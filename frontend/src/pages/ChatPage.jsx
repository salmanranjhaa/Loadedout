import { useState, useRef, useEffect } from "react";
import { Icon } from "../design/icons";
import { T } from "../design/tokens";
import { Chip, PageHeader, LoadingDots } from "../design/components";
import { aiAPI, mealsAPI, scheduleAPI, workoutAPI, userAPI, chatAPI } from "../utils/api";
import MarkdownRenderer from "../components/ai/MarkdownRenderer";
import QuickActions from "../components/ai/QuickActions";
import VoiceInput from "../components/ai/VoiceInput";

const STORAGE_KEY = "lifeplan_chat_v1";

function makeInitialMessage(name = "there") {
  return { role: "assistant", content: `Hey ${name}! How can I help you today?` };
}

function buildContext(profile) {
  const today = new Date().toISOString().slice(0, 10);
  const water = parseInt(localStorage.getItem(`lo_water_${today}`) || "0", 10);
  const prs = JSON.parse(localStorage.getItem("lo_prs") || "{}");
  const prList = Object.entries(prs)
    .map(([ex, data]) => `${ex}: ${data.weight_kg}kg`)
    .join(", ");
  return `User context: Weight ${profile?.weight_kg || "—"}kg, Target ${profile?.target_weight_kg || "—"}kg, Calories ${profile?.daily_calorie_target || "—"}, Protein ${profile?.daily_protein_target || "—"}g, Water today ${water}ml. PRs: ${prList || "none"}.`;
}

function inferTemplateExerciseType(exercise) {
  const repsText = `${exercise?.reps ?? ""}`.trim().toLowerCase();
  const hasWeight = exercise?.weight_suggestion_kg != null && `${exercise.weight_suggestion_kg}`.trim() !== "";
  if (/\b(sec|secs|second|seconds|min|mins|minute|minutes)\b/.test(repsText)) return "timed";
  return hasWeight ? "weighted" : "bodyweight";
}

function MealActionCard({ data, onSave, onDismiss }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState("macros");
  const [edited, setEdited] = useState({ ...data });
  const [ingredients, setIngredients] = useState((data.ingredients || []).map((ing) => ({ name: ing.name || "", amount: ing.amount || "" })));
  const [reestimating, setReestimating] = useState(false);

  async function reestimateFromIngredients() {
    if (!ingredients.length) return;
    const desc = ingredients
      .filter((i) => i.name.trim())
      .map((i) => `${i.amount ? i.amount + " " : ""}${i.name}`)
      .join(", ");
    setReestimating(true);
    try {
      const result = await aiAPI.estimateMacros(desc);
      if (!result.error) {
        setEdited((p) => ({
          ...p,
          calories: result.calories ?? p.calories,
          protein_g: result.protein_g ?? p.protein_g,
          carbs_g: result.carbs_g ?? p.carbs_g,
          fat_g: result.fat_g ?? p.fat_g,
        }));
        setTab("macros");
      }
    } catch {}
    setReestimating(false);
  }

  function addIngredient() {
    setIngredients((p) => [...p, { name: "", amount: "" }]);
  }
  function updateIngredient(i, field, val) {
    setIngredients((p) => p.map((ing, idx) => (idx === i ? { ...ing, [field]: val } : ing)));
  }
  function removeIngredient(i) {
    setIngredients((p) => p.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({ ...edited, ingredients });
      setSaved(true);
    } catch (e) {
      alert("Failed to save: " + e.message);
    }
    setSaving(false);
  }

  const accent = saved ? T.teal : T.violet;
  const tabBtnStyle = (active) => ({
    flex: 1,
    padding: "6px 0",
    borderRadius: 6,
    fontSize: 11,
    cursor: "pointer",
    fontFamily: "inherit",
    border: "none",
    background: active ? T.elevated2 : "transparent",
    color: active ? T.text : T.textMuted,
    fontWeight: active ? 600 : 400,
  });

  return (
    <div
      style={{
        marginTop: 10,
        borderRadius: 12,
        border: `1px solid ${accent}44`,
        padding: 12,
        background: accent + "0D",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="meal" size={13} color={accent} />
        <span style={{ fontSize: 11, fontWeight: 600, color: T.text }}>{saved ? "Saved & Logged ✓" : "Save this meal?"}</span>
        {!saved && (
          <button onClick={onDismiss} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: T.textDim, padding: 0 }}>
            <Icon name="x" size={12} color={T.textDim} />
          </button>
        )}
      </div>

      {!saved && (
        <>
          <div style={{ display: "flex", background: T.elevated, borderRadius: 8, padding: 2, gap: 2 }}>
            {["macros", "ingredients"].map((t) => (
              <button key={t} onClick={() => setTab(t)} style={tabBtnStyle(tab === t)}>
                {t}
              </button>
            ))}
          </div>

          {tab === "macros" && (
            <div style={{ background: T.elevated, borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              <input
                value={edited.name || ""}
                onChange={(e) => setEdited((p) => ({ ...p, name: e.target.value }))}
                placeholder="Meal name"
                style={{
                  width: "100%",
                  background: T.elevated2,
                  border: `1px solid ${T.border}`,
                  borderRadius: 8,
                  padding: "6px 10px",
                  color: T.text,
                  fontSize: 12,
                  fontFamily: "inherit",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {[
                  ["calories", "kcal", T.amber],
                  ["protein_g", "g prot", T.teal],
                  ["carbs_g", "g carbs", T.amber],
                  ["fat_g", "g fat", T.textMuted],
                ].map(([key, unit, color]) => (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="number"
                      value={edited[key] || ""}
                      onChange={(e) => setEdited((p) => ({ ...p, [key]: e.target.value }))}
                      style={{
                        width: 56,
                        background: T.elevated2,
                        border: `1px solid ${T.border}`,
                        borderRadius: 6,
                        padding: "4px 8px",
                        color: T.text,
                        fontSize: 11,
                        fontFamily: "inherit",
                        outline: "none",
                      }}
                      min={0}
                    />
                    <span style={{ fontSize: 9, color }}>{unit}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "ingredients" && (
            <div style={{ background: T.elevated, borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              {ingredients.map((ing, i) => (
                <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    value={ing.amount}
                    onChange={(e) => updateIngredient(i, "amount", e.target.value)}
                    placeholder="qty"
                    style={{
                      width: 48,
                      background: T.elevated2,
                      border: `1px solid ${T.border}`,
                      borderRadius: 6,
                      padding: "4px 8px",
                      color: T.textMuted,
                      fontSize: 11,
                      fontFamily: "inherit",
                      outline: "none",
                    }}
                  />
                  <input
                    value={ing.name}
                    onChange={(e) => updateIngredient(i, "name", e.target.value)}
                    placeholder="ingredient"
                    style={{
                      flex: 1,
                      background: T.elevated2,
                      border: `1px solid ${T.border}`,
                      borderRadius: 6,
                      padding: "4px 8px",
                      color: T.text,
                      fontSize: 11,
                      fontFamily: "inherit",
                      outline: "none",
                    }}
                  />
                  <button onClick={() => removeIngredient(i)} style={{ background: "none", border: "none", cursor: "pointer", color: T.textDim, padding: 2 }}>
                    <Icon name="trash" size={11} color={T.negative} />
                  </button>
                </div>
              ))}
              <button
                onClick={addIngredient}
                style={{
                  padding: "6px 0",
                  fontSize: 10,
                  color: T.textDim,
                  border: `1px dashed ${T.border}`,
                  borderRadius: 8,
                  background: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                }}
              >
                <Icon name="plus" size={10} color={T.textDim} /> Add ingredient
              </button>
              <button
                onClick={reestimateFromIngredients}
                disabled={reestimating || !ingredients.some((i) => i.name.trim())}
                style={{
                  padding: "7px 0",
                  fontSize: 11,
                  color: T.violet,
                  background: T.violet + "18",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  opacity: reestimating || !ingredients.some((i) => i.name.trim()) ? 0.4 : 1,
                }}
              >
                <Icon name={reestimating ? "history" : "bolt"} size={11} color={T.violet} />
                {reestimating ? "Re-estimating…" : "Re-estimate macros"}
              </button>
            </div>
          )}
        </>
      )}

      {saved && (
        <div style={{ background: T.elevated, borderRadius: 10, padding: 10 }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: T.text, margin: 0 }}>{edited.name}</p>
          <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: T.amber }}>{edited.calories} kcal</span>
            <span style={{ fontSize: 11, color: T.teal }}>{edited.protein_g}g protein</span>
          </div>
        </div>
      )}

      {!saved && (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onDismiss}
            style={{
              flex: 1,
              padding: "8px 0",
              fontSize: 11,
              color: T.textMuted,
              background: T.elevated,
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Dismiss
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1,
              padding: "8px 0",
              fontSize: 11,
              color: "#0A0A0F",
              background: saving ? T.elevated : T.teal,
              border: "none",
              borderRadius: 8,
              cursor: saving ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              opacity: saving ? 0.5 : 1,
            }}
          >
            <Icon name="check" size={11} color="#0A0A0F" />
            {saving ? "Saving…" : "Save & Log Today"}
          </button>
        </div>
      )}
    </div>
  );
}

function ScheduleActionCard({ data, onSave, onDismiss }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  async function handleSave() {
    setSaving(true);
    try {
      await onSave(data);
      setSaved(true);
    } catch (e) {
      alert(e.message);
    }
    setSaving(false);
  }
  const accent = saved ? T.teal : T.catClass;
  return (
    <div
      style={{
        marginTop: 10,
        borderRadius: 12,
        border: `1px solid ${accent}44`,
        padding: 12,
        background: accent + "0D",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="calendar" size={13} color={accent} />
        <span style={{ fontSize: 11, fontWeight: 600, color: T.text }}>{saved ? "Saved ✓" : "Add to schedule?"}</span>
        {!saved && (
          <button onClick={onDismiss} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: T.textDim, padding: 0 }}>
            <Icon name="x" size={12} color={T.textDim} />
          </button>
        )}
      </div>
      <div style={{ background: T.elevated, borderRadius: 10, padding: 10 }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: T.text, margin: 0 }}>{data.title}</p>
        <p style={{ fontSize: 11, color: T.textMuted, margin: "4px 0 0" }}>
          {data.day_of_week} · {data.start_time}–{data.end_time}
        </p>
      </div>
      {!saved && (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onDismiss}
            style={{
              flex: 1,
              padding: "8px 0",
              fontSize: 11,
              color: T.textMuted,
              background: T.elevated,
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Dismiss
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1,
              padding: "8px 0",
              fontSize: 11,
              color: "#0A0A0F",
              background: saving ? T.elevated : T.teal,
              border: "none",
              borderRadius: 8,
              cursor: saving ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {saving ? "Saving…" : "Add to Schedule"}
          </button>
        </div>
      )}
    </div>
  );
}

function WorkoutTemplateCard({ data, onSave, onDismiss }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState("overview");
  async function handleSave() {
    setSaving(true);
    try {
      await onSave(data);
      setSaved(true);
    } catch (e) {
      alert(e.message);
    }
    setSaving(false);
  }
  const accent = saved ? T.teal : T.catExercise;
  return (
    <div
      style={{
        marginTop: 10,
        borderRadius: 12,
        border: `1px solid ${accent}44`,
        padding: 12,
        background: accent + "0D",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="dumbbell" size={13} color={accent} />
        <span style={{ fontSize: 11, fontWeight: 600, color: T.text }}>{saved ? "Saved ✓" : "Save workout template?"}</span>
        {!saved && (
          <button onClick={onDismiss} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: T.textDim, padding: 0 }}>
            <Icon name="x" size={12} color={T.textDim} />
          </button>
        )}
      </div>
      {!saved && (
        <div style={{ display: "flex", background: T.elevated, borderRadius: 8, padding: 2, gap: 2 }}>
          {["overview", "exercises"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                padding: "6px 0",
                borderRadius: 6,
                fontSize: 11,
                cursor: "pointer",
                fontFamily: "inherit",
                border: "none",
                background: tab === t ? T.elevated2 : "transparent",
                color: tab === t ? T.text : T.textMuted,
                fontWeight: tab === t ? 600 : 400,
              }}
            >
              {t}
            </button>
          ))}
        </div>
      )}
      {tab === "overview" && (
        <div style={{ background: T.elevated, borderRadius: 10, padding: 10 }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: T.text, margin: 0 }}>{data.name}</p>
          <p style={{ fontSize: 11, color: T.textMuted, margin: "4px 0 0" }}>
            {data.exercises?.length || 0} exercises · {data.estimated_duration || "—"} min
          </p>
        </div>
      )}
      {tab === "exercises" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(data.exercises || []).map((ex, i) => (
            <div key={i} style={{ background: T.elevated, borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{ex.name}</div>
              <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>
                {ex.sets} sets × {ex.reps} reps
                {ex.weight_suggestion_kg ? ` @ ${ex.weight_suggestion_kg}kg` : ""}
              </div>
            </div>
          ))}
        </div>
      )}
      {!saved && (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onDismiss}
            style={{
              flex: 1,
              padding: "8px 0",
              fontSize: 11,
              color: T.textMuted,
              background: T.elevated,
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Dismiss
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1,
              padding: "8px 0",
              fontSize: 11,
              color: "#0A0A0F",
              background: saving ? T.elevated : T.teal,
              border: "none",
              borderRadius: 8,
              cursor: saving ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {saving ? "Saving…" : "Save Template"}
          </button>
        </div>
      )}
    </div>
  );
}

function StreamingMessage({ content }) {
  const [displayed, setDisplayed] = useState("");
  const indexRef = useRef(0);

  useEffect(() => {
    if (!content) return;
    indexRef.current = 0;
    setDisplayed("");
    const interval = setInterval(() => {
      indexRef.current += 1;
      setDisplayed(content.slice(0, indexRef.current));
      if (indexRef.current >= content.length) {
        clearInterval(interval);
      }
    }, 12);
    return () => clearInterval(interval);
  }, [content]);

  return <MarkdownRenderer text={displayed} />;
}

export default function ChatPage({ profile, onProfile }) {
  const [messages, setMessages] = useState(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch {}
    return [makeInitialMessage(profile?.full_name)];
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState(profile?.full_name || "there");
  const scrollRef = useRef(null);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function sendMessage(text) {
    if (!text.trim()) return;
    const userMsg = { role: "user", content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));
      const context = buildContext(profile);
      const response = await aiAPI.chat(context + "\n" + userMsg.content, history, "general");

      let content = response?.reply || response?.message || "Sorry, I didn't catch that.";
      let actionData = null;
      let actionType = null;

      try {
        const parsed = JSON.parse(content);
        if (parsed.reply) {
          content = parsed.reply;
          actionData = parsed.action_data;
          actionType = parsed.action_type;
        }
      } catch {
        // Not JSON, use as-is
      }

      const assistantMsg = { role: "assistant", content, actionData, actionType };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
    }
    setLoading(false);
  }

  function handleSaveAction(msg) {
    if (!msg.actionType || !msg.actionData) return;
    if (msg.actionType === "save_meal_template") {
      return mealsAPI.saveTemplate(msg.actionData);
    }
    if (msg.actionType === "add_schedule_event") {
      return scheduleAPI.create(msg.actionData);
    }
    if (msg.actionType === "save_workout_template") {
      return workoutAPI.saveTemplate(msg.actionData);
    }
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: T.bg }}>
      <PageHeader title="AI Assistant" subtitle="Your personal fitness coach" profile={profile} onProfile={onProfile} />

      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        <div ref={scrollRef} style={{ height: "100%", overflowY: "auto", padding: "0 16px 100px" }}>
          {/* Save hint */}
          <div
            style={{
              background: T.elevated,
              border: `1px solid ${T.border}`,
              borderRadius: 10,
              padding: "8px 12px",
              margin: "12px 0",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Icon name="sparkle" size={12} color={T.teal} />
            <span style={{ fontSize: 11, color: T.textMuted }}>
              Say <strong style={{ color: T.text }}>"save this"</strong> to log meals, workouts, or schedule events.
            </span>
          </div>

          <QuickActions onAction={(prompt) => sendMessage(prompt)} />

          {/* Messages */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 12 }}>
            {messages.map((msg, i) => {
              const isUser = msg.role === "user";
              return (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start", gap: 4 }}>
                  <div
                    style={{
                      maxWidth: "85%",
                      background: isUser ? T.teal : T.surface,
                      color: isUser ? "#0A0A0F" : T.textMuted,
                      borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                      padding: "10px 14px",
                      fontSize: 13,
                      lineHeight: 1.5,
                      border: isUser ? "none" : `1px solid ${T.border}`,
                    }}
                  >
                    {isUser ? (
                      msg.content
                    ) : i === messages.length - 1 && loading ? (
                      <StreamingMessage content={msg.content} />
                    ) : (
                      <MarkdownRenderer text={msg.content} />
                    )}
                  </div>
                  {!isUser && msg.actionData && msg.actionType === "save_meal_template" && (
                    <MealActionCard
                      data={msg.actionData}
                      onSave={() => handleSaveAction(msg)}
                      onDismiss={() => setMessages((prev) => prev.map((m, idx) => (idx === i ? { ...m, actionData: null } : m)))}
                    />
                  )}
                  {!isUser && msg.actionData && msg.actionType === "add_schedule_event" && (
                    <ScheduleActionCard
                      data={msg.actionData}
                      onSave={() => handleSaveAction(msg)}
                      onDismiss={() => setMessages((prev) => prev.map((m, idx) => (idx === i ? { ...m, actionData: null } : m)))}
                    />
                  )}
                  {!isUser && msg.actionData && msg.actionType === "save_workout_template" && (
                    <WorkoutTemplateCard
                      data={msg.actionData}
                      onSave={() => handleSaveAction(msg)}
                      onDismiss={() => setMessages((prev) => prev.map((m, idx) => (idx === i ? { ...m, actionData: null } : m)))}
                    />
                  )}
                </div>
              );
            })}
            {loading && messages[messages.length - 1]?.role === "user" && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div
                  style={{
                    background: T.surface,
                    border: `1px solid ${T.border}`,
                    borderRadius: "16px 16px 16px 4px",
                    padding: "12px 18px",
                  }}
                >
                  <LoadingDots />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Input */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "100%",
          maxWidth: 430,
          background: "rgba(10,10,15,0.95)",
          backdropFilter: "blur(20px)",
          borderTop: `0.5px solid ${T.border}`,
          padding: "10px 16px calc(10px + env(safe-area-inset-bottom, 0px))",
          zIndex: T.z.sticky,
          display: "flex",
          alignItems: "flex-end",
          gap: 8,
        }}
      >
        <VoiceInput onTranscript={(t) => setInput((prev) => prev + t)} />
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage(input);
            }
          }}
          placeholder="Ask anything…"
          rows={1}
          style={{
            flex: 1,
            background: T.elevated,
            border: `1px solid ${T.border}`,
            borderRadius: 18,
            padding: "10px 14px",
            color: T.text,
            fontSize: 14,
            fontFamily: "inherit",
            outline: "none",
            resize: "none",
            maxHeight: 100,
            lineHeight: 1.4,
          }}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || loading}
          style={{
            width: 36,
            height: 36,
            borderRadius: 9999,
            background: input.trim() && !loading ? T.teal : T.elevated2,
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: input.trim() && !loading ? "pointer" : "default",
            flexShrink: 0,
          }}
        >
          <Icon name="send" size={16} color={input.trim() && !loading ? "#0A0A0F" : T.textDim} />
        </button>
      </div>
    </div>
  );
}
