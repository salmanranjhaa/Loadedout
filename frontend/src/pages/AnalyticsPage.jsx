import { useState, useEffect } from "react";
import { T } from "../design/tokens";
import { Icon } from "../design/icons";
import { PageHeader, PageScroll, SectionHead, MiniStat, IllustratedEmptyState, SkeletonCard, LoadingDots } from "../design/components";
import { analyticsAPI, workoutAPI } from "../utils/api";
import WeightChart from "../components/charts/WeightChart";
import VolumeChart from "../components/charts/VolumeChart";

const RANGES = ["Week", "Month", "3 Months"];

const MOCK_WEIGHTS = Array.from({ length: 30 }, (_, i) => ({
  date: new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10),
  weight_kg: 82.4 - i * 0.028 + Math.sin(i * 0.7) * 0.3,
}));

const MOCK_PRs = [
  { exercise: "Bench Press", value: "102.5 kg", date: "Apr 18", muscle: "chest" },
  { exercise: "Squat", value: "135 kg", date: "Apr 12", muscle: "legs" },
  { exercise: "Deadlift", value: "160 kg", date: "Apr 5", muscle: "back" },
  { exercise: "Overhead Press", value: "70 kg", date: "Mar 28", muscle: "shoulders" },
];

function Heatmap({ workouts }) {
  const COLS = 13;
  const ROWS = 7;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cells = [];
  for (let col = COLS - 1; col >= 0; col--) {
    for (let row = 0; row < ROWS; row++) {
      const d = new Date(today);
      const daysBack = col * 7 + (ROWS - 1 - row) - (today.getDay() === 0 ? 6 : today.getDay() - 1);
      d.setDate(today.getDate() - daysBack);
      const dateStr = d.toISOString().slice(0, 10);
      const count = workouts.filter((w) => (w.date || w.logged_at?.slice(0, 10)) === dateStr).length;
      cells.push({ col: COLS - 1 - col, row, count, date: dateStr });
    }
  }

  const cellSize = 11;
  const gap = 3;
  const totalW = COLS * (cellSize + gap) - gap;
  const totalH = ROWS * (cellSize + gap) - gap;

  function intensityColor(count) {
    if (count === 0) return T.elevated2;
    if (count === 1) return T.teal + "55";
    if (count === 2) return T.teal + "99";
    return T.teal;
  }

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rCard, padding: 16, margin: "0 20px 16px" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 12 }}>Workout Consistency</div>
      <svg width={totalW} height={totalH} viewBox={`0 0 ${totalW} ${totalH}`}>
        {cells.map((c, i) => (
          <rect
            key={i}
            x={c.col * (cellSize + gap)}
            y={c.row * (cellSize + gap)}
            width={cellSize}
            height={cellSize}
            rx={2}
            fill={intensityColor(c.count)}
          >
            <title>{c.date}: {c.count} workout{c.count !== 1 ? "s" : ""}</title>
          </rect>
        ))}
      </svg>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
        <span style={{ fontSize: 10, color: T.textDim }}>Less</span>
        {[T.elevated2, T.teal + "55", T.teal + "99", T.teal].map((color, i) => (
          <div key={i} style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
        ))}
        <span style={{ fontSize: 10, color: T.textDim }}>More</span>
      </div>
    </div>
  );
}

function NutritionAdherence({ history, targets }) {
  const days = Object.entries(history)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-14);

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rCard, padding: 16, margin: "0 20px 16px" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 12 }}>Nutrition Adherence</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {days.map(([date, data]) => {
          const kcal = data.total_calories || 0;
          const diff = targets.calories ? Math.abs(kcal - targets.calories) / targets.calories : 1;
          const color = diff <= 0.1 ? T.teal : diff <= 0.2 ? T.amber : T.negative;
          return (
            <div key={date} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div
                style={{
                  width: "100%",
                  aspectRatio: "1",
                  borderRadius: 6,
                  background: color + "33",
                  border: `1.5px solid ${color}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span style={{ fontSize: 9, color, fontWeight: 700, fontFamily: T.fontMono }}>{Math.round(kcal)}</span>
              </div>
              <span style={{ fontSize: 8, color: T.textDim }}>{date.slice(5)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PRTimeline() {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rCard, padding: 16, margin: "0 20px 16px" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 12 }}>Personal Records</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {MOCK_PRs.map((pr) => (
          <div key={pr.exercise} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.teal }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{pr.exercise}</div>
              <div style={{ fontSize: 10, color: T.textDim, textTransform: "capitalize" }}>{pr.muscle}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.teal, fontFamily: T.fontMono }}>{pr.value}</div>
              <div style={{ fontSize: 10, color: T.textDim }}>{pr.date}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WeeklySummary() {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rCard, padding: 16, margin: "0 20px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Icon name="sparkle" size={14} color={T.teal} />
        <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Weekly AI Summary</div>
      </div>
      <div style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.6 }}>
        You hit chest <strong style={{ color: T.text }}>2× this week</strong>, up <strong style={{ color: T.teal }}>5% volume</strong> vs last week.
        Your protein adherence averaged <strong style={{ color: T.amber }}>87%</strong>. Consider adding more back work — you only trained back once.
        Weight trend is down <strong style={{ color: T.teal }}>0.4 kg</strong>. Keep the deficit moderate.
      </div>
    </div>
  );
}

export default function AnalyticsPage({ profile, onProfile }) {
  const [range, setRange] = useState("Month");
  const [weights, setWeights] = useState(MOCK_WEIGHTS);
  const [workouts, setWorkouts] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const days = range === "Week" ? 7 : range === "Month" ? 30 : 90;
        const [dash, wData, wkData] = await Promise.all([
          analyticsAPI.getDashboard(),
          analyticsAPI.getWeights(days),
          workoutAPI.getAll(days),
        ]);
        if (dash) setDashboard(dash);
        if (wData?.weights?.length) setWeights(wData.weights);
        if (wkData?.workouts) setWorkouts(wkData.workouts);
      } catch {
        // use mock
      } finally {
        setLoading(false);
      }
    })();
  }, [range]);

  const current = dashboard?.weight?.current || weights[weights.length - 1]?.weight_kg;
  const oldest = weights[0]?.weight_kg;
  const delta = current && oldest ? (current - oldest).toFixed(1) : null;
  const goalWeight = profile?.target_weight_kg;

  const totalSessions = workouts.length;
  const totalMinutes = workouts.reduce((s, w) => s + (w.duration_minutes || w.duration || 0), 0);

  const avgKcal = dashboard?.nutrition_this_week?.avg_calories || 2140;
  const avgProtein = dashboard?.nutrition_this_week?.avg_protein || 162;
  const protTarget = profile?.daily_protein_target || 190;
  const protAdherence = Math.round((avgProtein / protTarget) * 100);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: T.bg }}>
      <PageHeader title="Analytics" subtitle="Insight across body, fitness, food" profile={profile} onProfile={onProfile} />

      <PageScroll>
        {/* Range picker */}
        <div style={{ display: "flex", gap: 8, padding: "0 20px 20px" }}>
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              style={{
                padding: "7px 16px",
                borderRadius: 9999,
                background: range === r ? T.teal : T.elevated,
                border: `1px solid ${range === r ? T.teal : T.border}`,
                color: range === r ? "#0A0A0F" : T.text,
                fontSize: 12,
                fontWeight: range === r ? 700 : 500,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {r}
            </button>
          ))}
        </div>

        {/* Weight section */}
        {loading ? (
          <SkeletonCard />
        ) : (
          <>
            <div style={{ padding: "0 20px 12px", display: "flex", gap: 10 }}>
              <div style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rCard, padding: 14 }}>
                <div style={{ fontSize: 10, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}>Current</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: T.text, fontFamily: T.fontMono, marginTop: 2 }}>
                  {current ? `${current.toFixed(1)} kg` : "—"}
                </div>
                {delta && (
                  <div style={{ fontSize: 11, color: delta < 0 ? T.teal : T.negative, marginTop: 2, fontWeight: 600 }}>
                    {delta > 0 ? "+" : ""}
                    {delta} kg
                  </div>
                )}
              </div>
              <div style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rCard, padding: 14 }}>
                <div style={{ fontSize: 10, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}>Goal</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: T.amber, fontFamily: T.fontMono, marginTop: 2 }}>
                  {goalWeight ? `${goalWeight} kg` : "—"}
                </div>
                {current && goalWeight && (
                  <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
                    {Math.abs(current - goalWeight).toFixed(1)} kg to go
                  </div>
                )}
              </div>
            </div>

            <WeightChart data={weights} goalWeight={goalWeight} />
          </>
        )}

        {/* Fitness section */}
        <div style={{ padding: "0 20px 8px" }}>
          <SectionHead title="Fitness" />
        </div>
        {loading ? (
          <SkeletonCard />
        ) : (
          <>
            <div style={{ padding: "0 20px 12px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <MiniStat label="Sessions" value={totalSessions} />
              <MiniStat label="Minutes" value={totalMinutes} />
              <MiniStat label="Protein %" value={`${protAdherence}%`} />
            </div>

            <Heatmap workouts={workouts} />
            <VolumeChart history={workouts} />
          </>
        )}

        {/* Nutrition section */}
        <div style={{ padding: "0 20px 8px" }}>
          <SectionHead title="Nutrition" />
        </div>
        {loading ? (
          <SkeletonCard />
        ) : (
          <>
            <NutritionAdherence
              history={dashboard?.history || {}}
              targets={{ calories: profile?.daily_calorie_target || 2400 }}
            />
          </>
        )}

        {/* PRs */}
        <div style={{ padding: "0 20px 8px" }}>
          <SectionHead title="Records" />
        </div>
        <PRTimeline />

        {/* AI Summary */}
        <WeeklySummary />
      </PageScroll>
    </div>
  );
}
