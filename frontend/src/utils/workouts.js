// Live sessions are saved twice: to the server and to a local copy
// (lo_workout_history) used offline and for "last time" suggestions. A local
// copy belongs to a server log when it is from the same day and the server
// notes lead with the session name.
// ponytail: two same-name sessions on one day match each other's copies; store
// the server id on the local copy if that ever matters.
const isLocalCopyOf = (local, apiLog) =>
  (local.date || local.loggedAt || "").slice(0, 10) === (apiLog.date || "").slice(0, 10) &&
  (apiLog.notes || "").startsWith(local.name || "");

// Merge the two without counting a workout twice.
export function mergeWorkoutHistory(apiLogs, localHistory) {
  const localOnly = localHistory.filter((l) => !apiLogs.some((a) => isLocalCopyOf(l, a)));
  return [...apiLogs, ...localOnly];
}

// After editing (`changes`) or deleting (`changes` = null) a workout from the
// history list, bring its local copy along. Otherwise a renamed, moved or
// deleted server log would let the stale local copy reappear in the list.
export function replaceLocalCopy(workout, changes) {
  try {
    const local = JSON.parse(localStorage.getItem("lo_workout_history") || "[]");
    const same = (l) => (workout.id ? isLocalCopyOf(l, workout) : l.loggedAt === workout.loggedAt);
    const next = local.flatMap((l) => (!same(l) ? [l] : changes ? [{ ...l, ...changes }] : []));
    localStorage.setItem("lo_workout_history", JSON.stringify(next));
  } catch {}
}
