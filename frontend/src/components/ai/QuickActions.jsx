import { T } from "../../design/tokens";
import { Icon } from "../../design/icons";

// Prompts are written to exploit the coach's real context: today's macros,
// workout history, PRs, pantry, schedule, and the user's saved goals.
const ACTIONS = [
  {
    label: "Plan today's workout",
    sub: "Based on your recent sessions",
    icon: "dumbbell",
    color: T.teal,
    prompt: "Based on my recent workouts and what's least recovered, plan today's session for me with exercises, sets, reps and suggested weights.",
  },
  {
    label: "What should I eat today?",
    sub: "Fits your remaining macros",
    icon: "meal",
    color: T.amber,
    prompt: "Look at what I've already eaten today and plan my remaining meals so I hit my calorie and protein targets.",
  },
  {
    label: "Cook from my pantry",
    sub: "Dinner ideas, with macros",
    icon: "pantry",
    color: T.violet,
    prompt: "Suggest a dinner I can cook with ingredients from my pantry. Include macros per serving and quick prep steps.",
  },
  {
    label: "Review my week",
    sub: "Training + nutrition audit",
    icon: "analytics",
    color: T.teal,
    prompt: "Review my training and nutrition over the last 7 days and give me the 3 most impactful things to improve next week.",
  },
  {
    label: "Am I on track?",
    sub: "Weight trend vs your goal",
    icon: "trend-up",
    color: T.amber,
    prompt: "How is my weight trending compared to my goal and weekly pace? Am I on track, and should I adjust my calories?",
  },
  {
    label: "Break my plateau",
    sub: "Smart progression advice",
    icon: "bolt",
    color: T.violet,
    prompt: "Look at my personal records and recent workouts — where am I stalling, and give me a concrete plan to break the plateau.",
  },
];

// Hero variant: 2-column tappable cards for the empty state
export function PromptCards({ onAction }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, width: "100%" }}>
      {ACTIONS.map((a) => (
        <button
          key={a.label}
          onClick={() => onAction?.(a.prompt)}
          style={{
            textAlign: "left",
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 14,
            padding: "12px 13px",
            cursor: "pointer",
            fontFamily: "inherit",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div style={{
            width: 28, height: 28, borderRadius: 8, background: `${a.color}1C`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Icon name={a.icon} size={14} color={a.color} />
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text, lineHeight: 1.25 }}>{a.label}</div>
          <div style={{ fontSize: 10.5, color: T.textMuted, lineHeight: 1.35 }}>{a.sub}</div>
        </button>
      ))}
    </div>
  );
}

// Compact chips row (used above the conversation)
export default function QuickActions({ onAction }) {
  return (
    <div style={{ display: "flex", gap: 8, overflowX: "auto", scrollbarWidth: "none", padding: "0 20px 12px" }}>
      {ACTIONS.map((a) => (
        <button
          key={a.label}
          onClick={() => onAction?.(a.prompt)}
          style={{
            flexShrink: 0,
            padding: "8px 14px",
            background: T.elevated,
            border: `1px solid ${T.border}`,
            borderRadius: 9999,
            color: T.text,
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            gap: 6,
            whiteSpace: "nowrap",
          }}
        >
          <Icon name={a.icon} size={12} color={a.color} />
          {a.label}
        </button>
      ))}
    </div>
  );
}
