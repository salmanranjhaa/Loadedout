import { useState, useEffect } from "react";
import { T } from "../design/tokens";
import { Icon } from "../design/icons";
import { Card, Fab, PageHeader, PageScroll, SectionHead, EmptyState, LoadingDots } from "../design/components";
import { budgetAPI } from "../utils/api";
import { showToast } from "../utils/toast";
import CategoryDetailPage from "./details/CategoryDetailPage";

const EXPENSE_CATS = [
  { id: "food",      label: "Food",      color: T.amber,   icon: "meal"    },
  { id: "rent",      label: "Rent",      color: T.violet,  icon: "location" },
  { id: "transport", label: "Transport", color: T.teal,    icon: "bike"    },
  { id: "fitness",   label: "Fitness",   color: "#5C8FFC", icon: "dumbbell" },
  { id: "fun",       label: "Fun",       color: "#FC5C9E", icon: "heart"   },
  { id: "other",     label: "Other",     color: "#FC8B5C", icon: "pill"    },
];

const INCOME_CATS = [
  { id: "income",    label: "Income",    color: T.teal,    icon: "trend-up" },
  { id: "savings",   label: "Savings",   color: "#5C8FFC", icon: "shield"  },
];

const CATS = [...EXPENSE_CATS, ...INCOME_CATS];
const CAT_BUDGETS = { food: 400, rent: 1200, transport: 150, fitness: 80, fun: 200, other: 150 };

function getCat(id) { return CATS.find(c => c.id === id) || CATS[5]; }

const MOCK_SUMMARY = {
  income: 0, expenses: 0, net: 0,
  by_category: {},
  sparkline: [0, 0, 0, 0, 0, 0],
  week_bars: [0, 0, 0, 0, 0, 0, 0],
  week_avg: 0,
};

const MOCK_ENTRIES = [];

function groupByDate(entries) {
  const groups = {};
  for (const e of entries) {
    if (!groups[e.date]) groups[e.date] = [];
    groups[e.date].push(e);
  }
  return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
}

function DonutChart({ data, active, onSelect }) {
  const total = Object.values(data).reduce((s, v) => s + v, 0) || 1;
  const size = 120;
  const cx = size / 2;
  const cy = size / 2;
  const r = 44;
  const gap = 0.04;

  let offset = -Math.PI / 2;
  const slices = EXPENSE_CATS.map((cat) => {
    const val = data[cat.id] || 0;
    const pct = val / total;
    const angle = pct * 2 * Math.PI - gap;
    const slice = { cat, val, pct, startAngle: offset, endAngle: offset + angle };
    offset += pct * 2 * Math.PI;
    return slice;
  }).filter(s => s.val > 0);

  function arcPath(start, end) {
    if (Math.abs(end - start) < 0.001) return "";
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    const large = end - start > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={T.elevated2} strokeWidth={14} />
      {slices.map(s => (
        <path
          key={s.cat.id}
          d={arcPath(s.startAngle, s.endAngle)}
          fill="none"
          stroke={s.cat.color}
          strokeWidth={active === s.cat.id ? 18 : 14}
          strokeLinecap="round"
          style={{ cursor: "pointer", opacity: active && active !== s.cat.id ? 0.35 : 1, transition: "all 0.2s" }}
          onClick={() => onSelect(active === s.cat.id ? null : s.cat.id)}
        />
      ))}
      {active && (() => {
        const s = slices.find(sl => sl.cat.id === active);
        const cat = getCat(active);
        return s ? (
          <>
            <text x={cx} y={cy - 5} textAnchor="middle" fill={cat.color} fontSize="13" fontWeight="700" fontFamily={T.fontMono}>
              CHF {(s.val).toFixed(0)}
            </text>
            <text x={cx} y={cy + 10} textAnchor="middle" fill={T.textMuted} fontSize="9" fontFamily={T.fontFamily}>
              {(s.pct * 100).toFixed(0)}%
            </text>
          </>
        ) : null;
      })()}
    </svg>
  );
}

function SparklineSVG({ data }) {
  if (!data || data.length < 2) return null;
  const w = 200, h = 48;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * w,
    h - ((v - min) / range) * (h - 8) - 4,
  ]);
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ");
  const fill = `${path} L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={T.teal} stopOpacity="0.25" />
          <stop offset="100%" stopColor={T.teal} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill="url(#spark-fill)" />
      <path d={path} fill="none" stroke={T.teal} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WeekBarsChart({ bars, avg }) {
  const DAYS = ["M", "T", "W", "T", "F", "S", "S"];
  const max = Math.max(...bars, 1);
  const h = 72;
  const w = 280;
  const barW = 24;
  const gap = (w - DAYS.length * barW) / (DAYS.length - 1);
  const avgY = h - (avg / max) * h;

  return (
    <svg width={w} height={h + 20} viewBox={`0 0 ${w} ${h + 20}`}>
      <defs>
        <linearGradient id="bar-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={T.teal} stopOpacity="0.9" />
          <stop offset="100%" stopColor={T.teal} stopOpacity="0.3" />
        </linearGradient>
      </defs>
      {bars.map((v, i) => {
        const bh = Math.max((v / max) * h, 2);
        const x = i * (barW + gap);
        return (
          <g key={i}>
            <rect x={x} y={h - bh} width={barW} height={bh} rx={4} fill="url(#bar-grad)" />
            <text x={x + barW / 2} y={h + 14} textAnchor="middle" fill={T.textDim} fontSize="9" fontFamily={T.fontFamily}>{DAYS[i]}</text>
          </g>
        );
      })}
      {avg > 0 && (
        <>
          <line x1={0} y1={avgY} x2={w} y2={avgY} stroke={T.amber} strokeWidth={1} strokeDasharray="4 3" />
          <text x={w - 2} y={avgY - 3} textAnchor="end" fill={T.amber} fontSize="8" fontFamily={T.fontMono}>avg</text>
        </>
      )}
    </svg>
  );
}

// Unified add sheet — toggle between Expense and Income at the top
function AddEntrySheet({ onClose, onAdded }) {
  const [entryType, setEntryType] = useState("expense");
  const isIncome = entryType === "income";
  const cats = isIncome ? INCOME_CATS : EXPENSE_CATS;
  const [cat, setCat] = useState("food");
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [account, setAccount] = useState("");
  const [saving, setSaving] = useState(false);

  function switchType(t) {
    setEntryType(t);
    setCat(t === "income" ? "income" : "food");
    setDesc(""); setAccount("");
  }

  async function handleSave() {
    if (!amount || parseFloat(amount) <= 0) return;
    setSaving(true);
    try {
      const parts = [desc.trim(), isIncome && account.trim() ? `(${account.trim()})` : ""].filter(Boolean);
      await budgetAPI.add({
        amount: parseFloat(amount),
        category: cat,
        description: parts.join(" ") || null,
      });
      onAdded();
      onClose();
    } catch (e) { showToast(e?.message || "Failed to save", "error"); }
    setSaving(false);
  }

  const accentColor = isIncome ? T.teal : T.amber;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(2px)" }} />
      <div style={{ position: "relative", background: T.surface, borderRadius: "20px 20px 0 0", padding: "16px 20px 44px", border: `1px solid ${T.border}`, borderBottom: "none", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ width: 36, height: 4, borderRadius: 9999, background: T.border, margin: "0 auto 16px" }} />

        {/* Type toggle */}
        <div style={{ display: "flex", background: T.elevated, borderRadius: 12, padding: 4, marginBottom: 18, gap: 4 }}>
          {[{ id: "expense", label: "Expense", icon: "budget", color: T.amber }, { id: "income", label: "Income", icon: "trend-up", color: T.teal }].map(opt => (
            <button key={opt.id} onClick={() => switchType(opt.id)}
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 0", borderRadius: 9, background: entryType === opt.id ? opt.color : "transparent", border: "none", color: entryType === opt.id ? "#0A0A0F" : T.textMuted, fontSize: 13, fontWeight: entryType === opt.id ? 700 : 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
              <Icon name={opt.icon} size={14} color={entryType === opt.id ? "#0A0A0F" : T.textDim} />
              {opt.label}
            </button>
          ))}
        </div>

        {/* Amount — big centered input */}
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8 }}>Amount (CHF)</div>
          <input type="number" step="0.05" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" autoFocus
            style={{ width: "100%", background: T.elevated, border: `2px solid ${amount ? accentColor + "88" : T.border}`, borderRadius: 14, padding: "14px 0", fontSize: 32, fontWeight: 800, color: accentColor, fontFamily: T.fontMono, outline: "none", textAlign: "center", boxSizing: "border-box", transition: "border-color 0.15s" }} />
        </div>

        {/* Category */}
        <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8 }}>Category</div>
        <div style={{ display: "grid", gridTemplateColumns: isIncome ? "1fr 1fr" : "repeat(3,1fr)", gap: 8, marginBottom: 14 }}>
          {cats.map(c => (
            <button key={c.id} onClick={() => setCat(c.id)}
              style={{ padding: "10px 6px", borderRadius: 10, background: cat === c.id ? `${c.color}22` : T.elevated, border: `1.5px solid ${cat === c.id ? c.color : T.border}`, color: cat === c.id ? c.color : T.textMuted, fontSize: 11, fontWeight: cat === c.id ? 700 : 500, cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, transition: "all 0.15s" }}>
              <Icon name={c.icon} size={17} color={cat === c.id ? c.color : T.textDim} />
              {c.label}
            </button>
          ))}
        </div>

        {/* Description */}
        <input type="text" value={desc} onChange={e => setDesc(e.target.value)}
          placeholder={isIncome ? "Source (e.g. Monthly salary, Freelance)" : "Description (e.g. Lidl groceries)"}
          style={{ width: "100%", background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 13, color: T.text, fontFamily: "inherit", outline: "none", marginBottom: 8, boxSizing: "border-box" }} />

        {/* Bank account (income only) */}
        {isIncome && (
          <input type="text" value={account} onChange={e => setAccount(e.target.value)}
            placeholder="Bank / account (e.g. ZKB, Revolut)"
            style={{ width: "100%", background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 13, color: T.text, fontFamily: "inherit", outline: "none", marginBottom: 8, boxSizing: "border-box" }} />
        )}

        <div style={{ height: 12 }} />
        <button onClick={handleSave} disabled={saving || !amount || parseFloat(amount) <= 0}
          style={{ width: "100%", padding: "14px 0", background: !amount || parseFloat(amount) <= 0 ? T.elevated : accentColor, color: !amount || parseFloat(amount) <= 0 ? T.textMuted : "#0A0A0F", border: "none", borderRadius: 13, fontSize: 15, fontWeight: 700, cursor: saving || !amount ? "not-allowed" : "pointer", fontFamily: "inherit", transition: "background 0.15s" }}>
          {saving ? "Saving…" : isIncome ? "Add Income" : "Add Expense"}
        </button>
      </div>
    </div>
  );
}

export default function BudgetPage({ profile, onProfile }) {
  const [entries, setEntries] = useState(MOCK_ENTRIES);
  const [activeDonut, setActiveDonut] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const e = await budgetAPI.getAll("month");
        if (e?.entries) setEntries(e.entries);
      } catch {}
      setLoading(false);
    })();
  }, []);

  async function reload() {
    try {
      const e = await budgetAPI.getAll("month");
      if (e?.entries) setEntries(e.entries);
    } catch {}
  }

  // Separate income/savings from expenses
  const isIncomeEntry = e => e.category === "income" || e.category === "savings";
  const incomeEntries = entries.filter(isIncomeEntry);
  const expenseEntries = entries.filter(e => !isIncomeEntry(e));

  const totalIncome = incomeEntries.reduce((s, e) => s + e.amount, 0);
  const totalExpenses = expenseEntries.reduce((s, e) => s + e.amount, 0);
  const balance = totalIncome - totalExpenses;
  const savingsPct = totalIncome > 0 ? Math.round((balance / totalIncome) * 100) : 0;

  const catData = expenseEntries.reduce((acc, e) => { acc[e.category] = (acc[e.category] || 0) + e.amount; return acc; }, {});
  const totalExp = Object.values(catData).reduce((s, v) => s + v, 0) || 1;
  const grouped = groupByDate(entries);

  function fmtDate(d) {
    const dt = new Date(d + "T00:00:00");
    const today = new Date(); today.setHours(0,0,0,0);
    const diff = Math.round((today - dt) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    return dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: T.bg, position: "relative" }}>
      <PageHeader
        title="Budget"
        subtitle={`${new Date().toLocaleString("default",{month:"long"})} · ${new Date(new Date().getFullYear(),new Date().getMonth()+1,0).getDate()-new Date().getDate()} days remain`}
        profile={profile}
        onProfile={onProfile}
      />

      <PageScroll>
        {/* Balance hero card */}
        <div style={{ margin: "0 20px 14px", background: balance >= 0 ? `linear-gradient(135deg,${T.teal}18,${T.surface})` : `linear-gradient(135deg,${T.negative}18,${T.surface})`, border: `1px solid ${balance >= 0 ? T.teal + "33" : T.negative + "33"}`, borderRadius: T.rCard, padding: "20px 18px" }}>
          <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 }}>Balance this month</div>
          <div style={{ fontSize: 36, fontWeight: 800, fontFamily: T.fontMono, color: balance >= 0 ? T.teal : T.negative, letterSpacing: -1, lineHeight: 1, marginBottom: 4 }}>
            {balance >= 0 ? "+" : ""}CHF {Math.abs(balance).toFixed(2)}
          </div>
          {savingsPct > 0 && <div style={{ fontSize: 11, color: T.textMuted }}>{savingsPct}% saved this month</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 14 }}>
            {[
              { label: "Income", value: `CHF ${totalIncome.toFixed(0)}`, color: T.teal },
              { label: "Spent", value: `CHF ${totalExpenses.toFixed(0)}`, color: T.negative },
              { label: "Saved", value: `CHF ${Math.max(0, balance).toFixed(0)}`, color: "#5C8FFC" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: "rgba(10,10,15,0.3)", borderRadius: 10, padding: "8px 6px", textAlign: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color, fontFamily: T.fontMono }}>{value}</div>
                <div style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Donut + legend */}
        <div style={{ margin: "0 20px 16px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rCard, padding: "16px 18px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 14 }}>Spending by Category</div>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <DonutChart data={catData} active={activeDonut} onSelect={setActiveDonut} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
              {EXPENSE_CATS.map(cat => {
                const val = catData[cat.id] || 0;
                const pct = ((val / totalExp) * 100).toFixed(0);
                const isActive = activeDonut === cat.id;
                return (
                  <div key={cat.id} onClick={() => setActiveDonut(activeDonut === cat.id ? null : cat.id)} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", opacity: activeDonut && !isActive ? 0.4 : 1, transition: "opacity 0.15s" }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: cat.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, fontSize: 11, color: T.text, fontWeight: isActive ? 700 : 500 }}>{cat.label}</div>
                    <div style={{ fontSize: 10, color: T.textMuted, fontFamily: T.fontMono }}>{pct}%</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: cat.color, fontFamily: T.fontMono, minWidth: 44, textAlign: "right" }}>{val.toFixed(0)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Category progress tiles */}
        <div style={{ padding: "0 20px 16px" }}>
          <SectionHead title="Category budgets" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {EXPENSE_CATS.map(cat => {
              const spent = catData[cat.id] || 0;
              const budget = CAT_BUDGETS[cat.id] || 200;
              const pct = Math.min(spent / budget, 1);
              const over = spent > budget;
              return (
                <div key={cat.id} onClick={() => setSelectedCategory({ ...cat, spent, budget, txCount: Math.round(spent / 40) + 2 })} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 13px", cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: cat.color }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{cat.label}</span>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: over ? T.negative : T.text, fontFamily: T.fontMono, marginBottom: 2 }}>
                    CHF {spent.toFixed(0)} <span style={{ fontSize: 10, color: T.textMuted, fontWeight: 400 }}>/ {budget}</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 9999, background: T.elevated2, overflow: "hidden", marginTop: 6 }}>
                    <div style={{ width: `${pct * 100}%`, height: "100%", background: over ? T.negative : cat.color, borderRadius: 9999 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Week bar chart */}
        <div style={{ margin: "0 20px 16px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rCard, padding: "16px 18px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 14 }}>This Week</div>
          <WeekBarsChart bars={(() => {
            const DAYS_BACK = [6,5,4,3,2,1,0];
            const today = new Date();
            return DAYS_BACK.map(d => {
              const dt = new Date(today); dt.setDate(today.getDate() - d);
              const iso = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
              return expenseEntries.filter(e => e.date === iso).reduce((s, e) => s + e.amount, 0);
            });
          })()} avg={expenseEntries.length > 0 ? totalExpenses / 7 : 0} />
        </div>

        {/* Transaction history */}
        <div style={{ padding: "0 20px 24px" }}>
          <SectionHead title="Transactions" />
          {loading && <LoadingDots />}
          {!loading && grouped.length === 0 && (
            <EmptyState icon="budget" title="No transactions" subtitle="Tap + to log your first expense" />
          )}
          {grouped.map(([date, items]) => {
            const dayTotal = items.reduce((s, e) => s + e.amount, 0);
            return (
              <div key={date} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, letterSpacing: 0.3 }}>{fmtDate(date)}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.text, fontFamily: T.fontMono }}>CHF {dayTotal.toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {items.map(e => {
                    const cat = getCat(e.category);
                    return (
                      <div key={e.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: cat.color + "22", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Icon name={cat.icon} size={17} color={cat.color} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{e.description || cat.label}</div>
                          <div style={{ fontSize: 10, color: cat.color, background: cat.color + "18", borderRadius: 5, padding: "1px 6px", display: "inline-block", marginTop: 3, fontWeight: 600 }}>{cat.label}</div>
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: T.text, fontFamily: T.fontMono }}>CHF {e.amount.toFixed(2)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </PageScroll>

      <Fab onClick={() => setShowAdd(true)} icon="plus" color={T.amber} />
      {showAdd && <AddEntrySheet onClose={() => setShowAdd(false)} onAdded={reload} />}
      {selectedCategory && (
        <CategoryDetailPage
          category={selectedCategory}
          onBack={() => setSelectedCategory(null)}
        />
      )}
    </div>
  );
}
