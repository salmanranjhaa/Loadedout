import json
import re
import logging
import os
import asyncio
import httpx
from google import genai
from google.genai import types
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()
if settings.GCP_PROJECT_ID:
    os.environ.setdefault("GOOGLE_CLOUD_PROJECT", settings.GCP_PROJECT_ID)

_clients: dict[str, genai.Client] = {}


def _csv_values(raw: str) -> list[str]:
    return [v.strip() for v in (raw or "").split(",") if v.strip()]


def _unique(values: list[str]) -> list[str]:
    seen = set()
    ordered = []
    for value in values:
        if value and value not in seen:
            seen.add(value)
            ordered.append(value)
    return ordered


def _candidate_regions() -> list[str]:
    return _unique([settings.GCP_REGION, *_csv_values(settings.VERTEX_AI_FALLBACK_REGIONS)])


def _candidate_models(preferred_model: str | None = None) -> list[str]:
    base = preferred_model or settings.VERTEX_AI_MODEL
    return _unique([base, *_csv_values(settings.VERTEX_AI_MODEL_FALLBACKS)])


def _candidate_groq_models() -> list[str]:
    return _unique([settings.GROQ_MODEL, *_csv_values(settings.GROQ_MODEL_FALLBACKS)])


def get_client(location: str | None = None) -> genai.Client:
    """I lazily create a Vertex AI client per region using ADC."""
    region = location or settings.GCP_REGION
    if region not in _clients:
        _clients[region] = genai.Client(
            vertexai=True,
            project=settings.GCP_PROJECT_ID,
            location=region,
        )
    return _clients[region]


class _TextOnlyResponse:
    """I normalize non-Vertex text responses to match the response interface used below."""

    def __init__(self, text: str):
        self.text = text
        self.candidates = []


def _config_value(config, key: str, default=None):
    try:
        value = getattr(config, key)
    except Exception:
        return default
    return default if value is None else value


def _normalize_message_role(role: str | None) -> str:
    role = (role or "user").lower()
    if role == "model":
        return "assistant"
    if role in {"assistant", "system", "user", "tool"}:
        return role
    return "user"


def _part_to_text(part) -> str:
    if part is None:
        return ""
    text = getattr(part, "text", None)
    if text:
        return str(text)
    if isinstance(part, dict):
        if isinstance(part.get("text"), str):
            return part["text"]
        if isinstance(part.get("content"), str):
            return part["content"]
    return ""


def _parts_to_text(parts) -> str:
    merged = "".join(_part_to_text(part) for part in (parts or []))
    return merged.strip()


def _content_to_message(content) -> dict | None:
    if isinstance(content, str):
        return {"role": "user", "content": content}

    if isinstance(content, dict):
        role = _normalize_message_role(content.get("role"))
        text = content.get("content")
        if isinstance(text, list):
            text = " ".join(str(v) for v in text if v is not None)
        if not isinstance(text, str):
            text = ""
        text = text.strip()
        if not text:
            return None
        return {"role": role, "content": text}

    role = _normalize_message_role(getattr(content, "role", "user"))
    parts = getattr(content, "parts", None)
    text = _parts_to_text(parts)
    if not text:
        text = str(content or "").strip()
    if not text:
        return None
    return {"role": role, "content": text}


def _system_instruction_text(config) -> str:
    system_instruction = _config_value(config, "system_instruction")
    if not system_instruction:
        return ""
    if isinstance(system_instruction, str):
        return system_instruction.strip()
    if isinstance(system_instruction, dict):
        value = system_instruction.get("text") or system_instruction.get("content") or ""
        return str(value).strip()
    parts = getattr(system_instruction, "parts", None)
    if parts is not None:
        return _parts_to_text(parts)
    return str(system_instruction).strip()


def _to_groq_messages(contents, config) -> list[dict]:
    messages: list[dict] = []
    system_text = _system_instruction_text(config)
    if system_text:
        messages.append({"role": "system", "content": system_text})

    if isinstance(contents, list):
        for item in contents:
            msg = _content_to_message(item)
            if msg:
                messages.append(msg)
    else:
        msg = _content_to_message(contents)
        if msg:
            messages.append(msg)

    if not messages:
        messages.append({"role": "user", "content": ""})
    return messages


async def _generate_content_groq(
    contents,
    config: types.GenerateContentConfig,
    model_name: str,
):
    base_url = (settings.GROQ_BASE_URL or "").strip().rstrip("/")
    if not base_url:
        raise RuntimeError("GROQ_BASE_URL is not configured")

    api_key = (settings.GROQ_API_KEY or "").strip()
    if not api_key:
        raise RuntimeError("GROQ_API_KEY is not configured")

    payload = {
        "model": model_name,
        "messages": _to_groq_messages(contents, config),
        "temperature": _config_value(config, "temperature", 0.7),
        "stream": False,
    }

    max_output_tokens = _config_value(config, "max_output_tokens")
    if max_output_tokens:
        payload["max_completion_tokens"] = int(max_output_tokens)

    top_p = _config_value(config, "top_p")
    if top_p is not None:
        payload["top_p"] = top_p

    response = None
    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(
                f"{base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
    except Exception as e:
        raise RuntimeError(f"Groq request failed: {e}") from e

    if response.status_code >= 400:
        body = response.text[:220].replace("\n", " ")
        raise RuntimeError(f"Groq HTTP {response.status_code}: {body}")

    try:
        data = response.json()
    except Exception as e:
        raise RuntimeError(f"Groq JSON decode failed: {e}") from e

    text = (
        (
            (data.get("choices") or [{}])[0].get("message", {}) or {}
        ).get("content", "")
    ).strip()
    if not text:
        raise RuntimeError("Groq returned empty text")
    return _TextOnlyResponse(text=text)


async def generate_content_with_fallback(
    contents,
    config: types.GenerateContentConfig,
    preferred_model: str | None = None,
    allow_groq: bool = True,
):
    """I try model/region fallbacks so transient model availability issues do not hard-fail."""
    errors = []
    models = _candidate_models(preferred_model)
    regions = _candidate_regions()

    for region in regions:
        client = get_client(region)
        for model_name in models:
            for attempt in (1, 2):
                try:
                    response = await client.aio.models.generate_content(
                        model=model_name,
                        contents=contents,
                        config=config,
                    )
                    text = _response_text(response)
                    if not text and not _extract_function_call(response):
                        diag = _response_diagnostics(response)
                        raise RuntimeError(f"Empty model response ({diag})")
                    if region != settings.GCP_REGION or model_name != (preferred_model or settings.VERTEX_AI_MODEL):
                        logger.warning(
                            "Vertex AI fallback succeeded with model=%s region=%s",
                            model_name,
                            region,
                        )
                    return response
                except Exception as e:
                    err = str(e)
                    is_quota = ("RESOURCE_EXHAUSTED" in err) or ("429" in err)
                    if is_quota and attempt == 1:
                        # brief retry for bursty quota throttling
                        await asyncio.sleep(1.5)
                        continue
                    logger.warning(
                        "Vertex AI generate failed model=%s region=%s error=%s",
                        model_name,
                        region,
                        e,
                    )
                    errors.append(f"{region}/{model_name}: {type(e).__name__}")
                    break

    groq_enabled = allow_groq and settings.ENABLE_GROQ_FALLBACK and bool((settings.GROQ_API_KEY or "").strip())
    if groq_enabled:
        for model_name in _candidate_groq_models():
            for attempt in (1, 2):
                try:
                    response = await _generate_content_groq(
                        contents=contents,
                        config=config,
                        model_name=model_name,
                    )
                    logger.warning(
                        "LLM fallback succeeded with provider=groq model=%s",
                        model_name,
                    )
                    return response
                except Exception as e:
                    err = str(e)
                    is_quota = ("RESOURCE_EXHAUSTED" in err) or ("429" in err)
                    if is_quota and attempt == 1:
                        await asyncio.sleep(1.5)
                        continue
                    logger.warning("Groq generate failed model=%s error=%s", model_name, e)
                    errors.append(f"groq/{model_name}: {type(e).__name__}")
                    break

    attempts = ", ".join(errors[:6])
    raise RuntimeError(
        "Vertex AI failed for all configured model/region candidates"
        + (f" ({attempts})" if attempts else "")
    )


SYSTEM_PROMPT = """You are a nutrition, workout, and routine assistant for {username}.

USER PROFILE (do not invent missing values):
- Current weight: {weight}
- Target weight: {target}
- Height: {height}
- Age: {age}
- Gender: {gender}
- Activity level: {activity_level}
- Fitness goal: {fitness_goal} (pace: {goal_pace} kg/week)
- Daily targets: {calories} calories, {protein} protein, {carbs} carbs, {fat} fat
- Preferred currency: {currency}
- Dietary preferences: {dietary_preferences}
- Training preferences: {training_preferences}
- Supplement schedule: {supplements}
- Routine preferences: {routine_preferences}
- Grocery preferences: {grocery_preferences}

PERSONALIZATION RULES:
1. If a profile value is "not provided", treat it as unknown and never guess it.
2. Never mention personal facts (name, weight, age, location, targets, food habits) unless present in this user's profile/context.
3. If CURRENT PANTRY/INVENTORY is provided in context, prioritize ingredients already available at home.
4. When asked for grocery lists, list only missing/low items based on pantry context.
5. Always complete responses; do not cut off mid-sentence.
6. Keep responses clear and practical with inline macros where useful (for example: "~350 kcal, 40g protein, 25g carbs, 10g fat").
7. Respect dietary pattern and allergies strictly: never suggest a food that conflicts with them.
8. When planning workouts, work around listed injuries, use only available equipment, and fit the user's days-per-week and session length. Match intensity to their experience level and fitness goal.

ACTION RULES:
1. You have tools to save meals, workout templates, and schedule events.
2. Call a tool ONLY when the user clearly confirms a save/add action ("save this",
   "add it", "yes save it", "log that meal", "add to my schedule", etc.) or
   explicitly asks you to log/save something in their message.
3. When you call a tool, also write one short friendly sentence confirming what
   you prepared (the app shows the user an editable card to approve).
4. Never call a tool just because you suggested a meal/workout — wait for confirmation.
5. For cardio/CrossFit templates where set counts are not meaningful, use null
   for sets and describe reps using rounds/time.
"""


# ── Native function calling for save/add actions ─────────────────────────────
# The frontend renders an editable confirmation card per action_type, so tools
# only PREPARE payloads — nothing is written until the user approves in the UI.
def _build_action_tools() -> list:
    return [types.Tool(function_declarations=[
        types.FunctionDeclaration(
            name="save_meal_template",
            description="Prepare a meal to be logged today and saved as a reusable template. Call only after the user confirms saving a discussed meal.",
            parameters={
                "type": "OBJECT",
                "properties": {
                    "name": {"type": "STRING"},
                    "meal_type": {"type": "STRING", "enum": ["breakfast", "lunch", "dinner", "snack"]},
                    "calories": {"type": "NUMBER"},
                    "protein_g": {"type": "NUMBER"},
                    "carbs_g": {"type": "NUMBER"},
                    "fat_g": {"type": "NUMBER"},
                    "ingredients": {
                        "type": "ARRAY",
                        "items": {
                            "type": "OBJECT",
                            "properties": {
                                "name": {"type": "STRING"},
                                "amount": {"type": "STRING"},
                            },
                        },
                    },
                    "prep_instructions": {"type": "STRING"},
                },
                "required": ["name", "meal_type", "calories", "protein_g"],
            },
        ),
        types.FunctionDeclaration(
            name="save_workout_template",
            description="Prepare a workout template to save for reuse. Call only after the user confirms saving a discussed workout.",
            parameters={
                "type": "OBJECT",
                "properties": {
                    "name": {"type": "STRING"},
                    "workout_type": {"type": "STRING", "enum": ["strength", "crossfit", "running", "hiit", "yoga", "cycling", "football", "boxing", "swimming"]},
                    "exercises": {
                        "type": "ARRAY",
                        "items": {
                            "type": "OBJECT",
                            "properties": {
                                "name": {"type": "STRING"},
                                "sets": {"type": "INTEGER", "nullable": True},
                                "reps": {"type": "STRING"},
                                "weight_suggestion_kg": {"type": "NUMBER", "nullable": True},
                                "notes": {"type": "STRING"},
                            },
                            "required": ["name"],
                        },
                    },
                    "description": {"type": "STRING"},
                    "estimated_duration": {"type": "INTEGER"},
                    "tags": {"type": "ARRAY", "items": {"type": "STRING"}},
                },
                "required": ["name", "workout_type", "exercises"],
            },
        ),
        types.FunctionDeclaration(
            name="add_schedule_event",
            description="Prepare a recurring weekly schedule event. Call only after the user confirms adding it. day_of_week: 0=Monday … 6=Sunday. Times are HH:MM 24h.",
            parameters={
                "type": "OBJECT",
                "properties": {
                    "title": {"type": "STRING"},
                    "event_type": {"type": "STRING", "enum": ["routine", "meal", "exercise", "focus", "class", "social", "work"]},
                    "day_of_week": {"type": "INTEGER"},
                    "start_time": {"type": "STRING"},
                    "end_time": {"type": "STRING"},
                    "reasoning": {"type": "STRING"},
                },
                "required": ["title", "event_type", "day_of_week", "start_time", "end_time"],
            },
        ),
    ])]


def _jsonable(value):
    """Function-call args arrive as proto maps/lists — convert to plain JSON types."""
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    if hasattr(value, "items"):
        return {k: _jsonable(v) for k, v in value.items()}
    return value


def _extract_function_call(response) -> dict | None:
    try:
        for candidate in getattr(response, "candidates", None) or []:
            content = getattr(candidate, "content", None)
            for part in (getattr(content, "parts", None) or []):
                fc = getattr(part, "function_call", None)
                if fc is not None and getattr(fc, "name", None):
                    args = _jsonable(dict(fc.args)) if fc.args else {}
                    return {"action_type": fc.name, **args}
    except Exception:
        pass
    return None


def _format_profile_metric(value, unit: str = "") -> str:
    if value is None or value == "":
        return "not provided"
    try:
        number = float(value)
        text = str(int(number)) if number.is_integer() else f"{number:.1f}".rstrip("0").rstrip(".")
        return f"{text}{unit}"
    except (TypeError, ValueError):
        return f"{value}{unit}" if unit else str(value)


def _format_profile_blob(value) -> str:
    if value is None or value == "" or value == [] or value == {}:
        return "not provided"
    if isinstance(value, list):
        compact = [str(v).strip() for v in value if str(v).strip()]
        return ", ".join(compact) if compact else "not provided"
    if isinstance(value, dict):
        parts = []
        for key, raw in value.items():
            if raw in (None, "", [], {}):
                continue
            label = key.replace("_", " ")
            if isinstance(raw, list):
                compact = [str(v).strip() for v in raw if str(v).strip()]
                if compact:
                    parts.append(f"{label}: {', '.join(compact)}")
            else:
                parts.append(f"{label}: {raw}")
        return "; ".join(parts) if parts else "not provided"
    return str(value)

def _repair_json(text: str) -> str:
    """I fix common AI JSON output issues like thousands separators and trailing commas."""
    # Fix thousands separators: 1,234 -> 1234 (matches digit,3digits at word boundary)
    text = re.sub(r'(\d{1,3}),(\d{3})\b', r'\1\2', text)
    # Remove trailing commas before } or ]
    text = re.sub(r',\s*([}\]])', r'\1', text)
    return text.strip()


def _strip_code_fences(text: str) -> str:
    """I remove markdown code fences (```json ... ```) robustly."""
    if "```" not in text:
        return text
    # Split on ``` and find the part that looks like JSON
    parts = text.split("```")
    for part in parts:
        cleaned = part.lstrip("json").lstrip("JSON").strip()
        if cleaned.startswith("{") or cleaned.startswith("["):
            return cleaned
    # Fallback: try to find { ... } directly
    if "{" in text:
        start = text.index("{")
        end = text.rindex("}") + 1
        return text[start:end]
    return text


def _extract_json_payload(text: str) -> str:
    """I extract the most likely JSON object/array payload from model output."""
    cleaned = _repair_json(_strip_code_fences((text or "").strip()))
    if not cleaned:
        return ""

    if (cleaned.startswith("{") and cleaned.endswith("}")) or (
        cleaned.startswith("[") and cleaned.endswith("]")
    ):
        return cleaned

    obj_start = cleaned.find("{")
    obj_end = cleaned.rfind("}")
    if obj_start != -1 and obj_end != -1 and obj_end > obj_start:
        return cleaned[obj_start:obj_end + 1]

    arr_start = cleaned.find("[")
    arr_end = cleaned.rfind("]")
    if arr_start != -1 and arr_end != -1 and arr_end > arr_start:
        return cleaned[arr_start:arr_end + 1]

    return cleaned


def _parse_json_dict(text: str) -> dict:
    """I parse model text into a JSON object, tolerating wrappers/noise."""
    payload = _extract_json_payload(text)
    if not payload:
        raise ValueError("Empty model response")
    parsed = json.loads(payload)
    if not isinstance(parsed, dict):
        raise ValueError("Expected a JSON object")
    return parsed


def _as_int(value, default: int) -> int:
    try:
        if value is None or value == "":
            return default
        return int(round(float(value)))
    except (TypeError, ValueError):
        return default


def _response_text(response) -> str:
    """I read model text from response.text, with candidate-part fallback."""
    try:
        # .text is a property that RAISES if the response holds only a
        # function_call part — treat that as "no text", not as a failure
        direct = getattr(response, "text", None)
    except Exception:
        direct = None
    if direct:
        return direct.strip()

    try:
        for candidate in getattr(response, "candidates", []) or []:
            content = getattr(candidate, "content", None)
            parts = getattr(content, "parts", None) or []
            merged = "".join([
                (getattr(part, "text", "") or "")
                for part in parts
                if getattr(part, "text", None)
            ]).strip()
            if merged:
                return merged
    except Exception:
        pass

    return ""


def _response_diagnostics(response) -> str:
    """I provide compact response metadata to debug empty candidate text."""
    try:
        candidates = getattr(response, "candidates", None) or []
        parts = [f"candidates={len(candidates)}"]
        if candidates:
            first = candidates[0]
            finish_reason = getattr(first, "finish_reason", None)
            if finish_reason is not None:
                parts.append(f"finish_reason={finish_reason}")
            safety = getattr(first, "safety_ratings", None)
            if safety:
                parts.append("safety_ratings=present")
        prompt_feedback = getattr(response, "prompt_feedback", None)
        if prompt_feedback is not None:
            block_reason = getattr(prompt_feedback, "block_reason", None)
            if block_reason:
                parts.append(f"block_reason={block_reason}")
        return ", ".join(parts)
    except Exception:
        return "diagnostics_unavailable"


_WORKOUT_METS = {
    "crossfit": 8.0, "running": 8.3, "football": 7.0,
    "yoga": 3.0, "cycling": 7.5, "stretch": 2.5,
    "swimming": 7.0, "hiit": 8.5, "walking": 3.5,
}

_WORKOUT_PRIMARY_MUSCLES = {
    "running": ["quads", "hamstrings", "calves", "core"],
    "cycling": ["quads", "glutes", "hamstrings", "calves"],
    "swimming": ["lats", "shoulders", "core", "glutes"],
    "crossfit": ["full body", "core"],
    "hiit": ["full body", "core"],
    "football": ["quads", "hamstrings", "calves", "core"],
    "boxing": ["shoulders", "chest", "core", "triceps"],
    "walking": ["quads", "calves"],
    "yoga": ["core", "glutes", "hamstrings"],
    "stretch": ["mobility"],
}


def _as_float(value):
    try:
        if value is None or value == "":
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _estimate_calories_fallback(workout_type: str, duration_minutes: int, weight_kg: float) -> int:
    met = _WORKOUT_METS.get(workout_type.lower(), 6.0)
    safe_weight = _as_float(weight_kg) or 75.0
    return round(met * safe_weight * (duration_minutes / 60))


def _estimate_calories_with_details(
    workout_type: str,
    duration_minutes: int,
    weight_kg: float,
    details: dict | None = None,
) -> tuple[int, str]:
    details = details or {}
    wt = (workout_type or "").lower()
    base = _estimate_calories_fallback(wt, duration_minutes, weight_kg)
    basis = [f"MET baseline for {wt or 'workout'} and {duration_minutes} min"]

    # If user entered watch/manual calories, trust it strongly.
    manual_cal = _as_float(details.get("calories_burned"))
    if manual_cal and manual_cal > 0:
        base = int(round(manual_cal))
        basis.append("user provided calories from activity metrics")
        return base, "; ".join(basis)

    distance_km = _as_float(details.get("distance_km"))
    avg_pace = _as_float(details.get("avg_pace_min_km"))
    avg_speed = _as_float(details.get("avg_speed_kmh"))
    avg_hr = _as_float(details.get("avg_hr_bpm"))
    elevation_m = _as_float(details.get("elevation_m"))
    
    safe_weight = _as_float(weight_kg) or 75.0

    if wt == "running" and distance_km and distance_km > 0:
        by_distance = distance_km * safe_weight * 1.0
        base = int(round((base + by_distance) / 2))
        basis.append(f"distance model ({distance_km:.1f} km)")
        if avg_pace:
            if avg_pace <= 5.0:
                base = int(round(base * 1.10))
                basis.append("fast pace adjustment")
            elif avg_pace >= 6.7:
                base = int(round(base * 0.92))
                basis.append("easy pace adjustment")

    if wt == "cycling" and avg_speed and avg_speed > 0:
        speed_factor = min(1.35, max(0.8, avg_speed / 20.0))
        base = int(round(base * speed_factor))
        basis.append(f"cycling speed adjustment ({avg_speed:.1f} km/h)")

    if wt == "walking" and distance_km and distance_km > 0:
        by_distance = distance_km * safe_weight * 0.6
        base = int(round((base + by_distance) / 2))
        basis.append(f"walking distance model ({distance_km:.1f} km)")

    if elevation_m and elevation_m > 0:
        elev_boost = min(1.18, 1 + (elevation_m / 2000))
        base = int(round(base * elev_boost))
        basis.append(f"elevation adjustment ({int(elevation_m)} m)")

    if avg_hr and avg_hr > 0:
        hr_factor = min(1.30, max(0.82, avg_hr / 140.0))
        base = int(round(base * hr_factor))
        basis.append(f"heart-rate adjustment ({int(avg_hr)} bpm)")

    return max(base, 20), "; ".join(basis)


def _estimate_intensity_score(
    workout_type: str,
    duration_minutes: int,
    intensity: str,
    details: dict | None = None,
) -> int:
    details = details or {}
    wt = (workout_type or "").lower()
    score = {"low": 3, "moderate": 5, "high": 7}.get((intensity or "moderate").lower(), 5)

    avg_hr = _as_float(details.get("avg_hr_bpm"))
    if avg_hr:
        if avg_hr >= 170:
            score += 2
        elif avg_hr >= 150:
            score += 1
        elif avg_hr <= 115:
            score -= 1

    if duration_minutes >= 120:
        score += 2
    elif duration_minutes >= 75:
        score += 1
    elif duration_minutes <= 25:
        score -= 1

    if wt in {"crossfit", "hiit", "football", "boxing"}:
        score += 1

    if wt == "running":
        pace = _as_float(details.get("avg_pace_min_km"))
        if pace:
            if pace <= 5.0:
                score += 1
            elif pace >= 6.7:
                score -= 1

    return max(1, min(10, int(round(score))))


def _estimate_recovery_hours(workout_type: str, duration_minutes: int, intensity_score: int) -> int:
    wt = (workout_type or "").lower()
    hours = 6 + (intensity_score * 1.8) + (max(duration_minutes - 30, 0) * 0.12)
    if wt in {"crossfit", "hiit", "football", "boxing"}:
        hours += 2
    return int(max(8, min(60, round(hours))))


def _fallback_workout_analysis(
    workout_type: str,
    duration_minutes: int,
    intensity: str,
    weight_kg: float,
    note: str,
    details: dict | None = None,
    reason: str | None = None,
) -> dict:
    wt = (workout_type or "").lower()
    calories, basis = _estimate_calories_with_details(wt, duration_minutes, weight_kg, details)
    intensity_score = _estimate_intensity_score(wt, duration_minutes, intensity, details)
    recovery_hours = _estimate_recovery_hours(wt, duration_minutes, intensity_score)
    if intensity_score >= 8:
        cardio_impact = "high"
    elif intensity_score >= 5:
        cardio_impact = "moderate"
    else:
        cardio_impact = "low"

    notes = note
    if reason:
        notes = f"{note} ({reason})"

    return {
        "calories_burned": calories,
        "intensity_score": intensity_score,
        "muscle_groups": _WORKOUT_PRIMARY_MUSCLES.get(wt, []),
        "cardio_impact": cardio_impact,
        "recovery_hours": recovery_hours,
        "notes": notes,
        "weekly_impact": "Metric-based estimate used for this workout.",
        "analysis_source": "estimated",
        "estimation_basis": basis,
    }


def _build_chat_request(message, user_profile, conversation_history, rag_context):
    """I build (system_instruction, contents, config) shared by sync and streaming chat."""
    system_instruction = _format_system_prompt(user_profile)

    contents = []
    if conversation_history:
        for msg in conversation_history:
            role = "user" if msg.get("role") == "user" else "model"
            contents.append(types.Content(role=role, parts=[types.Part(text=msg["content"])]))

    user_text = message
    if rag_context:
        user_text = f"CONTEXT FROM USER HISTORY:\n{rag_context}\n\nUSER MESSAGE:\n{message}"
    contents.append(types.Content(role="user", parts=[types.Part(text=user_text)]))

    config = types.GenerateContentConfig(
        system_instruction=system_instruction,
        temperature=0.7,
        max_output_tokens=4096,
        tools=_build_action_tools(),
    )
    return contents, config


def _format_system_prompt(user_profile: dict) -> str:
    return SYSTEM_PROMPT.format(
        username=user_profile.get("username", "there"),
        weight=_format_profile_metric(user_profile.get("current_weight_kg"), "kg"),
        target=_format_profile_metric(user_profile.get("target_weight_kg"), "kg"),
        height=_format_profile_metric(user_profile.get("height_cm"), "cm"),
        age=_format_profile_metric(user_profile.get("age")),
        gender=_format_profile_metric(user_profile.get("gender")),
        activity_level=_format_profile_metric(user_profile.get("activity_level")),
        fitness_goal=_format_profile_metric(user_profile.get("fitness_goal")),
        goal_pace=_format_profile_metric(user_profile.get("goal_pace_kg_per_week")),
        training_preferences=_format_profile_blob(user_profile.get("training_preferences")),
        calories=_format_profile_metric(user_profile.get("daily_calorie_target"), " kcal"),
        protein=_format_profile_metric(user_profile.get("daily_protein_target"), " g"),
        carbs=_format_profile_metric(user_profile.get("daily_carb_target"), " g"),
        fat=_format_profile_metric(user_profile.get("daily_fat_target"), " g"),
        currency=(user_profile.get("preferred_currency") or "CHF"),
        dietary_preferences=_format_profile_blob(user_profile.get("dietary_preferences")),
        supplements=_format_profile_blob(user_profile.get("supplements")),
        routine_preferences=_format_profile_blob(user_profile.get("routine_preferences")),
        grocery_preferences=_format_profile_blob(user_profile.get("grocery_stores")),
    )

async def chat_with_ai(
    message: str,
    user_profile: dict,
    conversation_history: list[dict] = None,
    rag_context: str = "",
) -> dict:
    """I send a message to Gemini (with action tools) and return text + any prepared action."""
    if not settings.GCP_PROJECT_ID:
        return {
            "text": "AI chat is unavailable because GCP is not configured on the backend.",
            "structured_data": None,
        }

    contents, config = _build_chat_request(message, user_profile, conversation_history, rag_context)

    try:
        response = await generate_content_with_fallback(
            contents=contents,
            preferred_model=settings.VERTEX_AI_MODEL,
            config=config,
        )
    except Exception as e:
        logger.error(f"Chat generation failed: {e}")
        return {
            "text": "AI is temporarily unavailable. Please try again in a minute.",
            "structured_data": None,
        }

    response_text = _response_text(response)
    action = _extract_function_call(response)
    if action:
        return {
            "text": response_text or "I've prepared the details below — review and save when ready.",
            "structured_data": action,
        }
    if not response_text:
        return {
            "text": "I couldn't generate a response right now. Please retry in a moment.",
            "structured_data": None,
        }

    result = {"text": response_text, "structured_data": None}
    # Groq fallback has no tools — keep tolerating inline action JSON from it
    try:
        if response_text.lstrip().startswith("{") and '"action_type"' in response_text:
            parsed = _parse_json_dict(response_text)
            if parsed.get("action_type"):
                result["structured_data"] = parsed
                result["text"] = "I've prepared the details below — review and save when ready."
    except (json.JSONDecodeError, ValueError):
        pass

    return result


async def chat_with_ai_stream(
    message: str,
    user_profile: dict,
    conversation_history: list[dict] = None,
    rag_context: str = "",
):
    """I stream the chat reply as events: {type: delta|action|done|error}.

    Tries Vertex streaming across model/region candidates; if nothing has been
    emitted yet, falls back to the non-streaming path (which includes Groq).
    """
    if not settings.GCP_PROJECT_ID:
        yield {"type": "delta", "text": "AI chat is unavailable because GCP is not configured on the backend."}
        yield {"type": "done"}
        return

    contents, config = _build_chat_request(message, user_profile, conversation_history, rag_context)

    yielded_any = False
    for region in _candidate_regions():
        client = get_client(region)
        for model_name in _candidate_models(settings.VERTEX_AI_MODEL):
            full_text = ""
            action = None
            try:
                stream = await client.aio.models.generate_content_stream(
                    model=model_name,
                    contents=contents,
                    config=config,
                )
                async for chunk in stream:
                    delta = _response_text(chunk)
                    if delta:
                        full_text += delta
                        yielded_any = True
                        yield {"type": "delta", "text": delta}
                    fc = _extract_function_call(chunk)
                    if fc:
                        action = fc
                if not full_text and not action:
                    raise RuntimeError("empty stream")
                if action:
                    if not full_text:
                        yield {"type": "delta", "text": "I've prepared the details below — review and save when ready."}
                    yield {"type": "action", "data": action}
                yield {"type": "done"}
                return
            except Exception as e:
                logger.warning("Streaming chat failed model=%s region=%s: %s", model_name, region, e)
                if yielded_any:
                    # Can't cleanly retry after partial output — let the client keep what it has
                    yield {"type": "error", "message": "Response was cut short. Please retry."}
                    yield {"type": "done"}
                    return

    # No streaming candidate produced anything — non-streaming fallback (incl. Groq)
    result = await chat_with_ai(message, user_profile, conversation_history, rag_context)
    yield {"type": "delta", "text": result["text"]}
    if result.get("structured_data"):
        yield {"type": "action", "data": result["structured_data"]}
    yield {"type": "done"}


async def analyze_workout(
    workout_type: str,
    duration_minutes: int,
    intensity: str,
    description: str,
    details: dict | None,
    user_profile: dict,
) -> dict:
    """I use Gemini to analyze a workout and return calories, impact, recovery recommendations."""
    weight = _as_float(user_profile.get("current_weight_kg"))
    fallback = _fallback_workout_analysis(
        workout_type=workout_type,
        duration_minutes=duration_minutes,
        intensity=intensity,
        weight_kg=weight,
        note="Used estimated values.",
        details=details,
    )

    if not settings.GCP_PROJECT_ID:
        fallback["notes"] = "GCP not configured; using metric-based estimate."
        return fallback

    metrics_json = json.dumps(details or {}, ensure_ascii=True)
    athlete_line = (
        f"ATHLETE: weight {weight:.1f}kg, goal: improve fitness with healthy progression"
        if weight is not None
        else "ATHLETE: weight not provided, goal: improve fitness with healthy progression"
    )
    prompt = f"""Analyze this workout. Respond ONLY with valid JSON, no other text.

{athlete_line}
WORKOUT: {workout_type} | {duration_minutes} min | {intensity} intensity
DESCRIPTION: {description or "No description provided"}
METRICS: {metrics_json}

Respond with exactly this JSON structure (compute every value from THIS workout's
type, duration, intensity, and metrics — do not reuse these placeholder descriptions):
{{
  "calories_burned": <integer kcal estimate for this athlete and workout>,
  "intensity_score": <integer 1-10>,
  "muscle_groups": [<lowercase muscle group strings>],
  "cardio_impact": <"low"|"moderate"|"high">,
  "recovery_hours": <integer hours before training same muscles>,
  "notes": <one brief coaching insight sentence specific to this workout>,
  "weekly_impact": <one sentence on how this fits the athlete's goal>
}}"""

    try:
        async def _run_analysis(run_prompt: str, *, enforce_json_mime: bool) -> dict:
            cfg = {
                "temperature": 0.1,
                "max_output_tokens": 2048,
            }
            if enforce_json_mime:
                cfg["response_mime_type"] = "application/json"
            response = await generate_content_with_fallback(
                contents=run_prompt,
                preferred_model=settings.VERTEX_AI_MODEL,
                config=types.GenerateContentConfig(**cfg),
            )
            return _parse_json_dict(_response_text(response))

        attempts = [
            (
                "strict_json_mime",
                prompt,
                True,
            ),
            (
                "strict_json_mime_one_line",
                prompt + "\nReturn ONLY a single JSON object on one line, no markdown fences, no prose.",
                True,
            ),
            (
                "relaxed_json_mode",
                prompt + "\nReturn plain JSON only. Do not include markdown fences.",
                False,
            ),
        ]

        parsed = None
        attempt_errors = []
        for label, run_prompt, enforce_json_mime in attempts:
            try:
                parsed = await _run_analysis(run_prompt, enforce_json_mime=enforce_json_mime)
                break
            except Exception as err:
                logger.warning("Workout analysis parse attempt failed (%s): %s", label, err)
                attempt_errors.append(f"{label}: {err}")

        if parsed is None:
            raise RuntimeError("; ".join(attempt_errors[:3]))

        muscle_groups = parsed.get("muscle_groups") if isinstance(parsed.get("muscle_groups"), list) else []
        ai_calories = _as_int(parsed.get("calories_burned"), fallback["calories_burned"])
        if ai_calories < 20 or ai_calories > 2500:
            ai_calories = fallback["calories_burned"]

        return {
            "calories_burned": ai_calories,
            "intensity_score": max(1, min(10, _as_int(parsed.get("intensity_score"), fallback["intensity_score"]))),
            "muscle_groups": muscle_groups or fallback["muscle_groups"],
            "cardio_impact": parsed.get("cardio_impact", fallback["cardio_impact"]),
            "recovery_hours": max(0, _as_int(parsed.get("recovery_hours"), fallback["recovery_hours"])),
            "notes": parsed.get("notes", fallback["notes"]) or fallback["notes"],
            "weekly_impact": parsed.get("weekly_impact", fallback["weekly_impact"]),
            "analysis_source": "ai",
            "estimation_basis": fallback["estimation_basis"],
        }
    except Exception as e:
        logger.error(f"Workout analysis failed: {e}")
        raise RuntimeError(f"AI Workout Analysis Enforced - Failed with error: {e}")


async def estimate_macros_from_image(image_bytes: bytes, mime_type: str, hint: str = "") -> dict:
    """I estimate meal macros from a photo using Gemini Vision."""
    prompt = (
        "You are a nutrition expert. Look at this photo of food and estimate what it is "
        "and its complete nutritional content for the ENTIRE portion shown.\n"
        + (f"User hint: {hint}\n" if hint else "")
        + "Output ONLY a single compact JSON object on ONE LINE, no markdown:\n"
        '{"name":"short dish name","calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,'
        '"confidence":"low|medium|high","ingredients":[{"name":"string","amount":"string"}]}\n'
        "Use plain integers. If the image does not show food, use name \"not food\" and zeros."
    )
    contents = [
        types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
        types.Part(text=prompt),
    ]

    text = ""
    try:
        response = await generate_content_with_fallback(
            contents=contents,
            preferred_model=settings.VERTEX_AI_MODEL,
            allow_groq=False,  # Groq fallback is text-only; never send image bytes there
            config=types.GenerateContentConfig(
                temperature=0.1,
                max_output_tokens=2048,
                response_mime_type="application/json",
            ),
        )
        text = _response_text(response)
        if not text:
            return {"error": "Could not analyze the photo"}
        return _parse_json_dict(text)
    except Exception as e:
        logger.error(f"Photo macro estimation failed: {e} | raw: {text[:200]}")
        return {"error": "Could not analyze the photo"}


async def calculate_macros_from_description(food_description: str) -> dict:
    """I use Gemini to estimate macros from a free text food description."""

    # I deliberately ask for compact single-line JSON to avoid mid-generation truncation
    # that occurs when Gemini formats multi-line output and hits a safety/recitation stop.
    prompt = (
        f"You are a nutrition calculator. Output ONLY a single compact JSON object on ONE LINE "
        f"with NO newlines, NO indentation, NO markdown, NO extra text.\n"
        f"Use plain integers for all numbers. Never use commas in numbers (1500 not 1,500).\n"
        f"Food: {food_description}\n"
        f'Format: {{"name":"string","calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,'
        f'"ingredients":[{{"name":"string","amount":"string"}}]}}'
    )

    text = ""
    try:
        response = await generate_content_with_fallback(
            contents=prompt,
            preferred_model=settings.VERTEX_AI_MODEL,
            config=types.GenerateContentConfig(
                temperature=0.0, 
                max_output_tokens=2048,
                response_mime_type="application/json"
            ),
        )
        # I guard against None/empty response (safety filter, quota, or empty candidates)
        text = _response_text(response)
        if not text:
            logger.error("Gemini returned empty/None text for macro estimation")
            return {"error": "Could not parse nutritional data"}
        # I also log finish_reason when available to diagnose truncations
        try:
            finish = response.candidates[0].finish_reason if response.candidates else "unknown"
            if str(finish) not in ("FinishReason.STOP", "STOP", "1"):
                logger.warning(f"Macro estimation finish_reason={finish}")
        except Exception:
            pass
        text = _strip_code_fences(text)
        text = _repair_json(text)
        return json.loads(text)
    except Exception as e:
        logger.error(f"Failed to parse macro estimation response: {e} | raw: {text[:300]}")
        return {"error": "Could not parse nutritional data"}

