import { useState, useMemo } from "react";
import { T } from "../../design/tokens";
import { Icon } from "../../design/icons";
import { IllustratedEmptyState, SkeletonCard } from "../../design/components";

const FILTERS = ["all", "strength", "cardio", "hyrox", "running", "yoga"];

// ── Workout detail bottom-sheet ───────────────────────────────────────────────
function WorkoutDetailModal({ workout, onClose }) {
  if (!workout) return null;

  const type        = workout.workout_type || "strength";
  const borderColor = type === "hyrox" ? T.violet : type === "cardio" || type === "running" ? T.amber : T.teal;
  const iconName    = type === "strength" ? "dumbbell" : type === "hyrox" ? "bolt" : "run";

  const exercises   = workout.exercises || [];
  const totalSets   = exercises.reduce((s, e) => s + (e.sets?.length || 0), 0);
  const totalVolume = exercises.reduce(
    (s, e) => s + (e.sets || []).reduce((ss, set) => ss + (set.weight_kg || 0) * (set.reps || 0), 0),
    0
  );

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: T.z.modal + 20, background: "rgba(10,11,16,0.92)", display: "flex", alignItems: "flex-end", backdropFilter: "blur(6px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{ width: "100%", background: T.surface, borderRadius: "20px 20px 0 0", border: `1px solid ${T.border}`, borderBottom: "none", padding: "20px 20px 24px", marginBottom: T.navHeight, maxHeight: `calc(100dvh - ${T.navHeight})`, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto", animation: "lo-slide-up 0.25s cubic-bezier(0.32,0.72,0,1) forwards" }}
      >
        {/* Handle */}
        <div style={{ width: 36, height: 4, borderRadius: 9999, background: T.border, alignSelf: "center", marginBottom: 4 }} />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: borderColor + "22", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon name={iconName} size={22} color={borderColor} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.text, textTransform: "capitalize" }}>{workout.name || type}</div>
            <div style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono, marginTop: 2 }}>
              {(workout.date || workout.loggedAt || "").slice(0, 10)}
            </div>
          </div>
          <button onClick={onClose} style={{ background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 9999, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            <Icon name="x" size={14} color={T.textMuted} />
          </button>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {[
            ["Duration", `${workout.duration_minutes || 0}m`],
            ["Sets",     String(totalSets)],
            ["Volume",   totalVolume > 0 ? `${Math.round(totalVolume).toLocaleString()}kg` : "—"],
          ].map(([label, value]) => (
            <div key={label} style={{ background: T.elevated, borderRadius: 12, padding: "12px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600, marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: borderColor, fontFamily: T.fontMono }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Notes / AI analysis if present */}
        {(workout.ai_analysis?.notes || workout.description) && (
          <div style={{ background: T.elevated, border: `1px solid ${T.teal}33`, borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, color: T.teal, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Notes</div>
            <div style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.5 }}>{workout.ai_analysis?.notes || workout.description}</div>
          </div>
        )}

        {/* Exercise breakdown */}
        {exercises.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, letterSpacing: 0.8, textTransform: "uppercase" }}>
              Exercises ({exercises.length})
            </div>
            {exercises.map((ex, i) => {
              const exSets   = ex.sets || [];
              const exVolume = exSets.reduce((s, set) => s + (set.weight_kg || 0) * (set.reps || 0), 0);
              const bestSet  = exSets.length > 0
                ? exSets.reduce((best, set) => (set.weight_kg || 0) > (best.weight_kg || 0) ? set : best, exSets[0])
                : null;

              return (
                <div key={i} style={{ background: T.elevated, border: `1px solid ${T.border}`, borderRadius: T.rCard, overflow: "hidden" }}>
                  {/* Exercise header */}
                  <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, borderBottom: exSets.length > 0 ? `1px solid ${T.border}` : "none" }}>
                    <div style={{ width: 26, height: 26, borderRadius: 8, background: borderColor + "22", display: "flex", alignItems: "center", justifyContent: "center", color: borderColor, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                      {i + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{ex.name}</div>
                      {(exVolume > 0 || bestSet) && (
                        <div style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, marginTop: 1 }}>
                          {exSets.length} sets
                          {exVolume > 0 && ` · ${Math.round(exVolume).toLocaleString()}kg vol`}
                          {bestSet?.weight_kg > 0 && ` · best ${bestSet.weight_kg}kg×${bestSet.reps}`}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono }}>{exSets.length} sets</span>
                  </div>

                  {/* Set table */}
                  {exSets.length > 0 && (
                    <div>
                      {/* Column headers */}
                      <div style={{ display: "grid", gridTemplateColumns: "32px 1fr 1fr 1fr", padding: "6px 14px", borderBottom: `1px solid ${T.border}`, background: T.surface }}>
                        {["#", "Weight", "Reps", "RPE"].map((h) => (
                          <div key={h} style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, textAlign: "center" }}>{h}</div>
                        ))}
                      </div>
                      {exSets.map((set, si) => (
                        <div
                          key={si}
                          style={{ display: "grid", gridTemplateColumns: "32px 1fr 1fr 1fr", padding: "8px 14px", borderBottom: si < exSets.length - 1 ? `1px solid ${T.border}` : "none", background: si % 2 === 1 ? T.surface + "66" : "transparent" }}
                        >
                          <div style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono, textAlign: "center" }}>{si + 1}</div>
                          <div style={{ fontSize: 13, color: (set.weight_kg || 0) > 0 ? T.text : T.textDim, fontFamily: T.fontMono, textAlign: "center", fontWeight: 600 }}>
                            {set.weight_kg > 0 ? `${set.weight_kg}kg` : "—"}
                          </div>
                          <div style={{ fontSize: 13, color: (set.reps || 0) > 0 ? T.text : T.textDim, fontFamily: T.fontMono, textAlign: "center", fontWeight: 600 }}>
                            {set.reps > 0 ? set.reps : "—"}
                          </div>
                          <div style={{ fontSize: 11, color: set.rpe ? T.amber : T.textDim, fontFamily: T.fontMono, textAlign: "center" }}>
                            {set.rpe || "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "24px 0", color: T.textDim, fontSize: 13 }}>
            No exercise data recorded for this session.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────
export default function WorkoutHistory({ history, loading, onSelect }) {
  const [filter,          setFilter]   = useState("all");
  const [search,          setSearch]   = useState("");
  const [selectedWorkout, setSelected] = useState(null);

  const filtered = useMemo(() => {
    let data = [...history];
    if (filter !== "all") data = data.filter((w) => (w.workout_type || "strength") === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter(
        (w) =>
          (w.name || "").toLowerCase().includes(q) ||
          (w.exercises || []).some((e) => (e.name || "").toLowerCase().includes(q))
      );
    }
    return data.sort((a, b) => new Date(b.date || b.loggedAt) - new Date(a.date || a.loggedAt));
  }, [history, filter, search]);

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "0 20px" }}>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!filtered.length) {
    return (
      <IllustratedEmptyState
        variant="workout"
        action={
          <span style={{ fontSize: 12, color: T.textDim }}>
            {search || filter !== "all" ? "Try adjusting your filters." : "Log your first session to see history here."}
          </span>
        }
      />
    );
  }

  return (
    <>
      <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Search & filters */}
        <div style={{ display: "flex", gap: 8, flexDirection: "column" }}>
          <div style={{ position: "relative" }}>
            <Icon name="search" size={14} color={T.textDim} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search workouts or exercises…"
              style={{ width: "100%", background: T.elevated, border: `1px solid ${T.border}`, borderRadius: T.rInput, padding: "10px 12px 10px 36px", color: T.text, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
            />
          </div>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none" }}>
            {FILTERS.map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ flexShrink: 0, padding: "5px 12px", borderRadius: 9999, background: filter === f ? T.teal : T.elevated, color: filter === f ? "#0A0A0F" : T.text, border: `1px solid ${filter === f ? T.teal : T.border}`, fontSize: 11, fontWeight: filter === f ? 700 : 500, cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize" }}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* History list */}
        {filtered.map((w) => {
          const type        = w.workout_type || "strength";
          const borderColor = type === "hyrox" ? T.violet : type === "strength" ? T.teal : T.amber;
          const iconName    = type === "strength" ? "dumbbell" : type === "hyrox" ? "bolt" : "run";
          const totalSets   = (w.exercises || []).reduce((s, e) => s + (e.sets?.length || 0), 0);
          const totalVolume = (w.exercises || []).reduce(
            (s, e) => s + (e.sets || []).reduce((ss, set) => ss + (set.weight_kg || 0) * (set.reps || 0), 0),
            0
          );
          const hasExerciseData = totalSets > 0;

          return (
            <div
              key={w.id || w.loggedAt}
              onClick={() => { setSelected(w); onSelect?.(w); }}
              style={{ background: T.surface, border: `1px solid ${T.border}`, borderLeft: `3px solid ${borderColor}`, borderRadius: T.rCard, padding: "14px 16px", cursor: "pointer", display: "flex", gap: 12, transition: "background 0.12s" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = T.elevated)}
              onMouseLeave={(e) => (e.currentTarget.style.background = T.surface)}
            >
              <div style={{ width: 36, height: 36, borderRadius: 10, background: borderColor + "22", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon name={iconName} size={18} color={borderColor} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: T.text, textTransform: "capitalize" }}>{w.name || type}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: borderColor, background: borderColor + "22", padding: "2px 8px", borderRadius: 6, textTransform: "uppercase" }}>{type}</span>
                </div>
                <div style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono, marginBottom: 6 }}>
                  {(w.date || w.loggedAt || "").slice(0, 10)} · {w.duration_minutes || 0}m
                  {hasExerciseData && ` · ${totalSets} sets`}
                </div>
                {totalVolume > 0 && (
                  <div style={{ fontSize: 11, color: T.teal, fontFamily: T.fontMono, fontWeight: 600, marginBottom: 4 }}>
                    {Math.round(totalVolume).toLocaleString()} kg volume
                  </div>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {(w.exercises || []).slice(0, 4).map((e) => (
                    <span key={e.name} style={{ fontSize: 10, color: T.textMuted, background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 5, padding: "2px 7px" }}>
                      {e.name}
                    </span>
                  ))}
                  {(w.exercises || []).length > 4 && (
                    <span style={{ fontSize: 10, color: T.textDim }}>+{(w.exercises || []).length - 4} more</span>
                  )}
                </div>
              </div>
              {/* Tap hint */}
              <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                <Icon name="chev-right" size={14} color={T.textDim} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail modal */}
      {selectedWorkout && (
        <WorkoutDetailModal workout={selectedWorkout} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
