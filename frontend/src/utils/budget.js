import { T } from "../design/tokens";

// Shared by the Budget page, its account and category pages and the entry sheet.
export const EXPENSE_CATS = [
  { id: "food",      label: "Food",      color: T.amber,   icon: "meal"     },
  { id: "rent",      label: "Rent",      color: T.violet,  icon: "location" },
  { id: "transport", label: "Transport", color: T.blue,    icon: "bike"     },
  { id: "fitness",   label: "Fitness",   color: "#5C8FFC", icon: "dumbbell" },
  { id: "fun",       label: "Fun",       color: "#FC5C9E", icon: "heart"    },
  { id: "other",     label: "Other",     color: "#FC8B5C", icon: "pill"     },
];

export const INCOME_CATS = [
  { id: "income",  label: "Income",  color: T.teal,    icon: "trend-up" },
  { id: "savings", label: "Savings", color: "#5C8FFC", icon: "shield"   },
];

// Money moving between two accounts: not spending, not income
const TRANSFER_CATS = [
  { id: "transfer",     label: "Transfer",  color: T.violet, icon: "transfer" },
  { id: "card_payment", label: "Card bill", color: T.violet, icon: "budget"   },
];

const ALL_CATS = [...EXPENSE_CATS, ...INCOME_CATS, ...TRANSFER_CATS];
export function getCat(id) { return ALL_CATS.find(c => c.id === id) || EXPENSE_CATS[5]; }

export const isInflow = e => e.category === "income" || e.category === "savings";
export const isTransfer = e => e.category === "transfer" || e.category === "card_payment";
export const isSpending = e => !isInflow(e) && !isTransfer(e);

// How much an entry changes one account's balance (the server uses the same rule)
export function entryEffect(e, accountId) {
  if (e.to_account_id === accountId) return e.amount;
  if (e.account_id !== accountId) return 0;
  return isInflow(e) ? e.amount : -e.amount;
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const isScheduled = e => e.date > todayISO();

// Months as "2026-10"
export const monthOf = iso => iso.slice(0, 7);
export function shiftMonth(key, n) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function monthLabel(key, opts = { month: "long", year: "numeric" }) {
  return new Date(key + "-01T00:00:00").toLocaleDateString("en-GB", opts);
}

// "−CHF 12.50", or with sign "+CHF 12.50"
export function money(cur, v, { digits = 2, sign = false } = {}) {
  const r = Math.round(v * 100) / 100;
  const n = Math.abs(r).toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${r < 0 ? "−" : sign && r > 0 ? "+" : ""}${cur} ${n}`;
}

export function fmtDay(iso) {
  const dt = new Date(iso + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((dt - today) / 86400000);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  return dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export const accountIcon = a => (a?.kind === "credit_card" ? "budget" : "bank");
export const accountKindLabel = a => (a?.kind === "credit_card" ? "Credit card" : "Bank account");
