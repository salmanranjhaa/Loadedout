// Small date helpers for the chat history sidebar: human "2 hours ago" labels
// and Today / Yesterday / This Week / Earlier bucketing.

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** I render an ISO/Date as a compact relative time, e.g. "just now", "2h ago". */
export function relativeTime(value) {
  if (!value) return "";
  const then = value instanceof Date ? value : new Date(value);
  const ms = Date.now() - then.getTime();
  if (Number.isNaN(ms)) return "";
  if (ms < MIN) return "just now";
  if (ms < HOUR) {
    const m = Math.floor(ms / MIN);
    return `${m}m ago`;
  }
  if (ms < DAY) {
    const h = Math.floor(ms / HOUR);
    return `${h}h ago`;
  }
  const d = Math.floor(ms / DAY);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** I return which sidebar bucket a date falls into. */
export function dateBucket(value) {
  if (!value) return "Earlier";
  const then = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(then.getTime())) return "Earlier";

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday.getTime() - DAY);
  const startOfWeek = new Date(startOfToday.getTime() - 6 * DAY); // last 7 days incl. today

  if (then >= startOfToday) return "Today";
  if (then >= startOfYesterday) return "Yesterday";
  if (then >= startOfWeek) return "This Week";
  return "Earlier";
}

export const BUCKET_ORDER = ["Today", "Yesterday", "This Week", "Earlier"];

/**
 * I group sessions (each with created_at/updated_at) into ordered buckets.
 * Returns [{ label, items }] in BUCKET_ORDER, skipping empty buckets.
 */
export function groupByBucket(sessions, dateKey = "updated_at") {
  const buckets = {};
  for (const s of sessions) {
    const label = dateBucket(s[dateKey] || s.created_at);
    (buckets[label] ||= []).push(s);
  }
  return BUCKET_ORDER
    .filter((label) => buckets[label]?.length)
    .map((label) => ({ label, items: buckets[label] }));
}
