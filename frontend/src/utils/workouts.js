// Live sessions are saved twice: to the server and to a local copy
// (lo_workout_history) used offline and for "last time" suggestions. Merge the
// two without counting a workout twice: drop local copies that already exist
// server-side (same day, server notes lead with the session name).
export function mergeWorkoutHistory(apiLogs, localHistory) {
  const localOnly = localHistory.filter((l) => {
    const lDate = (l.date || l.loggedAt || "").slice(0, 10);
    return !apiLogs.some((a) =>
      (a.date || "").slice(0, 10) === lDate &&
      (a.notes || "").startsWith(l.name || "")
    );
  });
  return [...apiLogs, ...localOnly];
}
