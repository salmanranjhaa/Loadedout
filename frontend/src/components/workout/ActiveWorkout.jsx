import { useState, useEffect, useRef, useCallback } from "react";
import { T } from "../../design/tokens";
import { Icon } from "../../design/icons";
import { Badge, BottomSheet } from "../../design/components";
import ExerciseBrowser from "./ExerciseBrowser";

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function getLastPerformance(exerciseName) {
  try {
    const data = JSON.parse(localStorage.getItem("lo_workout_history") || "[]");
    for (let i = data.length - 1; i >= 0; i--) {
      const ex = data[i].exercises?.find((e) => e.name === exerciseName);
      if (ex?.sets?.length) {
        const best = ex.sets.reduce((max, s) => (s.weight_kg > max.weight_kg ? s : max), ex.sets[0]);
        return best;
      }
    }
  } catch {}
  return null;
}

function getPR(exerciseName) {
  try {
    const prs = JSON.parse(localStorage.getItem("lo_prs") || "{}");
    return prs[exerciseName] || null;
  } catch {}
  return null;
}

function savePR(exerciseName, weight_kg, reps) {
  try {
    const prs = JSON.parse(localStorage.getItem("lo_prs") || "{}");
    const current = prs[exerciseName];
    if (!current || weight_kg > current.weight_kg) {
      prs[exerciseName] = { weight_kg, reps, date: new Date().toISOString().slice(0, 10) };
      localStorage.setItem("lo_prs", JSON.stringify(prs));
      return true;
    }
  } catch {}
  return false;
}

function saveWorkoutToHistory(workout) {
  try {
    const data = JSON.parse(localStorage.getItem("lo_workout_history") || "[]");
    data.push({ ...workout, loggedAt: new Date().toISOString() });
    localStorage.setItem("lo_workout_history", JSON.stringify(data.slice(-100)));
  } catch {}
}

export default function ActiveWorkout({ open, onClose, template, onFinish }) {
  const [exercises, setExercises] = useState(() => {
    if (template?.exercises) {
      return template.exercises.map((ex) => ({
        name: typeof ex === "string" ? ex : ex.name,
        sets: [{ reps: "", weight_kg: "", rpe: "", done: false }],
      }));
    }
    return [];
  });
  const [sessionStart] = useState(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [restTimer, setRestTimer] = useState(0);
  const [restActive, setRestActive] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [celebration, setCelebration] = useState(null);
  const restInterval = useRef(null);
  const timerInterval = useRef(null);

  useEffect(() => {
    if (!open) return;
    timerInterval.current = setInterval(() => setElapsed(Math.floor((Date.now() - sessionStart) / 1000)), 1000);
    return () => clearInterval(timerInterval.current);
  }, [open, sessionStart]);

  useEffect(() => {
    if (restActive && restTimer > 0) {
      restInterval.current = setInterval(() => {
        setRestTimer((t) => {
          if (t <= 1) {
            setRestActive(false);
            clearInterval(restInterval.current);
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    }
    return () => clearInterval(restInterval.current);
  }, [restActive, restTimer]);

  const addExercise = useCallback((ex) => {
    const last = getLastPerformance(ex.name);
    setExercises((prev) => [
      ...prev,
      {
        name: ex.name,
        sets: [{ reps: last ? String(last.reps) : "", weight_kg: last ? String(last.weight_kg) : "", rpe: "", done: false }],
      },
    ]);
    setShowBrowser(false);
  }, []);

  const addSet = (exIndex) => {
    setExercises((prev) => {
      const next = [...prev];
      const lastSet = next[exIndex].sets[next[exIndex].sets.length - 1];
      next[exIndex].sets.push({
        reps: lastSet ? String(lastSet.reps) : "",
        weight_kg: lastSet ? String(lastSet.weight_kg) : "",
        rpe: "",
        done: false,
      });
      return next;
    });
  };

  const removeSet = (exIndex, setIndex) => {
    setExercises((prev) => {
      const next = [...prev];
      next[exIndex].sets = next[exIndex].sets.filter((_, i) => i !== setIndex);
      return next;
    });
  };

  const updateSet = (exIndex, setIndex, field, value) => {
    setExercises((prev) => {
      const next = [...prev];
      next[exIndex].sets[setIndex][field] = value;
      return next;
    });
  };

  const toggleSetDone = (exIndex, setIndex) => {
    setExercises((prev) => {
      const next = [...prev];
      const set = next[exIndex].sets[setIndex];
      set.done = !set.done;
      if (set.done) {
        const weight = parseFloat(set.weight_kg) || 0;
        const reps = parseInt(set.reps) || 0;
        if (weight > 0 && savePR(next[exIndex].name, weight, reps)) {
          setCelebration({ exercise: next[exIndex].name, weight, reps });
          setTimeout(() => setCelebration(null), 2500);
        }
        setRestActive(true);
        setRestTimer(90);
      }
      return next;
    });
  };

  const removeExercise = (exIndex) => {
    setExercises((prev) => prev.filter((_, i) => i !== exIndex));
  };

  const handleFinish = () => {
    const workout = {
      name: template?.name || "Quick Workout",
      duration_minutes: Math.floor(elapsed / 60),
      exercises: exercises.map((ex) => ({
        name: ex.name,
        sets: ex.sets.filter((s) => s.done).map((s) => ({
          reps: parseInt(s.reps) || 0,
          weight_kg: parseFloat(s.weight_kg) || 0,
          rpe: parseInt(s.rpe) || null,
        })),
      })),
    };
    saveWorkoutToHistory(workout);
    onFinish?.(workout);
    onClose?.();
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: T.z.modal,
        background: T.bg,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <button
          onClick={onClose}
          style={{
            width: 34,
            height: 34,
            borderRadius: 9999,
            background: T.elevated,
            border: `1px solid ${T.border}`,
            color: T.text,
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <Icon name="chev-left" size={16} />
        </button>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{template?.name || "Workout"}</div>
          <div style={{ fontSize: 11, color: T.teal, fontFamily: T.fontMono, marginTop: 2 }}>{formatTime(elapsed)}</div>
        </div>
        <button
          onClick={handleFinish}
          style={{
            padding: "6px 14px",
            background: T.teal,
            color: "#0A0A0F",
            border: "none",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Finish
        </button>
      </div>

      {/* Rest timer overlay */}
      {restActive && restTimer > 0 && (
        <div
          style={{
            background: T.elevated,
            borderBottom: `1px solid ${T.border}`,
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
            animation: "lo-fade-up 0.2s ease",
          }}
        >
          <span style={{ fontSize: 12, color: T.textMuted, fontWeight: 600 }}>Rest</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: T.teal, fontFamily: T.fontMono }}>{formatTime(restTimer)}</span>
          <div style={{ display: "flex", gap: 4 }}>
            {[30, 60, 90, 120, 180].map((s) => (
              <button
                key={s}
                onClick={() => setRestTimer(s)}
                style={{
                  padding: "3px 8px",
                  background: restTimer === s ? T.teal + "33" : T.elevated2,
                  border: `1px solid ${restTimer === s ? T.teal : T.border}`,
                  borderRadius: 6,
                  fontSize: 10,
                  color: restTimer === s ? T.teal : T.textMuted,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {s}s
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Exercises */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 16 }}>
        {exercises.map((ex, exIndex) => {
          const last = getLastPerformance(ex.name);
          const pr = getPR(ex.name);
          return (
            <div key={exIndex} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rCard, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: T.teal + "22", display: "flex", alignItems: "center", justifyContent: "center", color: T.teal, fontSize: 12, fontWeight: 700 }}>
                  {exIndex + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{ex.name}</div>
                  <div style={{ fontSize: 10, color: T.textDim, marginTop: 1 }}>
                    {last ? `Last: ${last.weight_kg}kg × ${last.reps}` : "No history"}
                    {pr ? ` · PR: ${pr.weight_kg}kg` : ""}
                  </div>
                </div>
                <button onClick={() => removeExercise(exIndex)} style={{ background: "none", border: "none", cursor: "pointer", color: T.negative, padding: 4 }}>
                  <Icon name="trash" size={14} color={T.negative} />
                </button>
              </div>

              {/* Sets */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {ex.sets.map((set, setIndex) => (
                  <div
                    key={setIndex}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "28px 1fr 1fr 1fr 36px",
                      gap: 6,
                      alignItems: "center",
                      background: set.done ? T.teal + "11" : T.elevated,
                      borderRadius: 8,
                      padding: "6px 8px",
                      border: `1px solid ${set.done ? T.teal + "44" : T.border}`,
                    }}
                  >
                    <span style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono, textAlign: "center" }}>{setIndex + 1}</span>
                    <input
                      type="number"
                      placeholder="kg"
                      value={set.weight_kg}
                      onChange={(e) => updateSet(exIndex, setIndex, "weight_kg", e.target.value)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: T.text,
                        fontSize: 13,
                        fontFamily: T.fontMono,
                        textAlign: "center",
                        outline: "none",
                        width: "100%",
                      }}
                    />
                    <input
                      type="number"
                      placeholder="reps"
                      value={set.reps}
                      onChange={(e) => updateSet(exIndex, setIndex, "reps", e.target.value)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: T.text,
                        fontSize: 13,
                        fontFamily: T.fontMono,
                        textAlign: "center",
                        outline: "none",
                        width: "100%",
                      }}
                    />
                    <input
                      type="number"
                      placeholder="RPE"
                      min={1}
                      max={10}
                      value={set.rpe}
                      onChange={(e) => updateSet(exIndex, setIndex, "rpe", e.target.value)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: T.text,
                        fontSize: 13,
                        fontFamily: T.fontMono,
                        textAlign: "center",
                        outline: "none",
                        width: "100%",
                      }}
                    />
                    <button
                      onClick={() => (set.done ? toggleSetDone(exIndex, setIndex) : toggleSetDone(exIndex, setIndex))}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        background: set.done ? T.teal : T.elevated2,
                        border: `1px solid ${set.done ? T.teal : T.border}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      <Icon name="check" size={12} color={set.done ? "#0A0A0F" : T.textDim} />
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={() => addSet(exIndex)}
                style={{
                  marginTop: 8,
                  padding: "6px 0",
                  background: "none",
                  border: `1px dashed ${T.border}`,
                  borderRadius: 8,
                  color: T.textDim,
                  fontSize: 11,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                }}
              >
                <Icon name="plus" size={11} /> Add Set
              </button>
            </div>
          );
        })}

        <button
          onClick={() => setShowBrowser(true)}
          style={{
            padding: "12px 0",
            background: T.elevated,
            border: `1px dashed ${T.teal}55`,
            borderRadius: T.rCard,
            color: T.teal,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <Icon name="plus" size={14} /> Add Exercise
        </button>
      </div>

      {/* PR Celebration */}
      {celebration && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: T.z.confetti,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(10,10,15,0.7)",
            backdropFilter: "blur(4px)",
            animation: "lo-fade-up 0.3s ease",
          }}
          onClick={() => setCelebration(null)}
        >
          <div
            style={{
              background: T.surface,
              border: `1px solid ${T.teal}44`,
              borderRadius: T.rCard,
              padding: "32px 24px",
              textAlign: "center",
              maxWidth: 280,
              boxShadow: T.shadow.glow(T.teal),
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 8 }}>🏆</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.teal, marginBottom: 4 }}>New PR!</div>
            <div style={{ fontSize: 14, color: T.text, fontWeight: 600 }}>{celebration.exercise}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: T.text, fontFamily: T.fontMono, marginTop: 8 }}>
              {celebration.weight}kg
            </div>
            <div style={{ fontSize: 12, color: T.textMuted }}>× {celebration.reps} reps</div>
          </div>
        </div>
      )}

      <ExerciseBrowser open={showBrowser} onClose={() => setShowBrowser(false)} onSelectExercise={addExercise} />
    </div>
  );
}
