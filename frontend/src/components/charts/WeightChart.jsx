import { useMemo } from "react";
import { T } from "../../design/tokens";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

export default function WeightChart({ data, goalWeight }) {
  const chartData = useMemo(() => {
    // 7-day moving average
    return data.map((d, i) => {
      const window = data.slice(Math.max(0, i - 6), i + 1);
      const avg = window.reduce((s, x) => s + x.weight_kg, 0) / window.length;
      return {
        date: d.date.slice(5),
        weight: Math.round(d.weight_kg * 10) / 10,
        avg: Math.round(avg * 10) / 10,
      };
    });
  }, [data]);

  if (!data?.length) return null;

  const minW = Math.min(...data.map((d) => d.weight_kg));
  const maxW = Math.max(...data.map((d) => d.weight_kg));

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rCard, padding: 16, margin: "0 20px 16px" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 12 }}>Body Weight</div>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={T.teal} stopOpacity={0.3} />
              <stop offset="100%" stopColor={T.teal} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" tick={{ fill: T.textDim, fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis domain={[minW - 1, maxW + 1]} tick={{ fill: T.textDim, fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 10,
              color: T.text,
              fontSize: 12,
            }}
            itemStyle={{ color: T.text }}
            formatter={(value) => [`${value} kg`, "Weight"]}
          />
          <Area type="monotone" dataKey="weight" stroke={T.teal} strokeWidth={2} fill="url(#weightGrad)" dot={false} activeDot={{ r: 4, fill: T.teal }} />
          <Area type="monotone" dataKey="avg" stroke={T.violet} strokeWidth={1.5} strokeDasharray="4 4" fill="none" dot={false} />
          {goalWeight && <ReferenceLine y={goalWeight} stroke={T.amber} strokeDasharray="3 3" strokeWidth={1} />}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
