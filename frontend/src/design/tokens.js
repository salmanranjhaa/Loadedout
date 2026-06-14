// Loadedout v4 design tokens — single source of truth
//
// v4 brings the app into the same family as salmanranjha.me / polarisedu.info:
// warm near-black neutrals with cream text, ONE disciplined action color
// (teal — reserved for the primary action + active states), gold strictly as
// the achievement/reward color (PRs, streaks, milestones), and a per-domain
// accent so each area of the app has its own mood:
//   schedule blue · meals amber · workout teal · budget green ·
//   pantry orange · analytics sky · AI violet
export const T = {
  // ── Neutrals: warm night base, cream text (family DNA) ─────────────────────
  bg:           "#0A0B10",
  surface:      "#11141D",
  elevated:     "#181C28",
  elevated2:    "#202533",
  border:       "#2A3040",
  borderStrong: "#3A4154",

  text:     "#EDEAE2",
  textMuted:"#9A968F",
  textDim:  "#615F66",

  // ── Roles ───────────────────────────────────────────────────────────────────
  // action: the ONE color allowed on primary buttons, active nav, focus rings.
  // reward: achievements only (PRs, streaks, goals hit) — scarcity is the point.
  action: "#27E0B9",
  reward: "#D8B569",

  teal:      "#27E0B9",
  tealDim:   "#11947A",
  amber:     "#FFB454",
  amberDim:  "#946218",
  violet:    "#8E7BFF",
  violetDim: "#5847B0",
  gold:      "#D8B569",
  goldDim:   "#8F7434",
  green:     "#4FC97E",
  blue:      "#6BA3FF",
  sky:       "#5AB8E8",
  orange:    "#FF9466",

  positive: "#27E0B9",
  negative: "#FF647E",
  warning:  "#FFB454",

  catRoutine: "#9A968F",
  catMeal:    "#FFB454",
  catExercise:"#27E0B9",
  catFocus:   "#8E7BFF",
  catClass:   "#6BA3FF",
  catSocial:  "#FF6BB0",
  catWork:    "#FF9466",

  rCard:  16,
  rInput: 12,
  rChip:  8,

  fontFamily: '"Inter", -apple-system, system-ui, sans-serif',
  fontMono:   '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
  fontSerif:  '"Fraunces", Georgia, serif',

  // ── Spacing scale ───────────────────────────────────────────────────────────
  space: {
    0: 0,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    7: 32,
    8: 40,
    9: 48,
    10: 64,
  },

  // ── Typography scale ────────────────────────────────────────────────────────
  type: {
    display: { fontSize: 40, fontWeight: 800, letterSpacing: -1.2, lineHeight: 1.0 },
    hero:    { fontSize: 28, fontWeight: 700, letterSpacing: -0.5, lineHeight: 1.1 },
    h1:      { fontSize: 23, fontWeight: 800, letterSpacing: -0.6, lineHeight: 1.15 },
    h2:      { fontSize: 17, fontWeight: 700, letterSpacing: -0.3, lineHeight: 1.2 },
    h3:      { fontSize: 15, fontWeight: 600, letterSpacing: -0.1, lineHeight: 1.25 },
    body:    { fontSize: 13, fontWeight: 500, letterSpacing: 0,    lineHeight: 1.5 },
    caption: { fontSize: 11, fontWeight: 600, letterSpacing: 0.5,  lineHeight: 1.4 },
    micro:   { fontSize: 9,  fontWeight: 600, letterSpacing: 0.4,  lineHeight: 1.3 },
    // Tracked-out small-caps label above a heading (Polaris-style)
    eyebrow: { fontSize: 10, fontWeight: 700, letterSpacing: 1.6,  lineHeight: 1.3, textTransform: "uppercase" },
  },

  // ── Shadows ─────────────────────────────────────────────────────────────────
  shadow: {
    sm: "0 2px 8px rgba(0,0,0,0.25)",
    md: "0 8px 24px rgba(0,0,0,0.35)",
    lg: "0 16px 48px rgba(0,0,0,0.45)",
    glow: (color) => `0 0 20px ${color}44`,
  },

  // ── Z-index scale ───────────────────────────────────────────────────────────
  z: {
    base: 1,
    dropdown: 50,
    sticky: 60,
    modalBackdrop: 90,
    modal: 100,
    toast: 110,
    confetti: 9999,
  },

  // Height the fixed bottom tab bar occupies (content + iOS safe area). Shared
  // so bottom sheets can sit ABOVE the nav instead of behind it.
  navHeight: "calc(58px + env(safe-area-inset-bottom, 0px))",
};

// Per-domain accents — each tab/page area carries its own hue so the app
// shifts mood between areas while the neutral base keeps it coherent.
export const domainColors = {
  schedule:  T.blue,
  meals:     T.amber,
  workout:   T.teal,
  budget:    T.green,
  inventory: T.orange,
  analytics: T.sky,
  chat:      T.violet,
  admin:     T.textMuted,
};

export function domainColor(pathname) {
  const key = Object.keys(domainColors).find((k) => (pathname || "").startsWith(`/${k}`));
  return key ? domainColors[key] : T.teal;
}

export const catColors = {
  routine:  T.catRoutine,
  meal:     T.catMeal,
  exercise: T.catExercise,
  focus:    T.catFocus,
  class:    T.catClass,
  social:   T.catSocial,
  work:     T.catWork,
};

// Muscle group colors for workout engine
export const muscleColors = {
  chest: "#FF647E",
  back: "#6BA3FF",
  legs: "#27E0B9",
  shoulders: "#FFB454",
  arms: "#8E7BFF",
  core: "#FF6BB0",
  cardio: "#FF9466",
  fullBody: "#9A968F",
};
