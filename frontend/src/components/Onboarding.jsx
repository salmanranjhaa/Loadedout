import { useState } from "react";
import { T } from "../design/tokens";
import { Icon } from "../design/icons";
import { userAPI } from "../utils/api";
import { showToast } from "../utils/toast";

// First-login wizard: collects body stats + goal, computes daily targets
// (Mifflin-St Jeor BMR × activity factor ± goal pace) and saves the profile.

const ACTIVITY_LEVELS = [
  { id: 1.2,   label: "Mostly sitting",   desc: "Desk job, little exercise" },
  { id: 1.375, label: "Lightly active",   desc: "1–3 workouts a week" },
  { id: 1.55,  label: "Active",           desc: "3–5 workouts a week" },
  { id: 1.725, label: "Very active",      desc: "6–7 hard sessions a week" },
];

const GOAL_PACE = [
  { id: -500, label: "Lose ~0.5 kg/week", emoji: "📉" },
  { id: -250, label: "Lose ~0.25 kg/week", emoji: "🪶" },
  { id: 0,    label: "Maintain weight",   emoji: "⚖️" },
  { id: 300,  label: "Lean bulk",         emoji: "📈" },
];

function computeTargets({ weight, height, age, gender, activity, pace }) {
  const w = parseFloat(weight), h = parseFloat(height), a = parseInt(age);
  if (!w || !h || !a) return null;
  const bmr = gender === "female"
    ? 10 * w + 6.25 * h - 5 * a - 161
    : 10 * w + 6.25 * h - 5 * a + 5;
  const tdee = bmr * activity;
  const calories = Math.round((tdee + pace) / 10) * 10;
  const protein = Math.round(w * (pace < 0 ? 2.0 : 1.8)); // higher protein in a cut
  const fat = Math.round((calories * 0.27) / 9);
  const carbs = Math.round((calories - protein * 4 - fat * 9) / 4);
  return { calories, protein, carbs: Math.max(carbs, 50), fat };
}

const inp = {
  width: "100%", background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 12,
  padding: "12px 14px", color: T.text, fontSize: 15, fontFamily: "inherit", outline: "none",
  boxSizing: "border-box", textAlign: "center",
};

export default function Onboarding({ profile, onComplete, onSkip }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    weight: profile?.current_weight_kg || "",
    height: profile?.height_cm || "",
    age: profile?.age || "",
    gender: profile?.gender || "male",
    targetWeight: profile?.target_weight_kg || "",
    activity: 1.55,
    pace: -250,
  });

  const targets = computeTargets(form);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  async function handleFinish() {
    if (!targets) return;
    setSaving(true);
    try {
      const activityLevel =
        form.activity <= 1.2 ? "sedentary" :
        form.activity <= 1.375 ? "light" :
        form.activity <= 1.55 ? "moderate" :
        form.activity <= 1.725 ? "very_active" : "athlete";
      await userAPI.updateProfile({
        current_weight_kg: parseFloat(form.weight),
        height_cm: parseFloat(form.height),
        age: parseInt(form.age),
        gender: form.gender,
        target_weight_kg: form.targetWeight ? parseFloat(form.targetWeight) : null,
        activity_level: activityLevel,
        fitness_goal: form.pace < 0 ? "lose_fat" : form.pace > 0 ? "build_muscle" : "maintain",
        // pace is stored as kcal/day in the form; convert to kg/week (7700 kcal ≈ 1 kg)
        goal_pace_kg_per_week: Math.round((form.pace * 7 / 7700) * 100) / 100,
        daily_calorie_target: targets.calories,
        daily_protein_target: targets.protein,
        daily_carb_target: targets.carbs,
        daily_fat_target: targets.fat,
      });
      localStorage.setItem("lo_onboarded", "1");
      showToast("You're all set — targets saved", "success");
      onComplete?.();
    } catch (err) {
      showToast(err.message || "Couldn't save your profile", "error");
    }
    setSaving(false);
  }

  function skip() {
    localStorage.setItem("lo_onboarded", "1");
    onSkip?.();
  }

  const stepValid =
    step === 0 ? true :
    step === 1 ? (parseFloat(form.weight) > 25 && parseFloat(form.height) > 100 && parseInt(form.age) > 10) :
    true;

  const label = { fontSize: 11, color: T.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: T.z.modal + 10, background: T.bg, display: "flex", flexDirection: "column", maxWidth: 430, margin: "0 auto" }}>
      {/* Progress */}
      <div style={{ display: "flex", gap: 6, padding: "max(env(safe-area-inset-top, 16px), 16px) 24px 0" }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ flex: 1, height: 4, borderRadius: 4, background: i <= step ? T.teal : T.elevated2, transition: "background 0.3s" }} />
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "28px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
        {step === 0 && (
          <>
            <div style={{ fontSize: 40, marginTop: 24 }}>👋</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: T.text, letterSpacing: -0.5, lineHeight: 1.2 }}>
              Welcome to LoadedOut
            </div>
            <div style={{ fontSize: 14, color: T.textMuted, lineHeight: 1.6 }}>
              Your one place for meals, workouts, schedule, and an AI coach that actually knows you.
              Two quick steps and your daily targets are dialed in.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
              {[["meal", "Track meals by search, photo, or barcode"], ["dumbbell", "Log gym sessions with PR tracking"], ["sparkle", "AI coach with your full context"]].map(([icon, txt]) => (
                <div key={txt} style={{ display: "flex", alignItems: "center", gap: 12, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 14px" }}>
                  <Icon name={icon} size={18} color={T.teal} />
                  <span style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>{txt}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div style={{ fontSize: 22, fontWeight: 800, color: T.text, letterSpacing: -0.4 }}>About you</div>
            <div style={{ fontSize: 13, color: T.textMuted }}>Used to calculate your calorie and macro targets.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={label}>Weight (kg)</div>
                <input type="number" inputMode="decimal" value={form.weight} onChange={(e) => set("weight", e.target.value)} placeholder="75" style={inp} />
              </div>
              <div>
                <div style={label}>Height (cm)</div>
                <input type="number" inputMode="decimal" value={form.height} onChange={(e) => set("height", e.target.value)} placeholder="178" style={inp} />
              </div>
              <div>
                <div style={label}>Age</div>
                <input type="number" inputMode="numeric" value={form.age} onChange={(e) => set("age", e.target.value)} placeholder="25" style={inp} />
              </div>
              <div>
                <div style={label}>Gender</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {["male", "female"].map((g) => (
                    <button key={g} onClick={() => set("gender", g)}
                      style={{ flex: 1, padding: "12px 0", borderRadius: 12, background: form.gender === g ? T.teal : T.elevated, color: form.gender === g ? "#0A0A0F" : T.text, border: `1px solid ${form.gender === g ? T.teal : T.border}`, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize" }}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div style={{ fontSize: 22, fontWeight: 800, color: T.text, letterSpacing: -0.4 }}>Your goal</div>
            <div>
              <div style={label}>Target weight (kg, optional)</div>
              <input type="number" inputMode="decimal" value={form.targetWeight} onChange={(e) => set("targetWeight", e.target.value)} placeholder="70" style={inp} />
            </div>
            <div>
              <div style={label}>Activity level</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {ACTIVITY_LEVELS.map((a) => (
                  <button key={a.id} onClick={() => set("activity", a.id)}
                    style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, padding: "10px 14px", borderRadius: 12, background: form.activity === a.id ? `${T.teal}18` : T.surface, border: `1px solid ${form.activity === a.id ? T.teal : T.border}`, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: form.activity === a.id ? T.teal : T.text }}>{a.label}</span>
                    <span style={{ fontSize: 11, color: T.textMuted }}>{a.desc}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={label}>Pace</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {GOAL_PACE.map((g) => (
                  <button key={g.id} onClick={() => set("pace", g.id)}
                    style={{ padding: "10px 8px", borderRadius: 12, background: form.pace === g.id ? `${T.teal}18` : T.surface, border: `1px solid ${form.pace === g.id ? T.teal : T.border}`, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: form.pace === g.id ? T.teal : T.text }}>
                    {g.emoji} {g.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 3 && targets && (
          <>
            <div style={{ fontSize: 22, fontWeight: 800, color: T.text, letterSpacing: -0.4 }}>Your daily targets</div>
            <div style={{ fontSize: 13, color: T.textMuted }}>Computed from your stats — you can tweak them anytime in Profile.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
              {[["Calories", `${targets.calories}`, "kcal", T.amber], ["Protein", `${targets.protein}`, "g", T.teal], ["Carbs", `${targets.carbs}`, "g", T.amber], ["Fat", `${targets.fat}`, "g", T.textMuted]].map(([l, v, u, c]) => (
                <div key={l} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: "18px 14px", textAlign: "center" }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: c, fontFamily: T.fontMono }}>{v}<span style={{ fontSize: 12, color: T.textDim }}> {u}</span></div>
                  <div style={{ fontSize: 10, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 6 }}>{l}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Footer buttons */}
      <div style={{ padding: "12px 24px calc(20px + env(safe-area-inset-bottom, 0px))", display: "flex", gap: 10 }}>
        {step === 0 ? (
          <button onClick={skip} style={{ flex: 1, padding: "14px 0", background: "transparent", border: `1px solid ${T.border}`, borderRadius: 14, color: T.textMuted, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Skip for now
          </button>
        ) : (
          <button onClick={() => setStep((s) => s - 1)} style={{ flex: 1, padding: "14px 0", background: "transparent", border: `1px solid ${T.border}`, borderRadius: 14, color: T.textMuted, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Back
          </button>
        )}
        {step < 3 ? (
          <button onClick={() => stepValid && setStep((s) => s + 1)} disabled={!stepValid}
            style={{ flex: 2, padding: "14px 0", background: stepValid ? T.teal : T.elevated, color: stepValid ? "#0A0A0F" : T.textDim, border: "none", borderRadius: 14, fontSize: 14, fontWeight: 700, cursor: stepValid ? "pointer" : "default", fontFamily: "inherit" }}>
            Continue
          </button>
        ) : (
          <button onClick={handleFinish} disabled={saving || !targets}
            style={{ flex: 2, padding: "14px 0", background: saving ? T.elevated : T.teal, color: saving ? T.textMuted : "#0A0A0F", border: "none", borderRadius: 14, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            {saving ? "Saving…" : "Start Tracking"}
          </button>
        )}
      </div>
    </div>
  );
}
