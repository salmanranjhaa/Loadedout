import { useState, useMemo } from "react";
import { T } from "../../design/tokens";
import { Icon } from "../../design/icons";
import { IllustratedEmptyState, SkeletonCard } from "../../design/components";

const FILTERS = ["all", "strength", "cardio", "hyrox", "running", "yoga"];

export default function WorkoutHistory({ history, loading, onSelect }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let data = [...history];
    if (filter !== "all") data = data.filter((w) => (w.workout_type || "strength") === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter(
        (w) =>
          (w.name || "").toLowerCase().includes(q) ||
          (w.exercises || []).some((e) => (e.name || "").toLowerCase().includes(q))
      );
    }
    return data.sort((a, b) => new Date(b.date || b.loggedAt) - new Date(a.date || a.loggedAt));
  }, [history, filter, search]);

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "0 20px" }}>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!filtered.length) {
    return (
      <IllustratedEmptyState
        variant="workout"
        action={
          <span style={{ fontSize: 12, color: T.textDim }}>
            {search || filter !== "all" ? "Try adjusting your filters." : "Log your first session to see history here."}
          </span>
        }
      />
    );
  }

  return (
    <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Search & filters */}
      <div style={{ display: "flex", gap: 8, flexDirection: "column" }}>
        <div style={{ position: "relative" }}>
          <Icon name="search" size={14} color={T.textDim} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workouts or exercises…"
            style={{
              width: "100%",
              background: T.elevated,
              border: `1px solid ${T.border}`,
              borderRadius: T.rInput,
              padding: "10px 12px 10px 32px",
              color: T.text,
              fontSize: 13,
              fontFamily: "inherit",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none" }}>
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                flexShrink: 0,
                padding: "5px 12px",
                borderRadius: 9999,
                background: filter === f ? T.teal : T.elevated,
                color: filter === f ? "#0A0A0F" : T.text,
                border: `1px solid ${filter === f ? T.teal : T.border}`,
                fontSize: 11,
                fontWeight: filter === f ? 700 : 500,
                cursor: "pointer",
                fontFamily: "inherit",
                textTransform: "capitalize",
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* History list */}
      {filtered.map((w) => {
        const type = w.workout_type || "strength";
        const borderColor = type === "hyrox" ? T.violet : type === "strength" ? T.teal : T.amber;
        const iconName = type === "strength" ? "dumbbell" : type === "hyrox" ? "bolt" : "run";
        const totalSets = (w.exercises || []).reduce((s, e) => s + (e.sets?.length || 0), 0);
        const totalVolume = (w.exercises || []).reduce(
          (s, e) => s + (e.sets || []).reduce((ss, set) => ss + (set.weight_kg || 0) * (set.reps || 0), 0),
          0
        );

        return (
          <div
            key={w.id || w.loggedAt}
            onClick={() => onSelect?.(w)}
            style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderLeft: `3px solid ${borderColor}`,
              borderRadius: T.rCard,
              padding: "14px 16px",
              cursor: "pointer",
              display: "flex",
              gap: 12,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: borderColor + "22",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon name={iconName} size={18} color={borderColor} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: T.text, textTransform: "capitalize" }}>
                  {w.name || type}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: borderColor,
                    background: borderColor + "22",
                    padding: "2px 8px",
                    borderRadius: 6,
                    textTransform: "uppercase",
                  }}
                >
                  {type}
                </span>
              </div>
              <div style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono, marginBottom: 8 }}>
                {(w.date || w.loggedAt || "").slice(0, 10)} · {w.duration_minutes || 0}m · {totalSets} sets
              </div>
              {totalVolume > 0 && (
                <div style={{ fontSize: 11, color: T.teal, fontFamily: T.fontMono, fontWeight: 600 }}>
                  {Math.round(totalVolume).toLocaleString()} kg volume
                </div>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                {(w.exercises || []).slice(0, 4).map((e) => (
                  <span
                    key={e.name}
                    style={{
                      fontSize: 10,
                      color: T.textMuted,
                      background: T.elevated,
                      border: `1px solid ${T.border}`,
                      borderRadius: 5,
                      padding: "2px 7px",
                    }}
                  >
                    {e.name}
                  </span>
                ))}
                {(w.exercises || []).length > 4 && (
                  <span style={{ fontSize: 10, color: T.textDim }}>+{(w.exercises || []).length - 4} more</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
