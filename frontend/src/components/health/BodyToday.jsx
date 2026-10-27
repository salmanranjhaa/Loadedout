import { useEffect, useRef, useState } from "react";
import { T } from "../../design/tokens";
import { Icon } from "../../design/icons";
import { Spinner } from "../../design/components";
import { garminAPI, healthAPI } from "../../utils/api";
import { showToast } from "../../utils/toast";
import { fmtDay } from "../../utils/budget";
import { BarsSvg, LineSvg } from "./charts";
import HealthDetail from "./HealthDetail";
import { hasBodyData, hm, isoDay, lastDays, syncMessage, syncedAgo, weekdayLetter } from "./health";

const tile = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rCard, padding: "10px 12px", cursor: "pointer", minWidth: 0, textAlign: "left", fontFamily: "inherit" };
const label = { fontSize: 9, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 700 };
const big = { fontSize: 20, fontWeight: 700, fontFamily: T.fontMono, marginTop: 3 };
const small = { fontSize: 10, color: T.textDim, marginTop: 2 };

// Steps, heart rate, body battery and sleep from Garmin at the top of the Fitness tab
export default function BodyToday({ onSynced }) {
  const [status, setStatus] = useState(null);
  const [days, setDays] = useState([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);       // "heart" | "sleep" | "activity"
  const poll = useRef(null);

  async function load() {
    const range = lastDays(30);
    const [s, h] = await Promise.all([garminAPI.status(), healthAPI.days(range[0], range[29])]);
    setStatus(s);
    setDays(h?.days || []);
    return s;
  }

  useEffect(() => {
    load().catch(() => {});
    return () => clearInterval(poll.current);
  }, []);

  // A sync started elsewhere (first connection, schedule): refresh when it ends
  useEffect(() => {
    clearInterval(poll.current);
    if (status?.syncing) {
      poll.current = setInterval(async () => {
        const s = await load().catch(() => null);
        if (s && !s.syncing) { clearInterval(poll.current); onSynced?.(); }
      }, 8000);
    }
  }, [status?.syncing]);

  async function sync() {
    setBusy(true);
    try {
      showToast(syncMessage(await garminAPI.sync()), "success");
      await load();
      onSynced?.();
    } catch (e) {
      showToast(e?.message || "Garmin sync failed", "error");
      load().catch(() => {});
    }
    setBusy(false);
  }

  if (!status || status.settings?.enabled === false) return null;
  if (!status.connected) {
    return (
      <div style={{ margin: "0 20px 16px", padding: "12px 14px", background: T.surface, border: `1px dashed ${T.borderStrong}`, borderRadius: T.rCard, fontSize: 12, color: T.textMuted, lineHeight: 1.5 }}>
        <b style={{ color: T.text }}>Connect Garmin</b> to see steps, heart rate and sleep here, and get your runs with their route. Add your key under Profile → Connected services → Garmin.
      </div>
    );
  }

  const byDate = Object.fromEntries(days.map((d) => [d.date, d]));
  const todayIso = isoDay(new Date());
  const latest = [...days].reverse().find(hasBodyData);
  const shown = hasBodyData(byDate[todayIso]) ? byDate[todayIso] : latest;
  const yesterday = lastDays(2)[0];
  const lastNight = [todayIso, yesterday].map((d) => byDate[d]).find((d) => d?.sleep_seconds);
  const week = lastDays(7);
  const hr = shown?.heart_rate?.samples || [];
  const bb = shown?.body_battery;
  const pct = shown?.steps && shown?.step_goal ? Math.min(1, shown.steps / shown.step_goal) : 0;
  const stale = status.status === "key_error";

  return (
    <div style={{ padding: "0 20px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, letterSpacing: 1.2, textTransform: "uppercase" }}>
            Body {shown && shown.date !== todayIso ? `· ${fmtDay(shown.date)}` : "today"}
          </div>
          <div style={{ fontSize: 10.5, color: stale ? T.negative : T.textDim, marginTop: 2 }}>
            {stale ? "Garmin needs a new key (Profile → Full settings → Garmin)" : `Garmin ${status.syncing ? "syncing…" : `synced ${syncedAgo(status.last_sync_at)}`}`}
          </div>
        </div>
        <button onClick={sync} disabled={busy || status.syncing} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 11px", background: "transparent", border: `1px solid ${T.sky}66`, borderRadius: 9999, color: T.sky, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          {busy || status.syncing ? <Spinner size={12} color={T.sky} /> : <Icon name="sync" size={13} color={T.sky} />} Sync
        </button>
      </div>

      {!shown ? (
        <div style={{ padding: "14px", background: T.surface, border: `1px dashed ${T.borderStrong}`, borderRadius: T.rCard, fontSize: 12, color: T.textMuted }}>
          No watch data in the last 30 days yet. Wear the watch during the day and sync.
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button style={tile} onClick={() => setOpen("activity")}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <svg width="42" height="42" viewBox="0 0 42 42" style={{ flexShrink: 0 }}>
                  <circle cx="21" cy="21" r="17" fill="none" stroke={T.elevated2} strokeWidth="5" />
                  <circle cx="21" cy="21" r="17" fill="none" stroke={T.teal} strokeWidth="5" strokeLinecap="round"
                          strokeDasharray={`${(pct * 106.8).toFixed(1)} 106.8`} transform="rotate(-90 21 21)" />
                </svg>
                <div style={{ minWidth: 0 }}>
                  <div style={label}>Steps</div>
                  <div style={{ ...big, fontSize: 17, color: T.text }}>{shown.steps != null ? shown.steps.toLocaleString("en-GB") : "—"}</div>
                  {shown.step_goal ? <div style={small}>of {shown.step_goal.toLocaleString("en-GB")}</div> : null}
                </div>
              </div>
            </button>
            <button style={tile} onClick={() => setOpen("heart")}>
              <div style={label}>Resting HR</div>
              <div style={{ ...big, color: T.negative }}>{shown.resting_hr ?? "—"}<span style={{ fontSize: 10, color: T.textMuted }}> bpm</span></div>
              {shown.heart_rate?.resting_7d ? <div style={small}>7-day avg {shown.heart_rate.resting_7d}</div> : null}
            </button>
            <button style={tile} onClick={() => setOpen("activity")}>
              <div style={label}>Body battery</div>
              <div style={{ ...big, color: T.sky }}>{bb ? bb.high : "—"}</div>
              {bb ? <div style={small}>high {bb.high} · low {bb.low}</div> : <div style={small}>not measured</div>}
            </button>
            <button style={{ ...tile, ...(lastNight ? {} : { background: "transparent", borderStyle: "dashed", borderColor: T.borderStrong }) }} onClick={() => setOpen("sleep")}>
              <div style={label}>Sleep</div>
              {lastNight
                ? <><div style={{ ...big, color: T.violet }}>{hm(lastNight.sleep_seconds)}</div><div style={small}>last night</div></>
                : <><div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginTop: 5 }}>Not tracked</div><div style={small}>wear the watch overnight</div></>}
            </button>
          </div>

          {hr.length > 1 && (
            <button onClick={() => setOpen("heart")} style={{ ...tile, width: "100%", marginTop: 8 }}>
              <div style={{ ...label, display: "flex", justifyContent: "space-between" }}><span>Heart rate {shown.date === todayIso ? "today" : fmtDay(shown.date)}</span><span style={{ textTransform: "none", letterSpacing: 0 }}>{shown.heart_rate.min}–{shown.heart_rate.max} bpm</span></div>
              <LineSvg points={hr} xMax={1440} yMin={40} yMax={Math.max(120, shown.heart_rate.max || 0)} color={T.negative} height={56} gap={20} />
            </button>
          )}

          <button onClick={() => setOpen("activity")} style={{ ...tile, width: "100%", marginTop: 8 }}>
            <div style={{ ...label, display: "flex", justifyContent: "space-between" }}><span>Steps this week</span><span style={{ textTransform: "none", letterSpacing: 0 }}>dashed = no data</span></div>
            <BarsSvg values={week.map((d) => byDate[d]?.steps || null)} labels={week.map(weekdayLetter)} goal={shown.step_goal || 10000}
                     color={T.teal} height={78} format={(v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : v)} />
          </button>
        </>
      )}

      {open && <HealthDetail tab={open} days={days} onTab={setOpen} onClose={() => setOpen(null)} />}
    </div>
  );
}
