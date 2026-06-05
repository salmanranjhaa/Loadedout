import { useState, useEffect } from "react";
import { T } from "../design/tokens";
import { Icon } from "../design/icons";
import { Card, Chip, PageHeader, PageScroll, SectionHead, IllustratedEmptyState, SkeletonCard, Badge } from "../design/components";
import { workoutAPI } from "../utils/api";
import ExerciseBrowser from "../components/workout/ExerciseBrowser";
import ActiveWorkout from "../components/workout/ActiveWorkout";
import WorkoutHistory from "../components/workout/WorkoutHistory";
import exerciseData from "../lib/exercises.json";

const SPORTS = [
  { id: "all", label: "All", icon: "dumbbell" },
  { id: "strength", label: "Strength", icon: "dumbbell" },
  { id: "cardio", label: "Cardio", icon: "run" },
  { id: "hyrox", label: "Hyrox", icon: "bolt" },
  { id: "running", label: "Running", icon: "run" },
  { id: "yoga", label: "Yoga", icon: "flame" },
];

function TemplateCardSmall({ t, onStart }) {
  const typeColor =
    t.workout_type === "running"
      ? T.amber
      : t.workout_type === "hyrox"
      ? T.violet
      : t.workout_type === "cardio"
      ? T.amber
      : T.teal;
  return (
    <div
      style={{
        width: 220,
        flexShrink: 0,
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: T.rCard,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <Badge color={typeColor} size="sm">
        {(t.workout_type || "strength").toUpperCase()}
      </Badge>
      <div style={{ fontSize: 17, fontWeight: 700, color: T.text }}>{t.name}</div>
      <div style={{ fontSize: 12, color: T.textMuted }}>{t.exercises?.length || 0} exercises · {t.duration || "—"}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {(t.muscles || []).slice(0, 3).map((m) => (
          <span
            key={m}
            style={{
              fontSize: 10,
              color: T.textMuted,
              background: T.elevated,
              border: `1px solid ${T.border}`,
              borderRadius: 6,
              padding: "2px 7px",
            }}
          >
            {m}
          </span>
        ))}
      </div>
      <button
        onClick={() => onStart(t)}
        style={{
          marginTop: "auto",
          padding: "8px 0",
          background: T.teal + "22",
          color: T.teal,
          border: `1px solid ${T.teal}44`,
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        Start
      </button>
    </div>
  );
}

function HeroCard({ onStart, onBrowse }) {
  return (
    <div
      style={{
        margin: "0 20px 20px",
        borderRadius: T.rCard,
        background: `linear-gradient(135deg,${T.teal}1A,${T.violet}33)`,
        border: `1px solid ${T.teal}33`,
        padding: 20,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -40,
          right: -40,
          width: 180,
          height: 180,
          borderRadius: "50%",
          background: `radial-gradient(circle,${T.violet}44,transparent 70%)`,
          pointerEvents: "none",
        }}
      />
      <div style={{ fontSize: 10, fontFamily: T.fontMono, color: T.teal, letterSpacing: 1.4, fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>
        Today's suggestion
      </div>
      <div style={{ fontSize: 23, fontWeight: 800, color: T.text, letterSpacing: -0.6, marginBottom: 4, lineHeight: 1.15 }}>
        Push Day · Chest + Tri
      </div>
      <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 20 }}>7 exercises · 60–75 min · last done 4d ago</div>
      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={onStart}
          style={{
            flex: 1,
            padding: "11px 0",
            background: T.teal,
            color: "#0A0A0F",
            border: "none",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Start Suggested
        </button>
        <button
          onClick={onBrowse}
          style={{
            flex: 1,
            padding: "11px 0",
            background: "transparent",
            color: T.text,
            border: `1px solid ${T.border}`,
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Browse Templates
        </button>
      </div>
    </div>
  );
}

function SpeedDialFAB({ onAILog, onManualLog, onNewTemplate }) {
  const [open, setOpen] = useState(false);
  const actions = [
    { icon: "sparkle", label: "AI Log", color: T.teal, handler: onAILog },
    { icon: "dumbbell", label: "Manual Log", color: T.amber, handler: onManualLog },
    { icon: "edit", label: "New Template", color: T.violet, handler: onNewTemplate },
  ];
  return (
    <div style={{ position: "absolute", right: 20, bottom: 92, zIndex: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      {open &&
        actions.map((a, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, animation: `speedDialIn 0.15s ${i * 0.05}s both` }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: T.text,
                background: T.elevated,
                border: `1px solid ${T.border}`,
                borderRadius: 8,
                padding: "4px 10px",
                whiteSpace: "nowrap",
              }}
            >
              {a.label}
            </span>
            <button
              onClick={() => {
                setOpen(false);
                a.handler();
              }}
              style={{
                width: 44,
                height: 44,
                borderRadius: 9999,
                background: a.color + "22",
                border: `1px solid ${a.color}44`,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: a.color,
              }}
            >
              <Icon name={a.icon} size={18} color={a.color} />
            </button>
          </div>
        ))}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: 56,
          height: 56,
          borderRadius: 9999,
          background: T.teal,
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#0A0A0F",
          boxShadow: `0 8px 24px ${T.teal}55`,
          transform: open ? "rotate(45deg)" : "none",
          transition: "transform 0.2s cubic-bezier(.34,1.56,.64,1)",
        }}
      >
        <Icon name="plus" size={24} color="#0A0A0F" strokeWidth={2.4} />
      </button>
    </div>
  );
}

function AIWorkoutLogger({ onClose, onRefresh }) {
  const [type, setType] = useState("strength");
  const [duration, setDuration] = useState("60");
  const [intensity, setIntensity] = useState("moderate");
  const [desc, setDesc] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [logging, setLogging] = useState(false);

  const WORKOUT_TYPES = ["strength", "crossfit", "running", "hiit", "hyrox", "yoga", "cycling"];
  const INTENSITY_OPTS = ["light", "moderate", "intense"];

  async function handleAnalyze() {
    setAnalyzing(true);
    try {
      const r = await workoutAPI.analyze({
        workout_type: type,
        duration_minutes: Number(duration),
        intensity,
        description: desc || undefined,
      });
      setResult(r);
    } catch (e) {
      alert(e.message || "Analyze failed");
    }
    setAnalyzing(false);
  }

  async function handleLog() {
    if (!result) return;
    setLogging(true);
    try {
      await workoutAPI.save({
        workout_type: type,
        duration_minutes: Number(duration),
        intensity,
        description: desc || undefined,
        ai_analysis: result,
        calories_burned_est: result.calories_burned || result.calories,
      });
      onRefresh?.();
      onClose();
    } catch (e) {
      alert(e.message || "Log failed");
    }
    setLogging(false);
  }

  function inp(focused) {
    return {
      width: "100%",
      background: T.elevated,
      border: `1px solid ${focused ? T.teal : T.border}`,
      borderRadius: T.rInput,
      padding: "10px 12px",
      color: T.text,
      fontSize: 13,
      fontFamily: "inherit",
      outline: "none",
      boxSizing: "border-box",
    };
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: T.z.modal,
        background: "rgba(10,10,15,0.88)",
        display: "flex",
        alignItems: "flex-end",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          width: "100%",
          background: T.surface,
          borderRadius: "20px 20px 0 0",
          border: `1px solid ${T.border}`,
          borderBottom: "none",
          padding: "20px 20px 48px",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          overflowY: "auto",
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 9999, background: T.border, alignSelf: "center", marginBottom: 4 }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: T.text }}>AI Workout Logger</div>
          <button
            onClick={onClose}
            style={{
              background: T.elevated,
              border: `1px solid ${T.border}`,
              borderRadius: 9999,
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: T.textMuted,
            }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>

        <div>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>Workout Type</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {WORKOUT_TYPES.map((wt) => (
              <button
                key={wt}
                onClick={() => setType(wt)}
                style={{
                  padding: "6px 12px",
                  borderRadius: T.rChip,
                  background: type === wt ? T.teal : T.elevated,
                  color: type === wt ? "#0A0A0F" : T.text,
                  border: `1px solid ${type === wt ? T.teal : T.border}`,
                  fontSize: 12,
                  fontWeight: type === wt ? 700 : 500,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textTransform: "capitalize",
                }}
              >
                {wt}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>Duration (minutes)</div>
          <input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} min={1} max={300} style={inp(false)} />
        </div>

        <div>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>Intensity</div>
          <div style={{ display: "flex", gap: 8 }}>
            {INTENSITY_OPTS.map((opt) => (
              <button
                key={opt}
                onClick={() => setIntensity(opt)}
                style={{
                  flex: 1,
                  padding: "8px 0",
                  borderRadius: T.rChip,
                  background:
                    intensity === opt
                      ? opt === "light"
                        ? T.teal
                        : opt === "intense"
                        ? T.negative
                        : T.amber
                      : T.elevated,
                  color: intensity === opt ? "#0A0A0F" : T.text,
                  border: `1px solid ${intensity === opt ? T.border : T.border}`,
                  fontSize: 12,
                  fontWeight: intensity === opt ? 700 : 500,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textTransform: "capitalize",
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>Notes (optional)</div>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="e.g. 5×5 squat, felt strong…" style={{ ...inp(false), resize: "none" }} />
        </div>

        {!result && (
          <button
            onClick={handleAnalyze}
            disabled={analyzing || !duration}
            style={{
              padding: "13px 0",
              background: analyzing ? T.elevated : `linear-gradient(135deg,${T.teal},${T.violet})`,
              color: analyzing ? T.textMuted : "#0A0A0F",
              border: "none",
              borderRadius: T.rCard,
              fontSize: 14,
              fontWeight: 700,
              cursor: analyzing ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <Icon name="sparkle" size={16} color={analyzing ? T.textMuted : "#0A0A0F"} />
            {analyzing ? "Analyzing…" : "Analyze with AI"}
          </button>
        )}

        {result && (
          <div
            style={{
              background: T.elevated,
              border: `1px solid ${T.teal}44`,
              borderRadius: T.rCard,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: T.teal, letterSpacing: 0.5, textTransform: "uppercase" }}>AI Analysis</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                ["Calories", `${result.calories_burned || result.calories || "—"} kcal`],
                ["Recovery", result.recovery_time || "—"],
              ].map(([l, v]) => (
                <div key={l} style={{ background: T.surface, borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{l}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: T.text, fontFamily: T.fontMono }}>{v}</div>
                </div>
              ))}
            </div>
            {result.muscles_worked?.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {result.muscles_worked.map((m) => (
                  <span key={m} style={{ fontSize: 10, color: T.teal, background: T.teal + "18", borderRadius: 6, padding: "3px 8px" }}>
                    {m}
                  </span>
                ))}
              </div>
            )}
            {result.notes && <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.5 }}>{result.notes}</div>}
            <button
              onClick={handleLog}
              disabled={logging}
              style={{
                padding: "12px 0",
                background: T.teal,
                color: "#0A0A0F",
                border: "none",
                borderRadius: T.rCard,
                fontSize: 14,
                fontWeight: 700,
                cursor: logging ? "not-allowed" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {logging ? "Logging…" : "Log Workout"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TemplateBrowser({ onClose, onStart }) {
  const [filter, setFilter] = useState("all");
  const allTemplates = exerciseData.templates.flatMap((tpl) =>
    tpl.days.map((day) => ({
      ...day,
      templateName: tpl.name,
      templateId: tpl.id,
      workout_type: day.focus === "cardio" ? "cardio" : day.focus === "fullBody" ? "hyrox" : "strength",
    }))
  );
  const filtered = filter === "all" ? allTemplates : allTemplates.filter((t) => t.workout_type === filter);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: T.z.modal,
        background: "rgba(10,10,15,0.88)",
        display: "flex",
        alignItems: "flex-end",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          width: "100%",
          background: T.surface,
          borderRadius: "20px 20px 0 0",
          border: `1px solid ${T.border}`,
          borderBottom: "none",
          padding: "20px 20px 48px",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          overflowY: "auto",
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 9999, background: T.border, alignSelf: "center", marginBottom: 4 }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: T.text }}>Browse Templates</div>
          <button
            onClick={onClose}
            style={{
              background: T.elevated,
              border: `1px solid ${T.border}`,
              borderRadius: 9999,
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: T.textMuted,
            }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>

        <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none" }}>
          {SPORTS.map((s) => (
            <button
              key={s.id}
              onClick={() => setFilter(s.id)}
              style={{
                flexShrink: 0,
                padding: "6px 14px",
                borderRadius: 9999,
                background: filter === s.id ? T.teal : T.elevated,
                color: filter === s.id ? "#0A0A0F" : T.text,
                border: `1px solid ${filter === s.id ? T.teal : T.border}`,
                fontSize: 12,
                fontWeight: filter === s.id ? 700 : 500,
                cursor: "pointer",
                fontFamily: "inherit",
                whiteSpace: "nowrap",
                textTransform: "capitalize",
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {filtered.map((t, i) => {
            const typeColor = t.workout_type === "running" ? T.amber : t.workout_type === "hyrox" ? T.violet : T.teal;
            return (
              <div
                key={`${t.templateId}-${i}`}
                style={{
                  background: T.surface,
                  border: `1px solid ${T.border}`,
                  borderRadius: T.rCard,
                  padding: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    alignSelf: "flex-start",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: 0.8,
                    color: typeColor,
                    background: typeColor + "22",
                    padding: "2px 7px",
                    borderRadius: 5,
                  }}
                >
                  {t.templateName}
                </span>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.text, lineHeight: 1.2 }}>{t.name}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {t.exercises.slice(0, 4).map((exId) => {
                    const ex = exerciseData.exercises.find((e) => e.id === exId);
                    return (
                      <span
                        key={exId}
                        style={{
                          fontSize: 9,
                          color: T.textMuted,
                          background: T.elevated,
                          border: `1px solid ${T.border}`,
                          borderRadius: 5,
                          padding: "2px 6px",
                        }}
                      >
                        {ex?.name || exId}
                      </span>
                    );
                  })}
                </div>
                <button
                  onClick={() =>
                    onStart({
                      name: t.name,
                      workout_type: t.workout_type,
                      exercises: t.exercises.map((exId) => {
                        const ex = exerciseData.exercises.find((e) => e.id === exId);
                        return { name: ex?.name || exId };
                      }),
                    })
                  }
                  style={{
                    marginTop: 4,
                    padding: "8px 0",
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
                  Start
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function WorkoutPage({ profile, onProfile }) {
  const [history, setHistory] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showBrowser, setShowBrowser] = useState(false);
  const [showAILogger, setShowAILogger] = useState(false);
  const [liveSession, setLiveSession] = useState(false);
  const [liveTemplate, setLiveTemplate] = useState(null);
  const [showExerciseDB, setShowExerciseDB] = useState(false);

  async function refresh() {
    try {
      const [logs, tmpl] = await Promise.all([workoutAPI.getAll(30), workoutAPI.getTemplates()]);
      const localHistory = JSON.parse(localStorage.getItem("lo_workout_history") || "[]");
      const apiLogs = logs?.workouts || [];
      const merged = [...apiLogs, ...localHistory].sort(
        (a, b) => new Date(b.date || b.loggedAt) - new Date(a.date || a.loggedAt)
      );
      setHistory(merged.slice(0, 50));
      if (tmpl?.templates?.length) {
        setTemplates(
          tmpl.templates.map((t) => ({
            ...t,
            tag: (t.workout_type || "strength").toUpperCase(),
            tagColor: t.workout_type === "running" ? T.amber : t.workout_type === "hyrox" ? T.violet : T.teal,
            exercises: t.exercises?.length || 0,
            duration: t.estimated_duration ? `${t.estimated_duration} min` : "—",
            muscles: t.exercises?.slice(0, 3).map((e) => e.name) || [],
          }))
        );
      }
    } catch {}
  }

  useEffect(() => {
    (async () => {
      try {
        await refresh();
      } catch {}
      setLoading(false);
    })();
  }, []);

  const streak = profile?.workout_streak || 4;
  const totalDays = profile?.total_workout_days || 128;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: T.bg, position: "relative" }}>
      <style>{`@keyframes speedDialIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}`}</style>
      <PageHeader title="Workout" subtitle={`Day ${streak} of your cut · ${totalDays} days in`} profile={profile} onProfile={onProfile} />

      <PageScroll>
        <HeroCard onStart={() => setLiveSession(true)} onBrowse={() => setShowBrowser(true)} />

        {/* Quick actions */}
        <div style={{ padding: "0 20px 16px", display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowExerciseDB(true)}
            style={{
              flex: 1,
              padding: "10px 0",
              background: T.elevated,
              border: `1px solid ${T.border}`,
              borderRadius: T.rCard,
              color: T.text,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <Icon name="search" size={14} color={T.teal} />
            Exercise DB
          </button>
          <button
            onClick={() => setShowBrowser(true)}
            style={{
              flex: 1,
              padding: "10px 0",
              background: T.elevated,
              border: `1px solid ${T.border}`,
              borderRadius: T.rCard,
              color: T.text,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <Icon name="edit" size={14} color={T.violet} />
            Templates
          </button>
        </div>

        <div style={{ padding: "0 20px 8px" }}>
          <SectionHead title="Templates" trailing={<span style={{ fontSize: 12, color: T.teal, cursor: "pointer" }} onClick={() => setShowBrowser(true)}>See all</span>} />
        </div>
        <div style={{ display: "flex", gap: 12, overflowX: "auto", padding: "4px 20px 24px", scrollbarWidth: "none" }}>
          {loading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : (
            templates.slice(0, 6).map((t) => <TemplateCardSmall key={t.id} t={t} onStart={(tpl) => { setLiveTemplate(tpl); setLiveSession(true); }} />)
          )}
        </div>

        <div style={{ padding: "0 20px 16px" }}>
          <SectionHead title="Recent Workouts" />
        </div>
        <WorkoutHistory history={history} loading={loading} onSelect={(w) => {}} />
      </PageScroll>

      <SpeedDialFAB
        onAILog={() => setShowAILogger(true)}
        onManualLog={() => setLiveSession(true)}
        onNewTemplate={() => setShowBrowser(true)}
      />

      {showBrowser && <TemplateBrowser onClose={() => setShowBrowser(false)} onStart={(t) => { setShowBrowser(false); setLiveTemplate(t); setLiveSession(true); }} />}
      {showAILogger && <AIWorkoutLogger onClose={() => setShowAILogger(false)} onRefresh={refresh} />}
      {showExerciseDB && <ExerciseBrowser open={showExerciseDB} onClose={() => setShowExerciseDB(false)} onSelectExercise={(ex) => { setShowExerciseDB(false); setLiveTemplate({ name: ex.name, exercises: [{ name: ex.name }] }); setLiveSession(true); }} />}

      {liveSession && (
        <ActiveWorkout
          open={liveSession}
          onClose={() => { setLiveSession(false); setLiveTemplate(null); refresh(); }}
          template={liveTemplate}
          onFinish={() => refresh()}
        />
      )}
    </div>
  );
}
