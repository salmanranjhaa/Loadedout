import { useState, useMemo, useEffect } from "react";
import { T, muscleColors } from "../../design/tokens";
import { Icon } from "../../design/icons";
import { Badge, BottomSheet } from "../../design/components";
import { exerciseAPI } from "../../utils/api";
import MuscleMap from "./MuscleMap";

const MUSCLE_GROUPS = [
  { id: "all",       label: "All",       color: T.textMuted },
  { id: "chest",     label: "Chest",     color: muscleColors.chest },
  { id: "back",      label: "Back",      color: muscleColors.back },
  { id: "legs",      label: "Legs",      color: muscleColors.legs },
  { id: "shoulders", label: "Shoulders", color: muscleColors.shoulders },
  { id: "arms",      label: "Arms",      color: muscleColors.arms },
  { id: "core",      label: "Core",      color: muscleColors.core },
  { id: "cardio",    label: "Cardio",    color: muscleColors.cardio },
];

const EQUIPMENT   = ["all","barbell","dumbbell","cable","machine","bodyweight","kettlebell","bands"];
const DIFFICULTIES = ["all","beginner","intermediate","advanced"];

function ProxyGif({ exerciseId, name, size = "100%" }) {
  const [error, setError] = useState(false);
  if (error) {
    return (
      <div style={{ width: size === "100%" ? "100%" : size, aspectRatio: "1 / 1", borderRadius: 16, background: T.elevated, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name="dumbbell" size={28} color={T.textDim} />
      </div>
    );
  }
  return (
    <img src={`/api/v1/exercises/${exerciseId}/gif`} alt={name} onError={() => setError(true)}
      style={{ width: size === "100%" ? "100%" : size, borderRadius: 16, background: T.elevated, display: "block" }}
    />
  );
}

// I show a small list thumbnail via the backend GIF proxy (which caches and
// injects the WorkoutX key — the raw gifUrl can't be loaded by an <img>). Falls
// back to the dumbbell placeholder when no GIF is mapped or it fails.
function ProxyThumb({ exerciseId, hasGif, name, size = 48 }) {
  const [error, setError] = useState(false);
  if (!hasGif || error) {
    return (
      <div style={{ width: size, height: size, borderRadius: 10, background: T.elevated, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon name="dumbbell" size={20} color={T.textDim} />
      </div>
    );
  }
  return (
    <img src={`/api/v1/exercises/${exerciseId}/gif`} alt={name} loading="lazy" onError={() => setError(true)}
      style={{ width: size, height: size, borderRadius: 10, objectFit: "cover", background: "#F4F2EC", flexShrink: 0 }}
    />
  );
}

// ── Client-side guidance cache ───────────────────────────────────────────────
// The backend caches LLM guidance in the DB, but without this every modal
// open still costs a round-trip. 7-day TTL, ~50 entries.
const GUIDANCE_CACHE_KEY = "lo_ex_guidance_v1";
function readGuidanceCache(id) {
  try {
    const all = JSON.parse(localStorage.getItem(GUIDANCE_CACHE_KEY) || "{}");
    const hit = all[id];
    if (hit && Date.now() - hit.at < 7 * 86400 * 1000) return hit.data;
  } catch {}
  return null;
}
function writeGuidanceCache(id, data) {
  try {
    const all = JSON.parse(localStorage.getItem(GUIDANCE_CACHE_KEY) || "{}");
    all[id] = { at: Date.now(), data };
    const ids = Object.keys(all);
    if (ids.length > 50) {
      ids.sort((a, b) => all[a].at - all[b].at).slice(0, ids.length - 50).forEach((k) => delete all[k]);
    }
    localStorage.setItem(GUIDANCE_CACHE_KEY, JSON.stringify(all));
  } catch {}
}

// ── Exercise detail modal ────────────────────────────────────────────────────
function ExerciseDetailModal({ exercise, onClose, onSelect }) {
  const [guidance, setGuidance]         = useState(null);
  const [loadingGuidance, setLoading]   = useState(false);

  useEffect(() => {
    if (!exercise?.id) return;
    const cached = readGuidanceCache(exercise.id);
    if (cached) { setGuidance(cached); setLoading(false); return; }
    setGuidance(null);
    setLoading(true);
    exerciseAPI.get(exercise.id)
      .then((data) => {
        setGuidance(data.llm_guidance);
        if (data.llm_guidance) writeGuidanceCache(exercise.id, data.llm_guidance);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [exercise?.id]);

  if (!exercise) return null;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: T.z.modal + 10, background: "rgba(10,11,16,0.92)", display: "flex", alignItems: "flex-end", backdropFilter: "blur(6px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="ex-detail-scroll"
        style={{ width: "100%", background: T.surface, borderRadius: "20px 20px 0 0", border: `1px solid ${T.border}`, borderBottom: "none", padding: "20px 20px 24px", marginBottom: T.navHeight, maxHeight: `calc(100dvh - ${T.navHeight})`, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto", animation: "lo-slide-up 0.25s cubic-bezier(0.32,0.72,0,1) forwards" }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 9999, background: T.border, alignSelf: "center", marginBottom: 4 }} />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: T.text }}>{exercise.name}</div>
          <button onClick={onClose} style={{ background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 9999, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <Icon name="x" size={14} color={T.textMuted} />
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {exercise.primary  && <Badge color={muscleColors[exercise.primary]  || T.teal}    size="sm">{exercise.primary}</Badge>}
          {(exercise.secondary || []).slice(0, 2).map((m) => (
            <Badge key={m} color={T.textMuted} size="sm">{m}</Badge>
          ))}
          {exercise.equipment && <Badge color={T.textDim} size="sm">{exercise.equipment}</Badge>}
          {exercise.difficulty && (
            <Badge color={exercise.difficulty === "beginner" ? T.teal : exercise.difficulty === "advanced" ? T.negative : T.amber} size="sm">
              {exercise.difficulty}
            </Badge>
          )}
        </div>

        {/* Targeted muscles — custom map instead of leading with the stock GIF */}
        <div>
          <div style={{ ...T.type.eyebrow, fontFamily: T.fontMono, color: T.textDim, marginBottom: 8 }}>Targets</div>
          <MuscleMap primary={exercise.primary} secondary={exercise.secondary || []} />
        </div>

        {/* Demo — deliberately plated so the white stock GIF reads as content,
            not as a hole in the dark UI */}
        <div>
          <div style={{ ...T.type.eyebrow, fontFamily: T.fontMono, color: T.textDim, marginBottom: 8 }}>Demo</div>
          <div style={{ background: "#F4F2EC", borderRadius: 16, border: `1px solid ${T.border}`, padding: 10, display: "flex", justifyContent: "center" }}>
            <div style={{ width: "72%", maxWidth: 240 }}>
              <ProxyGif exerciseId={exercise.id} name={exercise.name} />
            </div>
          </div>
        </div>

        {loadingGuidance && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ width: 16, height: 16, borderRadius: 9999, border: `2px solid ${T.border}`, borderTopColor: T.teal, animation: "lo-spin 0.8s linear infinite" }} />
            <span style={{ fontSize: 12, color: T.textMuted }}>Generating coach guidance…</span>
          </div>
        )}

        {guidance && (
          <div style={{ background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.teal, letterSpacing: 0.5, textTransform: "uppercase" }}>Coach Guidance</div>
            {guidance.overview && <div style={{ fontSize: 13, color: T.text, lineHeight: 1.6 }}>{guidance.overview}</div>}
            {guidance.form_tips?.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 6, fontWeight: 600 }}>Form Tips</div>
                {guidance.form_tips.map((tip, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 4 }}>
                    <Icon name="check" size={12} color={T.teal} />
                    <span style={{ fontSize: 12, color: T.text, lineHeight: 1.5 }}>{tip}</span>
                  </div>
                ))}
              </div>
            )}
            {guidance.common_mistakes?.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 6, fontWeight: 600 }}>Common Mistakes</div>
                {guidance.common_mistakes.map((m, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 4 }}>
                    <Icon name="x" size={12} color={T.negative} />
                    <span style={{ fontSize: 12, color: T.text, lineHeight: 1.5 }}>{m}</span>
                  </div>
                ))}
              </div>
            )}
            {guidance.breathing  && <div><div style={{ fontSize: 11, color: T.textMuted, marginBottom: 4, fontWeight: 600 }}>Breathing</div><div style={{ fontSize: 12, color: T.text }}>{guidance.breathing}</div></div>}
            {guidance.beginner_notes && <div><div style={{ fontSize: 11, color: T.textMuted, marginBottom: 4, fontWeight: 600 }}>Beginner Notes</div><div style={{ fontSize: 12, color: T.text }}>{guidance.beginner_notes}</div></div>}
            {guidance.safety && <div style={{ background: T.negative + "12", borderRadius: 8, padding: "8px 12px" }}><div style={{ fontSize: 11, color: T.negative, fontWeight: 600 }}>Safety</div><div style={{ fontSize: 12, color: T.text }}>{guidance.safety}</div></div>}
          </div>
        )}

        {/* Add to Workout button — only shown when caller wants selection */}
        {onSelect && (
          <button
            onClick={() => { onSelect(exercise); onClose(); }}
            style={{ padding: "13px 0", background: T.teal, color: "#0A0A0F", border: "none", borderRadius: T.rCard, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            <Icon name="plus" size={16} color="#0A0A0F" />
            Add to Workout
          </button>
        )}
      </div>
    </div>
  );
}

// ── Backend record → display shape ───────────────────────────────────────────
// I classify a DB exercise into one of the UI muscle groups using its body_part
// and target muscles, so the filter chips work across the mixed-source library.
const GROUP_KEYWORDS = {
  chest:     ["chest", "pectoral"],
  back:      ["back", "lat", "trapez", "trap", "spine", "erector"],
  legs:      ["leg", "quad", "hamstring", "glute", "calf", "calve", "adductor", "abductor", "hip"],
  shoulders: ["shoulder", "delt"],
  arms:      ["arm", "bicep", "tricep", "forearm"],
  core:      ["waist", "abs", "abdominal", "oblique", "core"],
  cardio:    ["cardio", "cardiovascular"],
};
function classifyGroup(db) {
  const hay = [
    db.body_part || "",
    ...(Array.isArray(db.primary_muscles) ? db.primary_muscles : []),
  ].join(" ").toLowerCase();
  for (const [group, words] of Object.entries(GROUP_KEYWORDS)) {
    if (words.some((w) => hay.includes(w))) return group;
  }
  return "";
}
function toDisplay(db) {
  return {
    id:         db.id,
    name:       db.name,
    primary:    classifyGroup(db) || (db.body_part || "").toLowerCase(),
    secondary:  Array.isArray(db.secondary_muscles) ? db.secondary_muscles.map((m) => String(m).toLowerCase()) : [],
    equipment:  (db.equipment || "").toLowerCase(),
    difficulty: db.level || "",
    gif_url:    db.gif_url,
  };
}

// ── Custom-exercise form — the escape hatch when search finds nothing ─────────
function CustomExerciseForm({ initialName, onAdd, onCancel }) {
  const [name, setName] = useState(initialName || "");
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.teal}44`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Add a custom exercise</div>
      <div style={{ fontSize: 11, color: T.textMuted }}>Not in the library? Add it by name and it'll be tracked like any other.</div>
      <input
        autoFocus value={name} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && name.trim() && onAdd({ name: name.trim() })}
        placeholder="Exercise name, e.g. Smith Machine Calf Raise"
        style={{ width: "100%", background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px", color: T.text, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onCancel}
          style={{ flex: 1, padding: "9px 0", background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 9, color: T.textMuted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
          Cancel
        </button>
        <button onClick={() => name.trim() && onAdd({ name: name.trim() })} disabled={!name.trim()}
          style={{ flex: 2, padding: "9px 0", background: name.trim() ? T.teal : T.elevated, color: name.trim() ? "#0A0A0F" : T.textMuted, border: "none", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: name.trim() ? "pointer" : "default", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Icon name="plus" size={13} color={name.trim() ? "#0A0A0F" : T.textMuted} /> Add Exercise
        </button>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function ExerciseBrowser({ open, onClose, onSelectExercise }) {
  const [muscle,    setMuscle]    = useState("all");
  const [equipment, setEquipment] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [search,    setSearch]    = useState("");
  const [detailExercise, setDetailExercise] = useState(null);
  const [items,     setItems]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [showCustom, setShowCustom] = useState(false);

  // I search the full backend library (server-side) so every exercise we have is
  // reachable — not just the small bundled list. Debounced to avoid spamming.
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const handle = setTimeout(() => {
      exerciseAPI.list({ q: search.trim(), limit: 150 })
        .then((data) => setItems((data?.items || []).map(toDisplay)))
        .catch(() => setItems([]))
        .finally(() => setLoading(false));
    }, search.trim() ? 350 : 0);
    return () => clearTimeout(handle);
  }, [search, open]);

  // Equipment/difficulty/muscle are refined client-side — the library mixes
  // capitalizations ("Body Weight" vs "bodyweight"), so exact backend filtering
  // is unreliable; matching loosely here keeps the chips honest.
  const filtered = useMemo(() => {
    return items.filter((ex) => {
      if (muscle     !== "all" && ex.primary    !== muscle)                                   return false;
      if (difficulty !== "all" && (ex.difficulty || "").toLowerCase() !== difficulty)         return false;
      if (equipment  !== "all") {
        const e = ex.equipment.replace(/[^a-z]/g, "");
        if (!e.includes(equipment.replace(/[^a-z]/g, "")) && !equipment.replace(/[^a-z]/g, "").includes(e)) return false;
      }
      return true;
    });
  }, [items, muscle, equipment, difficulty]);

  return (
    <>
      <BottomSheet open={open} onClose={onClose} title="Exercise Database">

        {/* Search */}
        <div style={{ position: "relative" }}>
          <Icon name="search" size={14} color={T.textDim} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search exercises…"
            style={{ width: "100%", background: T.elevated, border: `1px solid ${T.border}`, borderRadius: T.rInput, padding: "10px 12px 10px 36px", color: T.text, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
          />
        </div>

        {/* Muscle group filter — flex-wrap so all 8 buttons are always visible */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {MUSCLE_GROUPS.map((m) => (
            <button
              key={m.id}
              onClick={() => setMuscle(m.id)}
              style={{
                padding: "6px 12px",
                borderRadius: 9999,
                background: muscle === m.id ? m.color + "33" : T.elevated,
                color:      muscle === m.id ? m.color : T.text,
                border:     `1px solid ${muscle === m.id ? m.color + "66" : T.border}`,
                fontSize: 12, fontWeight: muscle === m.id ? 700 : 500,
                cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Equipment + Difficulty selects */}
        <div style={{ display: "flex", gap: 8 }}>
          <select value={equipment} onChange={(e) => setEquipment(e.target.value)}
            style={{ flex: 1, background: T.elevated, border: `1px solid ${T.border}`, borderRadius: T.rInput, padding: "8px 10px", color: T.text, fontSize: 12, fontFamily: "inherit" }}>
            {EQUIPMENT.map((e) => (
              <option key={e} value={e} style={{ background: T.surface, color: T.text }}>
                {e === "all" ? "All Equipment" : e[0].toUpperCase() + e.slice(1)}
              </option>
            ))}
          </select>
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}
            style={{ flex: 1, background: T.elevated, border: `1px solid ${T.border}`, borderRadius: T.rInput, padding: "8px 10px", color: T.text, fontSize: 12, fontFamily: "inherit" }}>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d} style={{ background: T.surface, color: T.text }}>
                {d === "all" ? "All Levels" : d[0].toUpperCase() + d.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 11, color: T.textDim, fontWeight: 500 }}>
            {loading ? "Searching…" : `${filtered.length} exercise${filtered.length !== 1 ? "s" : ""}`}
          </div>
          {onSelectExercise && !showCustom && (
            <button onClick={() => setShowCustom(true)}
              style={{ background: "none", border: "none", color: T.teal, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}>
              <Icon name="plus" size={12} color={T.teal} /> Custom
            </button>
          )}
        </div>

        {/* Custom-exercise escape hatch */}
        {showCustom && onSelectExercise && (
          <CustomExerciseForm
            initialName={search.trim()}
            onAdd={(ex) => { onSelectExercise(ex); setShowCustom(false); }}
            onCancel={() => setShowCustom(false)}
          />
        )}

        {/* Exercise list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "50vh", overflowY: "auto" }}>
          {filtered.map((ex) => (
            <button
              key={ex.id}
              onClick={() => setDetailExercise(ex)}
              style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "left", width: "100%" }}
            >
              <ProxyThumb exerciseId={ex.id} hasGif={!!ex.gif_url} name={ex.name} size={48} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 2 }}>{ex.name}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {ex.primary && <Badge color={muscleColors[ex.primary] || T.teal} size="sm">{ex.primary}</Badge>}
                  {ex.equipment && <Badge color={T.textDim} size="sm">{ex.equipment}</Badge>}
                  {ex.difficulty && <Badge color={ex.difficulty === "beginner" ? T.teal : ex.difficulty === "advanced" ? T.negative : T.amber} size="sm">{ex.difficulty}</Badge>}
                </div>
              </div>
              <Icon name="chev-right" size={14} color={T.textDim} />
            </button>
          ))}

          {!loading && filtered.length === 0 && !showCustom && (
            <div style={{ textAlign: "center", padding: "28px 16px", color: T.textDim, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <Icon name="dumbbell" size={26} color={T.textDim} />
              <div style={{ fontSize: 13 }}>No exercises{search.trim() ? ` for "${search.trim()}"` : ""}.</div>
              {onSelectExercise && (
                <button onClick={() => setShowCustom(true)}
                  style={{ marginTop: 2, padding: "9px 16px", background: T.teal, color: "#0A0A0F", border: "none", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon name="plus" size={13} color="#0A0A0F" /> Add "{search.trim() || "custom exercise"}"
                </button>
              )}
            </div>
          )}
        </div>
      </BottomSheet>

      {detailExercise && (
        <ExerciseDetailModal
          exercise={detailExercise}
          onClose={() => setDetailExercise(null)}
          onSelect={onSelectExercise
            ? (ex) => { onSelectExercise(ex); setDetailExercise(null); }
            : null
          }
        />
      )}
    </>
  );
}
