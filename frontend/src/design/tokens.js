// Loadedout v2 design tokens — single source of truth
export const T = {
  bg:           "#0A0A0F",
  surface:      "#13131A",
  elevated:     "#1C1C26",
  elevated2:    "#22222E",
  border:       "#2A2A38",
  borderStrong: "#363648",

  text:     "#F4F4F8",
  textMuted:"#8F8FA3",
  textDim:  "#5A5A6B",

  teal:      "#00E5C3",
  tealDim:   "#0B8973",
  amber:     "#F5A623",
  amberDim:  "#8F6114",
  violet:    "#7C5CFC",
  violetDim: "#4A3896",

  positive: "#00E5C3",
  negative: "#FF5C72",
  warning:  "#F5A623",

  catRoutine: "#8F8FA3",
  catMeal:    "#F5A623",
  catExercise:"#00E5C3",
  catFocus:   "#7C5CFC",
  catClass:   "#5C8FFC",
  catSocial:  "#FC5C9E",
  catWork:    "#FC8B5C",

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
  chest: "#FF5C72",
  back: "#5C8FFC",
  legs: "#00E5C3",
  shoulders: "#F5A623",
  arms: "#7C5CFC",
  core: "#FC5C9E",
  cardio: "#FC8B5C",
  fullBody: "#8F8FA3",
};
