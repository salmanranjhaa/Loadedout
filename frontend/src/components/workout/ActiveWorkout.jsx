import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { T, muscleColors } from "../../design/tokens";
import { Icon } from "../../design/icons";
import { Badge, BottomSheet } from "../../design/components";
import ExerciseBrowser from "./ExerciseBrowser";
import { workoutAPI, prAPI } from "../../utils/api";
import { showToast } from "../../utils/toast";

function localISODate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function getHistory() {
  try { return JSON.parse(localStorage.getItem("lo_workout_history") || "[]"); } catch { return []; }
}

function getLastPerformance(exerciseName) {
  const data = getHistory();
  for (let i = data.length - 1; i >= 0; i--) {
    const ex = data[i].exercises?.find((e) => e.name === exerciseName);
    if (ex?.sets?.length) {
      return ex.sets.filter((s) => s.reps > 0);
    }
  }
  return null;
}

function getPR(exerciseName) {
  try { return JSON.parse(localStorage.getItem("lo_prs") || "{}")[exerciseName] || null; } catch { return null; }
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
    const data = getHistory();
    data.push({ ...workout, loggedAt: new Date().toISOString() });
    localStorage.setItem("lo_workout_history", JSON.stringify(data.slice(-100)));
  } catch {}
}

// Progressive overload: suggest +2.5kg if all sets done, stay same if 1+ missed
function getSuggestedWeight(lastSets) {
  if (!lastSets?.length) return null;
  const allCompleted = lastSets.every((s) => (s.reps || 0) >= 8);
  const topWeight = Math.max(...lastSets.map((s) => parseFloat(s.weight_kg) || 0));
  if (topWeight <= 0) return null;
  const increment = topWeight >= 100 ? 5 : 2.5;
  return allCompleted ? topWeight + increment : topWeight;
}

// Estimated 1RM from Epley formula
function estimate1RM(weight, reps) {
  if (!weight || !reps || reps <= 0) return null;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

// ── Focusable set input ───────────────────────────────────────────────────────
function SetInput({ value, onChange, placeholder, inputMode = "decimal", color, min, max }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type="number"
      inputMode={inputMode}
      placeholder={placeholder}
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        width: "100%",
        height: 44,
        background: focused ? T.elevated2 : T.elevated,
        border: `1.5px solid ${focused ? T.teal : T.border}`,
        borderRadius: 10,
        color: color || T.text,
        fontSize: 16,
        fontFamily: T.fontMono,
        fontWeight: 600,
        textAlign: "center",
        outline: "none",
        padding: "0 4px",
        boxSizing: "border-box",
        cursor: "text",
        transition: "border-color 0.15s, background 0.15s",
      }}
    />
  );
}

function SetRow({ set, setIndex, exIndex, onUpdate, onToggleDone, onToggleWarmup }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "28px 44px 1fr 1fr 1fr 44px",
      gap: 6,
      alignItems: "center",
      background: set.done ? `${T.teal}14` : set.isWarmup ? `${T.amber}0C` : "transparent",
      borderRadius: 10,
      padding: "4px 0",
      transition: "background 0.15s",
    }}>
      {/* Set number */}
      <div style={{ fontSize: 12, color: T.textDim, fontFamily: T.fontMono, textAlign: "center", fontWeight: 600 }}>
        {setIndex + 1}
      </div>

      {/* Warmup toggle */}
      <button
        onClick={() => onToggleWarmup(exIndex, setIndex)}
        style={{
          height: 44, width: "100%", background: set.isWarmup ? `${T.amber}33` : T.elevated,
          border: `1.5px solid ${set.isWarmup ? T.amber : T.border}`,
          borderRadius: 10, fontSize: 11, color: set.isWarmup ? T.amber : T.textDim,
          cursor: "pointer", fontFamily: "inherit", fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.15s",
        }}
      >
        W
      </button>

      <SetInput
        value={set.weight_kg}
        onChange={(v) => onUpdate(exIndex, setIndex, "weight_kg", v)}
        placeholder="kg"
        inputMode="decimal"
      />
      <SetInput
        value={set.reps}
        onChange={(v) => onUpdate(exIndex, setIndex, "reps", v)}
        placeholder="—"
        inputMode="numeric"
      />
      <SetInput
        value={set.rpe}
        onChange={(v) => onUpdate(exIndex, setIndex, "rpe", v)}
        placeholder="—"
        inputMode="numeric"
        min={1}
        max={10}
        color={set.rpe ? T.amber : undefined}
      />

      {/* Done button */}
      <button
        onClick={() => onToggleDone(exIndex, setIndex)}
        style={{
          height: 44, width: 44, borderRadius: 10,
          background: set.done ? T.teal : T.elevated,
          border: `1.5px solid ${set.done ? T.teal : T.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", padding: 0, flexShrink: 0, transition: "all 0.15s",
        }}
      >
        <Icon name="check" size={16} color={set.done ? "#0A0A0F" : T.textDim} />
      </button>
    </div>
  );
}

// ── Post-workout summary screen ───────────────────────────────────────────────
function WorkoutSummary({ workout, onClose }) {
  const totalSets   = workout.exercises.reduce((s, e) => s + e.sets.length, 0);
  const totalVolume = workout.exercises.reduce(
    (s, e) => s + e.sets.reduce((ss, set) => ss + (set.weight_kg || 0) * (set.reps || 0), 0), 0
  );
  const prCount = workout.exercises.reduce((n, e) => n + (e.newPR ? 1 : 0), 0);
  const durationStr = `${Math.floor(workout.duration_seconds / 60)}m ${workout.duration_seconds % 60}s`;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: T.z.modal + 30, background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, animation: "lo-fade-up 0.3s ease" }}>
      {/* Glow orb */}
      <div style={{ position: "absolute", top: "20%", left: "50%", transform: "translateX(-50%)", width: 300, height: 300, borderRadius: "50%", background: `radial-gradient(circle, ${T.teal}22, transparent 70%)`, pointerEvents: "none" }} />

      <div style={{ width: "100%", maxWidth: 380, display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
        {/* Trophy + title */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>
            {prCount > 0 ? "🏆" : totalVolume > 5000 ? "🔥" : "✅"}
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: T.text, letterSpacing: -0.5 }}>
            {prCount > 0 ? `${prCount} PR${prCount > 1 ? "s" : ""} today!` : "Workout done!"}
          </div>
          <div style={{ fontSize: 14, color: T.textMuted, marginTop: 6 }}>{workout.name}</div>
        </div>

        {/* Stats grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, width: "100%" }}>
          {[
            ["Duration",  durationStr,                      T.teal],
            ["Sets",      String(totalSets),                T.violet],
            ["Volume",    totalVolume > 0 ? `${Math.round(totalVolume).toLocaleString()}kg` : "—", T.amber],
            ["Exercises", String(workout.exercises.length), T.teal],
          ].map(([label, value, color]) => (
            <div key={label} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: "16px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600, marginBottom: 8 }}>{label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color, fontFamily: T.fontMono }}>{value}</div>
            </div>
          ))}
        </div>

        {/* PR list */}
        {workout.exercises.filter((e) => e.newPR).length > 0 && (
          <div style={{ width: "100%", background: T.teal + "18", border: `1px solid ${T.teal}44`, borderRadius: 16, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.teal, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>New Personal Records</div>
            {workout.exercises.filter((e) => e.newPR).map((e) => (
              <div key={e.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0" }}>
                <span style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>{e.name}</span>
                <span style={{ fontSize: 13, color: T.teal, fontFamily: T.fontMono, fontWeight: 700 }}>{e.newPR.weight_kg}kg × {e.newPR.reps}</span>
              </div>
            ))}
          </div>
        )}

        {/* Exercise volume breakdown */}
        {workout.exercises.length > 0 && (
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
            {workout.exercises.slice(0, 5).map((ex) => {
              const vol = ex.sets.reduce((s, set) => s + (set.weight_kg || 0) * (set.reps || 0), 0);
              return (
                <div key={ex.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${T.border}` }}>
                  <span style={{ fontSize: 13, color: T.textMuted, fontWeight: 500 }}>{ex.name}</span>
                  <span style={{ fontSize: 12, color: T.textDim, fontFamily: T.fontMono }}>{ex.sets.length} sets{vol > 0 ? ` · ${Math.round(vol)}kg` : ""}</span>
                </div>
              );
            })}
          </div>
        )}

        <button
          onClick={onClose}
          style={{ width: "100%", padding: "14px 0", background: T.teal, color: "#0A0A0F", border: "none", borderRadius: T.rCard, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ActiveWorkout({ open, onClose, template, onFinish }) {
  // Pre-populate exercises from last performance when loading from template
  const [exercises, setExercises] = useState(() => {
    if (Array.isArray(template?.exercises)) {
      return template.exercises.map((ex) => {
        const name      = typeof ex === "string" ? ex : ex.name;
        const lastSets  = getLastPerformance(name);
        const suggested = getSuggestedWeight(lastSets);
        const lastReps  = lastSets?.length > 0 ? String(lastSets[lastSets.length - 1].reps) : "";
        return {
          name,
          lastSets: lastSets || [],
          suggested,
          sets: [{
            reps:      lastReps,
            weight_kg: suggested ? String(suggested) : (lastSets?.[0]?.weight_kg ? String(lastSets[0].weight_kg) : ""),
            rpe:       "",
            done:      false,
            isWarmup:  false,
          }],
        };
      });
    }
    return [];
  });

  // Belt-and-suspenders: if lazy initializer ran before template arrived, sync now
  useEffect(() => {
    if (!open || !Array.isArray(template?.exercises) || !template.exercises.length || exercises.length > 0) return;
    setExercises(template.exercises.map((ex) => {
      const name      = typeof ex === "string" ? ex : (ex.name || String(ex));
      const lastSets  = getLastPerformance(name);
      const suggested = getSuggestedWeight(lastSets);
      const lastReps  = lastSets?.length > 0 ? String(lastSets[lastSets.length - 1].reps) : "";
      return {
        name, lastSets: lastSets || [], suggested,
        sets: [{ reps: lastReps, weight_kg: suggested ? String(suggested) : (lastSets?.[0]?.weight_kg ? String(lastSets[0].weight_kg) : ""), rpe: "", done: false, isWarmup: false }],
      };
    }));
  }, [open, template]);

  const [sessionStart]  = useState(Date.now());
  const [elapsed,       setElapsed]      = useState(0);
  const [restTimer,     setRestTimer]    = useState(0);
  const [restActive,    setRestActive]   = useState(false);
  const [showBrowser,   setShowBrowser]  = useState(false);
  const [celebration,   setCelebration]  = useState(null);
  const [summary,       setSummary]      = useState(null);
  const restInterval  = useRef(null);
  const timerInterval = useRef(null);
  const audioCtx      = useRef(null);

  // Elapsed timer
  useEffect(() => {
    if (!open) return;
    timerInterval.current = setInterval(() => setElapsed(Math.floor((Date.now() - sessionStart) / 1000)), 1000);
    return () => clearInterval(timerInterval.current);
  }, [open, sessionStart]);

  // Rest countdown
  useEffect(() => {
    if (restActive && restTimer > 0) {
      restInterval.current = setInterval(() => {
        setRestTimer((t) => {
          if (t <= 1) {
            setRestActive(false);
            clearInterval(restInterval.current);
            playBeep();
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    }
    return () => clearInterval(restInterval.current);
  }, [restActive, restTimer]);

  function playBeep() {
    try {
      if (!audioCtx.current) audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtx.current;
      [0, 0.15, 0.3].forEach((delay) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type     = "sine";
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.3, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.15);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.15);
      });
    } catch {}
  }

  const addExercise = useCallback((ex) => {
    const lastSets  = getLastPerformance(ex.name);
    const suggested = getSuggestedWeight(lastSets);
    const lastReps  = lastSets?.length > 0 ? String(lastSets[lastSets.length - 1].reps) : "";
    setExercises((prev) => [
      ...prev,
      {
        name:     ex.name,
        lastSets: lastSets || [],
        suggested,
        sets: [{
          reps:      lastReps,
          weight_kg: suggested ? String(suggested) : (lastSets?.[0]?.weight_kg ? String(lastSets[0].weight_kg) : ""),
          rpe:       "",
          done:      false,
          isWarmup:  false,
        }],
      },
    ]);
    setShowBrowser(false);
  }, []);

  const addSet = (exIndex) => {
    setExercises((prev) => {
      const next    = [...prev];
      const lastSet = next[exIndex].sets[next[exIndex].sets.length - 1];
      next[exIndex].sets.push({
        reps:      lastSet ? String(lastSet.reps) : "",
        weight_kg: lastSet ? String(lastSet.weight_kg) : "",
        rpe:       "",
        done:      false,
        isWarmup:  false,
      });
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
      const next  = [...prev];
      const set   = next[exIndex].sets[setIndex];
      set.done    = !set.done;
      if (set.done && !set.isWarmup) {
        const weight = parseFloat(set.weight_kg) || 0;
        const reps   = parseInt(set.reps) || 0;
        if (weight > 0 && savePR(next[exIndex].name, weight, reps)) {
          next[exIndex].newPR = { weight_kg: weight, reps };
          setCelebration({ exercise: next[exIndex].name, weight, reps });
          setTimeout(() => setCelebration(null), 2500);
        }
        setRestActive(true);
        setRestTimer(90);
      }
      return next;
    });
  };

  const removeExercise = (exIndex) => setExercises((prev) => prev.filter((_, i) => i !== exIndex));

  const handleFinish = () => {
    const durationSeconds = elapsed;
    const workout = {
      name:            template?.name || "Quick Workout",
      workout_type:    template?.workout_type || "strength",
      duration_minutes: Math.floor(elapsed / 60),
      duration_seconds: durationSeconds,
      date:            localISODate(),
      exercises: exercises.map((ex) => ({
        name:   ex.name,
        newPR:  ex.newPR || null,
        sets:   ex.sets.filter((s) => s.done).map((s) => ({
          reps:      parseInt(s.reps) || 0,
          weight_kg: parseFloat(s.weight_kg) || 0,
          rpe:       parseInt(s.rpe) || null,
          isWarmup:  s.isWarmup || false,
        })),
      })).filter((ex) => ex.sets.length > 0),
    };
    saveWorkoutToHistory(workout);

    // Persist to the backend so sessions sync across devices, feed analytics,
    // and are visible to the AI coach. localStorage stays as the offline cache.
    if (workout.exercises.length > 0) {
      const totalVolume = workout.exercises.reduce(
        (s, e) => s + e.sets.reduce((ss, set) => ss + (set.weight_kg || 0) * (set.reps || 0), 0), 0
      );
      workoutAPI.save({
        workout_type: workout.workout_type,
        duration_minutes: Math.max(workout.duration_minutes, 1),
        intensity: "moderate",
        description: `${workout.name} — ${workout.exercises.length} exercises, ${Math.round(totalVolume)}kg total volume`,
        date: workout.date,
        details: {
          exercises: workout.exercises.map(({ name, sets }) => ({ name, sets })),
          total_volume_kg: Math.round(totalVolume),
        },
      }).then((res) => {
        if (res?.queued) showToast("Workout saved offline — will sync later");
      }).catch((err) => {
        showToast(err.message || "Workout saved locally only — sync failed", "error");
      });

      for (const ex of workout.exercises) {
        if (ex.newPR) {
          prAPI.upsert({
            exercise_name: ex.name,
            weight_kg: ex.newPR.weight_kg,
            reps: ex.newPR.reps,
            date: workout.date,
          }).catch(() => {});
        }
      }
    }

    onFinish?.(workout);
    setSummary(workout);
  };

  if (!open) return null;

  // If summary is showing, render it fullscreen
  if (summary) {
    return <WorkoutSummary workout={summary} onClose={() => { setSummary(null); onClose?.(); }} />;
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: T.z.modal, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Header */}
      <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 9999, background: T.elevated, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <Icon name="chev-left" size={16} color={T.text} />
        </button>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{template?.name || "Workout"}</div>
          <div style={{ fontSize: 11, color: T.teal, fontFamily: T.fontMono, marginTop: 2 }}>{formatTime(elapsed)}</div>
        </div>
        <button
          onClick={handleFinish}
          style={{ padding: "6px 16px", background: T.teal, color: "#0A0A0F", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
        >
          Finish
        </button>
      </div>

      {/* Rest timer */}
      {restActive && restTimer > 0 && (
        <div style={{ background: T.elevated, borderBottom: `1px solid ${T.border}`, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, animation: "lo-fade-up 0.2s ease" }}>
          <div>
            <div style={{ fontSize: 10, color: T.textDim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Rest</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: restTimer <= 10 ? T.negative : T.teal, fontFamily: T.fontMono }}>{formatTime(restTimer)}</div>
          </div>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {[30, 60, 90, 120, 180].map((s) => (
              <button key={s} onClick={() => setRestTimer(s)} style={{ padding: "4px 8px", background: restTimer === s ? T.teal + "33" : T.elevated2, border: `1px solid ${restTimer === s ? T.teal : T.border}`, borderRadius: 6, fontSize: 10, color: restTimer === s ? T.teal : T.textMuted, cursor: "pointer", fontFamily: "inherit" }}>
                {s}s
              </button>
            ))}
            <button onClick={() => setRestActive(false)} style={{ padding: "4px 8px", background: "none", border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 10, color: T.textDim, cursor: "pointer", fontFamily: "inherit" }}>
              Skip
            </button>
          </div>
        </div>
      )}

      {/* Exercises */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 16 }}>
        {exercises.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px", color: T.textDim, fontSize: 14 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>💪</div>
            <div style={{ fontWeight: 600, color: T.text, marginBottom: 6 }}>No exercises yet</div>
            <div>Tap "Add Exercise" below to get started.</div>
          </div>
        )}

        {exercises.map((ex, exIndex) => {
          const pr  = getPR(ex.name);
          const lastSets = ex.lastSets || [];
          const e1rm = (() => {
            if (!pr) return null;
            return estimate1RM(pr.weight_kg, pr.reps);
          })();

          return (
            <div key={exIndex} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rCard, overflow: "hidden" }}>
              {/* Exercise header */}
              <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${T.border}`, background: T.elevated }}>
                <div style={{ width: 30, height: 30, borderRadius: 9, background: T.teal + "22", display: "flex", alignItems: "center", justifyContent: "center", color: T.teal, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                  {exIndex + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{ex.name}</div>
                  <div style={{ display: "flex", gap: 10, marginTop: 2, flexWrap: "wrap" }}>
                    {lastSets.length > 0 && (
                      <span style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono }}>
                        Last: {lastSets.map((s) => `${s.weight_kg}×${s.reps}`).slice(0, 3).join(", ")}
                      </span>
                    )}
                    {pr && (
                      <span style={{ fontSize: 10, color: T.amber, fontFamily: T.fontMono }}>
                        PR: {pr.weight_kg}kg{e1rm ? ` · ~${e1rm}kg 1RM` : ""}
                      </span>
                    )}
                    {ex.suggested && !lastSets.length && (
                      <span style={{ fontSize: 10, color: T.teal, fontFamily: T.fontMono }}>
                        Suggested: {ex.suggested}kg
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => removeExercise(exIndex)} style={{ background: "none", border: "none", cursor: "pointer", padding: 6 }}>
                  <Icon name="trash" size={13} color={T.negative} />
                </button>
              </div>

              {/* Progressive overload banner — shown when last session data exists */}
              {ex.suggested && lastSets.length > 0 && (
                <div style={{ padding: "6px 14px", background: T.teal + "10", borderBottom: `1px solid ${T.teal}22`, display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon name="sparkle" size={11} color={T.teal} />
                  <span style={{ fontSize: 11, color: T.teal, fontWeight: 600 }}>
                    {ex.suggested > (parseFloat(lastSets[0]?.weight_kg) || 0)
                      ? `Try ${ex.suggested}kg today (+${(ex.suggested - (parseFloat(lastSets[0]?.weight_kg) || 0)).toFixed(1)}kg from last time)`
                      : `Target: ${ex.suggested}kg (same as last time)`}
                  </span>
                </div>
              )}

              {/* Sets */}
              <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                {/* Column headers */}
                <div style={{ display: "grid", gridTemplateColumns: "28px 44px 1fr 1fr 1fr 44px", gap: 6, paddingBottom: 6 }}>
                  {[" ", "W", "KG", "REPS", "RPE", ""].map((h, i) => (
                    <div key={i} style={{ fontSize: 10, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, textAlign: "center" }}>{h}</div>
                  ))}
                </div>

                {ex.sets.map((set, setIndex) => (
                  <SetRow
                    key={setIndex}
                    set={set}
                    setIndex={setIndex}
                    exIndex={exIndex}
                    onUpdate={updateSet}
                    onToggleDone={toggleSetDone}
                    onToggleWarmup={(ei, si) => updateSet(ei, si, "isWarmup", !set.isWarmup)}
                  />
                ))}

                {/* Add set */}
                <button
                  onClick={() => addSet(exIndex)}
                  style={{ marginTop: 2, padding: "11px 0", background: "none", border: `1px dashed ${T.border}`, borderRadius: 10, color: T.textDim, fontSize: 12, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}
                >
                  <Icon name="plus" size={12} /> Add Set
                </button>
              </div>
            </div>
          );
        })}

        {/* Add exercise */}
        <button
          onClick={() => setShowBrowser(true)}
          style={{ padding: "13px 0", background: T.elevated, border: `1px dashed ${T.teal}55`, borderRadius: T.rCard, color: T.teal, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
        >
          <Icon name="plus" size={14} /> Add Exercise
        </button>
      </div>

      {/* PR Celebration */}
      {celebration && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: T.z.confetti, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(7,10,16,0.7)", backdropFilter: "blur(4px)", animation: "lo-fade-up 0.3s ease" }}
          onClick={() => setCelebration(null)}
        >
          <div style={{ background: T.surface, border: `1px solid ${T.teal}44`, borderRadius: T.rCard, padding: "32px 28px", textAlign: "center", maxWidth: 280, boxShadow: `0 0 40px ${T.teal}33` }}>
            <div style={{ fontSize: 44, marginBottom: 8 }}>🏆</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: T.teal, marginBottom: 6 }}>New PR!</div>
            <div style={{ fontSize: 15, color: T.text, fontWeight: 600 }}>{celebration.exercise}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: T.text, fontFamily: T.fontMono, marginTop: 10 }}>{celebration.weight}kg</div>
            <div style={{ fontSize: 13, color: T.textMuted }}>× {celebration.reps} reps</div>
            {estimate1RM(celebration.weight, celebration.reps) && (
              <div style={{ fontSize: 11, color: T.teal, fontFamily: T.fontMono, marginTop: 8 }}>
                ~{estimate1RM(celebration.weight, celebration.reps)}kg estimated 1RM
              </div>
            )}
          </div>
        </div>
      )}

      <ExerciseBrowser open={showBrowser} onClose={() => setShowBrowser(false)} onSelectExercise={addExercise} />
    </div>
  );
}
