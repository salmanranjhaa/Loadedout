import { useState } from "react";
import { T } from "../../design/tokens";
import { Icon } from "../../design/icons";
import { Card, DetailHeader, Hint, PageScroll } from "../../design/components";
import { budgetAPI } from "../../utils/api";
import { showToast } from "../../utils/toast";
import {
  accountIcon, accountKindLabel, entryEffect, fmtDay, getCat, isScheduled, monthLabel, monthOf, money, todayISO,
} from "../../utils/budget";

const LABEL = { fontSize: 10, color: T.textMuted, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 6 };
const FIELD = { width: "100%", background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 14, color: T.text, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };

// A card's opening balance is entered as what it owed, so it reads positive
const shownOpening = (kind, v) => (kind === "credit_card" ? -v : v) || 0;

export function AccountForm({ account = null, onSaved, onCancel, onDelete }) {
  const [name, setName] = useState(account?.name || "");
  const [kind, setKind] = useState(account?.kind || "bank");
  const [opening, setOpening] = useState(account ? String(shownOpening(account.kind, account.opening_balance)) : "");
  const [saving, setSaving] = useState(false);
  const isCard = kind === "credit_card";

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const value = parseFloat(opening) || 0;
      const data = { name: name.trim(), kind, opening_balance: isCard ? -value : value };
      if (account) await budgetAPI.updateAccount(account.id, data);
      else await budgetAPI.addAccount(data);
      showToast(account ? "Account saved" : "Account added", "success");
      onSaved();
    } catch (e) { showToast(e?.message || "Couldn't save the account", "error"); }
    setSaving(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={LABEL}>Name</div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. UBS, Revolut, UBS Card" maxLength={60} style={FIELD} autoFocus={!account} />
      </div>
      <div>
        <div style={LABEL}>Type</div>
        <div style={{ display: "flex", gap: 8 }}>
          {[{ id: "bank", label: "Bank account" }, { id: "credit_card", label: "Credit card" }].map(k => (
            <button key={k.id} onClick={() => setKind(k.id)} aria-pressed={kind === k.id}
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 0", borderRadius: 10, background: kind === k.id ? T.teal + "22" : T.elevated, border: `1.5px solid ${kind === k.id ? T.teal : T.border}`, color: kind === k.id ? T.teal : T.textMuted, fontSize: 12, fontWeight: kind === k.id ? 700 : 500, cursor: "pointer", fontFamily: "inherit" }}>
              <Icon name={k.id === "credit_card" ? "budget" : "bank"} size={14} color={kind === k.id ? T.teal : T.textDim} />
              {k.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div style={LABEL}>{account ? (isCard ? "Owed before its first entry" : "Balance before its first entry") : (isCard ? "Owed now" : "Balance now")}</div>
        <input type="number" inputMode="decimal" step="0.01" value={opening} onChange={e => setOpening(e.target.value)} placeholder="0.00" style={{ ...FIELD, fontFamily: T.fontMono }} />
        <Hint style={{ marginTop: 6 }}>
          {account
            ? "Entries add to this. Change it if the balance here doesn't match your bank."
            : isCard ? "What the card owes today. Purchases you log add to it; paying the bill takes it down." : "What's in the account today. Entries you log from now on add to it or take from it."}
        </Hint>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {onDelete && (
          <button onClick={onDelete} disabled={saving} aria-label="Delete account" title="Delete account"
            style={{ width: 48, flexShrink: 0, background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="trash" size={16} color={T.negative} />
          </button>
        )}
        {onCancel && (
          <button onClick={onCancel} disabled={saving}
            style={{ flex: 1, padding: "12px 0", background: T.elevated, color: T.text, border: `1px solid ${T.border}`, borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Cancel
          </button>
        )}
        <button onClick={save} disabled={saving || !name.trim()}
          style={{ flex: 2, padding: "12px 0", background: name.trim() ? T.teal : T.elevated, color: name.trim() ? "#0A0A0F" : T.textMuted, border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: name.trim() ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
          {saving ? "Saving…" : account ? "Save account" : "Add account"}
        </button>
      </div>
    </div>
  );
}

export default function AccountDetailPage({ account, accounts = [], entries = [], cur = "CHF", onBack, onEdit, onAdd, onChanged }) {
  const [editing, setEditing] = useState(false);
  const isCard = account.kind === "credit_card";
  const owed = isCard && account.balance < 0 ? -account.balance : 0;
  // What's still to pay once payments already scheduled have gone through
  const leftToPay = isCard && account.projected < 0 ? Math.round(-account.projected * 100) / 100 : 0;
  const names = Object.fromEntries(accounts.map(a => [a.id, a.name]));
  const today = todayISO();
  const thisMonth = monthOf(today);

  // Oldest first to work out the balance after each entry, then newest first to show
  const mine = entries.filter(e => e.account_id === account.id || e.to_account_id === account.id)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  let running = account.opening_balance || 0;
  const rows = mine.map(e => {
    const effect = entryEffect(e, account.id);
    running += effect;
    return { e, effect, after: running };
  }).reverse();
  const scheduled = rows.filter(r => isScheduled(r.e));
  const past = rows.filter(r => !isScheduled(r.e));
  const months = [];
  for (const r of past) {
    const key = monthOf(r.e.date);
    if (!months.length || months[months.length - 1].key !== key) months.push({ key, rows: [], in: 0, out: 0 });
    const m = months[months.length - 1];
    m.rows.push(r);
    if (r.effect > 0) m.in += r.effect; else m.out -= r.effect;
  }
  const now = months.find(m => m.key === thisMonth) || { in: 0, out: 0 };

  async function remove() {
    if (mine.length) {
      showToast(`${account.name} has ${mine.length} entries. Move or delete them first.`, "error");
      return;
    }
    if (!window.confirm(`Delete ${account.name}?`)) return;
    try {
      await budgetAPI.deleteAccount(account.id);
      showToast("Account deleted", "success");
      onChanged();
      onBack();
    } catch (e) { showToast(e?.message || "Couldn't delete the account", "error"); }
  }

  const balanceColor = account.balance < 0 ? T.negative : T.teal;

  function Row({ e, effect, after }) {
    const cat = getCat(e.category);
    const other = e.to_account_id === account.id ? names[e.account_id] : e.to_account_id ? names[e.to_account_id] : null;
    const title = e.description || (other ? (effect > 0 ? `From ${other}` : `To ${other}`) : cat.label);
    return (
      <Card style={{ padding: "11px 14px" }} onClick={() => onEdit(e)}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: cat.color + "22", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon name={cat.icon} size={16} color={cat.color} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
            <div style={{ fontSize: 10, color: T.textDim, marginTop: 2 }}>
              {fmtDay(e.date)} · {other ? `${effect > 0 ? "from" : "to"} ${other}` : cat.label}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: T.fontMono, color: effect > 0 ? T.teal : T.text }}>{money(cur, effect, { sign: true })}</div>
            <div style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, marginTop: 2 }}>{money(cur, after)}</div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 10, background: T.bg, display: "flex", flexDirection: "column", animation: "lo-slide-in 0.25s cubic-bezier(0.32,0.72,0,1) forwards" }}>
      <DetailHeader
        onBack={onBack}
        title={account.name}
        subtitle={accountKindLabel(account)}
        trailing={
          <button onClick={() => setEditing(v => !v)} aria-label="Edit account" title="Edit account"
            style={{ width: 34, height: 34, borderRadius: 9999, background: editing ? T.teal + "22" : T.elevated, border: `1px solid ${editing ? T.teal : T.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
            <Icon name="edit" size={15} color={editing ? T.teal : T.text} />
          </button>
        }
      />

      <PageScroll padBottom={`calc(${T.navHeight} + 24px)`}>
        {editing && (
          <div style={{ padding: "0 16px 16px" }}>
            <Card style={{ padding: 16 }}>
              <AccountForm account={account} onSaved={() => { setEditing(false); onChanged(); }} onCancel={() => setEditing(false)} onDelete={remove} />
            </Card>
          </div>
        )}

        {/* Balance */}
        <div style={{ padding: "0 16px 14px" }}>
          <div style={{ borderRadius: 18, padding: 20, background: `linear-gradient(135deg, ${balanceColor}22, ${balanceColor}08)`, border: `1px solid ${balanceColor}33` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: balanceColor + "22", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name={accountIcon(account)} size={20} color={balanceColor} />
              </div>
              <div style={{ fontSize: 11, fontFamily: T.fontMono, color: balanceColor, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700 }}>
                {isCard ? (owed ? "To pay" : "Nothing owed") : "Balance today"}
              </div>
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: T.text, letterSpacing: -1, fontFamily: T.fontMono }}>
              {isCard ? money(cur, owed) : money(cur, account.balance)}
            </div>
            {account.projected !== account.balance && (
              <div style={{ fontSize: 12, color: T.textMuted, marginTop: 6 }}>
                After scheduled entries: <b style={{ color: T.text }}>{isCard ? `${money(cur, Math.max(-account.projected, 0))} to pay` : money(cur, account.projected)}</b>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              {leftToPay > 0 && (
                <button onClick={() => onAdd({ type: "transfer", to_account_id: account.id, amount: leftToPay })}
                  style={{ flex: 1, padding: "11px 0", background: T.violet, color: "#0A0A0F", border: "none", borderRadius: 11, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <Icon name="transfer" size={14} color="#0A0A0F" /> Pay card bill
                </button>
              )}
              <button onClick={() => onAdd({ type: "expense", account_id: account.id })}
                style={{ flex: 1, padding: "11px 0", background: T.elevated, color: T.text, border: `1px solid ${T.border}`, borderRadius: 11, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <Icon name="plus" size={14} color={T.text} /> Add entry
              </button>
            </div>
          </div>
        </div>

        {/* This month on this account */}
        <div style={{ padding: "0 16px 18px", display: "flex", gap: 8 }}>
          {[
            { label: `In · ${monthLabel(thisMonth, { month: "short" })}`, value: money(cur, now.in, { digits: 0 }), color: T.teal },
            { label: `Out · ${monthLabel(thisMonth, { month: "short" })}`, value: money(cur, now.out, { digits: 0 }), color: T.text },
            { label: "Entries", value: mine.length, color: T.text },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "10px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 700, fontFamily: T.fontMono, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 9, color: T.textDim, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 600, marginTop: 3 }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: "0 16px 20px", display: "flex", flexDirection: "column", gap: 6 }}>
          {scheduled.length > 0 && (
            <>
              <div style={{ ...LABEL, color: T.violet, marginTop: 2 }}>Scheduled</div>
              {scheduled.map(r => <Row key={r.e.id} {...r} />)}
            </>
          )}
          {months.map(m => (
            <div key={m.key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "10px 0 2px" }}>
                <span style={{ ...LABEL, marginBottom: 0 }}>{monthLabel(m.key)}</span>
                <span style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono }}>
                  in {money(cur, m.in, { digits: 0 })} · out {money(cur, m.out, { digits: 0 })}
                </span>
              </div>
              {m.rows.map(r => <Row key={r.e.id} {...r} />)}
            </div>
          ))}
          {mine.length === 0 && (
            <div style={{ textAlign: "center", padding: "28px 0", color: T.textDim, fontSize: 13 }}>
              Nothing on {account.name} yet. Entries you log against it show up here.
            </div>
          )}
          {mine.length > 0 && (
            <div style={{ fontSize: 11, color: T.textDim, textAlign: "center", marginTop: 8 }}>
              Started at {money(cur, account.opening_balance || 0)} · the small figure is the balance after each entry
            </div>
          )}
        </div>
      </PageScroll>
    </div>
  );
}
