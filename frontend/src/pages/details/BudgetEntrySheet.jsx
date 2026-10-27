import { useState } from "react";
import { T } from "../../design/tokens";
import { Icon } from "../../design/icons";
import { Hint } from "../../design/components";
import { budgetAPI } from "../../utils/api";
import { showToast } from "../../utils/toast";
import { EXPENSE_CATS, INCOME_CATS, accountIcon, fmtDay, getCat, isInflow, isTransfer, money, todayISO } from "../../utils/budget";

const LABEL = { fontSize: 10, color: T.textMuted, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8 };
const FIELD = { width: "100%", background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 13, color: T.text, fontFamily: "inherit", outline: "none", marginBottom: 8, boxSizing: "border-box" };

const typeOf = e => (isTransfer(e) ? "transfer" : isInflow(e) ? "income" : "expense");
const owedOn = a => (a?.kind === "credit_card" && a.balance < 0 ? Math.round(-a.balance * 100) / 100 : 0);

function AccountChips({ accounts, value, onChange, hide, color }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
      {accounts.filter(a => a.id !== hide).map(a => {
        const on = value === a.id;
        return (
          <button key={a.id} onClick={() => onChange(a.id)} aria-pressed={on}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 10, background: on ? color + "22" : T.elevated, border: `1.5px solid ${on ? color : T.border}`, color: on ? color : T.textMuted, fontSize: 12, fontWeight: on ? 700 : 500, cursor: "pointer", fontFamily: "inherit" }}>
            <Icon name={accountIcon(a)} size={14} color={on ? color : T.textDim} />
            {a.name}
          </button>
        );
      })}
    </div>
  );
}

// Add or edit sheet: Expense, Income or Transfer (paying a card bill is a
// transfer into the card). `entry` edits that transaction; `preset` starts a new
// one with fields filled in, e.g. "Pay card bill" on a card's page.
export default function BudgetEntrySheet({ onClose, onSaved, cur, accounts = [], entry = null, preset = null }) {
  const start = entry || preset || {};
  const firstBank = (accounts.find(a => a.kind !== "credit_card") || accounts[0])?.id ?? null;
  const [type, setType] = useState(start.category ? typeOf(start) : start.type || "expense");
  const [cat, setCat] = useState(start.category && !isTransfer(start) ? start.category : "food");
  const [amount, setAmount] = useState(start.amount ? String(start.amount) : "");
  const [desc, setDesc] = useState(start.description || "");
  const [accountId, setAccountId] = useState(start.account_id ?? firstBank);
  const [toId, setToId] = useState(start.to_account_id ?? null);
  const [day, setDay] = useState(start.date || todayISO());
  const [saving, setSaving] = useState(false);

  const isIncome = type === "income";
  const isMove = type === "transfer";
  const from = accounts.find(a => a.id === accountId);
  const to = accounts.find(a => a.id === toId);
  const accent = isIncome ? T.green : isMove ? T.violet : T.amber;
  const value = parseFloat(amount);
  const missing = !(value > 0) ? "Enter an amount above 0 to save."
    : isMove && accounts.length < 2 ? "Add a second account to move money between them."
    : isMove && !(accountId && toId) ? "Pick where the money comes from and where it goes."
    : null;

  // A card bill usually clears what the card owes; start from that amount
  function pickTo(id) {
    setToId(id);
    const owed = owedOn(accounts.find(a => a.id === id));
    if (!entry && !amount && owed) setAmount(owed.toFixed(2));
  }

  function switchType(t) {
    setType(t);
    setCat(t === "income" ? "income" : "food");
    if (t === "transfer" && !entry) {
      const source = from?.kind === "credit_card" ? firstBank : accountId;
      setAccountId(source);
      const card = accounts.find(a => a.kind === "credit_card" && a.id !== source);
      if (card && !toId) pickTo(card.id);
    }
  }

  async function handleSave() {
    if (missing) return;
    setSaving(true);
    try {
      const data = {
        amount: value,
        category: isMove ? "transfer" : cat,
        description: desc.trim() || null,
        date_str: day || todayISO(),
        account_id: accountId,
        to_account_id: isMove ? toId : null,
      };
      if (entry) await budgetAPI.update(entry.id, data);
      else await budgetAPI.add(data);
      onSaved();
      onClose();
      const when = day > todayISO() ? ` for ${fmtDay(day)}` : "";
      showToast(entry ? "Changes saved" : `${isIncome ? "Income" : isMove ? (to?.kind === "credit_card" ? "Card payment" : "Transfer") : "Expense"} added${when}`, "success");
    } catch (e) { showToast(e?.message || "Failed to save", "error"); }
    setSaving(false);
  }

  async function handleDelete() {
    if (!window.confirm(`Delete ${entry.description || getCat(entry.category).label} (${money(cur, entry.amount)})?`)) return;
    setSaving(true);
    try {
      await budgetAPI.delete(entry.id);
      onSaved();
      onClose();
      showToast("Entry deleted", "success");
    } catch (e) { showToast(e?.message || "Couldn't delete", "error"); }
    setSaving(false);
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, paddingTop: "env(safe-area-inset-top, 0px)", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(2px)" }} />
      <div style={{ position: "relative", background: T.surface, borderRadius: "20px 20px 0 0", padding: `16px 20px calc(${T.navHeight} + 20px)`, border: `1px solid ${T.border}`, borderBottom: "none", maxHeight: "calc(100% - 24px)", overflowY: "auto" }}>
        <div style={{ width: 36, height: 4, borderRadius: 9999, background: T.border, margin: "0 auto 16px" }} />
        {entry && <div style={{ fontSize: 17, fontWeight: 700, color: T.text, marginBottom: 14 }}>Edit entry</div>}

        {/* Type toggle */}
        <div style={{ display: "flex", background: T.elevated, borderRadius: 12, padding: 4, marginBottom: 18, gap: 4 }}>
          {[{ id: "expense", label: "Expense", icon: "budget", color: T.amber }, { id: "income", label: "Income", icon: "trend-up", color: T.teal }, { id: "transfer", label: "Transfer", icon: "transfer", color: T.violet }].map(opt => (
            <button key={opt.id} onClick={() => switchType(opt.id)} aria-pressed={type === opt.id}
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 0", borderRadius: 9, background: type === opt.id ? opt.color : "transparent", border: "none", color: type === opt.id ? "#0A0A0F" : T.textMuted, fontSize: 13, fontWeight: type === opt.id ? 700 : 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
              <Icon name={opt.icon} size={14} color={type === opt.id ? "#0A0A0F" : T.textDim} />
              {opt.label}
            </button>
          ))}
        </div>

        {/* Amount — big centered input */}
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={LABEL}>Amount ({cur})</div>
          <input type="number" inputMode="decimal" step="0.05" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" autoFocus={!entry && !preset}
            style={{ width: "100%", background: T.elevated, border: `2px solid ${amount ? accent + "88" : T.border}`, borderRadius: 14, padding: "14px 0", fontSize: 32, fontWeight: 800, color: accent, fontFamily: T.fontMono, outline: "none", textAlign: "center", boxSizing: "border-box", transition: "border-color 0.15s" }} />
        </div>

        {isMove ? (
          <>
            <div style={LABEL}>From</div>
            <AccountChips accounts={accounts} value={accountId} onChange={setAccountId} hide={toId} color={accent} />
            <div style={LABEL}>To</div>
            <AccountChips accounts={accounts} value={toId} onChange={pickTo} hide={accountId} color={accent} />
            <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.5, marginBottom: 12 }}>
              {to?.kind === "credit_card"
                ? <>Pays the <b style={{ color: T.text }}>{to.name}</b> bill{owedOn(to) ? <> (owes {money(cur, owedOn(to))})</> : null}. It isn't counted as spending again: the purchases already were.</>
                : "Moves money between your accounts. It isn't spending."}
            </div>
          </>
        ) : (
          <>
            <div style={LABEL}>Category</div>
            <div style={{ display: "grid", gridTemplateColumns: isIncome ? "1fr 1fr" : "repeat(3,1fr)", gap: 8, marginBottom: 14 }}>
              {(isIncome ? INCOME_CATS : EXPENSE_CATS).map(c => (
                <button key={c.id} onClick={() => setCat(c.id)} aria-pressed={cat === c.id}
                  style={{ padding: "10px 6px", borderRadius: 10, background: cat === c.id ? `${c.color}22` : T.elevated, border: `1.5px solid ${cat === c.id ? c.color : T.border}`, color: cat === c.id ? c.color : T.textMuted, fontSize: 11, fontWeight: cat === c.id ? 700 : 500, cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, transition: "all 0.15s" }}>
                  <Icon name={c.icon} size={17} color={cat === c.id ? c.color : T.textDim} />
                  {c.label}
                </button>
              ))}
            </div>
            {accounts.length > 0 ? (
              <>
                <div style={LABEL}>{isIncome ? "Paid into" : "Paid from"}</div>
                <AccountChips accounts={accounts} value={accountId} onChange={setAccountId} color={accent} />
              </>
            ) : (
              <Hint style={{ marginBottom: 12 }}>No accounts yet, so this goes to “Main account”. Add your accounts on the Budget page.</Hint>
            )}
          </>
        )}

        {/* Description */}
        <input type="text" value={desc} onChange={e => setDesc(e.target.value)}
          placeholder={isIncome ? "Source (e.g. Monthly salary, Freelance)" : isMove ? "Note (e.g. September statement)" : "Description (e.g. Lidl groceries)"}
          style={FIELD} />

        <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontSize: 10, color: T.textMuted, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase", margin: "6px 0 0" }}>
          Date
          <input type="date" value={day} onChange={e => setDay(e.target.value)}
            style={{ background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 10, padding: "8px 12px", fontSize: 13, color: T.text, fontFamily: "inherit", outline: "none", colorScheme: "dark" }} />
        </label>
        {day > todayISO() && (
          <Hint style={{ marginTop: 8 }}>
            Scheduled: {from ? `${from.name} ` : "the balance "}changes on {fmtDay(day)}, not before. Until then it shows under Scheduled.
          </Hint>
        )}

        <div style={{ height: 12 }} />
        <div style={{ display: "flex", gap: 8 }}>
          {entry && (
            <button onClick={handleDelete} disabled={saving} aria-label="Delete entry" title="Delete"
              style={{ width: 52, flexShrink: 0, background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="trash" size={17} color={T.negative} />
            </button>
          )}
          <button onClick={handleSave} disabled={saving || !!missing}
            style={{ flex: 1, padding: "14px 0", background: missing ? T.elevated : accent, color: missing ? T.textMuted : "#0A0A0F", border: "none", borderRadius: 13, fontSize: 15, fontWeight: 700, cursor: saving || missing ? "not-allowed" : "pointer", fontFamily: "inherit", transition: "background 0.15s" }}>
            {saving ? "Saving…" : entry ? "Save changes" : isIncome ? "Add income" : isMove ? (to?.kind === "credit_card" ? "Pay card bill" : "Add transfer") : "Add expense"}
          </button>
        </div>
        {missing && <Hint style={{ marginTop: 8 }}>{missing}</Hint>}
      </div>
    </div>
  );
}
