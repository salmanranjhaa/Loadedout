import { T } from "../../design/tokens";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function WeeklyCalendar({ data, calorieTarget }) {
  // data: array of { day: string, calories: number }
  const maxCal = Math.max(...data.map((d) => d.calories), calorieTarget * 1.2);

  function getColor(cal) {
    if (!calorieTarget) return T.elevated2;
    const diff = Math.abs(cal - calorieTarget) / calorieTarget;
    if (diff <= 0.1) return T.teal;
    if (diff <= 0.2) return T.amber;
    return T.negative;
  }

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rCard, padding: 16, margin: "0 20px 16px" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 12 }}>Weekly Overview</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120 }}>
        {data.map((d, i) => {
          const pct = Math.min(d.calories / maxCal, 1);
          const color = getColor(d.calories);
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{ fontSize: 10, color: T.text, fontFamily: T.fontMono, fontWeight: 600 }}>{Math.round(d.calories)}</div>
              <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
                <div
                  style={{
                    width: "100%",
                    height: `${Math.max(pct * 80, 4)}px`,
                    background: color + "88",
                    borderRadius: "4px 4px 0 0",
                    borderTop: `2px solid ${color}`,
                    transition: "all 0.3s ease",
                  }}
                />
              </div>
              <div style={{ fontSize: 10, color: T.textDim, fontWeight: 500 }}>{DAYS[i]}</div>
            </div>
          );
        })}
      </div>
      {calorieTarget > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10, justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: T.teal }} />
            <span style={{ fontSize: 10, color: T.textMuted }}>On target</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: T.amber }} />
            <span style={{ fontSize: 10, color: T.textMuted }}>Close</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: T.negative }} />
            <span style={{ fontSize: 10, color: T.textMuted }}>Off</span>
          </div>
        </div>
      )}
    </div>
  );
}
