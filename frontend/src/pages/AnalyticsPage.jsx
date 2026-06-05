import { useState, useEffect, useMemo } from "react";
import { T, muscleColors } from "../design/tokens";
import { Icon } from "../design/icons";
import { PageHeader, PageScroll, SectionHead, MiniStat, IllustratedEmptyState, SkeletonCard, LoadingDots } from "../design/components";
import { analyticsAPI, workoutAPI, prAPI } from "../utils/api";
import WeightChart from "../components/charts/WeightChart";
import VolumeChart from "../components/charts/VolumeChart";
import exerciseData from "../lib/exercises.json";

const RANGES = ["Week", "Month", "3 Months"];

function getMuscleForExercise(exerciseName) {
  return exerciseData.exercises.find(
    (e) => e.name.toLowerCase() === (exerciseName || "").toLowerCase()
  )?.primary || null;
}

function getLocalPRs() {
  try {
    const raw = JSON.parse(localStorage.getItem("lo_prs") || "{}");
    return Object.entries(raw).map(([exercise_name, data]) => ({
      exercise_name,
      weight_kg: data.weight_kg,
      reps:      data.reps,
      date:      data.date,
    }));
  } catch { return []; }
}

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

function PRTimeline({ prs }) {
  if (!prs || prs.length === 0) {
    return (
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rCard, padding: 16, margin: "0 20px 16px" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 8 }}>Personal Records</div>
        <div style={{ fontSize: 13, color: T.textDim, textAlign: "center", padding: "16px 0" }}>
          No PRs yet — finish a workout to start tracking them.
        </div>
      </div>
    );
  }

  const sorted = [...prs].sort((a, b) => b.weight_kg - a.weight_kg).slice(0, 10);

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rCard, padding: 16, margin: "0 20px 16px" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 12 }}>Personal Records</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {sorted.map((pr) => {
          const muscle = getMuscleForExercise(pr.exercise_name);
          const dotColor = muscle ? (muscleColors[muscle] || T.teal) : T.teal;
          const e1rm = pr.reps > 1 ? Math.round(pr.weight_kg * (1 + pr.reps / 30)) : pr.weight_kg;
          return (
            <div key={pr.exercise_name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pr.exercise_name}</div>
                <div style={{ fontSize: 10, color: T.textDim, textTransform: "capitalize" }}>
                  {muscle || "—"} · {pr.date || ""}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: dotColor, fontFamily: T.fontMono }}>
                  {pr.weight_kg}kg × {pr.reps}
                </div>
                <div style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono }}>
                  ~{e1rm}kg 1RM
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeeklySummary({ dashboard, profile }) {
  const workouts   = dashboard?.fitness_this_week?.workouts    || 0;
  const minutes    = dashboard?.fitness_this_week?.total_minutes || 0;
  const avgKcal    = dashboard?.nutrition_this_week?.avg_calories;
  const avgProtein = dashboard?.nutrition_this_week?.avg_protein;
  const protTarget = profile?.daily_protein_target;
  const weightChg  = dashboard?.weight?.week_change;

  if (!dashboard) return null;

  const protPct = protTarget && avgProtein ? Math.round((avgProtein / protTarget) * 100) : null;
  const protColor = protPct == null ? T.textDim : protPct >= 90 ? T.teal : protPct >= 70 ? T.amber : T.negative;

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rCard, padding: 16, margin: "0 20px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Icon name="sparkle" size={14} color={T.teal} />
        <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>This Week</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        {[
          ["Workouts",     workouts,                              T.teal],
          ["Minutes",      minutes,                               T.violet],
          ["Avg Calories", avgKcal  ? `${avgKcal} kcal`  : "—",  T.amber],
          ["Protein %",    protPct  ? `${protPct}%`       : "—",  protColor],
        ].map(([label, value, color]) => (
          <div key={label} style={{ background: T.elevated, borderRadius: 12, padding: "10px 12px" }}>
            <div style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: T.fontMono }}>{value}</div>
          </div>
        ))}
      </div>
      {weightChg != null && (
        <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.6 }}>
          Weight this week:{" "}
          <strong style={{ color: weightChg < 0 ? T.teal : T.negative }}>
            {weightChg > 0 ? "+" : ""}{weightChg} kg
          </strong>
          {weightChg < 0 ? " — on track for your cut." : " — consider tightening the deficit."}
        </div>
      )}
    </div>
  );
}

export default function AnalyticsPage({ profile, onProfile }) {
  const [range,    setRange]    = useState("Month");
  const [weights,  setWeights]  = useState([]);
  const [workouts, setWorkouts] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [prs,      setPRs]      = useState(() => getLocalPRs());
  const [loading,  setLoading]  = useState(true);

  // Merge local and API PRs, keeping highest weight per exercise
  function mergePRs(localPRs, apiPRs) {
    const map = {};
    for (const p of [...localPRs, ...apiPRs]) {
      const key = p.exercise_name;
      if (!map[key] || p.weight_kg > map[key].weight_kg) map[key] = p;
    }
    return Object.values(map).sort((a, b) => b.weight_kg - a.weight_kg);
  }

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
        // offline or auth issue — keep localStorage data
      } finally {
        setLoading(false);
      }
    })();
  }, [range]);

  // Sync localStorage PRs to backend once per session, then load real PRs
  useEffect(() => {
    const localPRs = getLocalPRs();
    if (!localPRs.length) {
      prAPI.getAll().then((data) => {
        if (data?.prs?.length) setPRs(data.prs);
      }).catch(() => {});
      return;
    }
    prAPI.bulkSync(localPRs).then(() =>
      prAPI.getAll().then((data) => {
        if (data?.prs?.length) setPRs(mergePRs(localPRs, data.prs));
      })
    ).catch(() => {
      // offline — keep localStorage PRs
    });
  }, []);

  const current    = dashboard?.weight?.current || weights[weights.length - 1]?.weight_kg;
  const oldest     = weights[0]?.weight_kg;
  const delta      = current && oldest ? (current - oldest).toFixed(1) : null;
  const goalWeight = profile?.target_weight_kg;

  // Merge localStorage history with API workouts for heatmap
  const localHistory = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("lo_workout_history") || "[]"); } catch { return []; }
  }, []);
  const allWorkouts = useMemo(() => {
    const combined = [...workouts, ...localHistory];
    const seen = new Set();
    return combined.filter((w) => {
      const key = w.id || w.loggedAt || w.date;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [workouts, localHistory]);

  const totalSessions = allWorkouts.length;
  const totalMinutes  = allWorkouts.reduce((s, w) => s + (w.duration_minutes || w.duration || 0), 0);

  const avgProtein   = dashboard?.nutrition_this_week?.avg_protein;
  const protTarget   = profile?.daily_protein_target;
  const protAdherence = avgProtein && protTarget ? Math.round((avgProtein / protTarget) * 100) : null;

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
                  <div style={{ fontSize: 11, color: parseFloat(delta) < 0 ? T.teal : T.negative, marginTop: 2, fontWeight: 600 }}>
                    {parseFloat(delta) > 0 ? "+" : ""}{delta} kg
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

            {weights.length > 1 ? (
              <WeightChart data={weights} goalWeight={goalWeight} />
            ) : (
              <div style={{ margin: "0 20px 16px", background: T.surface, border: `1px dashed ${T.border}`, borderRadius: T.rCard, padding: "24px 20px", textAlign: "center" }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>⚖️</div>
                <div style={{ fontSize: 13, color: T.textMuted }}>Log your body weight daily to see your trend chart here.</div>
              </div>
            )}
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
              <MiniStat label="Protein %" value={protAdherence ? `${protAdherence}%` : "—"} />
            </div>

            <Heatmap workouts={allWorkouts} />
            <VolumeChart history={allWorkouts} />
          </>
        )}

        {/* Nutrition section */}
        <div style={{ padding: "0 20px 8px" }}>
          <SectionHead title="Nutrition" />
        </div>
        {loading ? (
          <SkeletonCard />
        ) : (
          <NutritionAdherence
            history={dashboard?.history || {}}
            targets={{ calories: profile?.daily_calorie_target || 2400 }}
          />
        )}

        {/* PRs */}
        <div style={{ padding: "0 20px 8px" }}>
          <SectionHead title="Records" />
        </div>
        <PRTimeline prs={prs} />

        {/* Weekly summary */}
        <WeeklySummary dashboard={dashboard} profile={profile} />
      </PageScroll>
    </div>
  );
}
