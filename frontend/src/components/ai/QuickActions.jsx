import { T } from "../../design/tokens";
import { Icon } from "../../design/icons";

const ACTIONS = [
  { label: "Generate Push workout", icon: "dumbbell", prompt: "Generate a Push workout with 6 exercises including sets, reps, and RPE." },
  { label: "Log yesterday's dinner", icon: "meal", prompt: "Help me log yesterday's dinner. I had grilled salmon, rice, and broccoli." },
  { label: "Why am I plateauing?", icon: "trend-up", prompt: "I've been stuck at the same weights for 3 weeks. Why might I be plateauing and what should I do?" },
  { label: "Suggest a snack", icon: "meal", prompt: "Suggest a high-protein snack under 200 calories." },
  { label: "Adjust my calories", icon: "sparkle", prompt: "I'm not losing weight anymore. Should I adjust my calories?" },
  { label: "Form check tips", icon: "dumbbell", prompt: "Give me form tips for the deadlift and squat." },
];

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
          <Icon name={a.icon} size={12} color={T.teal} />
          {a.label}
        </button>
      ))}
    </div>
  );
}
