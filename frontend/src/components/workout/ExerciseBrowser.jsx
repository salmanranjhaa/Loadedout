import { useState, useMemo, useEffect } from "react";
import { T, muscleColors } from "../../design/tokens";
import { Icon } from "../../design/icons";
import { Badge, BottomSheet } from "../../design/components";
import { exerciseAPI } from "../../utils/api";
import exerciseData from "../../lib/exercises.json";

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

function ExerciseGif({ url, name, size = 48 }) {
  if (!url) {
    return (
      <div style={{ width: size, height: size, borderRadius: 10, background: T.elevated, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon name="dumbbell" size={20} color={T.textDim} />
      </div>
    );
  }
  return (
    <img src={url} alt={name} loading="lazy"
      style={{ width: size, height: size, borderRadius: 10, objectFit: "cover", background: T.elevated, flexShrink: 0 }}
    />
  );
}

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

// ── Exercise detail modal ────────────────────────────────────────────────────
function ExerciseDetailModal({ exercise, onClose, onSelect }) {
  const [guidance, setGuidance]         = useState(null);
  const [loadingGuidance, setLoading]   = useState(false);

  useEffect(() => {
    if (!exercise?.id) return;
    setGuidance(null);
    setLoading(true);
    exerciseAPI.get(exercise.id)
      .then((data) => { setGuidance(data.llm_guidance); setLoading(false); })
      .catch(() => setLoading(false));
  }, [exercise?.id]);

  if (!exercise) return null;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: T.z.modal + 10, background: "rgba(7,10,16,0.92)", display: "flex", alignItems: "flex-end", backdropFilter: "blur(6px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="ex-detail-scroll"
        style={{ width: "100%", background: T.surface, borderRadius: "20px 20px 0 0", border: `1px solid ${T.border}`, borderBottom: "none", padding: "20px 20px 48px", maxHeight: "92vh", display: "flex", flexDirection: "column", gap: 16, overflowY: "auto", animation: "lo-slide-up 0.25s cubic-bezier(0.32,0.72,0,1) forwards" }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 9999, background: T.border, alignSelf: "center", marginBottom: 4 }} />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: T.text }}>{exercise.name}</div>
          <button onClick={onClose} style={{ background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 9999, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <Icon name="x" size={14} color={T.textMuted} />
          </button>
        </div>

        <ProxyGif exerciseId={exercise.id} name={exercise.name} />

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {exercise.primary  && <Badge color={muscleColors[exercise.primary]  || T.teal}    size="sm">{exercise.primary}</Badge>}
          {exercise.equipment && <Badge color={T.textDim} size="sm">{exercise.equipment}</Badge>}
          {exercise.difficulty && (
            <Badge color={exercise.difficulty === "beginner" ? T.teal : exercise.difficulty === "advanced" ? T.negative : T.amber} size="sm">
              {exercise.difficulty}
            </Badge>
          )}
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

// ── Main component ───────────────────────────────────────────────────────────
export default function ExerciseBrowser({ open, onClose, onSelectExercise }) {
  const [muscle,    setMuscle]    = useState("all");
  const [equipment, setEquipment] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [search,    setSearch]    = useState("");
  const [detailExercise, setDetailExercise] = useState(null);

  const filtered = useMemo(() => {
    return exerciseData.exercises.filter((ex) => {
      if (muscle    !== "all" && ex.primary    !== muscle)    return false;
      if (equipment !== "all" && ex.equipment  !== equipment) return false;
      if (difficulty !== "all" && ex.difficulty !== difficulty) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return ex.name.toLowerCase().includes(q) || ex.primary.toLowerCase().includes(q);
      }
      return true;
    });
  }, [muscle, equipment, difficulty, search]);

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

        <div style={{ fontSize: 11, color: T.textDim, fontWeight: 500 }}>
          {filtered.length} exercise{filtered.length !== 1 ? "s" : ""}
        </div>

        {/* Exercise list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "50vh", overflowY: "auto" }}>
          {filtered.map((ex) => (
            <button
              key={ex.id}
              onClick={async () => {
                try {
                  const result = await exerciseAPI.list({ q: ex.name, limit: 1 });
                  if (result.items?.length > 0) {
                    const dbEx = result.items[0];
                    setDetailExercise({
                      ...ex,
                      id:        dbEx.id,
                      name:      dbEx.name,
                      primary:   Array.isArray(dbEx.primary_muscles)   && dbEx.primary_muscles.length   > 0 ? dbEx.primary_muscles[0].toLowerCase()               : ex.primary,
                      secondary: Array.isArray(dbEx.secondary_muscles) && dbEx.secondary_muscles.length > 0 ? dbEx.secondary_muscles.map((m) => m.toLowerCase())  : ex.secondary,
                      equipment: dbEx.equipment ? dbEx.equipment.toLowerCase() : ex.equipment,
                      difficulty: dbEx.level || ex.difficulty,
                      gif_url:   dbEx.gif_url,
                    });
                  } else {
                    setDetailExercise(ex);
                  }
                } catch {
                  setDetailExercise(ex);
                }
              }}
              style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "left", width: "100%" }}
            >
              <ExerciseGif url={ex.gif_url} name={ex.name} size={48} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 2 }}>{ex.name}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Badge color={muscleColors[ex.primary] || T.teal} size="sm">{ex.primary}</Badge>
                  <Badge color={T.textDim} size="sm">{ex.equipment}</Badge>
                  <Badge color={ex.difficulty === "beginner" ? T.teal : ex.difficulty === "advanced" ? T.negative : T.amber} size="sm">{ex.difficulty}</Badge>
                </div>
              </div>
              <Icon name="chev-right" size={14} color={T.textDim} />
            </button>
          ))}
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
