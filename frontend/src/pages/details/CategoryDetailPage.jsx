import { T } from "../../design/tokens";
import { Icon } from "../../design/icons";
import { Card, DetailHeader, PageScroll } from "../../design/components";

function DailyBars({ days, color }) {
  const max = Math.max(...days.map((d) => d.total), 1);
  const w = 280;
  const h = 80;
  const barW = Math.max(4, Math.floor(w / days.length) - 3);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {days.map((d, i) => {
        const barH = d.total > 0 ? Math.max(4, (d.total / max) * (h - 10)) : 2;
        const x = i * (barW + 3);
        const y = h - barH;
        return (
          <rect key={i} x={x} y={y} width={barW} height={barH} rx={3}
            fill={d.total > 0 ? color : T.elevated2} />
        );
      })}
    </svg>
  );
}

export default function CategoryDetailPage({ category = {}, entries = [], onBack }) {
  const {
    label,
    name = label || "Category",
    icon = "budget",
    color = T.teal,
    budget = 0,
  } = category;

  const sorted = [...entries].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const spent = sorted.reduce((s, e) => s + (e.amount || 0), 0);
  const txCount = sorted.length;
  const avgTx = txCount ? spent / txCount : 0;
  const pct = budget > 0 ? spent / budget : 0;
  const remaining = budget - spent;
  const over = budget > 0 && remaining < 0;

  const monthLabel = new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" });

  // Daily totals across the current month, from real entries
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const prefix = new Date().toISOString().slice(0, 8); // "YYYY-MM-"
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const key = `${prefix.slice(0, 8)}${String(i + 1).padStart(2, "0")}`;
    return { day: i + 1, total: sorted.filter((e) => (e.date || "").slice(0, 10) === key).reduce((s, e) => s + (e.amount || 0), 0) };
  });

  return (
    <div
      style={{
        position: "absolute", inset: 0, zIndex: 10,
        background: T.bg, display: "flex", flexDirection: "column",
        animation: "lo-slide-in 0.25s cubic-bezier(0.32,0.72,0,1) forwards",
      }}
    >
      <DetailHeader
        onBack={onBack}
        title={name}
        subtitle={`${txCount} transaction${txCount !== 1 ? "s" : ""} this month`}
      />

      <PageScroll padBottom={40}>
        {/* Hero stats */}
        <div style={{ padding: "0 16px 16px" }}>
          <div style={{
            borderRadius: 18, padding: 20,
            background: `linear-gradient(135deg, ${color}22, ${color}08)`,
            border: `1px solid ${color}33`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: budget > 0 ? 16 : 0 }}>
              <div style={{ width: 44, height: 44, borderRadius: 14, background: color + "22", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name={icon} size={22} color={color} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontFamily: T.fontMono, color: color, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700 }}>
                  {name} · {monthLabel}
                </div>
                <div style={{ fontSize: 30, fontWeight: 800, color: T.text, letterSpacing: -1, fontFamily: T.fontMono, marginTop: 2 }}>
                  CHF {spent.toFixed(0)}
                  {budget > 0 && (
                    <span style={{ fontSize: 14, fontWeight: 500, color: T.textMuted, letterSpacing: 0 }}> / {budget}</span>
                  )}
                </div>
              </div>
            </div>

            {budget > 0 && (
              <>
                <div style={{ height: 6, borderRadius: 9999, background: T.elevated2, overflow: "hidden", marginBottom: 12 }}>
                  <div style={{
                    width: `${Math.min(pct * 100, 100)}%`, height: "100%",
                    background: over ? T.negative : color, borderRadius: 9999,
                    transition: "width 0.6s cubic-bezier(0.34,1.56,0.64,1)",
                  }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 12, color: T.textMuted }}>
                    {over
                      ? <span style={{ color: T.negative, fontWeight: 600 }}>CHF {Math.abs(remaining).toFixed(0)} over budget</span>
                      : <span>CHF {remaining.toFixed(0)} remaining</span>
                    }
                  </div>
                  <div style={{ fontSize: 12, fontFamily: T.fontMono, color: over ? T.negative : color, fontWeight: 600 }}>
                    {Math.round(pct * 100)}%
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Stat row */}
        <div style={{ padding: "0 16px 20px", display: "flex", gap: 8 }}>
          {[
            { label: "Total", value: `CHF ${spent.toFixed(0)}` },
            { label: "Transactions", value: txCount },
            { label: "Avg / tx", value: `CHF ${avgTx.toFixed(0)}` },
          ].map(({ label: l, value }) => (
            <div key={l} style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "10px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: T.fontMono, color: T.text }}>{value}</div>
              <div style={{ fontSize: 9, color: T.textDim, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 600, marginTop: 3 }}>{l}</div>
            </div>
          ))}
        </div>

        {/* Daily spend chart */}
        {spent > 0 && (
          <div style={{ padding: "0 16px 20px" }}>
            <Card style={{ padding: 16 }}>
              <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 12 }}>
                Day-by-day · this month
              </div>
              <DailyBars days={days} color={color} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                <span style={{ fontSize: 9, color: T.textDim, fontFamily: T.fontMono }}>1st</span>
                <span style={{ fontSize: 9, color: T.textDim, fontFamily: T.fontMono }}>{daysInMonth}th</span>
              </div>
            </Card>
          </div>
        )}

        {/* Transactions */}
        <div style={{ padding: "0 16px 20px", display: "flex", flexDirection: "column", gap: 6 }}>
          {sorted.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: T.textDim, fontSize: 13 }}>
              No transactions in this category yet.
            </div>
          ) : (
            sorted.map((tx) => (
              <Card key={tx.id} style={{ padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: color + "22", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon name={icon} size={17} color={color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{tx.description || name}</div>
                    <div style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, marginTop: 2 }}>{(tx.date || "").slice(0, 10)}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: T.fontMono, color: T.text }}>
                    -CHF {(tx.amount || 0).toFixed(2)}
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </PageScroll>
    </div>
  );
}
