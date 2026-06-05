import json
import logging
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.exercise import Exercise
from app.services.vertex_ai import get_client
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


_ENRICHMENT_PROMPT = """You are a certified personal trainer and exercise physiologist.

Given the exercise below, write a concise but rich educational description in JSON format.

Exercise: {name}
Primary muscles: {primary}
Secondary muscles: {secondary}
Equipment: {equipment}
Level: {level}
Instructions:
{instructions}

Respond ONLY with valid JSON in this exact shape:
{{
  "overview": "2-3 sentence description of what the exercise does and why it matters",
  "form_tips": ["tip 1", "tip 2", "tip 3"],
  "common_mistakes": ["mistake 1", "mistake 2"],
  "breathing": "guidance on when to inhale/exhale",
  "beginner_notes": "specific advice for beginners",
  "safety": "injury-prevention warning if any"
}}

Keep each field concise. form_tips should have 3 items. common_mistakes should have 2 items."""


async def enrich_exercise(exercise: Exercise, db: AsyncSession) -> dict:
    """Generate LLM guidance for an exercise and cache it in the DB."""
    if exercise.llm_description and exercise.llm_enriched_at:
        try:
            return json.loads(exercise.llm_description)
        except json.JSONDecodeError:
            logger.warning("Cached llm_description is invalid JSON for %s", exercise.id)

    instructions_text = "\n".join(
        f"{i+1}. {step}" for i, step in enumerate(exercise.instructions or [])
    )

    prompt = _ENRICHMENT_PROMPT.format(
        name=exercise.name,
        primary=", ".join(exercise.primary_muscles or []),
        secondary=", ".join(exercise.secondary_muscles or []),
        equipment=exercise.equipment or "bodyweight",
        level=exercise.level or "intermediate",
        instructions=instructions_text,
    )

    for attempt in range(2):
        try:
            client = get_client()
            model = settings.VERTEX_AI_MODEL
            response = await client.aio.models.generate_content(
                model=model,
                contents=prompt,
                config={
                    "temperature": 0.2,
                    "max_output_tokens": 1024,
                    "response_mime_type": "application/json",
                },
            )
            text = response.text or "{}"
            # Extract JSON from possible markdown fences
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0].strip()
            elif "```" in text:
                text = text.split("```")[1].split("```")[0].strip()

            parsed = json.loads(text)

            # Cache in DB
            exercise.llm_description = json.dumps(parsed)
            exercise.llm_enriched_at = datetime.now(timezone.utc)
            await db.commit()

            return parsed
        except Exception as e:
            logger.warning("LLM enrichment attempt %d failed for %s: %s", attempt + 1, exercise.id, e)
            if attempt == 1:
                break

    logger.error("LLM enrichment failed for %s after retries", exercise.id)
    fallback = {
        "overview": f"{exercise.name} targets the {', '.join(exercise.primary_muscles or [])}.",
        "form_tips": ["Keep core tight", "Control the tempo", "Full range of motion"],
        "common_mistakes": ["Using momentum", "Partial reps"],
        "breathing": "Exhale on exertion, inhale on return.",
        "beginner_notes": "Start with light weight and focus on form.",
        "safety": "Stop if you feel sharp pain.",
    }
    exercise.llm_description = json.dumps(fallback)
    exercise.llm_enriched_at = datetime.now(timezone.utc)
    await db.commit()
    return fallback
