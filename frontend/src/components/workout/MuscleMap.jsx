import { T, muscleColors } from "../../design/tokens";

// Stylized front/back figure built from capsules — deliberately geometric
// rather than anatomical so it sits well in the dark UI. Targeted regions
// light up in the muscle-group color; everything else stays as quiet outline.

const DIM = "#222838";
const DIM_STROKE = "#323A4E";

function Region({ d, cx, cy, rx, ry, x, y, w, h, r = 6, lit, color }) {
  // lit: "primary" glows at full strength, "secondary" lights dimmer, no glow
  const fill   = lit ? color : DIM;
  const stroke = lit ? color : DIM_STROKE;
  const extra  = lit === "primary" ? { filter: "url(#mm-glow)" } : lit === "secondary" ? { opacity: 0.45 } : {};
  if (d)  return <path d={d} fill={fill} stroke={stroke} strokeWidth="1" {...extra} />;
  if (rx) return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={fill} stroke={stroke} strokeWidth="1" {...extra} />;
  return <rect x={x} y={y} width={w} height={h} rx={r} fill={fill} stroke={stroke} strokeWidth="1" {...extra} />;
}

// Which figure regions light up for each muscle group
const FRONT_MAP = {
  chest:     ["chestL", "chestR"],
  shoulders: ["deltL", "deltR"],
  arms:      ["bicL", "bicR", "foreL", "foreR"],
  core:      ["abs1", "abs2", "abs3"],
  legs:      ["quadL", "quadR", "calfL", "calfR"],
  cardio:    ["chestL", "chestR", "abs1", "abs2", "abs3", "quadL", "quadR"],
  fullBody:  ["chestL", "chestR", "deltL", "deltR", "bicL", "bicR", "abs1", "abs2", "abs3", "quadL", "quadR"],
};
const BACK_MAP = {
  back:      ["traps", "latL", "latR"],
  shoulders: ["rdeltL", "rdeltR"],
  arms:      ["triL", "triR"],
  legs:      ["gluteL", "gluteR", "hamL", "hamR", "bcalfL", "bcalfR"],
  core:      ["lower"],
  cardio:    ["latL", "latR", "hamL", "hamR"],
  fullBody:  ["traps", "latL", "latR", "gluteL", "gluteR", "hamL", "hamR"],
};

function Figure({ view, lit, color }) {
  const on = (id) => lit.get(id) || false;
  const R = (id, props) => <Region key={id} lit={on(id)} color={color} {...props} />;
  return (
    <svg viewBox="0 0 120 230" width="100%" style={{ display: "block" }}>
      <defs>
        <filter id="mm-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="0" dy="0" stdDeviation="3.5" floodColor={color} floodOpacity="0.55" />
        </filter>
      </defs>
      {/* head + neck */}
      <circle cx="60" cy="18" r="11" fill={DIM} stroke={DIM_STROKE} />
      <rect x="55" y="28" width="10" height="8" rx="3" fill={DIM} stroke={DIM_STROKE} />
      {view === "front" ? (
        <>
          {R("deltL", { cx: 38, cy: 46, rx: 9, ry: 7 })}
          {R("deltR", { cx: 82, cy: 46, rx: 9, ry: 7 })}
          {R("chestL", { d: "M44 50 h14 a3 3 0 0 1 3 3 v12 a4 4 0 0 1 -4 4 h-11 a5 5 0 0 1 -5 -5 v-9 a4 4 0 0 1 3 -5 z" })}
          {R("chestR", { d: "M76 50 h-14 a3 3 0 0 0 -3 3 v12 a4 4 0 0 0 4 4 h11 a5 5 0 0 0 5 -5 v-9 a4 4 0 0 0 -3 -5 z" })}
          {R("bicL", { x: 28, y: 55, w: 11, h: 26, r: 5.5 })}
          {R("bicR", { x: 81, y: 55, w: 11, h: 26, r: 5.5 })}
          {R("foreL", { x: 26, y: 84, w: 10, h: 26, r: 5 })}
          {R("foreR", { x: 84, y: 84, w: 10, h: 26, r: 5 })}
          {R("abs1", { x: 49, y: 72, w: 22, h: 11, r: 4 })}
          {R("abs2", { x: 49, y: 86, w: 22, h: 11, r: 4 })}
          {R("abs3", { x: 49, y: 100, w: 22, h: 13, r: 4 })}
          {/* hips */}
          <rect x="46" y="116" width="28" height="12" rx="5" fill={DIM} stroke={DIM_STROKE} />
          {R("quadL", { x: 44, y: 130, w: 14, h: 44, r: 7 })}
          {R("quadR", { x: 62, y: 130, w: 14, h: 44, r: 7 })}
          {R("calfL", { x: 46, y: 180, w: 11, h: 36, r: 5.5 })}
          {R("calfR", { x: 63, y: 180, w: 11, h: 36, r: 5.5 })}
        </>
      ) : (
        <>
          {R("rdeltL", { cx: 38, cy: 46, rx: 9, ry: 7 })}
          {R("rdeltR", { cx: 82, cy: 46, rx: 9, ry: 7 })}
          {R("traps", { d: "M48 40 h24 l-4 14 h-16 z" })}
          {R("latL", { d: "M45 56 h13 v32 a4 4 0 0 1 -4 4 l-9 -14 a30 30 0 0 1 0 -22 z" })}
          {R("latR", { d: "M75 56 h-13 v32 a4 4 0 0 0 4 4 l9 -14 a30 30 0 0 0 0 -22 z" })}
          {R("triL", { x: 28, y: 55, w: 11, h: 26, r: 5.5 })}
          {R("triR", { x: 81, y: 55, w: 11, h: 26, r: 5.5 })}
          <rect x="26" y="84" width="10" height="26" rx="5" fill={DIM} stroke={DIM_STROKE} />
          <rect x="84" y="84" width="10" height="26" rx="5" fill={DIM} stroke={DIM_STROKE} />
          {R("lower", { x: 50, y: 96, w: 20, h: 16, r: 5 })}
          {R("gluteL", { cx: 52, cy: 122, rx: 10, ry: 9 })}
          {R("gluteR", { cx: 68, cy: 122, rx: 10, ry: 9 })}
          {R("hamL", { x: 44, y: 134, w: 14, h: 40, r: 7 })}
          {R("hamR", { x: 62, y: 134, w: 14, h: 40, r: 7 })}
          {R("bcalfL", { x: 46, y: 180, w: 11, h: 36, r: 5.5 })}
          {R("bcalfR", { x: 63, y: 180, w: 11, h: 36, r: 5.5 })}
        </>
      )}
    </svg>
  );
}

export default function MuscleMap({ primary, secondary = [] }) {
  const color = muscleColors[primary] || T.teal;
  const front = new Map();
  const back  = new Map();
  // Secondaries first so the primary level wins on shared regions
  for (const m of secondary) {
    (FRONT_MAP[m] || []).forEach((r) => front.set(r, "secondary"));
    (BACK_MAP[m] || []).forEach((r) => back.set(r, "secondary"));
  }
  (FRONT_MAP[primary] || []).forEach((r) => front.set(r, "primary"));
  (BACK_MAP[primary] || []).forEach((r) => back.set(r, "primary"));

  return (
    <div style={{ background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 16, padding: "14px 10px 8px", display: "flex", gap: 4 }}>
      {[
        ["FRONT", "front", front],
        ["BACK", "back", back],
      ].map(([label, view, lit]) => (
        <div key={view} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <Figure view={view} lit={lit} color={color} />
          <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1.4, color: T.textDim, fontFamily: T.fontMono }}>{label}</span>
        </div>
      ))}
    </div>
  );
}
