// Shared by the Body today card and the health detail screens
const pad = (n) => String(n).padStart(2, "0");
export const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// The last n dates as "2026-10-27", oldest first
export function lastDays(n) {
  const today = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (n - 1 - i));
    return isoDay(d);
  });
}

export const hm = (secs) => (secs ? `${Math.floor(secs / 3600)}h ${pad(Math.round((secs % 3600) / 60))}m` : "—");
export const weekdayLetter = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { weekday: "narrow" });
export const dayMonth = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export function syncedAgo(iso) {
  if (!iso) return "not synced yet";
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
}

// A day the watch recorded something on
export const hasBodyData = (d) => !!(d && (d.steps || d.resting_hr || d.sleep_seconds || d.body_battery));

export function syncMessage(r) {
  if (r?.status === "still_syncing") return "Still bringing in your Garmin history, check back in a few minutes";
  const parts = [
    r?.activities_added ? `${r.activities_added} activit${r.activities_added === 1 ? "y" : "ies"}` : null,
    r?.linked ? `${r.linked} joined with your logs` : null,
    r?.health_days ? `${r.health_days} day${r.health_days === 1 ? "" : "s"} of health` : null,
  ].filter(Boolean);
  return parts.length ? `Garmin: ${parts.join(" · ")}` : "Garmin: nothing new";
}
