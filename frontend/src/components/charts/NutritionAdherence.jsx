import { useMemo } from "react";
import { T } from "../../design/tokens";

function getStatusColor(status) {
  if (status === "hit") return T.positive;
  if (status === "partial") return T.warning;
  return T.negative;
}

function getStatusLabel(status) {
  if (status === "hit") return "Hit";
  if (status === "partial") return "Partial";
  return "Missed";
}

export default function NutritionAdherence({ history = [], profile }) {
  const days = useMemo(() => {
    const map = new Map();
    history.forEach((entry) => {
      const date = entry.date || entry.logged_at?.slice(0, 10) || entry.created_at?.slice(0, 10);
      if (!date) return;
      if (!map.has(date)) {
        map.set(date, { calories: 0, protein: 0, carbs: 0, fat: 0 });
      }
      const d = map.get(date);
      d.calories += entry.calories || 0;
      d.protein += entry.protein_g || 0;
      d.carbs += entry.carbs_g || 0;
      d.fat += entry.fat_g || 0;
    });

    const calorieTarget = profile?.daily_calories_target || 2500;
    const proteinTarget = profile?.daily_protein_target || 180;

    const arr = Array.from(map.entries()).map(([date, totals]) => {
      const calPct = calorieTarget > 0 ? totals.calories / calorieTarget : 0;
      const protPct = proteinTarget > 0 ? totals.protein / proteinTarget : 0;
      let status = "miss";
      if (calPct >= 0.9 && protPct >= 0.9) status = "hit";
      else if (calPct >= 0.7 || protPct >= 0.7) status = "partial";
      return { date, status, totals };
    });

    arr.sort((a, b) => b.date.localeCompare(a.date));
    return arr.slice(0, 28);
  }, [history, profile]);

  if (!days.length) return null;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
        {days.map((day) => (
          <div
            key={day.date}
            style={{
              aspectRatio: "1",
              borderRadius: 8,
              background: getStatusColor(day.status) + "22",
              border: `1px solid ${getStatusColor(day.status)}44`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
            }}
            title={`${day.date} — ${getStatusLabel(day.status)}`}
          >
            <span style={{ fontSize: 10, color: T.textMuted, fontFamily: T.fontMono }}>
              {new Date(day.date).getDate()}
            </span>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: getStatusColor(day.status) }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, justifyContent: "center" }}>
        {[
          { label: "Hit", color: T.positive },
          { label: "Partial", color: T.warning },
          { label: "Miss", color: T.negative },
        ].map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.color }} />
            <span style={{ fontSize: 10, color: T.textMuted }}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
