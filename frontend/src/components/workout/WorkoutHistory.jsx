import { useState, useMemo } from "react";
import { T } from "../../design/tokens";
import { Icon } from "../../design/icons";
import { IllustratedEmptyState, SkeletonCard } from "../../design/components";
import { workoutAPI } from "../../utils/api";
import { replaceLocalCopy } from "../../utils/workouts";
import { showToast } from "../../utils/toast";
import WorkoutDetails, { workoutStyle, summaryTiles, hasDetails } from "./WorkoutDetails";
import RouteMap from "./RouteMap";

// "2026-10-05" -> "Mon 5 Oct" (local date, same style as Budget)
function fmtDay(raw) {
  const iso = String(raw || "").slice(0, 10);
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
const sets = (n) => `${n} set${n === 1 ? "" : "s"}`;
const num = (v) => Math.max(0, parseFloat(v) || 0);
const field = {
  width: "100%", background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 10, padding: "9px 10px",
  color: T.text, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", colorScheme: "dark",
};
const labelStyle = { fontSize: 10, color: T.textMuted, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 };

// The shape of a run's route, for the history list ([[lat, lon], …])
function RouteThumb({ points, color }) {
  const W = 52, H = 44, pad = 5;
  const lat0 = points[0][0] * Math.PI / 180;
  const xs = points.map((p) => p[1] * Math.cos(lat0)), ys = points.map((p) => p[0]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const s = Math.min((W - 2 * pad) / (x1 - x0 || 1), (H - 2 * pad) / (y1 - y0 || 1));
  const ox = (W - (x1 - x0) * s) / 2, oy = (H - (y1 - y0) * s) / 2;
  const d = xs.map((x, i) => `${i ? "L" : "M"}${(ox + (x - x0) * s).toFixed(1)} ${(oy + (y1 - ys[i]) * s).toFixed(1)}`).join(" ");
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ flexShrink: 0, borderRadius: 10, background: "#141a24" }}>
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ── Join a Garmin recording and your own entry of the same session, or split them ─
function LinkPanel({ workout, history, busy, onLink, onUnlink }) {
  const [picking, setPicking] = useState(false);
  const day = String(workout.date || "").slice(0, 10);
  const sameDay = history.filter((w) => w.id && w.id !== workout.id && String(w.date || "").slice(0, 10) === day);
  const suggested = (workout.details?.link_suggestions || []).map((id) => sameDay.find((w) => w.id === id)).filter(Boolean);
  const box = { background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 12, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 };
  const title = { fontSize: 11, fontWeight: 600, color: T.textMuted, letterSpacing: 0.6, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 };
  const choice = (w) => (
    <button key={w.id} disabled={busy} onClick={() => onLink(w)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, color: T.text, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
      <span style={{ flex: 1 }}>
        {w.name || w.workout_type}
        <span style={{ color: T.textDim, fontFamily: T.fontMono, fontSize: 11 }}> · {w.duration_minutes || 0}m{w.details?.start_time ? ` · ${w.details.start_time}` : ""}{w.garmin_activity_id ? " · Garmin" : ""}</span>
      </span>
      <span style={{ color: T.teal, fontWeight: 700 }}>Join</span>
    </button>
  );

  if (workout.linked) {
    return (
      <div style={box}>
        <div style={title}><Icon name="link" size={13} color={T.sky} /> Joined into one workout</div>
        <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.5 }}>Garmin's recording and your own entry of this session: measured numbers and route from Garmin, name, notes and parts from you. Counted once.</div>
        <button disabled={busy} onClick={onUnlink} style={{ alignSelf: "flex-start", padding: "7px 12px", background: "transparent", border: `1px solid ${T.border}`, borderRadius: 9999, color: T.text, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Split again</button>
      </div>
    );
  }
  return (
    <>
      {suggested.length > 0 && (
        <div style={{ ...box, borderColor: `${T.amber}66` }}>
          <div style={{ ...title, color: T.amber }}><Icon name="link" size={13} color={T.amber} /> Same session as one of these?</div>
          {suggested.map(choice)}
        </div>
      )}
      {sameDay.length > 0 && suggested.length === 0 && (picking ? (
        <div style={box}>
          <div style={title}><Icon name="link" size={13} color={T.textMuted} /> Join with…</div>
          {sameDay.map(choice)}
          <button onClick={() => setPicking(false)} style={{ alignSelf: "flex-start", background: "none", border: "none", color: T.textMuted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
        </div>
      ) : (
        <button onClick={() => setPicking(true)} style={{ display: "flex", alignItems: "center", gap: 6, alignSelf: "flex-start", background: "none", border: "none", color: T.sky, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
          <Icon name="link" size={13} color={T.sky} /> Same session as another workout that day? Join them
        </button>
      ))}
    </>
  );
}

// ── Workout detail bottom-sheet (view, edit, delete) ──────────────────────────
function WorkoutDetailModal({ workout, history = [], onClose, onChanged }) {
  const [draft, setDraft] = useState(null); // set while editing
  const [busy, setBusy] = useState(false);
  if (!workout) return null;

  function startEdit() {
    setDraft({
      name: workout.name || "",
      date: String(workout.date || workout.loggedAt || "").slice(0, 10),
      duration: String(workout.duration_minutes || ""),
      exercises: (workout.exercises || []).map((e) => ({ name: e.name, sets: (e.sets || []).map((s) => ({ ...s })) })),
    });
  }

  const editEx = (ei, fn) => setDraft((d) => ({ ...d, exercises: d.exercises.map((e, i) => (i === ei ? fn(e) : e)) }));
  const setSet = (ei, si, key, value) => editEx(ei, (e) => ({ ...e, sets: e.sets.map((s, j) => (j === si ? { ...s, [key]: value } : s)) }));
  const removeSet = (ei, si) => editEx(ei, (e) => ({ ...e, sets: e.sets.filter((_, j) => j !== si) }));
  const addSet = (ei) => editEx(ei, (e) => ({ ...e, sets: [...e.sets, { ...(e.sets[e.sets.length - 1] || { reps: 0, weight_kg: 0 }) }] }));
  const removeExercise = (ei) => setDraft((d) => ({ ...d, exercises: d.exercises.filter((_, i) => i !== ei) }));

  async function save() {
    const name = draft.name.trim() || workout.name || "Workout";
    const date = draft.date || String(workout.date || workout.loggedAt || "").slice(0, 10);
    const duration_minutes = Math.max(1, Math.round(num(draft.duration)));
    const exercises = draft.exercises
      .map((e) => ({ name: e.name, sets: e.sets.map((s) => ({ ...s, reps: Math.round(num(s.reps)), weight_kg: num(s.weight_kg) })) }))
      .filter((e) => e.sets.length > 0);
    const volume = Math.round(exercises.reduce((t, e) => t + e.sets.reduce((u, s) => u + s.weight_kg * s.reps, 0), 0));
    setBusy(true);
    try {
      if (workout.id) {
        const notes = workout.notes || "";
        await workoutAPI.update(workout.id, {
          date,
          duration_minutes,
          details: { ...(workout.details || {}), name, exercises, total_volume_kg: volume },
          // Live sessions lead their notes with the name ("Push Day — 3 exercises…"); keep that in step
          ...(notes.startsWith(`${workout.name} — `) ? { description: `${name} — ${exercises.length} exercises, ${volume}kg total volume` } : {}),
        });
      }
      replaceLocalCopy(workout, { name, date, duration_minutes, exercises });
      showToast("Workout updated", "success");
      onChanged?.();
      onClose();
    } catch (e) {
      showToast(e?.message || "Couldn't save the workout", "error");
    }
    setBusy(false);
  }

  async function remove() {
    if (!window.confirm(`Delete ${workout.name || "this workout"}?`)) return;
    setBusy(true);
    try {
      if (workout.id) await workoutAPI.delete(workout.id);
      replaceLocalCopy(workout, null);
      showToast("Workout deleted", "success");
      onChanged?.();
      onClose();
    } catch (e) {
      showToast(e?.message || "Couldn't delete the workout", "error");
    }
    setBusy(false);
  }

  async function linkTo(other) {
    setBusy(true);
    try {
      await workoutAPI.link(workout.id, other.id);
      showToast("Joined into one workout", "success");
      onChanged?.();
      onClose();
    } catch (e) {
      showToast(e?.message || "Couldn't join the workouts", "error");
    }
    setBusy(false);
  }

  async function unlinkIt() {
    if (!window.confirm("Split this back into the Garmin recording and your own entry? They won't be joined again automatically.")) return;
    setBusy(true);
    try {
      await workoutAPI.unlink(workout.id);
      showToast("Split into two workouts", "success");
      onChanged?.();
      onClose();
    } catch (e) {
      showToast(e?.message || "Couldn't split the workout", "error");
    }
    setBusy(false);
  }

  const type        = workout.workout_type || "strength";
  const { color: borderColor, icon: iconName } = workoutStyle(type);
  const d           = workout.details || {};
  const exercises   = workout.exercises || [];
  const ownNotes    = workout.notes && !workout.notes.startsWith(`${workout.name} — `) ? workout.notes : null;
  const noteText    = workout.ai_analysis?.notes || workout.description || d.notes || ownNotes;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: T.z.modal + 20, paddingTop: "env(safe-area-inset-top, 0px)", background: "rgba(10,11,16,0.92)", display: "flex", alignItems: "flex-end", backdropFilter: "blur(6px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{ width: "100%", background: T.surface, borderRadius: "20px 20px 0 0", border: `1px solid ${T.border}`, borderBottom: "none", padding: "20px 20px 24px", marginBottom: T.navHeight, maxHeight: `calc(100% - ${T.navHeight})`, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto", animation: "lo-slide-up 0.25s cubic-bezier(0.32,0.72,0,1) forwards" }}
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
            <div style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono, marginTop: 2, textTransform: "capitalize" }}>
              {[fmtDay(workout.date || workout.loggedAt), d.start_time, d.subtype && String(d.subtype).replace(/_/g, " "), d.location].filter(Boolean).join(" · ")}
            </div>
          </div>
          <button aria-label="Close" title="Close" onClick={onClose} style={{ background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 9999, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            <Icon name="x" size={14} color={T.textMuted} />
          </button>
        </div>

        {draft ? (
          <>
            <div>
              <div style={labelStyle}>Name</div>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Push Day" style={field} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={labelStyle}>Date</div>
                <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} style={field} />
              </div>
              <div>
                <div style={labelStyle}>Duration (min)</div>
                <input type="number" inputMode="numeric" min={1} value={draft.duration} onChange={(e) => setDraft({ ...draft, duration: e.target.value })} style={field} />
              </div>
            </div>

            {draft.exercises.map((ex, ei) => (
              <div key={ei} style={{ background: T.elevated, border: `1px solid ${T.border}`, borderRadius: T.rCard, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: T.text }}>{ex.name}</div>
                  <button aria-label={`Remove ${ex.name}`} title="Remove exercise" onClick={() => removeExercise(ei)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                    <Icon name="trash" size={14} color={T.negative} />
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "24px 1fr 1fr 28px", gap: 6, alignItems: "center" }}>
                  {["#", "Weight (kg)", "Reps", ""].map((h) => (
                    <div key={h} style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, textAlign: "center" }}>{h}</div>
                  ))}
                  {ex.sets.map((s, si) => [
                    <div key={`n${si}`} style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono, textAlign: "center" }}>{si + 1}</div>,
                    <input key={`w${si}`} aria-label={`${ex.name} set ${si + 1} weight`} type="number" inputMode="decimal" min={0} step="0.5" value={s.weight_kg ?? ""} onChange={(e) => setSet(ei, si, "weight_kg", e.target.value)} style={{ ...field, textAlign: "center", fontFamily: T.fontMono }} />,
                    <input key={`r${si}`} aria-label={`${ex.name} set ${si + 1} reps`} type="number" inputMode="numeric" min={0} value={s.reps ?? ""} onChange={(e) => setSet(ei, si, "reps", e.target.value)} style={{ ...field, textAlign: "center", fontFamily: T.fontMono }} />,
                    <button key={`x${si}`} aria-label={`Remove set ${si + 1}`} title="Remove set" onClick={() => removeSet(ei, si)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", justifyContent: "center" }}>
                      <Icon name="x" size={13} color={T.textMuted} />
                    </button>,
                  ])}
                </div>
                <button onClick={() => addSet(ei)} style={{ padding: "7px 0", background: "transparent", border: `1px dashed ${T.teal}55`, borderRadius: 8, color: T.teal, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  + Add set
                </button>
              </div>
            ))}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setDraft(null)} disabled={busy} style={{ flex: 1, padding: "13px 0", background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 12, color: T.text, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                Cancel
              </button>
              <button onClick={save} disabled={busy} style={{ flex: 2, padding: "13px 0", background: busy ? T.elevated : T.teal, border: "none", borderRadius: 12, color: busy ? T.textMuted : "#0A0A0F", fontSize: 14, fontWeight: 700, cursor: busy ? "default" : "pointer", fontFamily: "inherit" }}>
                {busy ? "Saving…" : "Save changes"}
              </button>
            </div>
          </>
        ) : (
        <>
        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {summaryTiles(workout).map(([label, value]) => (
            <div key={label} style={{ background: T.elevated, borderRadius: 12, padding: "12px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600, marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: borderColor, fontFamily: T.fontMono }}>{value}</div>
            </div>
          ))}
        </div>

        {workout.has_track && <RouteMap workoutId={workout.id} color={borderColor} />}

        <WorkoutDetails workout={workout} color={borderColor} />

        {/* Notes / AI analysis if present. Live sessions lead their notes with an
            auto summary ("Push Day — 3 exercises…"), which the tiles already show. */}
        {noteText && (
          <div style={{ background: T.elevated, border: `1px solid ${T.teal}33`, borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, color: T.teal, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Notes</div>
            <div style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{noteText}</div>
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
                          {sets(exSets.length)}
                          {exVolume > 0 && ` · ${Math.round(exVolume).toLocaleString()}kg vol`}
                          {bestSet?.weight_kg > 0 && ` · best ${bestSet.weight_kg}kg×${bestSet.reps}`}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono }}>{sets(exSets.length)}</span>
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
        ) : !hasDetails(d) && !noteText && (
          <div style={{ textAlign: "center", padding: "24px 0", color: T.textDim, fontSize: 13 }}>
            No exercise data recorded for this session.
          </div>
        )}

        {workout.id && <LinkPanel workout={workout} history={history} busy={busy} onLink={linkTo} onUnlink={unlinkIt} />}

        <div style={{ display: "flex", gap: 8 }}>
          <button aria-label="Delete workout" title="Delete" onClick={remove} disabled={busy} style={{ width: 52, flexShrink: 0, background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="trash" size={17} color={T.negative} />
          </button>
          <button onClick={startEdit} style={{ flex: 1, padding: "13px 0", background: T.teal, border: "none", borderRadius: 12, color: "#0A0A0F", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Icon name="edit" size={15} color="#0A0A0F" /> Edit workout
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────
export default function WorkoutHistory({ history, loading, onSelect, onChanged }) {
  const [filter,          setFilter]   = useState("all");
  const [search,          setSearch]   = useState("");
  const [selectedWorkout, setSelected] = useState(null);
  const filters = useMemo(() => ["all", ...new Set(history.map((w) => w.workout_type || "strength"))], [history]);

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
            {filters.map((f) => (
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
          const { color: borderColor, icon: iconName } = workoutStyle(type);
          const km          = w.details?.distance_km;
          const tags        = (w.exercises || []).length ? w.exercises : Array.isArray(w.details?.parts) ? w.details.parts.filter((p) => p?.name) : [];
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
              {w.route_preview?.length > 1 ? (
                <RouteThumb points={w.route_preview} color={borderColor} />
              ) : (
                <div style={{ width: 36, height: 36, borderRadius: 10, background: borderColor + "22", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon name={iconName} size={18} color={borderColor} />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: T.text, textTransform: "capitalize" }}>{w.name || type}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: borderColor, background: borderColor + "22", padding: "2px 8px", borderRadius: 6, textTransform: "uppercase" }}>{type}</span>
                </div>
                <div style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono, marginBottom: 6 }}>
                  {fmtDay(w.date || w.loggedAt)} · {w.duration_minutes || 0}m
                  {km != null && ` · ${km} km`}
                  {hasExerciseData && ` · ${sets(totalSets)}`}
                </div>
                {totalVolume > 0 && (
                  <div style={{ fontSize: 11, color: T.teal, fontFamily: T.fontMono, fontWeight: 600, marginBottom: 4 }}>
                    {Math.round(totalVolume).toLocaleString()} kg volume
                  </div>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {tags.slice(0, 4).map((e, i) => (
                    <span key={i} style={{ fontSize: 10, color: T.textMuted, background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 5, padding: "2px 7px" }}>
                      {e.name}
                    </span>
                  ))}
                  {tags.length > 4 && (
                    <span style={{ fontSize: 10, color: T.textDim }}>+{tags.length - 4} more</span>
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
        <WorkoutDetailModal key={selectedWorkout.id || selectedWorkout.loggedAt} workout={selectedWorkout} history={history} onClose={() => setSelected(null)} onChanged={onChanged} />
      )}
    </>
  );
}
