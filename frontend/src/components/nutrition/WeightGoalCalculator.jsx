import { useState } from "react";
import { T } from "../../design/tokens";
import { Icon } from "../../design/icons";

function calculateTDEE(weight_kg, height_cm, age, sex, activityLevel) {
  // Mifflin-St Jeor
  let bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age;
  bmr += sex === "female" ? -161 : 5;
  const multipliers = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
  return Math.round(bmr * (multipliers[activityLevel] || 1.55));
}

export default function WeightGoalCalculator({ profile, onUpdate }) {
  const [targetWeight, setTargetWeight] = useState(profile?.target_weight_kg || "");
  const [weeks, setWeeks] = useState("12");
  const [activity, setActivity] = useState("moderate");
  const [showResult, setShowResult] = useState(false);

  const currentWeight = profile?.weight_kg || 80;
  const height = profile?.height_cm || 175;
  const age = profile?.age || 30;
  const sex = profile?.sex || "male";

  const tdee = calculateTDEE(currentWeight, height, age, sex, activity);
  const weightDiff = parseFloat(targetWeight) - currentWeight;
  const weeklyChange = weightDiff / (parseFloat(weeks) || 1);
  const dailyCalorieAdjustment = Math.round(weeklyChange * 7700 / 7); // ~7700 kcal per kg
  const targetCalories = tdee + dailyCalorieAdjustment;
  const proteinTarget = Math.round(parseFloat(targetWeight) * 2.2); // 2.2g per kg target weight

  const handleApply = () => {
    onUpdate?.({
      daily_calorie_target: Math.round(targetCalories),
      daily_protein_target: proteinTarget,
      target_weight_kg: parseFloat(targetWeight),
    });
    setShowResult(false);
  };

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rCard, padding: 16, margin: "0 20px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: T.violet + "22", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="trend-up" size={18} color={T.violet} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Weight Goal</div>
          <div style={{ fontSize: 11, color: T.textMuted }}>Auto-adjust your targets</div>
        </div>
      </div>

      {!showResult ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 4, fontWeight: 600 }}>Target Weight (kg)</div>
            <input
              type="number"
              value={targetWeight}
              onChange={(e) => setTargetWeight(e.target.value)}
              placeholder={String(currentWeight)}
              style={{
                width: "100%",
                background: T.elevated,
                border: `1px solid ${T.border}`,
                borderRadius: T.rInput,
                padding: "8px 12px",
                color: T.text,
                fontSize: 13,
                fontFamily: T.fontMono,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 4, fontWeight: 600 }}>Timeline (weeks)</div>
            <input
              type="number"
              value={weeks}
              onChange={(e) => setWeeks(e.target.value)}
              min={1}
              max={52}
              style={{
                width: "100%",
                background: T.elevated,
                border: `1px solid ${T.border}`,
                borderRadius: T.rInput,
                padding: "8px 12px",
                color: T.text,
                fontSize: 13,
                fontFamily: T.fontMono,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 4, fontWeight: 600 }}>Activity Level</div>
            <select
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
              style={{
                width: "100%",
                background: T.elevated,
                border: `1px solid ${T.border}`,
                borderRadius: T.rInput,
                padding: "8px 12px",
                color: T.text,
                fontSize: 13,
                fontFamily: "inherit",
                outline: "none",
              }}
            >
              <option value="sedentary">Sedentary</option>
              <option value="light">Light (1-2x/week)</option>
              <option value="moderate">Moderate (3-4x/week)</option>
              <option value="active">Active (5-6x/week)</option>
              <option value="very_active">Very Active (2x/day)</option>
            </select>
          </div>
          <button
            onClick={() => setShowResult(true)}
            disabled={!targetWeight || !weeks}
            style={{
              padding: "10px 0",
              background: !targetWeight || !weeks ? T.elevated : T.violet,
              color: !targetWeight || !weeks ? T.textMuted : "#0A0A0F",
              border: "none",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              cursor: !targetWeight || !weeks ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            Calculate
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ background: T.elevated, borderRadius: 10, padding: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}>Daily Calories</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: T.amber, fontFamily: T.fontMono }}>{Math.round(targetCalories)}</div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}>Protein Target</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: T.teal, fontFamily: T.fontMono }}>{proteinTarget}g</div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}>Weekly Change</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.text, fontFamily: T.fontMono }}>{weeklyChange > 0 ? "+" : ""}{weeklyChange.toFixed(2)} kg</div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}>TDEE</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.text, fontFamily: T.fontMono }}>{tdee} kcal</div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: T.textMuted, lineHeight: 1.5 }}>
            {weeklyChange < -0.5
              ? "Aggressive deficit. Consider a slower rate for muscle retention."
              : weeklyChange < -0.25
              ? "Moderate deficit. Good for fat loss with training."
              : weeklyChange < 0
              ? "Gentle deficit. Sustainable long-term."
              : weeklyChange < 0.25
              ? "Maintenance/slight surplus. Good for recomp."
              : "Surplus. Ensure you're training hard to maximize muscle gain."}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setShowResult(false)}
              style={{
                flex: 1,
                padding: "8px 0",
                background: T.elevated,
                border: `1px solid ${T.border}`,
                borderRadius: 8,
                color: T.textMuted,
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Back
            </button>
            <button
              onClick={handleApply}
              style={{
                flex: 1,
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
              Apply Targets
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
