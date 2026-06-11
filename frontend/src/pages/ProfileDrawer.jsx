import { useMemo } from "react";
import { T } from "../design/tokens";
import { Icon } from "../design/icons";
import {
  PageScroll, SettingsRow, SettingsGroup,
} from "../design/components";
import { userAPI } from "../utils/api";

// ── Gamification helpers ───────────────────────────────────────────────────────
function getWorkoutStats() {
  try {
    const history = JSON.parse(localStorage.getItem("lo_workout_history") || "[]");
    const prs     = JSON.parse(localStorage.getItem("lo_prs") || "{}");
    const prCount = Object.keys(prs).length;
    const totalWorkouts = history.length;
    const totalVolume   = history.reduce((sum, w) =>
      sum + (w.exercises || []).reduce((es, e) =>
        es + (e.sets || []).reduce((ss, s) => ss + (s.weight_kg || 0) * (s.reps || 0), 0), 0), 0);

    // Streak from dates
    const sortedDates = [...new Set(history.map((w) => (w.date || w.loggedAt || "").slice(0, 10)))]
      .filter(Boolean).sort().reverse();
    let streak = 0;
    const today = new Date().toISOString().slice(0, 10);
    let check   = today;
    for (const d of sortedDates) {
      if (d === check) { streak++; const dt = new Date(check); dt.setDate(dt.getDate() - 1); check = dt.toISOString().slice(0, 10); }
      else if (d < check) break;
    }

    return { totalWorkouts, totalVolume: Math.round(totalVolume), prCount, streak };
  } catch { return { totalWorkouts: 0, totalVolume: 0, prCount: 0, streak: 0 }; }
}

const XP_PER_WORKOUT   = 150;
const XP_PER_PR        = 75;
const XP_PER_1000KG    = 20;
const LEVEL_BASE_XP    = 500;
const LEVEL_MULTIPLIER = 1.3;

function calcLevel(xp) {
  let level = 1;
  let required = LEVEL_BASE_XP;
  let accumulated = 0;
  while (accumulated + required <= xp) {
    accumulated += required;
    level++;
    required = Math.round(LEVEL_BASE_XP * Math.pow(LEVEL_MULTIPLIER, level - 1));
  }
  const progress = xp - accumulated;
  return { level, progress, required, pct: progress / required };
}

const ACHIEVEMENTS = [
  { id: "first_workout",  label: "First Rep",       icon: "🏋️", desc: "Completed your first workout",      xp: 200,  check: (s) => s.totalWorkouts >= 1 },
  { id: "workouts_10",    label: "Getting Serious",  icon: "🔥", desc: "10 workouts done",                  xp: 500,  check: (s) => s.totalWorkouts >= 10 },
  { id: "workouts_50",    label: "Veteran",          icon: "⚔️", desc: "50 workouts logged",                xp: 2000, check: (s) => s.totalWorkouts >= 50 },
  { id: "first_pr",       label: "PR Setter",        icon: "🏆", desc: "Set your first personal record",    xp: 300,  check: (s) => s.prCount >= 1 },
  { id: "pr_5",           label: "Record Breaker",   icon: "💥", desc: "5 personal records",                xp: 750,  check: (s) => s.prCount >= 5 },
  { id: "pr_20",          label: "PR Machine",       icon: "🚀", desc: "20 personal records",               xp: 2500, check: (s) => s.prCount >= 20 },
  { id: "streak_7",       label: "Week Warrior",     icon: "📅", desc: "7-day workout streak",              xp: 1000, check: (s) => s.streak >= 7 },
  { id: "streak_30",      label: "Unstoppable",      icon: "⚡", desc: "30-day streak",                    xp: 5000, check: (s) => s.streak >= 30 },
  { id: "volume_10k",     label: "Heavy Lifter",     icon: "🏗️", desc: "Lifted 10,000 kg total volume",    xp: 800,  check: (s) => s.totalVolume >= 10000 },
  { id: "volume_100k",    label: "Iron Legend",      icon: "👑", desc: "100,000 kg total volume",           xp: 5000, check: (s) => s.totalVolume >= 100000 },
];

function GamificationSection({ profile }) {
  const stats = useMemo(() => getWorkoutStats(), []);

  const earnedXP =
    stats.totalWorkouts * XP_PER_WORKOUT +
    stats.prCount * XP_PER_PR +
    Math.floor(stats.totalVolume / 1000) * XP_PER_1000KG +
    ACHIEVEMENTS.filter((a) => a.check(stats)).reduce((sum, a) => sum + a.xp, 0);

  const { level, progress, required, pct } = calcLevel(earnedXP);
  const earned  = ACHIEVEMENTS.filter((a) => a.check(stats));
  const locked  = ACHIEVEMENTS.filter((a) => !a.check(stats));
  const LEVEL_TITLES = ["Novice","Beginner","Dedicated","Consistent","Serious","Advanced","Expert","Elite","Master","Legend"];
  const title = LEVEL_TITLES[Math.min(Math.floor(level / 10), LEVEL_TITLES.length - 1)];

  return (
    <div style={{ padding: "0 20px 18px" }}>
      {/* Level card */}
      <div style={{ background: `linear-gradient(135deg, ${T.violet}22, ${T.teal}18)`, border: `1px solid ${T.violet}44`, borderRadius: 18, padding: "16px 18px", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: `linear-gradient(135deg, ${T.violet}, ${T.teal})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800, color: "#0A0A0F", flexShrink: 0 }}>
            {level}
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>Level {level} — {title}</div>
            <div style={{ fontSize: 11, color: T.textMuted, fontFamily: T.fontMono, marginTop: 2 }}>{earnedXP.toLocaleString()} XP total</div>
          </div>
        </div>

        {/* XP bar */}
        <div style={{ height: 6, background: T.elevated2, borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(pct * 100, 100)}%`, background: `linear-gradient(90deg, ${T.violet}, ${T.teal})`, borderRadius: 3, transition: "width 0.6s ease" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
          <span style={{ fontSize: 9, color: T.textDim, fontFamily: T.fontMono }}>{progress} / {required} XP to next level</span>
          <span style={{ fontSize: 9, color: T.teal, fontFamily: T.fontMono, fontWeight: 600 }}>+{XP_PER_WORKOUT} XP / workout</span>
        </div>
      </div>

      {/* Quick stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
        {[
          { icon: "dumbbell", label: "Workouts",    value: stats.totalWorkouts },
          { icon: "trophy",   label: "PRs",         value: stats.prCount },
          { icon: "fire",     label: "Day Streak",  value: stats.streak },
        ].map(({ icon, label, value }) => (
          <div key={label} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "10px 8px", textAlign: "center" }}>
            <Icon name={icon} size={14} color={T.teal} />
            <div style={{ fontSize: 18, fontWeight: 700, color: T.text, fontFamily: T.fontMono, marginTop: 4 }}>{value}</div>
            <div style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Achievements */}
      <div style={{ fontSize: 11, color: T.textMuted, letterSpacing: 0.8, textTransform: "uppercase", fontWeight: 600, marginBottom: 10, paddingLeft: 2 }}>
        Achievements ({earned.length}/{ACHIEVEMENTS.length})
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {earned.map((a) => (
          <div key={a.id} style={{ background: `${T.teal}10`, border: `1px solid ${T.teal}33`, borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>{a.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{a.label}</div>
              <div style={{ fontSize: 10, color: T.textMuted }}>{a.desc}</div>
            </div>
            <span style={{ fontSize: 10, color: T.teal, fontWeight: 700, fontFamily: T.fontMono, flexShrink: 0 }}>+{a.xp} XP</span>
          </div>
        ))}
        {locked.slice(0, 3).map((a) => (
          <div key={a.id} style={{ background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, opacity: 0.5 }}>
            <span style={{ fontSize: 20, flexShrink: 0, filter: "grayscale(1)" }}>{a.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.textMuted }}>{a.label}</div>
              <div style={{ fontSize: 10, color: T.textDim }}>{a.desc}</div>
            </div>
            <span style={{ fontSize: 10, color: T.textDim, fontWeight: 600, fontFamily: T.fontMono, flexShrink: 0 }}>+{a.xp} XP</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Avatar hero ────────────────────────────────────────────────────────────────
function AvatarHero({ profile, streak }) {
  const name = profile?.full_name || profile?.username || "Athlete";
  const email = profile?.email || "";
  const daysIn = profile?.member_since
    ? Math.max(1, Math.floor((Date.now() - new Date(profile.member_since)) / 86400000))
    : null;

  const initials = name
    .split(" ")
    .map(n => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div style={{ padding: "28px 20px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      {/* Avatar circle */}
      <div style={{
        width: 80, height: 80, borderRadius: 9999, overflow: "hidden",
        background: `conic-gradient(from 135deg, ${T.violet}, ${T.teal}, ${T.violet})`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 26, fontWeight: 800, color: "#0A0A0F",
        letterSpacing: -0.5,
        boxShadow: `0 0 0 3px ${T.surface}, 0 0 0 5px ${T.border}, 0 8px 24px ${T.violet}44`,
      }}>
        {profile?.avatar_data
          ? <img src={profile.avatar_data} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : initials}
      </div>

      {/* Name */}
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: T.text, letterSpacing: -0.4 }}>{name}</div>
        <div style={{ fontSize: 13, color: T.textMuted, marginTop: 2 }}>{email}</div>
        {daysIn != null && (
          <div style={{ fontSize: 11, color: T.textDim, marginTop: 4, fontFamily: T.fontMono }}>
            {daysIn} days in
          </div>
        )}
      </div>

      {/* Streak chip — only when there is a real streak */}
      {streak > 1 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "5px 12px",
          background: `${T.amber}18`,
          border: `1px solid ${T.amber}44`,
          borderRadius: 9999,
        }}>
          <Icon name="fire" size={14} color={T.amber} />
          <span style={{ fontSize: 12, fontWeight: 700, color: T.amber }}>
            {streak} day streak
          </span>
        </div>
      )}
    </div>
  );
}

// ── Supplement item in settings ────────────────────────────────────────────────
function SupplementItem({ sup, last }) {
  return (
    <div style={{
      padding: "10px 14px",
      display: "flex",
      alignItems: "center",
      gap: 10,
      borderBottom: last ? "none" : `0.5px solid ${T.border}`,
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 8,
        background: `${T.violet}20`,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <Icon name="pill" size={14} color={T.violet} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{sup.name}</div>
        {sup.dose && (
          <div style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, marginTop: 1 }}>{sup.dose}</div>
        )}
      </div>
      {/* Time chips */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {(sup.times || sup.time ? [sup.time || "Morning"] : []).map((t, i) => (
          <span key={i} style={{
            fontSize: 9, fontWeight: 600, color: T.textMuted,
            padding: "2px 6px", background: T.elevated2, borderRadius: 5,
            border: `1px solid ${T.border}`,
            whiteSpace: "nowrap",
          }}>
            {t}
          </span>
        ))}
      </div>
      <Icon name="chev-right" size={13} color={T.textDim} />
    </div>
  );
}

// ── Main drawer ────────────────────────────────────────────────────────────────
// Flatten supplements that may be a legacy {morning:[],...} dict or a list
function flattenSupplements(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    return Object.entries(raw).flatMap(([bucket, items]) =>
      (Array.isArray(items) ? items : []).map(s =>
        typeof s === "string" ? { name: s, times: [bucket.replace(/_/g, " ")] } : { times: [bucket.replace(/_/g, " ")], ...s }
      )
    );
  }
  return [];
}

export default function ProfileDrawer({ profile, onClose, onLogout, onProfileUpdate, onFullProfile }) {
  const p = profile || {};
  const supplements = flattenSupplements(p.supplements);
  const stats = useMemo(() => getWorkoutStats(), []);

  const fmt = (v, unit = "") => v != null ? `${v}${unit}` : "—";

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: T.bg,
      display: "flex", flexDirection: "column",
      animation: "slideInRight 0.28s cubic-bezier(0.32, 0.72, 0, 1)",
    }}>
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0.6; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>

      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "14px 16px 10px",
        borderBottom: `1px solid ${T.border}`,
        flexShrink: 0,
      }}>
        <button
          onClick={onClose}
          style={{
            width: 34, height: 34, borderRadius: 9999,
            background: T.elevated, border: `1px solid ${T.border}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: T.text, flexShrink: 0,
          }}
        >
          <Icon name="chev-left" size={16} />
        </button>
        <div style={{ flex: 1, textAlign: "center", fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: -0.2 }}>
          Profile
        </div>
        <div style={{ width: 34 }} />
      </div>

      <PageScroll padBottom={60}>
        {/* Hero */}
        <AvatarHero profile={p} streak={stats.streak} />

        {/* Gamification */}
        <GamificationSection profile={p} />

        {/* Full settings button */}
        {onFullProfile && (
          <div style={{ padding: "0 20px 16px" }}>
            <button
              onClick={onFullProfile}
              style={{
                width: "100%", padding: "12px 16px",
                background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 14,
                display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
              }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: 9,
                background: `linear-gradient(135deg, ${T.violet}, ${T.teal})`,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <Icon name="settings" size={15} color="#0A0A0F" />
              </div>
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Full settings</div>
                <div style={{ fontSize: 11, color: T.textMuted }}>Goals, macros, AI coach, connected apps</div>
              </div>
              <Icon name="chev-right" size={14} color={T.textMuted} />
            </button>
          </div>
        )}

        {/* Body metrics */}
        <SettingsGroup title="Body metrics">
          <SettingsRow label="Height" value={fmt(p.height_cm, " cm")} />
          <SettingsRow label="Current weight" value={fmt(p.current_weight_kg, " kg")} />
          <SettingsRow label="Goal weight" value={fmt(p.target_weight_kg, " kg")} />
          <SettingsRow label="Biological sex" value={(p.gender || "—").replace(/_/g, " ")} />
          <SettingsRow label="Activity level" value={(p.activity_level || "—").replace(/_/g, " ")} last />
        </SettingsGroup>

        {/* Macro targets */}
        <SettingsGroup title="Macro targets">
          <SettingsRow label="Calories" value={fmt(p.calorie_target || p.daily_calorie_target, " kcal")} />
          <SettingsRow label="Protein" value={fmt(p.protein_target || p.daily_protein_target, " g")} />
          <SettingsRow label="Carbs" value={fmt(p.carb_target || p.daily_carb_target, " g")} />
          <SettingsRow label="Fat" value={fmt(p.fat_target || p.daily_fat_target, " g")} last />
        </SettingsGroup>

        {/* Supplements */}
        {supplements.length > 0 && (
          <div style={{ padding: "0 20px 14px" }}>
            <div style={{ fontSize: 11, color: T.textMuted, letterSpacing: 0.8, textTransform: "uppercase", fontWeight: 600, marginBottom: 8, paddingLeft: 4 }}>
              Supplements
            </div>
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, overflow: "hidden" }}>
              {supplements.map((sup, i) => (
                <SupplementItem key={i} sup={sup} last={i === supplements.length - 1} />
              ))}
            </div>
          </div>
        )}

        {/* Connected services */}
        <SettingsGroup title="Connected services">
          <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8, background: T.elevated2,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Icon name="google" size={14} color={T.textMuted} />
            </div>
            <span style={{ fontSize: 13, color: T.text, fontWeight: 500, flex: 1 }}>Google</span>
            <span style={{ fontSize: 11, color: p.google_connected ? T.teal : T.textDim, fontWeight: 600 }}>
              {p.google_connected ? "Connected" : "Not connected"}
            </span>
          </div>
        </SettingsGroup>

        {/* Preferences */}
        <SettingsGroup title="Preferences">
          <SettingsRow label="Currency" value={p.preferred_currency || "CHF"} />
          <SettingsRow label="Units" value="Metric" last />
        </SettingsGroup>

        {/* Full settings CTA */}
        <div style={{ padding: "4px 20px 8px" }}>
          <button
            onClick={onFullProfile}
            style={{
              width: "100%", padding: "13px",
              background: `${T.teal}18`,
              border: `1px solid ${T.teal}44`,
              borderRadius: 14,
              color: T.teal,
              fontSize: 14, fontWeight: 700,
              cursor: "pointer",
              fontFamily: T.fontFamily,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            <Icon name="analytics" size={16} color={T.teal} />
            Full profile &amp; settings
          </button>
        </div>

        {/* Sign out */}
        <div style={{ padding: "8px 20px 32px" }}>
          <button
            onClick={onLogout}
            style={{
              width: "100%", padding: "13px",
              background: "transparent",
              border: `1px solid ${T.negative}66`,
              borderRadius: 14,
              color: T.negative,
              fontSize: 14, fontWeight: 600,
              cursor: "pointer",
              fontFamily: T.fontFamily,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            <Icon name="logout" size={16} color={T.negative} />
            Sign out
          </button>
        </div>
      </PageScroll>
    </div>
  );
}
