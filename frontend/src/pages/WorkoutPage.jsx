import { useState, useEffect, useMemo, useRef } from "react";
import { T, muscleColors } from "../design/tokens";
import { Icon } from "../design/icons";
import { Card, Chip, PageHeader, PageScroll, SectionHead, IllustratedEmptyState, SkeletonCard, Badge } from "../design/components";
import { workoutAPI, aiAPI } from "../utils/api";
import { showToast } from "../utils/toast";
import ExerciseBrowser from "../components/workout/ExerciseBrowser";
import ActiveWorkout from "../components/workout/ActiveWorkout";
import WorkoutHistory from "../components/workout/WorkoutHistory";
import exerciseData from "../lib/exercises.json";

const SPORTS = [
  { id: "all",      label: "All",      icon: "dumbbell" },
  { id: "strength", label: "Strength", icon: "dumbbell" },
  { id: "cardio",   label: "Cardio",   icon: "run" },
  { id: "hyrox",    label: "Hyrox",    icon: "bolt" },
  { id: "running",  label: "Running",  icon: "run" },
  { id: "yoga",     label: "Yoga",     icon: "flame" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function typeColor(t) {
  return t === "running" ? T.amber : t === "hyrox" ? T.violet : t === "cardio" ? T.amber : T.teal;
}

function inp() {
  return {
    width: "100%", background: T.elevated, border: `1px solid ${T.border}`, borderRadius: T.rInput,
    padding: "10px 12px", color: T.text, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
  };
}

// ── Small template card (horizontal carousel) ─────────────────────────────────
function TemplateCardSmall({ t, onStart }) {
  const c = typeColor(t.workout_type);
  return (
    <div style={{ width: 220, flexShrink: 0, background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rCard, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <Badge color={c} size="sm">{(t.workout_type || "strength").toUpperCase()}</Badge>
      <div style={{ fontSize: 17, fontWeight: 700, color: T.text }}>{t.name}</div>
      <div style={{ fontSize: 12, color: T.textMuted }}>{t.exercises?.length || 0} exercises · {t.duration || "—"}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {(t.muscles || []).slice(0, 3).map((m) => (
          <span key={m} style={{ fontSize: 10, color: T.textMuted, background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 6, padding: "2px 7px" }}>{m}</span>
        ))}
      </div>
      <button onClick={() => onStart(t)} style={{ marginTop: "auto", padding: "8px 0", background: T.elevated, color: T.text, border: `1px solid ${T.borderStrong}`, borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
        Start
      </button>
    </div>
  );
}

// ── Workout intelligence helpers ──────────────────────────────────────────────
const MUSCLE_TO_GROUP = {
  chest:     "Push", back:      "Pull", legs:      "Legs",
  shoulders: "Push", arms:      "Push", core:      "Core",
  cardio:    "Cardio",
};
const PUSH_MUSCLES = new Set(["chest", "shoulders", "arms"]);
const PULL_MUSCLES = new Set(["back"]);
const LEG_MUSCLES  = new Set(["legs"]);

function getMuscleFromExerciseName(name) {
  const ex = exerciseData.exercises.find((e) => e.name.toLowerCase() === name.toLowerCase());
  return ex?.primary || null;
}

function analyzeWorkoutHistory(history) {
  if (!history.length) return null;
  const sorted = [...history].sort((a, b) => new Date(b.date || b.loggedAt) - new Date(a.date || a.loggedAt));
  const lastWorkout = sorted[0];

  // Figure out what muscle groups were in last workout
  const lastMuscles = new Set(
    (lastWorkout.exercises || []).map((e) => getMuscleFromExerciseName(e.name)).filter(Boolean)
  );

  let lastGroup = "Unknown";
  const isPush = [...lastMuscles].some((m) => PUSH_MUSCLES.has(m));
  const isPull = [...lastMuscles].some((m) => PULL_MUSCLES.has(m));
  const isLegs = [...lastMuscles].some((m) => LEG_MUSCLES.has(m));
  if (isPush) lastGroup = "Push";
  else if (isPull) lastGroup = "Pull";
  else if (isLegs) lastGroup = "Legs";

  // Suggest next using PPL cycle
  const nextGroup = lastGroup === "Push" ? "Pull" : lastGroup === "Pull" ? "Legs" : "Push";

  // Days since last workout
  const lastDate = new Date(lastWorkout.date || lastWorkout.loggedAt);
  const daysSince = Math.floor((Date.now() - lastDate) / (1000 * 60 * 60 * 24));

  return { lastGroup, nextGroup, daysSince, lastWorkout };
}

function getMuscleRecency(history) {
  const recency = {};
  const sorted = [...history].sort((a, b) => new Date(b.date || b.loggedAt) - new Date(a.date || a.loggedAt));
  for (const w of sorted) {
    for (const ex of w.exercises || []) {
      const m = getMuscleFromExerciseName(ex.name);
      if (m && !recency[m]) {
        const date = new Date(w.date || w.loggedAt);
        recency[m] = Math.floor((Date.now() - date) / (1000 * 60 * 60 * 24));
      }
    }
  }
  return recency;
}

const NEXT_MUSCLES = {
  Push: { muscles: ["Chest", "Shoulders", "Triceps"], description: "Upper body press" },
  Pull: { muscles: ["Back", "Biceps", "Rear Delts"], description: "Upper body pull" },
  Legs: { muscles: ["Quads", "Hamstrings", "Glutes"], description: "Lower body" },
  Core: { muscles: ["Core", "Abs"],                  description: "Core strength" },
};

// ── Hero card (AI-driven, heuristic fallback) ─────────────────────────────────
function HeroCard({ onStart, onBrowse, workoutInsight, aiSuggestion, aiThinking }) {
  const insight = workoutInsight;
  const nextGroup  = insight?.nextGroup  || "Push";
  const daysSince  = insight?.daysSince;
  const info       = NEXT_MUSCLES[nextGroup] || NEXT_MUSCLES.Push;
  const freshnessStr = daysSince == null ? "" : daysSince === 0 ? "last session: today" : daysSince === 1 ? "last session: yesterday" : `last session: ${daysSince}d ago`;

  const ai = aiSuggestion;
  const isRest = ai?.is_rest_day;
  const title = ai ? (isRest ? "Rest Day" : ai.template_name) : `${nextGroup} Day`;
  const subtitle = ai
    ? ai.reason
    : `${info.description} · ${info.muscles.join(", ")}`;
  const tag = ai ? (isRest ? "AI Coach · Recovery" : `AI Pick · ${ai.focus || "Today"}`) : insight ? "Suggested next" : "Quick start";

  return (
    <div style={{ margin: "0 20px 20px", borderRadius: T.rCard, background: T.surface, border: `1px solid ${T.border}`, padding: 20, position: "relative", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        {ai && <Icon name="sparkle" size={11} color={T.teal} />}
        <span style={{ ...T.type.eyebrow, fontFamily: T.fontMono, color: T.textMuted }}>
          {tag}
        </span>
        {aiThinking && <span style={{ fontSize: 9, color: T.textDim, fontFamily: T.fontMono }}>· coach is thinking…</span>}
      </div>
      <div style={{ ...T.type.hero, color: T.text, marginBottom: 6 }}>
        {title}
      </div>
      {/* The coach's reasoning gets the family serif-italic voice */}
      <div style={{ fontSize: ai ? 13.5 : 12, color: T.textMuted, marginBottom: 4, lineHeight: 1.5, fontFamily: ai ? T.fontSerif : T.fontFamily, fontStyle: ai ? "italic" : "normal" }}>
        {subtitle}
      </div>
      {freshnessStr && (
        <div style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono, marginBottom: 16 }}>{freshnessStr}</div>
      )}
      {!freshnessStr && <div style={{ marginBottom: 16 }} />}
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onStart} style={{ flex: 1, padding: "11px 0", background: T.teal, color: "#0A0A0F", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          {isRest ? "Train Anyway" : ai ? "Start This" : insight ? "Start Suggested" : "Quick Start"}
        </button>
        <button onClick={onBrowse} style={{ flex: 1, padding: "11px 0", background: "transparent", color: T.text, border: `1px solid ${T.border}`, borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Browse Templates</button>
      </div>
    </div>
  );
}

// ── Muscle recency widget ─────────────────────────────────────────────────────
function MuscleRecencyWidget() {
  const recency = useMemo(() => {
    const history = JSON.parse(localStorage.getItem("lo_workout_history") || "[]");
    return getMuscleRecency(history);
  }, []);

  const groups = [
    { key: "chest",     label: "Chest",     color: muscleColors.chest },
    { key: "back",      label: "Back",      color: muscleColors.back },
    { key: "legs",      label: "Legs",      color: muscleColors.legs },
    { key: "shoulders", label: "Shoulders", color: muscleColors.shoulders },
    { key: "arms",      label: "Arms",      color: muscleColors.arms },
    { key: "core",      label: "Core",      color: muscleColors.core },
  ];

  function statusColor(days) {
    if (days == null) return T.textDim;
    if (days <= 1)    return T.teal;
    if (days <= 3)    return T.amber;
    return T.negative;
  }
  function statusLabel(days) {
    if (days == null) return "—";
    if (days === 0)   return "Today";
    if (days === 1)   return "1d ago";
    return `${days}d ago`;
  }

  // Only show if we have any recency data at all
  const hasData = groups.some((g) => recency[g.key] != null);
  if (!hasData) return null;

  return (
    <div style={{ margin: "0 20px 20px" }}>
      <SectionHead title="Muscle Freshness" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 10 }}>
        {groups.map(({ key, label, color }) => {
          const days = recency[key];
          const sc   = statusColor(days);
          return (
            <div key={key} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "10px 10px 8px", textAlign: "center" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: sc, margin: "0 auto 6px" }} />
              <div style={{ fontSize: 11, fontWeight: 700, color: T.text, marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 10, color: sc, fontFamily: T.fontMono, fontWeight: 600 }}>{statusLabel(days)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Speed-dial FAB ─────────────────────────────────────────────────────────────
function SpeedDialFAB({ onAILog, onManualLog, onNewTemplate }) {
  const [open, setOpen] = useState(false);
  const actions = [
    { icon: "sparkle",  label: "AI Log",       color: T.teal,   handler: onAILog },
    { icon: "dumbbell", label: "Manual Log",    color: T.amber,  handler: onManualLog },
    { icon: "edit",     label: "New Template",  color: T.violet, handler: onNewTemplate },
  ];
  return (
    <div style={{ position: "absolute", right: 20, bottom: 92, zIndex: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <style>{`@keyframes speedDialIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}`}</style>
      {open && actions.map((a, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, animation: `speedDialIn 0.15s ${i * 0.05}s both` }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: T.text, background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 8, padding: "4px 10px", whiteSpace: "nowrap" }}>{a.label}</span>
          <button onClick={() => { setOpen(false); a.handler(); }} style={{ width: 44, height: 44, borderRadius: 9999, background: a.color + "22", border: `1px solid ${a.color}44`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name={a.icon} size={18} color={a.color} />
          </button>
        </div>
      ))}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ width: 56, height: 56, borderRadius: 9999, background: T.teal, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 8px 24px ${T.teal}55`, transform: open ? "rotate(45deg)" : "none", transition: "transform 0.2s cubic-bezier(.34,1.56,.64,1)" }}
      >
        <Icon name="plus" size={24} color="#0A0A0F" strokeWidth={2.4} />
      </button>
    </div>
  );
}

// ── AI Workout Logger ─────────────────────────────────────────────────────────
function AIWorkoutLogger({ onClose, onRefresh }) {
  const [type,      setType]      = useState("strength");
  const [duration,  setDuration]  = useState("60");
  const [intensity, setIntensity] = useState("moderate");
  const [desc,      setDesc]      = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result,    setResult]    = useState(null);
  const [logging,   setLogging]   = useState(false);

  const WORKOUT_TYPES  = ["strength","crossfit","running","hiit","hyrox","yoga","cycling"];
  const INTENSITY_OPTS = ["light","moderate","intense"];

  async function handleAnalyze() {
    setAnalyzing(true);
    try {
      const r = await workoutAPI.analyze({ workout_type: type, duration_minutes: Number(duration), intensity, description: desc || undefined });
      setResult(r);
    } catch (e) { showToast(e.message || "Analyze failed", "error"); }
    setAnalyzing(false);
  }

  async function handleLog() {
    if (!result) return;
    setLogging(true);
    try {
      const d = new Date();
      const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      await workoutAPI.save({ workout_type: type, duration_minutes: Number(duration), intensity, description: desc || undefined, date: localDate, ai_analysis: result, calories_burned_est: result.calories_burned || result.calories });
      showToast("Workout logged", "success");
      onRefresh?.();
      onClose();
    } catch (e) { showToast(e.message || "Log failed", "error"); }
    setLogging(false);
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: T.z.modal, background: "rgba(10,11,16,0.88)", display: "flex", alignItems: "flex-end", backdropFilter: "blur(4px)" }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ width: "100%", background: T.surface, borderRadius: "20px 20px 0 0", border: `1px solid ${T.border}`, borderBottom: "none", padding: "20px 20px 24px", marginBottom: T.navHeight, maxHeight: `calc(100dvh - ${T.navHeight})`, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", animation: "lo-slide-up 0.25s cubic-bezier(0.32,0.72,0,1) forwards" }}>
        <div style={{ width: 36, height: 4, borderRadius: 9999, background: T.border, alignSelf: "center", marginBottom: 4 }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: T.text }}>AI Workout Logger</div>
          <button onClick={onClose} style={{ background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 9999, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Icon name="x" size={14} color={T.textMuted} /></button>
        </div>

        <div>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>Workout Type</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {WORKOUT_TYPES.map((wt) => (
              <button key={wt} onClick={() => setType(wt)} style={{ padding: "6px 12px", borderRadius: T.rChip, background: type === wt ? T.teal : T.elevated, color: type === wt ? "#0A0A0F" : T.text, border: `1px solid ${type === wt ? T.teal : T.border}`, fontSize: 12, fontWeight: type === wt ? 700 : 500, cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize" }}>{wt}</button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>Duration (minutes)</div>
          <input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} min={1} max={300} style={inp()} />
        </div>

        <div>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>Intensity</div>
          <div style={{ display: "flex", gap: 8 }}>
            {INTENSITY_OPTS.map((opt) => (
              <button key={opt} onClick={() => setIntensity(opt)} style={{ flex: 1, padding: "8px 0", borderRadius: T.rChip, background: intensity === opt ? (opt === "light" ? T.teal : opt === "intense" ? T.negative : T.amber) : T.elevated, color: intensity === opt ? "#0A0A0F" : T.text, border: `1px solid ${T.border}`, fontSize: 12, fontWeight: intensity === opt ? 700 : 500, cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize" }}>{opt}</button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>Notes (optional)</div>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="e.g. 5×5 squat, felt strong…" style={{ ...inp(), resize: "none" }} />
        </div>

        {!result && (
          <button onClick={handleAnalyze} disabled={analyzing || !duration} style={{ padding: "13px 0", background: analyzing ? T.elevated : `linear-gradient(135deg,${T.teal},${T.violet})`, color: analyzing ? T.textMuted : "#0A0A0F", border: "none", borderRadius: T.rCard, fontSize: 14, fontWeight: 700, cursor: analyzing ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Icon name="sparkle" size={16} color={analyzing ? T.textMuted : "#0A0A0F"} />
            {analyzing ? "Analyzing…" : "Analyze with AI"}
          </button>
        )}

        {result && (
          <div style={{ background: T.elevated, border: `1px solid ${T.teal}44`, borderRadius: T.rCard, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.teal, letterSpacing: 0.5, textTransform: "uppercase" }}>AI Analysis</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[["Calories", `${result.calories_burned || result.calories || "—"} kcal`], ["Recovery", result.recovery_hours ? `${result.recovery_hours}h` : result.recovery_time || "—"]].map(([l, v]) => (
                <div key={l} style={{ background: T.surface, borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{l}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: T.text, fontFamily: T.fontMono }}>{v}</div>
                </div>
              ))}
            </div>
            {(result.muscle_groups || result.muscles_worked)?.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(result.muscle_groups || result.muscles_worked).map((m) => <span key={m} style={{ fontSize: 10, color: T.teal, background: T.teal + "18", borderRadius: 6, padding: "3px 8px" }}>{m}</span>)}
              </div>
            )}
            {result.notes && <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.5 }}>{result.notes}</div>}
            <button onClick={handleLog} disabled={logging} style={{ padding: "12px 0", background: T.teal, color: "#0A0A0F", border: "none", borderRadius: T.rCard, fontSize: 14, fontWeight: 700, cursor: logging ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
              {logging ? "Logging…" : "Log Workout"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Template Browser ──────────────────────────────────────────────────────────
function TemplateBrowser({ onClose, onStart, apiTemplates = [] }) {
  const [filter, setFilter] = useState("all");

  // Only the user's own templates — created manually or saved from the AI coach.
  const apiMapped = apiTemplates.map((t) => ({
    id:           `api-${t.id}`,
    name:         t.name,
    templateName: "My Templates",
    workout_type: t.workout_type || "strength",
    exerciseIds:  [],
    exerciseObjs: t.exercises || [],
    source:       "api",
  }));

  const allTemplates = [...apiMapped];
  const filtered = filter === "all" ? allTemplates : allTemplates.filter((t) => t.workout_type === filter);

  function startTemplate(t) {
    if (t.source === "api" && t.exerciseObjs) {
      onStart({ name: t.name, workout_type: t.workout_type, exercises: t.exerciseObjs });
    } else {
      onStart({
        name: t.name,
        workout_type: t.workout_type,
        exercises: t.exerciseIds.map((exId) => {
          const ex = exerciseData.exercises.find((e) => e.id === exId);
          return { name: ex?.name || exId };
        }),
      });
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: T.z.modal, background: "rgba(10,11,16,0.88)", display: "flex", alignItems: "flex-end", backdropFilter: "blur(4px)" }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ width: "100%", background: T.surface, borderRadius: "20px 20px 0 0", border: `1px solid ${T.border}`, borderBottom: "none", padding: "20px 20px 24px", marginBottom: T.navHeight, maxHeight: `calc(100dvh - ${T.navHeight})`, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", animation: "lo-slide-up 0.25s cubic-bezier(0.32,0.72,0,1) forwards" }}>
        <div style={{ width: 36, height: 4, borderRadius: 9999, background: T.border, alignSelf: "center", marginBottom: 4 }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: T.text }}>Browse Templates</div>
          <button onClick={onClose} style={{ background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 9999, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Icon name="x" size={14} color={T.textMuted} /></button>
        </div>

        <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none" }}>
          {SPORTS.map((s) => (
            <button key={s.id} onClick={() => setFilter(s.id)} style={{ flexShrink: 0, padding: "6px 14px", borderRadius: 9999, background: filter === s.id ? T.teal : T.elevated, color: filter === s.id ? "#0A0A0F" : T.text, border: `1px solid ${filter === s.id ? T.teal : T.border}`, fontSize: 12, fontWeight: filter === s.id ? 700 : 500, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>{s.label}</button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: T.textDim, fontSize: 13 }}>No templates for this category.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {filtered.map((t) => {
              const c = typeColor(t.workout_type);
              const exerciseNames = t.source === "api"
                ? (t.exerciseObjs || []).slice(0, 4).map((e) => e.name)
                : t.exerciseIds.slice(0, 4).map((id) => exerciseData.exercises.find((e) => e.id === id)?.name || id);
              return (
                <div key={t.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rCard, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                  <span style={{ alignSelf: "flex-start", fontSize: 9, fontWeight: 700, letterSpacing: 0.8, color: c, background: c + "22", padding: "2px 7px", borderRadius: 5 }}>{t.templateName}</span>
                  <div style={{ fontSize: 15, fontWeight: 700, color: T.text, lineHeight: 1.2 }}>{t.name}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {exerciseNames.map((name) => (
                      <span key={name} style={{ fontSize: 9, color: T.textMuted, background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 5, padding: "2px 6px" }}>{name}</span>
                    ))}
                  </div>
                  <button onClick={() => startTemplate(t)} style={{ marginTop: 4, padding: "8px 0", background: T.teal, color: "#0A0A0F", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Start</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── New Template Modal ────────────────────────────────────────────────────────
function NewTemplateModal({ onClose, onSaved }) {
  const [name,       setName]       = useState("");
  const [type,       setType]       = useState("strength");
  const [exercises,  setExercises]  = useState([]);
  const [showPicker, setShowPicker] = useState(false);
  const [saving,     setSaving]     = useState(false);

  function addExercise(ex) {
    setExercises((prev) => [...prev, { name: ex.name, id: ex.id }]);
  }

  function removeExercise(i) {
    setExercises((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    if (!name.trim()) { showToast("Give your template a name", "error"); return; }
    if (exercises.length === 0) { showToast("Add at least one exercise", "error"); return; }
    setSaving(true);
    try {
      await workoutAPI.saveTemplate({
        name: name.trim(),
        workout_type: type,
        exercises: exercises.map((e) => ({ name: e.name })),
      });
      onSaved?.();
      onClose();
    } catch {
      // save to localStorage as fallback
      const local = JSON.parse(localStorage.getItem("lo_custom_templates") || "[]");
      local.push({ id: `local-${Date.now()}`, name: name.trim(), workout_type: type, exercises });
      localStorage.setItem("lo_custom_templates", JSON.stringify(local));
      onSaved?.();
      onClose();
    }
    setSaving(false);
  }

  const TYPES = ["strength","cardio","hyrox","running","yoga"];

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: T.z.modal, background: "rgba(10,11,16,0.88)", display: "flex", alignItems: "flex-end", backdropFilter: "blur(4px)" }} onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div style={{ width: "100%", background: T.surface, borderRadius: "20px 20px 0 0", border: `1px solid ${T.border}`, borderBottom: "none", padding: "20px 20px 24px", marginBottom: T.navHeight, maxHeight: `calc(100dvh - ${T.navHeight})`, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", animation: "lo-slide-up 0.25s cubic-bezier(0.32,0.72,0,1) forwards" }}>
          <div style={{ width: 36, height: 4, borderRadius: 9999, background: T.border, alignSelf: "center", marginBottom: 4 }} />

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: T.text }}>New Template</div>
            <button onClick={onClose} style={{ background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 9999, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Icon name="x" size={14} color={T.textMuted} /></button>
          </div>

          {/* Name */}
          <div>
            <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>Template Name</div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Push Day, Leg Volume…" style={inp()} />
          </div>

          {/* Type */}
          <div>
            <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>Type</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {TYPES.map((t) => (
                <button key={t} onClick={() => setType(t)} style={{ padding: "6px 12px", borderRadius: T.rChip, background: type === t ? typeColor(t) : T.elevated, color: type === t ? "#0A0A0F" : T.text, border: `1px solid ${type === t ? typeColor(t) : T.border}`, fontSize: 12, fontWeight: type === t ? 700 : 500, cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize" }}>{t}</button>
              ))}
            </div>
          </div>

          {/* Exercise list */}
          <div>
            <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 10, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>
              Exercises {exercises.length > 0 && `(${exercises.length})`}
            </div>
            {exercises.length === 0 ? (
              <div style={{ background: T.elevated, border: `1px dashed ${T.border}`, borderRadius: T.rCard, padding: "24px 0", textAlign: "center", color: T.textDim, fontSize: 13 }}>
                No exercises added yet
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {exercises.map((ex, i) => (
                  <div key={i} style={{ background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 7, background: T.teal + "22", display: "flex", alignItems: "center", justifyContent: "center", color: T.teal, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text, flex: 1 }}>{ex.name}</div>
                    <button onClick={() => removeExercise(i)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: T.negative }}>
                      <Icon name="trash" size={14} color={T.negative} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add exercise button */}
          <button
            onClick={() => setShowPicker(true)}
            style={{ padding: "11px 0", background: T.elevated, border: `1px dashed ${T.teal}55`, borderRadius: T.rCard, color: T.teal, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
          >
            <Icon name="plus" size={14} color={T.teal} />
            Add Exercise
          </button>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ padding: "13px 0", background: saving ? T.elevated : T.teal, color: saving ? T.textMuted : "#0A0A0F", border: "none", borderRadius: T.rCard, fontSize: 14, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}
          >
            {saving ? "Saving…" : "Save Template"}
          </button>
        </div>
      </div>

      {showPicker && (
        <ExerciseBrowser
          open={showPicker}
          onClose={() => setShowPicker(false)}
          onSelectExercise={(ex) => { addExercise(ex); setShowPicker(false); }}
        />
      )}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function WorkoutPage({ profile, onProfile }) {
  const [history,         setHistory]      = useState([]);
  const [templates,       setTemplates]    = useState([]);
  const [loading,         setLoading]      = useState(true);
  const [showBrowser,     setShowBrowser]  = useState(false);
  const [showAILogger,    setShowAILogger] = useState(false);
  const [showNewTemplate, setShowNewTpl]   = useState(false);
  const [liveSession,     setLiveSession]  = useState(false);
  const [liveTemplate,    setLiveTemplate] = useState(null);
  const [sessionKey,      setSessionKey]   = useState(0);
  const [showExerciseDB,  setShowExDB]     = useState(false);
  const [aiSuggestion,    setAiSuggestion] = useState(null);
  const [aiThinking,      setAiThinking]   = useState(false);
  const suggestionPool      = useRef([]);
  const suggestionRequested = useRef(false);

  async function refresh() {
    try {
      const [logs, tmpl] = await Promise.all([workoutAPI.getAll(30), workoutAPI.getTemplates()]);
      const localHistory = JSON.parse(localStorage.getItem("lo_workout_history") || "[]");
      const apiLogs      = logs?.workouts || [];
      // Live sessions are saved both locally and to the API — drop local copies
      // that already exist server-side (same day, notes lead with the session name)
      const localOnly = localHistory.filter((l) => {
        const lDate = (l.date || l.loggedAt || "").slice(0, 10);
        return !apiLogs.some((a) =>
          (a.date || "").slice(0, 10) === lDate &&
          (a.notes || "").startsWith(l.name || "")
        );
      });
      const merged = [...apiLogs, ...localOnly].sort((a, b) => new Date(b.date || b.loggedAt) - new Date(a.date || a.loggedAt));
      setHistory(merged.slice(0, 50));

      // Merge API templates + local custom templates
      const apiTemplates   = tmpl?.templates || [];
      const localCustom    = JSON.parse(localStorage.getItem("lo_custom_templates") || "[]");
      const allTemplates   = [...apiTemplates, ...localCustom];
      // Keep `exercises` as the real array — ActiveWorkout maps over it
      setTemplates(
        allTemplates.map((t) => {
          const exList = Array.isArray(t.exercises) ? t.exercises : [];
          return {
            ...t,
            exercises: exList,
            tag:      (t.workout_type || "strength").toUpperCase(),
            tagColor: typeColor(t.workout_type || "strength"),
            duration: t.estimated_duration ? `${t.estimated_duration} min` : "—",
            muscles:  exList.slice(0, 3).map((e) => (typeof e === "string" ? e : e.name)).filter(Boolean),
          };
        })
      );
    } catch {}
  }

  useEffect(() => {
    (async () => {
      try { await refresh(); } catch {}
      setLoading(false);
    })();
  }, []);

  const workoutInsight = useMemo(() => analyzeWorkoutHistory(history), [history]);

  // Ask the AI coach which template fits today (cached per day + template set)
  useEffect(() => {
    if (loading || suggestionRequested.current) return;
    suggestionRequested.current = true;

    const seen = new Set();
    const candidates = [...templates].filter((t) => {
      const key = (t.name || "").toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (!candidates.length) return;
    suggestionPool.current = candidates;

    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const namesKey = candidates.map((c) => c.name).sort().join("|");
    const CACHE_KEY = "lo_wk_suggestion_v1";
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (cached && cached.date === today && cached.namesKey === namesKey) {
        setAiSuggestion(cached.data);
        return;
      }
    } catch {}

    (async () => {
      setAiThinking(true);
      try {
        const payload = candidates.map((c) => ({
          name: c.name,
          workout_type: c.workout_type || "strength",
          exercises: (Array.isArray(c.exercises) ? c.exercises : [])
            .slice(0, 8)
            .map((e) => (typeof e === "string" ? e : e.name))
            .filter(Boolean),
        }));
        const res = await aiAPI.suggestWorkout(payload, today);
        if (res?.reason) {
          setAiSuggestion(res);
          localStorage.setItem(CACHE_KEY, JSON.stringify({ date: today, namesKey, data: res }));
        }
      } catch {
        // AI unavailable — the heuristic hero card still works
      }
      setAiThinking(false);
    })();
  }, [loading, templates]);

  // Real numbers from history — never invent streaks
  const { streakDays, weekCount } = useMemo(() => {
    const days = new Set(history.map((w) => (w.date || w.loggedAt || "").slice(0, 10)).filter(Boolean));
    let streak = 0;
    const cursor = new Date();
    // A streak survives if today simply hasn't been trained yet
    if (!days.has(cursor.toISOString().slice(0, 10))) cursor.setDate(cursor.getDate() - 1);
    while (days.has(cursor.toISOString().slice(0, 10))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const week = history.filter((w) => new Date(w.date || w.loggedAt) >= weekAgo).length;
    return { streakDays: streak, weekCount: week };
  }, [history]);

  const headerSubtitle = history.length === 0
    ? "Let's get moving"
    : `${weekCount} workout${weekCount !== 1 ? "s" : ""} this week${streakDays > 1 ? ` · ${streakDays}-day streak` : ""}`;

  function startSession(tpl) {
    setLiveTemplate(tpl || null);
    setLiveSession(true);
    setSessionKey((k) => k + 1);
  }

  function startSuggestedWorkout() {
    // 1. AI pick wins when available (rest day → open an empty quick session)
    if (aiSuggestion?.template_name) {
      const aiMatch = suggestionPool.current.find(
        (t) => (t.name || "").toLowerCase() === aiSuggestion.template_name.toLowerCase()
      );
      if (aiMatch) { startSession(aiMatch); return; }
    }
    if (aiSuggestion?.is_rest_day) { startSession(null); return; }

    // 2. Heuristic fallback: PPL rotation against the user's own templates only.
    //    No built-in programs — an empty quick session is the fallback.
    const nextGroup = workoutInsight?.nextGroup || "Push";
    const apiMatch = templates.find((t) => (t.name || "").toLowerCase().includes(nextGroup.toLowerCase()));
    startSession(apiMatch || null);
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: T.bg, position: "relative" }}>
      <PageHeader title="Workout" subtitle={headerSubtitle} profile={profile} onProfile={onProfile} />

      <PageScroll>
        <HeroCard
          onStart={startSuggestedWorkout}
          onBrowse={() => setShowBrowser(true)}
          workoutInsight={workoutInsight}
          aiSuggestion={aiSuggestion}
          aiThinking={aiThinking}
        />
        <MuscleRecencyWidget />

        {/* Quick actions */}
        <div style={{ padding: "0 20px 16px", display: "flex", gap: 8 }}>
          <button onClick={() => setShowExDB(true)} style={{ flex: 1, padding: "10px 0", background: T.elevated, border: `1px solid ${T.border}`, borderRadius: T.rCard, color: T.text, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Icon name="search" size={14} color={T.teal} /> Exercise DB
          </button>
          <button onClick={() => setShowBrowser(true)} style={{ flex: 1, padding: "10px 0", background: T.elevated, border: `1px solid ${T.border}`, borderRadius: T.rCard, color: T.text, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Icon name="edit" size={14} color={T.violet} /> Templates
          </button>
        </div>

        <div style={{ padding: "0 20px 8px" }}>
          <SectionHead title="Templates" trailing={<span style={{ fontSize: 12, color: T.textMuted, cursor: "pointer" }} onClick={() => setShowBrowser(true)}>See all ›</span>} />
        </div>
        <div style={{ display: "flex", gap: 12, overflowX: "auto", padding: "4px 20px 24px", scrollbarWidth: "none" }}>
          {loading ? (
            <><SkeletonCard /><SkeletonCard /></>
          ) : templates.length > 0 ? (
            templates.slice(0, 6).map((t) => (
              <TemplateCardSmall key={t.id} t={t} onStart={startSession} />
            ))
          ) : (
            <div style={{ fontSize: 13, color: T.textDim, padding: "20px 0" }}>
              No templates yet — create one or browse below.
            </div>
          )}
        </div>

        <div style={{ padding: "0 20px 16px" }}>
          <SectionHead title="Recent Workouts" />
        </div>
        <WorkoutHistory history={history} loading={loading} onSelect={() => {}} />
      </PageScroll>

      <SpeedDialFAB
        onAILog={() => setShowAILogger(true)}
        onManualLog={() => startSession(null)}
        onNewTemplate={() => setShowNewTpl(true)}
      />

      {showBrowser && (
        <TemplateBrowser
          onClose={() => setShowBrowser(false)}
          onStart={(t) => { setShowBrowser(false); startSession(t); }}
          apiTemplates={templates}
        />
      )}

      {showAILogger && (
        <AIWorkoutLogger onClose={() => setShowAILogger(false)} onRefresh={refresh} />
      )}

      {showExerciseDB && (
        <ExerciseBrowser
          open={showExerciseDB}
          onClose={() => setShowExDB(false)}
          onSelectExercise={(ex) => {
            setShowExDB(false);
            startSession({ name: ex.name, exercises: [{ name: ex.name }] });
          }}
        />
      )}

      {showNewTemplate && (
        <NewTemplateModal onClose={() => setShowNewTpl(false)} onSaved={refresh} />
      )}

      {liveSession && (
        <ActiveWorkout
          key={sessionKey}
          open={liveSession}
          onClose={() => { setLiveSession(false); setLiveTemplate(null); refresh(); }}
          template={liveTemplate}
          onFinish={() => refresh()}
        />
      )}
    </div>
  );
}
