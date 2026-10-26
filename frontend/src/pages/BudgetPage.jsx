import { useState, useEffect } from "react";
import { T } from "../design/tokens";
import { Icon } from "../design/icons";
import { BottomSheet, Card, Fab, PageHeader, PageScroll, SectionHead, EmptyState, LoadingDots } from "../design/components";
import { budgetAPI } from "../utils/api";
import { showToast } from "../utils/toast";
import CategoryDetailPage from "./details/CategoryDetailPage";
import AccountDetailPage, { AccountForm } from "./details/AccountDetailPage";
import BudgetEntrySheet from "./details/BudgetEntrySheet";
import {
  EXPENSE_CATS, accountIcon, accountKindLabel, fmtDay, getCat, isInflow, isScheduled, isSpending, isTransfer,
  money, monthLabel, monthOf, shiftMonth, todayISO,
} from "../utils/budget";

const sum = list => list.reduce((s, e) => s + e.amount, 0);

function groupByDate(entries) {
  const groups = {};
  for (const e of entries) {
    if (!groups[e.date]) groups[e.date] = [];
    groups[e.date].push(e);
  }
  return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
}

function DonutChart({ data, active, onSelect, cur }) {
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
              {cur} {(s.val).toFixed(0)}
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

function WeekBarsChart({ bars, labels, avg }) {
  const max = Math.max(...bars, 1);
  const h = 72;
  const w = 280;
  const barW = 24;
  const gap = (w - bars.length * barW) / (bars.length - 1);
  const avgY = h - (avg / max) * h;

  return (
    <svg width={w} height={h + 20} viewBox={`0 0 ${w} ${h + 20}`}>
      <defs>
        <linearGradient id="bar-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={T.green} stopOpacity="0.9" />
          <stop offset="100%" stopColor={T.green} stopOpacity="0.3" />
        </linearGradient>
      </defs>
      {bars.map((v, i) => {
        const bh = Math.max((v / max) * h, 2);
        const x = i * (barW + gap);
        return (
          <g key={i}>
            <rect x={x} y={h - bh} width={barW} height={bh} rx={4} fill="url(#bar-grad)" />
            <text x={x + barW / 2} y={h + 14} textAnchor="middle" fill={T.textDim} fontSize="9" fontFamily={T.fontFamily}>{labels[i]}</text>
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

// Income and spending per month; tapping a month opens it
function MonthBars({ months, selected, onSelect }) {
  const max = Math.max(...months.flatMap(m => [m.income, m.spent]), 1);
  const h = 64;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4 }}>
      {months.map(m => {
        const on = m.key === selected;
        return (
          <button key={m.key} onClick={() => onSelect(m.key)} aria-pressed={on} aria-label={`${monthLabel(m.key)}: income ${m.income.toFixed(0)}, spent ${m.spent.toFixed(0)}`}
            style={{ flex: 1, minWidth: 0, background: on ? T.elevated : "transparent", border: `1px solid ${on ? T.border : "transparent"}`, borderRadius: 10, padding: "8px 0 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, cursor: "pointer", fontFamily: "inherit" }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: h }}>
              <div style={{ width: 9, height: Math.max(2, (m.income / max) * h), background: T.teal, borderRadius: 3, opacity: on ? 1 : 0.7 }} />
              <div style={{ width: 9, height: Math.max(2, (m.spent / max) * h), background: T.amber, borderRadius: 3, opacity: on ? 1 : 0.7 }} />
            </div>
            <div style={{ fontSize: 10, color: on ? T.text : T.textDim, fontWeight: on ? 700 : 500 }}>{monthLabel(m.key, { month: "short" })}</div>
          </button>
        );
      })}
    </div>
  );
}

function Stat({ label, value, color = T.text }) {
  return (
    <div style={{ flex: 1, minWidth: 0, background: "rgba(10,11,16,0.3)", borderRadius: 10, padding: "8px 6px", textAlign: "center" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color, fontFamily: T.fontMono, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
      <div style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 2 }}>{label}</div>
    </div>
  );
}

export default function BudgetPage({ profile, onProfile }) {
  const cur = profile?.preferred_currency || "CHF";
  const today = todayISO();
  const thisMonth = monthOf(today);
  const [entries, setEntries] = useState([]);
  const [totals, setTotals] = useState({ accounts: [], net_worth: 0, net_worth_projected: 0, card_to_pay: 0 });
  const [limits, setLimits] = useState({});
  const [month, setMonth] = useState(thisMonth);
  const [loading, setLoading] = useState(true);
  const [activeDonut, setActiveDonut] = useState(null);
  const [sheet, setSheet] = useState(null);             // { entry } to edit, { preset } to add
  const [openAccountId, setOpenAccountId] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [addingAccount, setAddingAccount] = useState(false);

  async function reload() {
    try {
      const [e, a, l] = await Promise.all([budgetAPI.getAll("all"), budgetAPI.accounts(), budgetAPI.limits()]);
      if (e?.entries) setEntries(e.entries);
      if (a?.accounts) setTotals(a);
      if (l?.limits) setLimits(l.limits);
    } catch {}
  }

  useEffect(() => { reload().finally(() => setLoading(false)); }, []);

  const { accounts } = totals;
  const names = Object.fromEntries(accounts.map(a => [a.id, a.name]));
  const openAccount = accounts.find(a => a.id === openAccountId);
  const banks = accounts.filter(a => a.kind !== "credit_card");
  const inBanks = banks.reduce((s, a) => s + a.balance, 0);
  const cardsOwe = totals.card_to_pay;
  const scheduled = entries.filter(isScheduled).sort((a, b) => a.date.localeCompare(b.date));

  // The month being looked at
  const monthEntries = entries.filter(e => monthOf(e.date) === month);
  const spending = monthEntries.filter(isSpending);
  const income = sum(monthEntries.filter(e => e.category === "income"));
  const spent = sum(spending);
  const catData = spending.reduce((acc, e) => { acc[e.category] = (acc[e.category] || 0) + e.amount; return acc; }, {});
  const totalExp = Object.values(catData).reduce((s, v) => s + v, 0) || 1;
  const grouped = groupByDate(monthEntries);
  const firstMonth = entries.length ? monthOf(entries[entries.length - 1].date) : thisMonth;
  const lastMonth = entries.length && monthOf(entries[0].date) > thisMonth ? monthOf(entries[0].date) : thisMonth;
  const chartEnd = month > thisMonth ? month : thisMonth;
  // The total across accounts when the month began and at its end (today for
  // this month): income in minus spending out; transfers don't change it
  const openingTotal = accounts.reduce((s, a) => s + (a.opening_balance || 0), 0);
  const totalBefore = cutoff => openingTotal + entries.filter(e => e.date < cutoff)
    .reduce((s, e) => s + (isInflow(e) ? e.amount : isSpending(e) ? -e.amount : 0), 0);
  const monthStartTotal = totalBefore(`${month}-01`);
  const monthEndTotal = month === thisMonth ? totals.net_worth : totalBefore(`${shiftMonth(month, 1)}-01`);
  const history = Array.from({ length: 6 }, (_, i) => shiftMonth(chartEnd, i - 5)).map(key => {
    const list = entries.filter(e => monthOf(e.date) === key);
    return { key, income: sum(list.filter(e => e.category === "income")), spent: sum(list.filter(isSpending)) };
  });

  async function saveBudget(catId, value) {
    try {
      const r = await budgetAPI.setLimits({ [catId]: value });
      if (r?.limits) setLimits(r.limits);
      setSelectedCategory(c => c && { ...c, budget: value });
      showToast(value > 0 ? "Budget saved" : "Budget removed", "success");
      return true;
    } catch (e) { showToast(e?.message || "Couldn't save the budget", "error"); return false; }
  }

  const accountLine = e => (isTransfer(e) ? `${names[e.account_id] || "?"} → ${names[e.to_account_id] || "?"}` : names[e.account_id]);
  const overlayOpen = !!(openAccount || selectedCategory);

  function EntryRow({ e }) {
    const cat = getCat(e.category);
    const inflow = isInflow(e);
    return (
      <div role="button" tabIndex={0} aria-label={`Edit ${e.description || cat.label}`}
        onClick={() => setSheet({ entry: e })} onKeyDown={(ev) => ev.key === "Enter" && setSheet({ entry: e })}
        style={{ background: T.surface, border: `1px solid ${isScheduled(e) ? T.violet + "55" : T.border}`, borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: cat.color + "22", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon name={cat.icon} size={17} color={cat.color} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {e.description || cat.label}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 3 }}>
            <span style={{ fontSize: 10, color: cat.color, background: cat.color + "18", borderRadius: 5, padding: "1px 6px", fontWeight: 600 }}>{cat.label}</span>
            {accountLine(e) && <span style={{ fontSize: 10, color: T.textMuted, background: T.elevated, borderRadius: 5, padding: "1px 6px", fontWeight: 600 }}>{accountLine(e)}</span>}
            {isScheduled(e) && <span style={{ fontSize: 10, color: T.violet, background: T.violet + "18", borderRadius: 5, padding: "1px 6px", fontWeight: 600 }}>Scheduled</span>}
          </div>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: inflow ? T.teal : isTransfer(e) ? T.violet : T.text, fontFamily: T.fontMono, whiteSpace: "nowrap" }}>
          {inflow ? "+" : ""}{money(cur, e.amount)}
        </div>
        <Icon name="chev-right" size={14} color={T.textDim} />
      </div>
    );
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
        {/* Everything together: what the banks hold minus what the cards owe */}
        <div style={{ margin: "0 20px 14px", background: totals.net_worth >= 0 ? `linear-gradient(135deg,${T.teal}18,${T.surface})` : `linear-gradient(135deg,${T.negative}18,${T.surface})`, border: `1px solid ${totals.net_worth >= 0 ? T.teal + "33" : T.negative + "33"}`, borderRadius: T.rCard, padding: "20px 18px" }}>
          <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 }}>Total across your accounts</div>
          <div style={{ fontSize: 36, fontWeight: 800, fontFamily: T.fontMono, color: totals.net_worth >= 0 ? T.teal : T.negative, letterSpacing: -1, lineHeight: 1, marginBottom: 4 }}>
            {money(cur, totals.net_worth)}
          </div>
          {totals.net_worth_projected !== totals.net_worth && (
            <div style={{ fontSize: 11, color: T.textMuted }}>After scheduled entries: {money(cur, totals.net_worth_projected)}</div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14 }}>
            <Stat label="In the bank" value={money(cur, inBanks, { digits: 0 })} />
            <span style={{ color: T.textDim, fontSize: 14 }}>−</span>
            <Stat label="Cards owe" value={money(cur, cardsOwe, { digits: 0 })} color={cardsOwe > 0 ? T.amber : T.textMuted} />
            <span style={{ color: T.textDim, fontSize: 14 }}>=</span>
            <Stat label="Total" value={money(cur, totals.net_worth, { digits: 0 })} color={totals.net_worth >= 0 ? T.teal : T.negative} />
          </div>
        </div>

        {/* Accounts */}
        <div style={{ padding: "0 20px 16px" }}>
          <SectionHead title="Accounts" trailing={
            <button onClick={() => setAddingAccount(true)} style={{ display: "flex", alignItems: "center", gap: 4, background: "transparent", border: "none", color: T.teal, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
              <Icon name="plus" size={13} color={T.teal} /> Add
            </button>
          } />
          {!loading && accounts.length === 0 && (
            <Card style={{ padding: 16, textAlign: "center" }} onClick={() => setAddingAccount(true)}>
              <div style={{ fontSize: 13, color: T.text, fontWeight: 600, marginBottom: 4 }}>Add your bank accounts and cards</div>
              <div style={{ fontSize: 12, color: T.textMuted }}>Then you see what each one holds, what the cards owe and the total.</div>
            </Card>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {accounts.map(a => {
              const isCard = a.kind === "credit_card";
              const color = a.balance < 0 ? T.negative : isCard ? T.textMuted : T.teal;
              return (
                <Card key={a.id} style={{ padding: "12px 14px" }} onClick={() => setOpenAccountId(a.id)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 11, background: color + "1F", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icon name={accountIcon(a)} size={18} color={color} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{a.name}</div>
                      <div style={{ fontSize: 10, color: T.textDim, marginTop: 2 }}>
                        {accountKindLabel(a)}{a.projected !== a.balance ? ` · ${money(cur, a.projected)} after scheduled` : ""}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 15, fontWeight: 700, fontFamily: T.fontMono, color }}>{money(cur, a.balance)}</div>
                      {isCard && a.balance < 0 && <div style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 2 }}>to pay</div>}
                    </div>
                    <Icon name="chev-right" size={14} color={T.textDim} />
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Scheduled, any month */}
        {scheduled.length > 0 && (
          <div style={{ padding: "0 20px 16px" }}>
            <SectionHead title="Scheduled" />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {scheduled.map(e => (
                <div key={e.id}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: T.violet, margin: "0 0 4px 2px" }}>{fmtDay(e.date)}</div>
                  <EntryRow e={e} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* One month: income, spending, categories, transactions */}
        <div style={{ margin: "0 20px 16px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rCard, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <button onClick={() => setMonth(m => shiftMonth(m, -1))} disabled={month <= firstMonth} aria-label="Previous month"
              style={{ width: 32, height: 32, borderRadius: 9999, background: T.elevated, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: month <= firstMonth ? "default" : "pointer", opacity: month <= firstMonth ? 0.35 : 1, padding: 0 }}>
              <Icon name="chev-left" size={14} color={T.text} />
            </button>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{monthLabel(month)}</div>
              {month !== thisMonth && (
                <button onClick={() => setMonth(thisMonth)} style={{ background: "transparent", border: "none", color: T.teal, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>Back to this month</button>
              )}
            </div>
            <button onClick={() => setMonth(m => shiftMonth(m, 1))} disabled={month >= lastMonth} aria-label="Next month"
              style={{ width: 32, height: 32, borderRadius: 9999, background: T.elevated, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: month >= lastMonth ? "default" : "pointer", opacity: month >= lastMonth ? 0.35 : 1, padding: 0 }}>
              <Icon name="chev-right" size={14} color={T.text} />
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <Stat label="Income" value={money(cur, income, { digits: 0 })} color={T.teal} />
            <Stat label="Spent" value={money(cur, spent, { digits: 0 })} color={T.amber} />
            <Stat label="Net" value={money(cur, income - spent, { digits: 0, sign: true })} color={income - spent >= 0 ? T.teal : T.negative} />
          </div>
          {accounts.length > 0 && month <= thisMonth && (
            <div style={{ fontSize: 12, color: T.textMuted, textAlign: "center", lineHeight: 1.5, marginBottom: 14 }}>
              Started {monthLabel(month, { month: "long" })} with <b style={{ color: T.text }}>{money(cur, monthStartTotal, { digits: 0 })}</b>
              {" · "}{month === thisMonth ? "now" : "ended with"} <b style={{ color: T.text }}>{money(cur, monthEndTotal, { digits: 0 })}</b>
            </div>
          )}
          <MonthBars months={history} selected={month} onSelect={setMonth} />
          <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 8, fontSize: 10, color: T.textDim }}>
            <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: T.teal, marginRight: 4 }} />Income</span>
            <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: T.amber, marginRight: 4 }} />Spent</span>
            <span>Transfers and card bills aren't spending</span>
          </div>
        </div>

        {/* Donut + legend */}
        <div style={{ margin: "0 20px 16px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rCard, padding: "16px 18px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 14 }}>Spending by category · {monthLabel(month, { month: "short" })}</div>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <DonutChart data={catData} active={activeDonut} onSelect={setActiveDonut} cur={cur} />
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

        {/* Category budgets: tap one to see it and change its budget */}
        <div style={{ padding: "0 20px 16px" }}>
          <SectionHead title="Category budgets" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {EXPENSE_CATS.map(cat => {
              const spentCat = catData[cat.id] || 0;
              const budget = limits[cat.id] || 0;
              const pct = budget > 0 ? Math.min(spentCat / budget, 1) : 0;
              const over = budget > 0 && spentCat > budget;
              return (
                <div key={cat.id} role="button" tabIndex={0} onClick={() => setSelectedCategory({ ...cat, spent: spentCat, budget })}
                  onKeyDown={(ev) => ev.key === "Enter" && setSelectedCategory({ ...cat, spent: spentCat, budget })}
                  style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 13px", cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: cat.color }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{cat.label}</span>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: over ? T.negative : T.text, fontFamily: T.fontMono, marginBottom: 2 }}>
                    {cur} {spentCat.toFixed(0)} <span style={{ fontSize: 10, color: T.textMuted, fontWeight: 400 }}>{budget > 0 ? `/ ${budget}` : "· no budget"}</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 9999, background: T.elevated2, overflow: "hidden", marginTop: 6 }}>
                    <div style={{ width: `${pct * 100}%`, height: "100%", background: over ? T.negative : cat.color, borderRadius: 9999 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* The last 7 days */}
        {month === thisMonth && (() => {
          const days = [6, 5, 4, 3, 2, 1, 0].map(back => {
            const dt = new Date(); dt.setDate(dt.getDate() - back);
            return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
          });
          const bars = days.map(d => sum(entries.filter(e => e.date === d && isSpending(e))));
          return (
            <div style={{ margin: "0 20px 16px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rCard, padding: "16px 18px" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 14 }}>Last 7 days</div>
              <WeekBarsChart bars={bars} avg={bars.reduce((s, v) => s + v, 0) / 7}
                labels={days.map(d => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "narrow" }))} />
            </div>
          );
        })()}

        {/* Transactions in the month */}
        <div style={{ padding: "0 20px 24px" }}>
          <SectionHead title={`Transactions · ${monthLabel(month, { month: "long" })}`} />
          {loading && <LoadingDots />}
          {!loading && grouped.length === 0 && (
            <EmptyState icon="budget" title="No transactions" subtitle={month === thisMonth ? "Tap + to log your first expense" : `Nothing logged in ${monthLabel(month)}`} />
          )}
          {grouped.map(([date, items]) => {
            const dayTotal = sum(items.filter(isSpending));
            return (
              <div key={date} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: date > today ? T.violet : T.textMuted, letterSpacing: 0.3 }}>{fmtDay(date)}</span>
                  {dayTotal > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: T.text, fontFamily: T.fontMono }}>{money(cur, dayTotal)} spent</span>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {items.map(e => <EntryRow key={e.id} e={e} />)}
                </div>
              </div>
            );
          })}
        </div>
      </PageScroll>

      {!overlayOpen && <Fab onClick={() => setSheet({ preset: null })} icon="plus" color={T.green} label="Add income, expense or transfer" />}

      {openAccount && (
        <AccountDetailPage
          account={openAccount}
          accounts={accounts}
          entries={entries}
          cur={cur}
          onBack={() => setOpenAccountId(null)}
          onEdit={e => setSheet({ entry: e })}
          onAdd={preset => setSheet({ preset })}
          onChanged={reload}
        />
      )}
      {selectedCategory && (
        <CategoryDetailPage
          currency={cur}
          category={selectedCategory}
          month={month}
          entries={spending.filter(e => e.category === selectedCategory.id)}
          onBack={() => setSelectedCategory(null)}
          onEdit={e => setSheet({ entry: e })}
          onSaveBudget={value => saveBudget(selectedCategory.id, value)}
        />
      )}
      {sheet && (
        <BudgetEntrySheet
          key={sheet.entry?.id ?? "new"}
          entry={sheet.entry || null}
          preset={sheet.preset || null}
          accounts={accounts}
          cur={cur}
          onClose={() => setSheet(null)}
          onSaved={reload}
        />
      )}
      <BottomSheet open={addingAccount} onClose={() => setAddingAccount(false)} title="Add account">
        <AccountForm onSaved={() => { setAddingAccount(false); reload(); }} />
      </BottomSheet>
    </div>
  );
}
