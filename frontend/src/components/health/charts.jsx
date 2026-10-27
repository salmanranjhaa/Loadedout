import { T } from "../../design/tokens";

// Small SVG charts for watch data. They stretch to the card's width; days or
// minutes without data are shown as gaps or dashed outlines, never skipped.

// A line through [x, y] points, broken where x jumps by more than `gap`
export function LineSvg({ points, xMax, yMin, yMax, color, height = 120, gap = 10, fill = false, guides = [], xLabels = [] }) {
  const W = 340, top = 6, bottom = xLabels.length ? 16 : 4;
  const x = (v) => (v / xMax) * W;
  const y = (v) => top + (1 - (v - yMin) / Math.max(1, yMax - yMin)) * (height - top - bottom);
  const runs = [];
  points.forEach((p, i) => {
    if (i === 0 || p[0] - points[i - 1][0] > gap) runs.push([]);
    runs[runs.length - 1].push(p);
  });
  const d = runs.filter((r) => r.length > 1).map((r) => r.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(" ")).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
      {guides.map((g) => (
        <g key={g}>
          <line x1={0} x2={W} y1={y(g)} y2={y(g)} stroke={T.border} strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
          <text x={W} y={y(g) - 2} fill={T.textDim} fontSize={9} textAnchor="end" fontFamily={T.fontMono}>{g}</text>
        </g>
      ))}
      {fill && runs.filter((r) => r.length > 1).map((r, i) => (
        <path key={i} d={`M${x(r[0][0])} ${y(yMin)} ` + r.map((p) => `L${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(" ") + ` L${x(r[r.length - 1][0])} ${y(yMin)} Z`} fill={color} opacity={0.12} />
      ))}
      <path d={d} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {xLabels.map(([v, label]) => (
        <text key={label} x={Math.min(Math.max(x(v), 8), W - 8)} y={height - 3} fill={T.textDim} fontSize={9} textAnchor="middle" fontFamily={T.fontMono}>{label}</text>
      ))}
    </svg>
  );
}

// One bar per day; null = no data (dashed outline)
export function BarsSvg({ values, labels = [], max, goal, color, height = 100, format = (v) => v }) {
  const W = 340, n = values.length, gapW = 6, bw = (W - gapW * (n - 1)) / n, bottom = labels.length ? 14 : 2;
  const top = 12, h = height - top - bottom;
  const peak = max || Math.max(goal || 0, ...values.filter((v) => v != null), 1);
  const y = (v) => top + h - (v / peak) * h;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} style={{ display: "block" }}>
      {goal ? <line x1={0} x2={W} y1={y(goal)} y2={y(goal)} stroke={color} strokeDasharray="3 3" opacity={0.6} /> : null}
      {values.map((v, i) => {
        const bx = i * (bw + gapW);
        return (
          <g key={i}>
            {v == null
              ? <rect x={bx} y={top + h * 0.7} width={bw} height={h * 0.3} rx={3} fill="none" stroke={T.borderStrong} strokeDasharray="3 3" />
              : <rect x={bx} y={y(v)} width={bw} height={Math.max(2, top + h - y(v))} rx={3} fill={color} opacity={goal && v < goal ? 0.55 : 1} />}
            {v != null && n <= 14 && <text x={bx + bw / 2} y={y(v) - 3} fill={T.textMuted} fontSize={8.5} textAnchor="middle" fontFamily={T.fontMono}>{format(v)}</text>}
            {labels[i] && <text x={bx + bw / 2} y={height - 2} fill={T.textDim} fontSize={9} textAnchor="middle" fontFamily={T.fontMono}>{labels[i]}</text>}
          </g>
        );
      })}
    </svg>
  );
}
