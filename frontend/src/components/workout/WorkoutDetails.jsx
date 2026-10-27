import { T } from "../../design/tokens";
import { fmtSecs } from "../../utils/workouts";

// Everything type-specific about a workout sits in workout.details, written by
// Claude through the connector (see mcp/server.py WORKOUT_DETAIL_ARGS). This
// renders whatever is there: units come from the key names, so new keys show
// up without an app change.

export function workoutStyle(type) {
  switch (type) {
    case "strength": return { color: T.teal, icon: "dumbbell" };
    case "hyrox":    return { color: T.violet, icon: "bolt" };
    case "crossfit": return { color: T.orange, icon: "flame" };
    case "bodypump": return { color: T.catSocial, icon: "dumbbell" };
    case "cycling":  return { color: T.sky, icon: "bike" };
    case "trx":      return { color: T.blue, icon: "workout" };
    case "running": case "walking": case "cardio": return { color: T.amber, icon: "run" };
    default:         return { color: T.teal, icon: "workout" };
  }
}


const LABELS = {
  tss: "TSS", ftp_w: "FTP", avg_hr: "Avg HR", max_hr: "Max HR", rpe_session: "Session RPE",
  avg_rpm: "Avg RPM", max_rpm: "Max RPM", elapsed_minutes: "Elapsed",
};
const UNITS = [
  [/_s_per_km$/, (v) => `${fmtSecs(v)} /km`], [/_s$/, fmtSecs], [/_minutes$/, (v) => `${v} min`],
  [/_kmh$/, (v) => `${v} km/h`], [/_km$/, (v) => `${v} km`], [/_m$/, (v) => `${v} m`], [/_cm$/, (v) => `${v} cm`],
  [/_kg$/, (v) => `${v} kg`], [/_w$/, (v) => `${v} W`], [/_spm$/, (v) => `${v} spm`], [/_rpm$/, (v) => `${v} rpm`],
  [/(^|_)hr$/, (v) => `${v} bpm`],
];
const UNIT_SUFFIX = /_(s_per_km|s|minutes|kmh|km|m|cm|kg|w|spm)$/;

export const labelFor = (k) => LABELS[k] || (k.replace(UNIT_SUFFIX, "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()));
export function fmtValue(k, v) {
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v !== "number") return String(v).replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  return (UNITS.find(([re]) => re.test(k))?.[1] || String)(v);
}

// Tiles across the top of the detail sheet: whatever the session has
export function summaryTiles(w) {
  const d = w.details || {};
  const exercises = w.exercises || [];
  const sets = exercises.reduce((s, e) => s + (e.sets?.length || 0), 0);
  const volume = exercises.reduce((s, e) => s + (e.sets || []).reduce((ss, x) => ss + (x.weight_kg || 0) * (x.reps || 0), 0), 0);
  return [
    ["Duration", `${w.duration_minutes || 0}m`],
    d.distance_km != null && ["Distance", `${d.distance_km} km`],
    d.avg_pace_s_per_km != null && ["Pace", `${fmtSecs(d.avg_pace_s_per_km)}/km`],
    d.total_time_s != null && ["Total", fmtSecs(d.total_time_s)],
    d.avg_hr != null && ["Avg HR", String(d.avg_hr)],
    sets > 0 && ["Sets", String(sets)],
    volume > 0 && ["Volume", `${Math.round(volume).toLocaleString()}kg`],
    (w.calories || w.calories_burned_est) && ["kcal", String(w.calories || w.calories_burned_est)],
  ].filter(Boolean).slice(0, 6);
}

// Keys shown in their own blocks (or the header and tiles), not in the metric list
const OWN_BLOCK = new Set([
  "name", "exercises", "total_volume_kg", "parts", "splits", "hr_zone_seconds", "source", "recording_note",
  "subtype", "location", "start_time", "distance_km", "avg_pace_s_per_km", "total_time_s", "avg_hr", "notes",
  "garmin_activity_type", "keep_apart_from", "link_suggestions",
]);

const sectionLabel = { fontSize: 11, fontWeight: 600, color: T.textMuted, letterSpacing: 0.8, textTransform: "uppercase" };
const card = { background: T.elevated, border: `1px solid ${T.border}`, borderRadius: T.rCard, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 };
const mono = { fontFamily: T.fontMono };
const chip = (color = T.textMuted) => ({ fontSize: 10, fontWeight: 600, color, border: `1px solid ${T.border}`, borderRadius: 6, padding: "2px 7px", whiteSpace: "nowrap" });

export function hasDetails(d) {
  return Object.entries(d || {}).some(([k, v]) => !["name", "exercises", "total_volume_kg"].includes(k) && v != null);
}

export default function WorkoutDetails({ workout, color }) {
  const d = workout.details || {};
  const metrics = Object.entries(d).filter(
    ([k, v]) => !OWN_BLOCK.has(k) && v !== "" && ["string", "number", "boolean"].includes(typeof v)
  );
  const parts = Array.isArray(d.parts) ? d.parts.filter((p) => p && typeof p === "object") : [];
  const splits = Array.isArray(d.splits) ? d.splits.filter((s) => s && typeof s === "object") : [];
  const sources = [].concat(d.source || []);

  return (
    <>
      {metrics.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {metrics.map(([k, v]) => (
            <div key={k} style={{ background: T.elevated, borderRadius: 10, padding: "8px 10px", minWidth: 0 }}>
              <div style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>{labelFor(k)}</div>
              <div style={{ fontSize: 13, color: T.text, fontWeight: 600, marginTop: 2, overflowWrap: "anywhere", ...(typeof v === "number" ? mono : {}) }}>{fmtValue(k, v)}</div>
            </div>
          ))}
        </div>
      )}

      {d.hr_zone_seconds && typeof d.hr_zone_seconds === "object" && <HrZones zones={d.hr_zone_seconds} />}
      {splits.length > 0 && <Splits splits={splits} color={color} />}
      {parts.map((p, i) => <Part key={i} part={p} index={i} color={color} />)}

      {(sources.length > 0 || d.recording_note) && (
        <div style={card}>
          <div style={sectionLabel}>Recorded with</div>
          {sources.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {sources.map((s) => <span key={s} style={{ ...chip(T.text), textTransform: "capitalize" }}>{String(s).replace(/_/g, " ")}</span>)}
            </div>
          )}
          {d.recording_note && <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.5 }}>{d.recording_note}</div>}
        </div>
      )}
    </>
  );
}

const ZONE_COLORS = { z1: T.textDim, z2: T.blue, z3: T.teal, z4: T.amber, z5: T.negative };

function HrZones({ zones }) {
  const list = Object.entries(zones).filter(([z, s]) => /^z\d$/.test(z) && typeof s === "number" && s > 0).sort();
  if (!list.length) return null;
  return (
    <div style={card}>
      <div style={{ ...sectionLabel, display: "flex", justifyContent: "space-between" }}>
        <span>Heart rate zones</span>
        {zones.zone_model && <span style={{ textTransform: "none", letterSpacing: 0, color: T.textDim }}>{zones.zone_model}</span>}
      </div>
      <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", gap: 2 }}>
        {list.map(([z, s]) => <div key={z} style={{ flex: s, background: ZONE_COLORS[z] || T.textMuted }} />)}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: 11, color: T.textMuted }}>
        {list.map(([z, s]) => (
          <span key={z}>
            <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 4, background: ZONE_COLORS[z] || T.textMuted, marginRight: 5 }} />
            {z.toUpperCase()} <span style={{ ...mono, color: T.text }}>{fmtSecs(s)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Splits({ splits, color }) {
  // Pace per split: given directly, or worked out from its time and length
  const pace = (s) => s.pace_s_per_km ?? (s.time_s && s.km ? s.time_s / (s.km % 1 || 1) : null);
  const fastest = Math.min(...splits.map(pace).filter((p) => p > 0));
  return (
    <div style={card}>
      <div style={sectionLabel}>Splits</div>
      {splits.map((s, i) => {
        const p = pace(s);
        return (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "34px 62px 1fr auto auto", gap: 8, alignItems: "center", fontSize: 12 }}>
            <span style={{ ...mono, color: T.textDim }}>{s.km ?? i + 1}</span>
            <span style={{ ...mono, fontWeight: 600, color: p === fastest ? T.teal : T.text }}>{p ? fmtSecs(p) : "—"}</span>
            <div style={{ height: 6, borderRadius: 3, background: T.surface, overflow: "hidden" }}>
              {p > 0 && <div style={{ width: `${Math.round((fastest / p) * 100)}%`, height: "100%", background: p === fastest ? T.teal : color }} />}
            </div>
            <span style={{ ...mono, color: T.textMuted, fontSize: 11 }}>{s.elev_delta_m != null ? `${s.elev_delta_m > 0 ? "+" : ""}${s.elev_delta_m} m` : ""}</span>
            <span style={{ ...mono, color: T.textMuted, fontSize: 11 }}>{s.avg_hr ? `${s.avg_hr} bpm` : ""}</span>
          </div>
        );
      })}
    </div>
  );
}

const ITEM_COLS = ["sets", "reps", "weight_kg", "distance_m", "time_s", "calories", "height_cm", "body_angle", "tempo", "side", "rpe"];
const ITEM_HEAD = { sets: "Sets", reps: "Reps", weight_kg: "Kg", distance_m: "Dist", time_s: "Time", calories: "Cal", height_cm: "cm", body_angle: "Angle", tempo: "Tempo", side: "Side", rpe: "RPE" };

function scoreText(sc) {
  if (sc.text) return sc.text;
  switch (sc.type) {
    case "time":        return sc.time_s != null ? fmtSecs(sc.time_s) : null;
    case "rounds_reps": return `${sc.rounds ?? 0} + ${sc.reps ?? 0}`;
    case "reps":        return sc.reps != null ? `${sc.reps} reps` : null;
    case "load":        return sc.load_kg != null ? `${sc.load_kg} kg` : null;
    case "distance":    return sc.distance_m != null ? `${sc.distance_m} m` : null;
    case "calories":    return sc.calories != null ? `${sc.calories} cal` : null;
    default:            return null;
  }
}

function Part({ part: p, index, color }) {
  const items = Array.isArray(p.items) ? p.items.filter((it) => it && typeof it === "object") : [];
  const cols = ITEM_COLS.filter((c) => items.some((it) => it[c] != null && it[c] !== ""));
  const score = p.score && typeof p.score === "object" ? scoreText(p.score) : null;
  const tags = [
    p.format && String(p.format).replace(/_/g, " ").toUpperCase(),
    p.time_cap_s != null && `${fmtSecs(p.time_cap_s)} cap`,
    p.rounds != null && `${p.rounds} rounds`,
    (p.work_s != null || p.rest_s != null) && `${p.work_s ?? "—"}s on / ${p.rest_s ?? "—"}s off`,
    p.time_s != null && fmtSecs(p.time_s),
  ].filter(Boolean);
  const rx = p.rx_level && String(p.rx_level).replace("_plus", "+").replace(/_/g, " ").toUpperCase();
  const rounds = Array.isArray(p.round_times_s) ? p.round_times_s : [];
  const letters = (s) => String(s || "").toLowerCase().replace(/[^a-z]/g, "");
  const showKind = p.kind && p.name && letters(p.kind) !== letters(p.name);   // skip "WOD / wod"

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 24, height: 24, borderRadius: 7, background: color + "22", color, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{index + 1}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{p.name || labelFor(p.kind || "part")}</div>
          {showKind && <div style={{ fontSize: 10, color: T.textDim, textTransform: "capitalize" }}>{String(p.kind).replace(/_/g, " ")}</div>}
        </div>
      </div>

      {(tags.length > 0 || rx) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {tags.map((t) => <span key={t} style={{ ...chip(), ...mono }}>{t}</span>)}
          {rx && <span style={{ ...chip("#0A0A0F"), background: color, borderColor: color }}>{rx}</span>}
        </div>
      )}

      {score && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 700 }}>Score</span>
          <span style={{ ...mono, fontSize: 22, fontWeight: 700, color }}>{score}</span>
        </div>
      )}

      {items.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: `minmax(0,1fr) ${cols.map(() => "auto").join(" ")}`, columnGap: 12, rowGap: 6, alignItems: "baseline" }}>
          <span />
          {cols.map((c) => <span key={c} style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, textAlign: "right" }}>{ITEM_HEAD[c]}</span>)}
          {items.map((it, i) => [
            <div key={`n${i}`} style={{ minWidth: 0, opacity: it.completed === false ? 0.45 : 1 }}>
              <div style={{ fontSize: 13, color: T.text, textDecoration: it.completed === false ? "line-through" : "none" }}>{it.name || "—"}</div>
              {(it.scaling || it.notes) && (
                <div style={{ fontSize: 10.5, color: it.scaling ? T.amber : T.textDim, marginTop: 1 }}>{[it.scaling && `Scaled: ${it.scaling}`, it.notes].filter(Boolean).join(" · ")}</div>
              )}
            </div>,
            ...cols.map((c) => (
              <span key={`${c}${i}`} style={{ ...mono, fontSize: 12, color: T.text, textAlign: "right", whiteSpace: "nowrap" }}>
                {it[c] == null || it[c] === "" ? "" : c === "time_s" ? fmtSecs(it[c]) : c === "distance_m" ? `${it[c]} m` : String(it[c])}
              </span>
            )),
          ])}
        </div>
      )}

      {rounds.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {rounds.map((s, i) => <span key={i} style={{ ...chip(T.text), ...mono }}>R{i + 1} {fmtSecs(s)}</span>)}
        </div>
      )}
      {p.notes && <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.5 }}>{p.notes}</div>}
    </div>
  );
}
