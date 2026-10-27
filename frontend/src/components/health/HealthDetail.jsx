import { useState } from "react";
import { T } from "../../design/tokens";
import { DetailHeader } from "../../design/components";
import { fmtDay } from "../../utils/budget";
import { BarsSvg, LineSvg } from "./charts";
import { dayMonth, hm, lastDays, weekdayLetter } from "./health";

const TABS = [["heart", "Heart rate"], ["sleep", "Sleep"], ["activity", "Activity"]];
const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rCard, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 };
const sec = { fontSize: 10, fontWeight: 700, color: T.textMuted, letterSpacing: 1.2, textTransform: "uppercase", display: "flex", justifyContent: "space-between" };
const note = { fontSize: 11.5, color: T.textMuted, lineHeight: 1.5 };
const HOURS = [[0, "00"], [360, "06"], [720, "12"], [1080, "18"], [1440, "24"]];

function Tiles({ items, color }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 8 }}>
      {items.map(([l, v]) => (
        <div key={l} style={{ background: T.surface, borderRadius: 12, padding: "10px 6px", textAlign: "center" }}>
          <div style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 700 }}>{l}</div>
          <div style={{ fontSize: 17, fontWeight: 700, fontFamily: T.fontMono, color, marginTop: 4 }}>{v ?? "—"}</div>
        </div>
      ))}
    </div>
  );
}

// Heart rate, sleep and daily activity from the watch, over the last 30 days
export default function HealthDetail({ tab, days, onTab, onClose }) {
  const byDate = Object.fromEntries(days.map((d) => [d.date, d]));
  return (
    <div style={{ position: "fixed", inset: 0, bottom: T.navHeight, zIndex: T.z.modal, background: T.bg, display: "flex", flexDirection: "column", animation: "lo-slide-in 0.25s cubic-bezier(0.32,0.72,0,1) forwards" }}>
      <DetailHeader onBack={onClose} title={TABS.find(([k]) => k === tab)[1]} subtitle="from Garmin" />
      <div style={{ display: "flex", gap: 6, padding: "0 16px 10px" }}>
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => onTab(k)} style={{ flex: 1, padding: "7px 0", borderRadius: 9999, border: `1px solid ${k === tab ? T.teal : T.border}`, background: k === tab ? T.teal : T.elevated, color: k === tab ? "#0A0A0F" : T.text, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{l}</button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 24px", display: "flex", flexDirection: "column", gap: 10 }}>
        {tab === "heart" && <Heart days={days} />}
        {tab === "sleep" && <Sleep byDate={byDate} />}
        {tab === "activity" && <Activity byDate={byDate} />}
      </div>
    </div>
  );
}

function Heart({ days }) {
  const withSamples = days.filter((d) => d.heart_rate?.samples?.length > 1);
  const [i, setI] = useState(withSamples.length - 1);
  const day = withSamples[i];
  const resting = days.filter((d) => d.resting_hr);
  if (!day && !resting.length) return <div style={note}>No heart rate from the watch in the last 30 days.</div>;
  return (
    <>
      {day && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <button disabled={i <= 0} onClick={() => setI(i - 1)} style={navBtn(i <= 0)}>‹</button>
            <span style={{ fontSize: 13, fontWeight: 600, minWidth: 110, textAlign: "center" }}>{fmtDay(day.date)}</span>
            <button disabled={i >= withSamples.length - 1} onClick={() => setI(i + 1)} style={navBtn(i >= withSamples.length - 1)}>›</button>
          </div>
          <Tiles color={T.negative} items={[["Resting", day.heart_rate.resting], ["Min", day.heart_rate.min], ["Max", day.heart_rate.max], ["7-day rest", day.heart_rate.resting_7d]]} />
          <div style={card}>
            <div style={sec}><span>Through the day</span><span style={{ textTransform: "none", letterSpacing: 0 }}>every 2 min</span></div>
            <LineSvg points={day.heart_rate.samples} xMax={1440} yMin={40} yMax={Math.max(180, day.heart_rate.max || 0)}
                     color={T.negative} height={170} gap={20} guides={[60, 100, 140]} xLabels={HOURS} />
            <div style={note}>Gaps are times the watch was off your wrist.</div>
          </div>
        </>
      )}
      {resting.length > 1 && (
        <div style={card}>
          <div style={sec}><span>Resting heart rate</span><span style={{ textTransform: "none", letterSpacing: 0 }}>{resting.length} days</span></div>
          <LineSvg points={resting.map((d) => [daysAgoIndex(d.date), d.resting_hr])} xMax={29}
                   yMin={Math.min(...resting.map((d) => d.resting_hr)) - 5} yMax={Math.max(...resting.map((d) => d.resting_hr)) + 5}
                   color={T.negative} height={90} gap={30} xLabels={[[0, dayMonth(lastDays(30)[0])], [29, "today"]]} />
        </div>
      )}
    </>
  );
}

function Sleep({ byDate }) {
  const nights = lastDays(14);
  const tracked = nights.filter((d) => byDate[d]?.sleep_seconds);
  const last = byDate[tracked[tracked.length - 1]];
  const s = last?.sleep;
  const stages = s ? [["Deep", s.deep_s, "#5847B0"], ["Light", s.light_s, T.violet], ["REM", s.rem_s, T.sky], ["Awake", s.awake_s, T.orange]].filter(([, v]) => v) : [];
  return (
    <>
      {s ? (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 32, fontWeight: 700, fontFamily: T.fontMono, color: T.violet }}>{hm(s.seconds)}</span>
            <span style={{ fontSize: 12, color: T.textMuted, fontFamily: T.fontMono }}>{fmtDay(last.date)}{s.start && s.end ? ` · ${s.start} → ${s.end}` : ""}</span>
          </div>
          {stages.length > 0 && (
            <div style={card}>
              <div style={sec}><span>Stages</span></div>
              <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", gap: 2 }}>
                {stages.map(([l, v, c]) => <div key={l} style={{ flex: v, background: c }} />)}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", fontSize: 12 }}>
                {stages.map(([l, v, c]) => (
                  <span key={l}><span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 4, background: c, marginRight: 6 }} />{l} <b style={{ fontFamily: T.fontMono }}>{hm(v)}</b></span>
                ))}
              </div>
            </div>
          )}
        </>
      ) : <div style={note}>No sleep tracked in the last two weeks. Wear the watch overnight and sync to see it here.</div>}
      <div style={card}>
        <div style={sec}><span>Last 14 nights</span><span style={{ textTransform: "none", letterSpacing: 0 }}>hours</span></div>
        <BarsSvg values={nights.map((d) => (byDate[d]?.sleep_seconds ? Math.round(byDate[d].sleep_seconds / 360) / 10 : null))}
                 labels={nights.map((d, i) => (i % 2 ? "" : weekdayLetter(d)))} max={10} color={T.violet} height={110} />
        <div style={note}>{tracked.length} of the last 14 nights tracked. Empty nights are shown, not skipped.</div>
      </div>
    </>
  );
}

function Activity({ byDate }) {
  const two = lastDays(14), week = lastDays(7);
  const goal = two.map((d) => byDate[d]?.step_goal).find(Boolean) || 10000;
  const steps = two.map((d) => byDate[d]?.steps || null);
  const withSteps = steps.filter(Boolean);
  const sum = (key) => week.reduce((t, d) => t + (byDate[d]?.summary?.[key] || 0), 0);
  const intensity = sum("moderateIntensityMinutes") + 2 * sum("vigorousIntensityMinutes");
  const bbDays = week.map((d) => byDate[d]?.body_battery);
  return (
    <>
      <Tiles color={T.teal} items={[
        ["Avg steps", withSteps.length ? Math.round(withSteps.reduce((a, b) => a + b, 0) / withSteps.length).toLocaleString("en-GB") : null],
        ["Intensity min", `${intensity}/150`],
        ["Active kcal", sum("activeKilocalories") ? Math.round(sum("activeKilocalories")).toLocaleString("en-GB") : null],
      ]} />
      <div style={card}>
        <div style={sec}><span>Steps per day</span><span style={{ textTransform: "none", letterSpacing: 0 }}>goal {goal.toLocaleString("en-GB")}</span></div>
        <BarsSvg values={steps} labels={two.map((d, i) => (i % 2 ? "" : weekdayLetter(d)))} goal={goal} color={T.teal} height={120}
                 format={(v) => `${Math.round(v / 100) / 10}k`} />
        <div style={note}>Dashed days had no data. Intensity minutes count vigorous minutes twice, like Garmin's weekly goal.</div>
      </div>
      <div style={card}>
        <div style={sec}><span>Body battery</span><span style={{ textTransform: "none", letterSpacing: 0 }}>high and low each day</span></div>
        <svg viewBox="0 0 340 110" width="100%" height={110}>
          {bbDays.map((b, i) => {
            const x = i * (340 / 7) + 12, y = (v) => 8 + (1 - v / 100) * 84;
            return (
              <g key={i}>
                {b ? <rect x={x} y={y(b.high)} width={22} height={Math.max(3, y(b.low) - y(b.high))} rx={5} fill={T.sky} opacity={0.85} />
                   : <rect x={x} y={56} width={22} height={36} rx={5} fill="none" stroke={T.borderStrong} strokeDasharray="3 3" />}
                {b && <text x={x + 11} y={y(b.high) - 3} fill={T.textMuted} fontSize={8.5} textAnchor="middle" fontFamily={T.fontMono}>{b.high}</text>}
                <text x={x + 11} y={108} fill={T.textDim} fontSize={9} textAnchor="middle" fontFamily={T.fontMono}>{weekdayLetter(week[i])}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div style={card}>
        <div style={sec}><span>Stress per day</span><span style={{ textTransform: "none", letterSpacing: 0 }}>0–100, lower is calmer</span></div>
        <BarsSvg values={week.map((d) => byDate[d]?.stress_avg ?? null)} labels={week.map(weekdayLetter)} max={100} color={T.orange} height={90} />
      </div>
    </>
  );
}

const navBtn = (off) => ({ width: 30, height: 30, borderRadius: 9999, background: T.elevated, border: `1px solid ${T.border}`, color: off ? T.textDim : T.text, cursor: off ? "default" : "pointer", fontSize: 15 });

function daysAgoIndex(iso) {
  return lastDays(30).indexOf(iso);
}
