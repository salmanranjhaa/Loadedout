import { useState, useRef } from "react";
import { T } from "../design/tokens";
import { Icon } from "../design/icons";
import { userAPI } from "../utils/api";
import { showToast } from "../utils/toast";

function Mascot({ glowing }) {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      <rect width="44" height="44" rx="12" fill={glowing ? T.teal : T.elevated2} style={{ transition: "fill 0.4s" }} />
      <circle cx="15" cy="19" r="3.5" fill={glowing ? "#0A0A0F" : T.teal} style={{ transition: "fill 0.4s" }} />
      <circle cx="29" cy="19" r="3.5" fill={glowing ? "#0A0A0F" : T.teal} style={{ transition: "fill 0.4s" }} />
      <path d="M 16 28 Q 22 33 28 28" stroke={glowing ? "#0A0A0F" : T.teal} strokeWidth="2.2" strokeLinecap="round" fill="none" style={{ transition: "stroke 0.4s" }} />
      <line x1="22" y1="8" x2="22" y2="13" stroke={glowing ? "#0A0A0F" : T.teal} strokeWidth="2" strokeLinecap="round" />
      <circle cx="22" cy="7" r="2" fill={glowing ? "#0A0A0F" : T.amber} style={{ transition: "fill 0.4s" }} />
    </svg>
  );
}

// ── Options ──────────────────────────────────────────────────────────────────
const ACTIVITY_OPTS = [
  { value: "sedentary",   label: "Sedentary",   factor: 1.2,   desc: "Desk job, little exercise" },
  { value: "light",       label: "Light",       factor: 1.375, desc: "1–2 sessions / week" },
  { value: "moderate",    label: "Moderate",    factor: 1.55,  desc: "3–4 sessions / week" },
  { value: "very_active", label: "Very active", factor: 1.725, desc: "5–6 sessions / week" },
  { value: "athlete",     label: "Athlete",     factor: 1.9,   desc: "Daily hard training" },
];
const GOAL_OPTS = [
  { value: "lose_fat",     label: "Lose fat" },
  { value: "maintain",     label: "Maintain" },
  { value: "build_muscle", label: "Build muscle" },
  { value: "recomp",       label: "Recomp" },
  { value: "performance",  label: "Performance" },
];
const PACE_OPTS = [
  { value: -0.75, label: "-0.75 kg/wk" },
  { value: -0.5,  label: "-0.5 kg/wk" },
  { value: -0.25, label: "-0.25 kg/wk" },
  { value: 0,     label: "Hold" },
  { value: 0.25,  label: "+0.25 kg/wk" },
  { value: 0.5,   label: "+0.5 kg/wk" },
];
const DIET_OPTS = ["none", "vegetarian", "vegan", "pescatarian", "halal", "keto", "mediterranean"];
const EXPERIENCE_OPTS = ["beginner", "intermediate", "advanced"];
const EQUIPMENT_OPTS = ["full_gym", "dumbbells", "barbell", "kettlebell", "bands", "bodyweight", "cardio_machines"];
const SPORT_OPTS = ["strength", "hypertrophy", "running", "hyrox", "crossfit", "yoga", "cycling"];
const CURRENCY_OPTS = ["CHF", "EUR", "USD", "GBP", "PKR"];

function labelize(v) { return String(v || "").replace(/_/g, " "); }

// Mifflin-St Jeor, mirrors Onboarding's math
function computeTargets({ weight, height, age, gender, activityFactor, paceKgWeek }) {
  const w = parseFloat(weight), h = parseFloat(height), a = parseInt(age);
  if (!w || !h || !a) return null;
  const bmr = gender === "female" ? 10 * w + 6.25 * h - 5 * a - 161 : 10 * w + 6.25 * h - 5 * a + 5;
  const paceKcal = (paceKgWeek * 7700) / 7;
  const calories = Math.max(1200, Math.round((bmr * activityFactor + paceKcal) / 10) * 10);
  const protein = Math.round(w * (paceKgWeek < 0 ? 2.0 : 1.8));
  const fat = Math.round((calories * 0.27) / 9);
  const carbs = Math.max(50, Math.round((calories - protein * 4 - fat * 9) / 4));
  return { calories, protein, carbs, fat };
}

// ── Building blocks ──────────────────────────────────────────────────────────
function SGroup({ title, children, editing, onEdit, onSave, onCancel, saving }) {
  return (
    <div style={{ padding: "0 20px 14px" }}>
      <div style={{ fontSize: 11, color: T.textMuted, letterSpacing: 0.8, textTransform: "uppercase", fontWeight: 600, marginBottom: 8, paddingLeft: 4, display: "flex", alignItems: "center", gap: 8 }}>
        {title}
        <div style={{ flex: 1 }} />
        {editing ? (
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onCancel} style={{ fontSize: 12, color: T.textMuted, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
            <button onClick={onSave} disabled={saving} style={{ fontSize: 12, color: T.teal, fontWeight: 700, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", opacity: saving ? 0.5 : 1 }}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        ) : onEdit ? (
          <button onClick={onEdit} style={{ fontSize: 11, color: T.teal, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Edit</button>
        ) : null}
      </div>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}

function SRow({ label, value, last, children }) {
  return (
    <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, borderBottom: last ? "none" : `0.5px solid ${T.border}` }}>
      <span style={{ fontSize: 13, color: T.text, fontWeight: 500, flex: 1 }}>{label}</span>
      {children || (
        <span style={{ fontSize: 12, color: T.textMuted, fontFamily: /\d/.test(String(value)) ? T.fontMono : T.fontFamily, textTransform: "capitalize" }}>{value ?? "—"}</span>
      )}
    </div>
  );
}

function FieldInput({ label, value, onChange, type = "text", unit, last, placeholder }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ padding: "10px 14px", borderBottom: last ? "none" : `0.5px solid ${T.border}` }}>
      <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 5 }}>
        {label}{unit && <span style={{ color: T.textDim }}> · {unit}</span>}
      </div>
      <input
        type={type} value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{
          width: "100%", background: T.elevated, border: `1px solid ${focused ? T.teal : T.border}`,
          borderRadius: 8, padding: "8px 10px", fontSize: 14, color: T.text,
          outline: "none", fontFamily: type === "number" ? T.fontMono : "inherit", boxSizing: "border-box",
        }}
      />
    </div>
  );
}

function ChipSelect({ label, value, onChange, options, last, multi = false }) {
  const selected = multi ? (Array.isArray(value) ? value : []) : value;
  function toggle(v) {
    if (!multi) { onChange(v); return; }
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  }
  return (
    <div style={{ padding: "10px 14px", borderBottom: last ? "none" : `0.5px solid ${T.border}` }}>
      <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {options.map(opt => {
          const v = typeof opt === "object" ? opt.value : opt;
          const l = typeof opt === "object" ? opt.label : labelize(opt);
          const on = multi ? selected.includes(v) : selected === v;
          return (
            <button key={String(v)} onClick={() => toggle(v)}
              style={{ padding: "5px 12px", borderRadius: 8, background: on ? T.teal : T.elevated, color: on ? "#0A0A0F" : T.text, border: `1px solid ${on ? T.teal : T.border}`, fontSize: 12, fontWeight: on ? 700 : 500, cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize" }}>
              {l}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Free-text tag list (allergies, injuries, disliked foods)
function TagsInput({ label, tags, onChange, placeholder, last }) {
  const [draft, setDraft] = useState("");
  function add() {
    const v = draft.trim();
    if (!v || tags.includes(v)) { setDraft(""); return; }
    onChange([...tags, v]); setDraft("");
  }
  return (
    <div style={{ padding: "10px 14px", borderBottom: last ? "none" : `0.5px solid ${T.border}` }}>
      <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>{label}</div>
      {tags.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {tags.map(t => (
            <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 8px 4px 11px", borderRadius: 8, background: `${T.amber}1C`, border: `1px solid ${T.amber}44`, color: T.amber, fontSize: 12, fontWeight: 600 }}>
              {t}
              <button onClick={() => onChange(tags.filter(x => x !== t))} style={{ background: "none", border: "none", color: T.amber, cursor: "pointer", padding: 0, display: "flex" }}>
                <Icon name="x" size={11} color={T.amber} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={draft} placeholder={placeholder}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === "Enter" && add()}
          style={{ flex: 1, background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 8, padding: "7px 10px", fontSize: 13, color: T.text, outline: "none", fontFamily: "inherit" }}
        />
        <button onClick={add} style={{ padding: "0 14px", background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 8, color: T.teal, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Add</button>
      </div>
    </div>
  );
}

// ── Avatar hero with upload ──────────────────────────────────────────────────
function downscaleToBase64(file, maxDim = 384) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      resolve(dataUrl.split(",")[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read image")); };
    img.src = url;
  });
}

function AvatarHero({ profile, onProfileUpdate, onAvatarTap, glowing }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const initials = (profile?.full_name || profile?.username || "LO")
    .split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const b64 = await downscaleToBase64(file);
      await userAPI.uploadAvatar(b64, "image/jpeg");
      showToast("Profile picture updated", "success");
      onProfileUpdate?.();
    } catch (err) {
      showToast(err.message || "Upload failed", "error");
    }
    setUploading(false);
  }

  async function handleRemove() {
    try {
      await userAPI.deleteAvatar();
      showToast("Profile picture removed", "success");
      onProfileUpdate?.();
    } catch (err) { showToast(err.message || "Failed", "error"); }
  }

  return (
    <div style={{ padding: "28px 20px 20px", background: `linear-gradient(180deg, ${T.surface} 0%, ${T.bg} 100%)`, borderBottom: `0.5px solid ${T.border}`, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
      <div style={{ position: "relative" }} onClick={onAvatarTap}>
        <div style={{
          width: 88, height: 88, borderRadius: 9999, overflow: "hidden",
          background: glowing ? `radial-gradient(circle, ${T.teal}CC, ${T.violet}CC)` : `linear-gradient(135deg, ${T.violet}, ${T.teal})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 30, fontWeight: 800, color: "#0A0A0F", letterSpacing: 1,
          boxShadow: glowing ? `0 0 0 6px ${T.teal}44, 0 0 0 12px ${T.teal}22, 0 16px 48px ${T.teal}66` : `0 8px 32px ${T.violet}44`,
          transition: "all 0.4s", fontFamily: T.fontFamily,
        }}>
          {profile?.avatar_data
            ? <img src={profile.avatar_data} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : initials}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
          disabled={uploading}
          style={{ position: "absolute", bottom: 0, right: 0, width: 28, height: 28, borderRadius: 9999, background: T.teal, border: `2px solid ${T.bg}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}
        >
          <Icon name="camera" size={13} color="#0A0A0F" />
        </button>
      </div>
      {uploading && <div style={{ fontSize: 11, color: T.teal, fontFamily: T.fontMono }}>Uploading…</div>}
      {!uploading && profile?.avatar_data && (
        <button onClick={handleRemove} style={{ background: "none", border: "none", color: T.textDim, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Remove photo</button>
      )}

      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: T.text, letterSpacing: -0.5 }}>{profile?.full_name || profile?.username || "Loadout User"}</div>
        <div style={{ fontSize: 13, color: T.textMuted, marginTop: 3 }}>{profile?.email || ""}</div>
        {profile?.member_since && (
          <div style={{ fontSize: 11, color: T.textDim, marginTop: 4, fontFamily: T.fontMono }}>Member since {profile.member_since}</div>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, width: "100%" }}>
        {[
          { label: "Height", value: profile?.height_cm ? `${profile.height_cm}cm` : "—", icon: "trend-up", color: T.teal },
          { label: "Weight", value: profile?.current_weight_kg ? `${profile.current_weight_kg}kg` : "—", icon: "dumbbell", color: T.amber },
          { label: "Target", value: profile?.target_weight_kg ? `${profile.target_weight_kg}kg` : "—", icon: "bolt", color: T.violet },
        ].map(({ label, value, icon, color }) => (
          <div key={label} style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "10px 0", textAlign: "center" }}>
            <Icon name={icon} size={15} color={color} />
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: T.fontMono, color: T.text, marginTop: 4 }}>{value}</div>
            <div style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {glowing && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: `${T.teal}18`, border: `1px solid ${T.teal}44`, borderRadius: 12, width: "100%" }}>
          <Mascot glowing={glowing} />
          <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.5, flex: 1 }}>
            Hey! I'm <b style={{ color: T.teal }}>Loadie</b> — I live inside your data. Keep crushing it!
          </div>
        </div>
      )}
    </div>
  );
}

// Flatten supplements that may be a legacy {morning:[],...} dict or a list
function flattenSupplements(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    return Object.entries(raw).flatMap(([bucket, items]) =>
      (Array.isArray(items) ? items : []).map(s =>
        typeof s === "string" ? { name: s, dose: "", times: [labelize(bucket)], unit: "" } : { times: [labelize(bucket)], ...s }
      )
    );
  }
  return [];
}

export default function FullProfilePage({ profile, onClose, onLogout, onProfileUpdate }) {
  const p = profile || {};
  const dp = p.dietary_preferences || {};
  const tp = p.training_preferences || {};

  const [saving, setSaving] = useState(false);
  const [avatarTaps, setAvatarTaps] = useState(0);
  const [glowing, setGlowing] = useState(false);
  const tapTimer = useRef(null);

  const [editingName, setEditingName] = useState(false);
  const [fullName, setFullName] = useState(p.full_name || "");

  // Goals
  const [editingGoals, setEditingGoals] = useState(false);
  const [gGoal, setGGoal] = useState(p.fitness_goal || "");
  const [gPace, setGPace] = useState(p.goal_pace_kg_per_week ?? 0);
  const [gActivity, setGActivity] = useState(p.activity_level || "");
  const [gTarget, setGTarget] = useState(String(p.target_weight_kg || ""));

  // Body metrics
  const [editingBody, setEditingBody] = useState(false);
  const [bWeight, setBWeight] = useState(String(p.current_weight_kg || ""));
  const [bHeight, setBHeight] = useState(String(p.height_cm || ""));
  const [bAge, setBAge] = useState(String(p.age || ""));
  const [bSex, setBSex] = useState(p.gender || "");

  // Nutrition targets
  const [editingNutrition, setEditingNutrition] = useState(false);
  const [nCal, setNCal] = useState(String(p.daily_calorie_target || ""));
  const [nProt, setNProt] = useState(String(p.daily_protein_target || ""));
  const [nCarb, setNCarb] = useState(String(p.daily_carb_target || ""));
  const [nFat, setNFat] = useState(String(p.daily_fat_target || ""));

  // Diet
  const [editingDiet, setEditingDiet] = useState(false);
  const [dPattern, setDPattern] = useState(dp.dietary_pattern || "none");
  const [dAllergies, setDAllergies] = useState(dp.allergies || []);
  const [dDisliked, setDDisliked] = useState(dp.disliked_foods || []);

  // Training
  const [editingTraining, setEditingTraining] = useState(false);
  const [tDays, setTDays] = useState(tp.days_per_week || null);
  const [tLength, setTLength] = useState(String(tp.session_length_min || ""));
  const [tExp, setTExp] = useState(tp.experience_level || "");
  const [tEquip, setTEquip] = useState(tp.equipment || []);
  const [tSports, setTSports] = useState(tp.focus_sports || []);
  const [tInjuries, setTInjuries] = useState(tp.injuries || []);

  // Supplements
  const [supps, setSupps] = useState(() => flattenSupplements(p.supplements));
  const [suppName, setSuppName] = useState("");
  const [suppDose, setSuppDose] = useState("");

  function onAvatarTap() {
    setAvatarTaps(t => {
      const next = t + 1;
      if (tapTimer.current) clearTimeout(tapTimer.current);
      tapTimer.current = setTimeout(() => setAvatarTaps(0), 1200);
      if (next >= 5) { setGlowing(true); setTimeout(() => setGlowing(false), 5000); return 0; }
      return next;
    });
  }

  async function save(payload, done) {
    setSaving(true);
    try {
      await userAPI.updateProfile(payload);
      showToast("Saved", "success");
      onProfileUpdate?.();
      done?.();
    } catch (e) {
      showToast(e.message || "Save failed", "error");
    }
    setSaving(false);
  }

  const saveName = () => save({ full_name: fullName }, () => setEditingName(false));
  const saveGoals = () => save({
    fitness_goal: gGoal || null,
    goal_pace_kg_per_week: gPace,
    activity_level: gActivity || null,
    target_weight_kg: parseFloat(gTarget) || null,
  }, () => setEditingGoals(false));
  const saveBody = () => save({
    current_weight_kg: parseFloat(bWeight) || null,
    height_cm: parseFloat(bHeight) || null,
    age: parseInt(bAge) || null,
    gender: bSex || null,
  }, () => setEditingBody(false));
  const saveNutrition = () => save({
    daily_calorie_target: parseInt(nCal) || null,
    daily_protein_target: parseInt(nProt) || null,
    daily_carb_target: parseInt(nCarb) || null,
    daily_fat_target: parseInt(nFat) || null,
  }, () => setEditingNutrition(false));
  const saveDiet = () => save({
    dietary_preferences: { dietary_pattern: dPattern === "none" ? null : dPattern, allergies: dAllergies, disliked_foods: dDisliked },
  }, () => setEditingDiet(false));
  const saveTraining = () => save({
    training_preferences: {
      days_per_week: tDays, session_length_min: parseInt(tLength) || null,
      experience_level: tExp || null, equipment: tEquip, focus_sports: tSports, injuries: tInjuries,
    },
  }, () => setEditingTraining(false));

  function recalcTargets() {
    const act = ACTIVITY_OPTS.find(a => a.value === (gActivity || p.activity_level));
    const t = computeTargets({
      weight: bWeight || p.current_weight_kg, height: bHeight || p.height_cm,
      age: bAge || p.age, gender: bSex || p.gender,
      activityFactor: act?.factor || 1.55,
      paceKgWeek: gPace ?? p.goal_pace_kg_per_week ?? 0,
    });
    if (!t) { showToast("Set weight, height and age first", "error"); return; }
    setNCal(String(t.calories)); setNProt(String(t.protein));
    setNCarb(String(t.carbs)); setNFat(String(t.fat));
    setEditingNutrition(true);
    showToast("Targets recalculated — review and save", "info");
  }

  async function saveSupplements(next) {
    setSupps(next);
    try {
      await userAPI.updateProfile({
        supplements: next.map(s => ({ name: s.name, dose: s.dose || "", times: s.times || [], unit: s.unit || "" })),
      });
      onProfileUpdate?.();
    } catch (e) { showToast(e.message || "Save failed", "error"); }
  }

  function addSupplement() {
    const name = suppName.trim();
    if (!name) return;
    saveSupplements([...supps, { name, dose: suppDose.trim(), times: [], unit: "" }]);
    setSuppName(""); setSuppDose("");
  }

  const inputStyle = { flex: 1, background: T.elevated2, border: `1px solid ${T.teal}`, borderRadius: 8, padding: "6px 10px", fontSize: 13, color: T.text, outline: "none", fontFamily: T.fontFamily };
  const paceLabel = (v) => PACE_OPTS.find(o => o.value === v)?.label || (v ? `${v} kg/wk` : "Hold");

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: T.bg, display: "flex", flexDirection: "column", fontFamily: T.fontFamily }}>
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 8px", borderBottom: `0.5px solid ${T.border}`, flexShrink: 0 }}>
        <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 9999, background: T.elevated, border: `1px solid ${T.border}`, color: T.text, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <Icon name="chev-left" size={16} />
        </button>
        <div style={{ flex: 1, textAlign: "center", fontSize: 15, fontWeight: 600, color: T.text }}>Profile & Settings</div>
        <div style={{ width: 34 }} />
      </div>

      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", paddingBottom: 40 }}>
        <AvatarHero profile={p} onProfileUpdate={onProfileUpdate} onAvatarTap={onAvatarTap} glowing={glowing} />

        {/* Identity */}
        <div style={{ height: 16 }} />
        <SGroup title="Identity">
          <div style={{ padding: "12px 14px", borderBottom: `0.5px solid ${T.border}` }}>
            <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>Display Name</div>
            {editingName ? (
              <div style={{ display: "flex", gap: 8 }}>
                <input value={fullName} onChange={e => setFullName(e.target.value)} style={inputStyle} autoFocus />
                <button onClick={saveName} disabled={saving} style={{ padding: "6px 14px", background: T.teal, border: "none", borderRadius: 8, color: "#0A0A0F", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                  {saving ? "…" : "Save"}
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, color: T.text, flex: 1 }}>{p.full_name || "—"}</span>
                <button onClick={() => setEditingName(true)} style={{ background: "none", border: "none", cursor: "pointer", color: T.teal, fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>Edit</button>
              </div>
            )}
          </div>
          <SRow label="Username" value={p.username || "—"} />
          <SRow label="Email" value={p.email || "—"} last />
        </SGroup>

        {/* Goals */}
        <SGroup title="Goals" editing={editingGoals} onEdit={() => setEditingGoals(true)} onSave={saveGoals} onCancel={() => setEditingGoals(false)} saving={saving}>
          {editingGoals ? (
            <>
              <ChipSelect label="Fitness goal" value={gGoal} onChange={setGGoal} options={GOAL_OPTS} />
              <FieldInput label="Goal weight" unit="kg" type="number" value={gTarget} onChange={setGTarget} />
              <ChipSelect label="Weekly pace" value={gPace} onChange={setGPace} options={PACE_OPTS} />
              <ChipSelect label="Activity level" value={gActivity} onChange={setGActivity} options={ACTIVITY_OPTS.map(({ value, label }) => ({ value, label }))} last />
            </>
          ) : (
            <>
              <SRow label="Fitness goal" value={p.fitness_goal ? labelize(p.fitness_goal) : "—"} />
              <SRow label="Goal weight" value={p.target_weight_kg ? `${p.target_weight_kg} kg` : "—"} />
              <SRow label="Weekly pace" value={p.goal_pace_kg_per_week != null ? paceLabel(p.goal_pace_kg_per_week) : "—"} />
              <SRow label="Activity level" value={p.activity_level ? labelize(p.activity_level) : "—"} last />
            </>
          )}
        </SGroup>

        {/* Body Metrics */}
        <SGroup title="Body Metrics" editing={editingBody} onEdit={() => setEditingBody(true)} onSave={saveBody} onCancel={() => setEditingBody(false)} saving={saving}>
          {editingBody ? (
            <>
              <FieldInput label="Current weight" unit="kg" type="number" value={bWeight} onChange={setBWeight} />
              <FieldInput label="Height" unit="cm" type="number" value={bHeight} onChange={setBHeight} />
              <FieldInput label="Age" type="number" value={bAge} onChange={setBAge} />
              <ChipSelect label="Biological sex" value={bSex} onChange={setBSex} last options={[
                { value: "male", label: "Male" },
                { value: "female", label: "Female" },
                { value: "non_binary", label: "Non-binary" },
                { value: "prefer_not_to_say", label: "Prefer not to say" },
              ]} />
            </>
          ) : (
            <>
              <SRow label="Current weight" value={p.current_weight_kg ? `${p.current_weight_kg} kg` : "—"} />
              <SRow label="Height" value={p.height_cm ? `${p.height_cm} cm` : "—"} />
              <SRow label="Age" value={p.age ? `${p.age} years` : "—"} />
              <SRow label="Biological sex" value={p.gender ? labelize(p.gender) : "—"} last />
            </>
          )}
        </SGroup>

        {/* Nutrition Targets */}
        <SGroup title="Nutrition Targets" editing={editingNutrition} onEdit={() => setEditingNutrition(true)} onSave={saveNutrition} onCancel={() => setEditingNutrition(false)} saving={saving}>
          {editingNutrition ? (
            <>
              <FieldInput label="Daily Calories" unit="kcal" type="number" value={nCal} onChange={setNCal} />
              <FieldInput label="Protein" unit="g" type="number" value={nProt} onChange={setNProt} />
              <FieldInput label="Carbohydrates" unit="g" type="number" value={nCarb} onChange={setNCarb} />
              <FieldInput label="Fat" unit="g" type="number" value={nFat} onChange={setNFat} last />
            </>
          ) : (
            <>
              <SRow label="Daily Calories" value={p.daily_calorie_target ? `${p.daily_calorie_target} kcal` : "—"} />
              <SRow label="Protein" value={p.daily_protein_target ? `${p.daily_protein_target} g` : "—"} />
              <SRow label="Carbohydrates" value={p.daily_carb_target ? `${p.daily_carb_target} g` : "—"} />
              <SRow label="Fat" value={p.daily_fat_target ? `${p.daily_fat_target} g` : "—"} last />
            </>
          )}
        </SGroup>
        <div style={{ padding: "0 20px 14px", marginTop: -6 }}>
          <button onClick={recalcTargets} style={{ width: "100%", padding: "11px 0", background: `${T.violet}18`, border: `1px solid ${T.violet}44`, borderRadius: 12, color: T.violet, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Icon name="sparkle" size={15} color={T.violet} />
            Recalculate from my goals
          </button>
        </div>

        {/* Diet */}
        <SGroup title="Diet" editing={editingDiet} onEdit={() => setEditingDiet(true)} onSave={saveDiet} onCancel={() => setEditingDiet(false)} saving={saving}>
          {editingDiet ? (
            <>
              <ChipSelect label="Dietary pattern" value={dPattern} onChange={setDPattern} options={DIET_OPTS} />
              <TagsInput label="Allergies & intolerances" tags={dAllergies} onChange={setDAllergies} placeholder="e.g. peanuts, lactose…" />
              <TagsInput label="Foods you dislike" tags={dDisliked} onChange={setDDisliked} placeholder="e.g. mushrooms…" last />
            </>
          ) : (
            <>
              <SRow label="Dietary pattern" value={dp.dietary_pattern ? labelize(dp.dietary_pattern) : "No restriction"} />
              <SRow label="Allergies" value={(dp.allergies || []).join(", ") || "None"} />
              <SRow label="Disliked foods" value={(dp.disliked_foods || []).join(", ") || "None"} last />
            </>
          )}
        </SGroup>

        {/* Training */}
        <SGroup title="Training" editing={editingTraining} onEdit={() => setEditingTraining(true)} onSave={saveTraining} onCancel={() => setEditingTraining(false)} saving={saving}>
          {editingTraining ? (
            <>
              <ChipSelect label="Days per week" value={tDays} onChange={setTDays} options={[1, 2, 3, 4, 5, 6, 7].map(n => ({ value: n, label: String(n) }))} />
              <FieldInput label="Session length" unit="min" type="number" value={tLength} onChange={setTLength} />
              <ChipSelect label="Experience" value={tExp} onChange={setTExp} options={EXPERIENCE_OPTS} />
              <ChipSelect label="Equipment available" value={tEquip} onChange={setTEquip} options={EQUIPMENT_OPTS} multi />
              <ChipSelect label="Focus" value={tSports} onChange={setTSports} options={SPORT_OPTS} multi />
              <TagsInput label="Injuries / limitations" tags={tInjuries} onChange={setTInjuries} placeholder="e.g. lower back, left knee…" last />
            </>
          ) : (
            <>
              <SRow label="Days per week" value={tp.days_per_week || "—"} />
              <SRow label="Session length" value={tp.session_length_min ? `${tp.session_length_min} min` : "—"} />
              <SRow label="Experience" value={tp.experience_level ? labelize(tp.experience_level) : "—"} />
              <SRow label="Equipment" value={(tp.equipment || []).map(labelize).join(", ") || "—"} />
              <SRow label="Focus" value={(tp.focus_sports || []).map(labelize).join(", ") || "—"} />
              <SRow label="Injuries" value={(tp.injuries || []).join(", ") || "None"} last />
            </>
          )}
        </SGroup>

        {/* Supplements */}
        <SGroup title="Supplements">
          {supps.length === 0 && (
            <div style={{ padding: "16px 14px", fontSize: 12, color: T.textDim, borderBottom: `0.5px solid ${T.border}` }}>
              No supplements added yet.
            </div>
          )}
          {supps.map((s, i) => (
            <div key={`${s.name}-${i}`} style={{ padding: "11px 14px", display: "flex", alignItems: "center", gap: 10, borderBottom: `0.5px solid ${T.border}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>{s.name}</div>
                {(s.dose || s.times?.length > 0) && (
                  <div style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, marginTop: 2 }}>
                    {[s.dose, s.times?.join(", ")].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
              <button onClick={() => saveSupplements(supps.filter((_, idx) => idx !== i))} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                <Icon name="trash" size={14} color={T.negative} />
              </button>
            </div>
          ))}
          <div style={{ padding: "10px 14px", display: "flex", gap: 6 }}>
            <input value={suppName} onChange={e => setSuppName(e.target.value)} placeholder="Name (e.g. Creatine)"
              style={{ flex: 2, background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 8, padding: "7px 10px", fontSize: 13, color: T.text, outline: "none", fontFamily: "inherit" }} />
            <input value={suppDose} onChange={e => setSuppDose(e.target.value)} placeholder="Dose" onKeyDown={e => e.key === "Enter" && addSupplement()}
              style={{ flex: 1, background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 8, padding: "7px 10px", fontSize: 13, color: T.text, outline: "none", fontFamily: "inherit" }} />
            <button onClick={addSupplement} style={{ padding: "0 14px", background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 8, color: T.teal, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Add</button>
          </div>
        </SGroup>

        {/* Preferences */}
        <SGroup title="Preferences">
          <ChipSelect label="Currency" value={p.preferred_currency || "CHF"} onChange={(c) => save({ preferred_currency: c })} options={CURRENCY_OPTS} last />
        </SGroup>

        {/* Account */}
        <SGroup title="Account">
          <SRow label="Google" value={p.google_connected ? "Connected" : "Not connected"} last />
        </SGroup>

        {/* Sign out */}
        <div style={{ padding: "4px 20px 32px" }}>
          <button onClick={onLogout} style={{ width: "100%", padding: "14px 0", background: `${T.negative}18`, border: `1px solid ${T.negative}44`, borderRadius: 14, color: T.negative, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Sign out
          </button>
        </div>

        <div style={{ textAlign: "center", fontSize: 11, color: T.textDim, paddingBottom: 20, fontFamily: T.fontMono }}>
          Loadedout · Made with <span style={{ color: T.teal }}>♥</span>
        </div>
      </div>
    </div>
  );
}
