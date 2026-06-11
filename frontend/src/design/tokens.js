// Loadedout v3 design tokens — single source of truth
// Blue-tinted dark base with softened accents: premium athletic feel
// (Whoop/Linear lineage) instead of neon-on-pure-black.
export const T = {
  bg:           "#070A10",
  surface:      "#0E1320",
  elevated:     "#161D2D",
  elevated2:    "#1D2638",
  border:       "#26314A",
  borderStrong: "#33415F",

  text:     "#EEF2F9",
  textMuted:"#8C97AE",
  textDim:  "#5B667D",

  teal:      "#27E0B9",
  tealDim:   "#11947A",
  amber:     "#FFB454",
  amberDim:  "#946218",
  violet:    "#8E7BFF",
  violetDim: "#5847B0",

  positive: "#27E0B9",
  negative: "#FF647E",
  warning:  "#FFB454",

  catRoutine: "#8C97AE",
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
    hero:    { fontSize: 28, fontWeight: 700, letterSpacing: -0.5, lineHeight: 1.1 },
    h1:      { fontSize: 23, fontWeight: 800, letterSpacing: -0.6, lineHeight: 1.15 },
    h2:      { fontSize: 17, fontWeight: 700, letterSpacing: -0.3, lineHeight: 1.2 },
    h3:      { fontSize: 15, fontWeight: 600, letterSpacing: -0.1, lineHeight: 1.25 },
    body:    { fontSize: 13, fontWeight: 500, letterSpacing: 0,    lineHeight: 1.5 },
    caption: { fontSize: 11, fontWeight: 600, letterSpacing: 0.5,  lineHeight: 1.4 },
    micro:   { fontSize: 9,  fontWeight: 600, letterSpacing: 0.4,  lineHeight: 1.3 },
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
};

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
  fullBody: "#8C97AE",
};
