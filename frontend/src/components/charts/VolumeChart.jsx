import { useState, useMemo } from "react";
import { T, muscleColors } from "../../design/tokens";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const MUSCLES = ["chest", "back", "legs", "shoulders", "arms", "core"];

export default function VolumeChart({ history }) {
  const [activeMuscles, setActiveMuscles] = useState(["chest", "back", "legs"]);

  const chartData = useMemo(() => {
    // Group by week
    const weeks = {};
    history.forEach((w) => {
      const date = new Date(w.date || w.loggedAt);
      const key = `${date.getFullYear()}-W${String(Math.ceil(date.getDate() / 7)).padStart(2, "0")}`;
      if (!weeks[key]) weeks[key] = {};
      (w.exercises || []).forEach((ex) => {
        const muscle = ex.muscle || "fullBody";
        if (!weeks[key][muscle]) weeks[key][muscle] = 0;
        (ex.sets || []).forEach((s) => {
          weeks[key][muscle] += (s.weight_kg || 0) * (s.reps || 0);
        });
      });
    });
    return Object.entries(weeks)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([week, data]) => ({ week, ...data }));
  }, [history]);

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rCard, padding: 16, margin: "0 20px 16px" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 12 }}>Volume Progression</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {MUSCLES.map((m) => (
          <button
            key={m}
            onClick={() =>
              setActiveMuscles((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]))
            }
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              background: activeMuscles.includes(m) ? muscleColors[m] + "33" : T.elevated,
              border: `1px solid ${activeMuscles.includes(m) ? muscleColors[m] + "66" : T.border}`,
              color: activeMuscles.includes(m) ? muscleColors[m] : T.textMuted,
              fontSize: 10,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              textTransform: "capitalize",
            }}
          >
            {m}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <XAxis dataKey="week" tick={{ fill: T.textDim, fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: T.textDim, fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 10,
              color: T.text,
              fontSize: 12,
            }}
            itemStyle={{ color: T.text }}
          />
          <Legend wrapperStyle={{ fontSize: 10, color: T.textMuted }} />
          {activeMuscles.map((m) => (
            <Line
              key={m}
              type="monotone"
              dataKey={m}
              stroke={muscleColors[m]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
