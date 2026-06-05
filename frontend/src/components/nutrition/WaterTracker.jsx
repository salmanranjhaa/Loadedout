import { useState, useEffect } from "react";
import { T } from "../../design/tokens";
import { Icon } from "../../design/icons";

const GOAL_ML = 2500;
const QUICK_ADDS = [250, 500, 750];

export default function WaterTracker() {
  const [amount, setAmount] = useState(0);
  const [custom, setCustom] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const key = `lo_water_${today}`;
    const stored = parseInt(localStorage.getItem(key) || "0", 10);
    setAmount(stored);
  }, []);

  const save = (val) => {
    const today = new Date().toISOString().slice(0, 10);
    const key = `lo_water_${today}`;
    localStorage.setItem(key, String(val));
    setAmount(val);
  };

  const add = (ml) => save(amount + ml);
  const reset = () => save(0);

  const pct = Math.min(amount / GOAL_ML, 1);
  const remaining = Math.max(GOAL_ML - amount, 0);

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rCard, padding: 16, margin: "0 20px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "#5C8FFC22", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="mug" size={18} color="#5C8FFC" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Water Tracker</div>
          <div style={{ fontSize: 11, color: T.textMuted }}>{remaining > 0 ? `${remaining}ml to goal` : "Goal reached!"}</div>
        </div>
        <button onClick={reset} style={{ background: "none", border: "none", cursor: "pointer", color: T.textDim, fontSize: 11 }}>
          Reset
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ height: 8, borderRadius: 9999, background: T.elevated2, overflow: "hidden", marginBottom: 12 }}>
        <div
          style={{
            width: `${pct * 100}%`,
            height: "100%",
            background: pct >= 1 ? T.teal : "#5C8FFC",
            borderRadius: 9999,
            transition: "width 0.4s ease",
          }}
        />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {QUICK_ADDS.map((ml) => (
          <button
            key={ml}
            onClick={() => add(ml)}
            style={{
              flex: 1,
              padding: "8px 0",
              background: T.elevated,
              border: `1px solid ${T.border}`,
              borderRadius: 8,
              color: T.text,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            +{ml}ml
          </button>
        ))}
        <button
          onClick={() => setShowCustom((s) => !s)}
          style={{
            padding: "8px 12px",
            background: T.elevated,
            border: `1px solid ${T.border}`,
            borderRadius: 8,
            color: T.textMuted,
            fontSize: 12,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <Icon name="edit" size={12} />
        </button>
      </div>

      {showCustom && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input
            type="number"
            placeholder="Custom ml"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            style={{
              flex: 1,
              background: T.elevated,
              border: `1px solid ${T.border}`,
              borderRadius: T.rInput,
              padding: "8px 12px",
              color: T.text,
              fontSize: 13,
              fontFamily: "inherit",
              outline: "none",
            }}
          />
          <button
            onClick={() => {
              const val = parseInt(custom, 10);
              if (val > 0) add(val);
              setCustom("");
              setShowCustom(false);
            }}
            style={{
              padding: "8px 16px",
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
            Add
          </button>
        </div>
      )}
    </div>
  );
}
