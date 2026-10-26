import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "../design/tokens";
import { Icon } from "../design/icons";
import { Fab, PageHeader, PageScroll, SectionHead, EmptyState, LoadingDots, Hint } from "../design/components";
import { inventoryAPI } from "../utils/api";
import { showToast } from "../utils/toast";
import PantryDetailPage from "./details/PantryDetailPage";
import { CAT_MAP, catOf, getCatMeta, STATUSES, statusMeta, STORAGES, storageMeta, UNITS } from "../utils/pantry";

const FILTER_CATS = [
  { id: "all",     label: "All",     color: T.orange   },
  { id: "tobuy",   label: "To buy",  color: T.negative },
  { id: "protein", label: "Protein", color: T.negative },
  { id: "produce", label: "Produce", color: "#5FC87A" },
  { id: "grains",  label: "Grains",  color: T.amber  },
  { id: "dairy",   label: "Dairy",   color: "#5C8FFC" },
  { id: "pantry",  label: "Pantry",  color: T.violet },
];

// "To buy" collects what needs a shop: need to buy, and running low
const isToBuy = (i) => i.status === "need_to_buy" || i.status === "running_low";
const matches = (i, filter) => filter === "all" || (filter === "tobuy" ? isToBuy(i) : catOf(i) === filter);

function ChipRow({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
      {options.map((o) => (
        <button key={o.id || "none"} onClick={() => onChange(o.id)} aria-pressed={value === o.id}
          style={{ padding: "6px 12px", borderRadius: 9999, background: value === o.id ? o.color + "22" : T.elevated, border: `1px solid ${value === o.id ? o.color + "55" : T.border}`, color: value === o.id ? o.color : T.textMuted, fontSize: 12, fontWeight: value === o.id ? 700 : 500, cursor: "pointer", fontFamily: "inherit" }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function AddItemSheet({ onClose, onAdded }) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("g");
  const [cat, setCat] = useState("protein");
  const [status, setStatus] = useState("ok");
  const [storage, setStorage] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await inventoryAPI.add({ name: name.trim(), quantity: qty ? Number(qty) : null, unit, category: cat, status, storage: storage || null });
      onAdded();
      onClose();
      showToast(`${name.trim()} added to your pantry`, "success");
    } catch (e) { showToast(e?.message || "Couldn't add the item", "error"); }
    setSaving(false);
  }

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 40, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)" }} />
      <div style={{ position: "relative", background: T.surface, borderRadius: "20px 20px 0 0", padding: `20px 20px calc(${T.navHeight} + 20px)`, border: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>Add Item</div>
          <button aria-label="Close" title="Close" onClick={onClose} style={{ background: T.elevated, border: "none", borderRadius: 9999, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: T.textMuted }}>
            <Icon name="x" size={14} />
          </button>
        </div>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Item name (e.g. Chicken Breast)"
          onKeyDown={e => e.key === "Enter" && handleSave()}
          style={{ width: "100%", background: T.elevated, border: `1px solid ${T.border}`, borderRadius: T.rInput, padding: "11px 14px", fontSize: 14, color: T.text, fontFamily: "inherit", outline: "none", marginBottom: 12, boxSizing: "border-box" }}
        />
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <input
            type="number"
            inputMode="decimal"
            value={qty}
            onChange={e => setQty(e.target.value)}
            placeholder="Qty"
            min={0}
            style={{ width: 80, background: T.elevated, border: `1px solid ${T.border}`, borderRadius: T.rInput, padding: "10px 12px", fontSize: 13, color: T.text, fontFamily: T.fontMono, outline: "none" }}
          />
          <select
            value={unit}
            onChange={e => setUnit(e.target.value)}
            style={{ flex: 1, background: T.elevated, border: `1px solid ${T.border}`, borderRadius: T.rInput, padding: "10px 12px", fontSize: 13, color: T.text, fontFamily: "inherit", outline: "none" }}
          >
            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <ChipRow options={Object.entries(CAT_MAP).filter(([k]) => k !== "other").map(([id, m]) => ({ id, ...m }))} value={cat} onChange={setCat} />
        <ChipRow options={STATUSES} value={status} onChange={setStatus} />
        <ChipRow options={[{ id: "", label: "Storage not set", color: T.textMuted }, ...STORAGES]} value={storage} onChange={setStorage} />
        <div style={{ height: 4 }} />
        <button onClick={handleSave} disabled={saving || !name.trim()} style={{ width: "100%", padding: "13px 0", background: T.orange, color: "#0A0A0F", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: saving || !name.trim() ? "not-allowed" : "pointer", opacity: saving || !name.trim() ? 0.5 : 1, fontFamily: "inherit" }}>
          {saving ? "Adding…" : "Add to Pantry"}
        </button>
        {!name.trim() && <Hint style={{ marginTop: 8 }}>Enter an item name to add it.</Hint>}
      </div>
    </div>
  );
}

function ItemCard({ item, onClick }) {
  const cat = getCatMeta(catOf(item));
  const status = statusMeta(item.status);
  const storage = storageMeta(item.storage);
  const daysLeft = item.days_until_expiry;
  const isExpiring = daysLeft != null && daysLeft <= 3;

  return (
    <div onClick={onClick} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "13px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", marginBottom: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, color: cat.color, background: cat.color + "1A", padding: "2px 7px", borderRadius: 5 }}>
            {cat.label.toUpperCase()}
          </span>
          {status.id !== "ok" && (
            <span style={{ fontSize: 10, fontWeight: 700, color: status.color, background: status.color + "1A", padding: "2px 7px", borderRadius: 5 }}>
              {status.label}
            </span>
          )}
          {storage && <span style={{ fontSize: 10, color: T.textMuted }}>{storage.label}</span>}
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: daysLeft != null ? 4 : 0 }}>{item.name}</div>
        {daysLeft != null && (
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: isExpiring ? T.amber : T.textDim, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: isExpiring ? T.amber : T.textMuted, fontWeight: isExpiring ? 600 : 400 }}>
              {daysLeft < 0 ? "Expired" : daysLeft === 0 ? "Expires today" : `Expires in ${daysLeft}d`}
            </span>
          </div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {item.quantity != null && (
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: T.fontMono }}>
            {item.quantity} <span style={{ fontSize: 10, color: T.textMuted, fontWeight: 400 }}>{item.unit}</span>
          </span>
        )}
        <Icon name="chev-right" size={15} color={T.textDim} />
      </div>
    </div>
  );
}

export default function InventoryPage({ profile, onProfile }) {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const data = await inventoryAPI.getAll();
        if (data?.items) setItems(data.items);
      } catch {
        // leave empty — empty state renders below
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function reload() {
    try {
      const data = await inventoryAPI.getAll();
      if (data?.items) setItems(data.items);
    } catch {}
  }

  const countByFilter = Object.fromEntries(FILTER_CATS.map(c => [c.id, items.filter(i => matches(i, c.id)).length]));

  const filtered = items.filter(i => matches(i, filter));

  // Sort: expiring soon first
  const sorted = [...filtered].sort((a, b) => {
    const da = a.days_until_expiry ?? 9999;
    const db = b.days_until_expiry ?? 9999;
    return da - db;
  });

  async function removeItem(item) {
    if (!window.confirm(`Remove ${item.name} from your pantry?`)) return;
    try {
      await inventoryAPI.delete(item.id);
      setItems(prev => prev.filter(i => i.id !== item.id));
      setSelectedItem(null);
      showToast(`${item.name} removed`, "success");
    } catch (e) {
      showToast(e?.message || "Couldn't remove the item", "error");
    }
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: T.bg, position: "relative" }}>
      <PageHeader title="Pantry" subtitle="Smart inventory for AI meal planning" profile={profile} onProfile={onProfile} />

      <PageScroll>
        {/* AI chip banner */}
        <div onClick={() => navigate("/chat")} style={{ margin: "0 20px 16px", borderRadius: T.rCard, background: `linear-gradient(135deg, ${T.violet}33, ${T.orange}22)`, border: `1px solid ${T.violet}44`, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${T.violet}, ${T.orange})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon name="sparkle" size={18} color="#0A0A0F" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 2 }}>AI uses this for meal suggestions</div>
            <div style={{ fontSize: 11, color: T.orange }}>
              {items.length ? "Ask the AI coach for meal ideas · tap to open" : "Add what you have so the AI coach can suggest meals"}
            </div>
          </div>
          <Icon name="chev-right" size={16} color={T.textDim} />
        </div>

        {/* Filter pills */}
        <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "0 20px 16px", scrollbarWidth: "none" }}>
          {FILTER_CATS.map(c => {
            const count = countByFilter[c.id] || 0;
            const active = filter === c.id;
            return (
              <button key={c.id} onClick={() => setFilter(c.id)} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 13px", borderRadius: 9999, background: active ? c.color : T.elevated, border: `1px solid ${active ? c.color : T.border}`, color: active ? "#0A0A0F" : T.text, fontSize: 12, fontWeight: active ? 700 : 500, whiteSpace: "nowrap", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                {c.label}
                <span style={{ fontSize: 10, fontFamily: T.fontMono, opacity: 0.7 }}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Items */}
        <div style={{ padding: "0 20px 24px" }}>
          {loading && <LoadingDots />}
          {!loading && sorted.length === 0 && (
            <EmptyState icon="pantry" title="Nothing here" subtitle={filter === "all" ? "Tap + to add what's in your kitchen" : filter === "tobuy" ? "Nothing to buy right now" : "No items in this category"} />
          )}
          {sorted.map(item => (
            <ItemCard key={item.id} item={item} onClick={() => setSelectedItem(item)} />
          ))}
        </div>
      </PageScroll>

      {!selectedItem && <Fab onClick={() => setShowAdd(true)} icon="plus" color={T.orange} label="Add pantry item" />}
      {showAdd && <AddItemSheet onClose={() => setShowAdd(false)} onAdded={reload} />}
      {selectedItem && (
        <PantryDetailPage
          key={selectedItem.id}
          item={selectedItem}
          onBack={() => setSelectedItem(null)}
          onSaved={(updated) => setItems(prev => prev.map(i => i.id === updated.id ? updated : i))}
          onDelete={() => removeItem(selectedItem)}
        />
      )}
    </div>
  );
}
