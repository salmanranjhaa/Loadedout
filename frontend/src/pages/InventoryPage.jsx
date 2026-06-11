import { useState, useEffect } from "react";
import { T } from "../design/tokens";
import { Icon } from "../design/icons";
import { Fab, PageHeader, PageScroll, SectionHead, EmptyState, LoadingDots } from "../design/components";
import { inventoryAPI } from "../utils/api";
import PantryDetailPage from "./details/PantryDetailPage";

const FILTER_CATS = [
  { id: "all",     label: "All",     color: T.orange   },
  { id: "protein", label: "Protein", color: T.negative },
  { id: "produce", label: "Produce", color: "#5FC87A" },
  { id: "grains",  label: "Grains",  color: T.amber  },
  { id: "dairy",   label: "Dairy",   color: "#5C8FFC" },
  { id: "pantry",  label: "Pantry",  color: T.violet },
];

const CAT_MAP = {
  protein: { label: "Protein", color: T.negative },
  produce: { label: "Produce", color: "#5FC87A"  },
  grains:  { label: "Grains",  color: T.amber    },
  dairy:   { label: "Dairy",   color: "#5C8FFC"  },
  pantry:  { label: "Pantry",  color: T.violet   },
  other:   { label: "Other",   color: T.textMuted },
};

function getCatMeta(id) { return CAT_MAP[id] || CAT_MAP.other; }

function AddItemSheet({ onClose, onAdded }) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("g");
  const [cat, setCat] = useState("protein");
  const [saving, setSaving] = useState(false);
  const UNITS = ["g", "kg", "pieces", "cans", "L", "ml", "portions", "tbsp"];

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await inventoryAPI.add({ name: name.trim(), quantity: qty ? Number(qty) : null, unit, category: cat });
      onAdded();
      onClose();
    } catch (e) { console.error(e); }
    setSaving(false);
  }

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 40, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)" }} />
      <div style={{ position: "relative", background: T.surface, borderRadius: "20px 20px 0 0", padding: "20px 20px 36px", border: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>Add Item</div>
          <button onClick={onClose} style={{ background: T.elevated, border: "none", borderRadius: 9999, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: T.textMuted }}>
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
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
          {Object.entries(CAT_MAP).filter(([k]) => k !== "other").map(([id, meta]) => (
            <button key={id} onClick={() => setCat(id)} style={{ padding: "6px 12px", borderRadius: 9999, background: cat === id ? meta.color + "22" : T.elevated, border: `1px solid ${cat === id ? meta.color + "55" : T.border}`, color: cat === id ? meta.color : T.textMuted, fontSize: 12, fontWeight: cat === id ? 700 : 500, cursor: "pointer", fontFamily: "inherit" }}>
              {meta.label}
            </button>
          ))}
        </div>
        <button onClick={handleSave} disabled={saving || !name.trim()} style={{ width: "100%", padding: "13px 0", background: T.orange, color: "#0A0A0F", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: saving || !name.trim() ? "not-allowed" : "pointer", opacity: saving || !name.trim() ? 0.5 : 1, fontFamily: "inherit" }}>
          {saving ? "Adding…" : "Add to Pantry"}
        </button>
      </div>
    </div>
  );
}

function ItemCard({ item, onClick }) {
  const cat = getCatMeta(item.category);
  const daysLeft = item.expiry_days;
  const isExpiring = daysLeft != null && daysLeft <= 3;

  return (
    <div onClick={onClick} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "13px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", marginBottom: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, color: cat.color, background: cat.color + "1A", padding: "2px 7px", borderRadius: 5 }}>
            {cat.label.toUpperCase()}
          </span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: daysLeft != null ? 4 : 0 }}>{item.name}</div>
        {daysLeft != null && (
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: isExpiring ? T.amber : T.textDim, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: isExpiring ? T.amber : T.textMuted, fontWeight: isExpiring ? 600 : 400 }}>
              {isExpiring ? `Expires in ${daysLeft}d` : `Expires in ${daysLeft}d`}
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

  const countByFilter = {
    all: items.length,
    protein: items.filter(i => i.category === "protein").length,
    produce: items.filter(i => i.category === "produce").length,
    grains:  items.filter(i => i.category === "grains").length,
    dairy:   items.filter(i => i.category === "dairy").length,
    pantry:  items.filter(i => i.category === "pantry").length,
  };

  const filtered = filter === "all" ? items : items.filter(i => i.category === filter);

  // Sort: expiring soon first
  const sorted = [...filtered].sort((a, b) => {
    const da = a.expiry_days ?? 9999;
    const db = b.expiry_days ?? 9999;
    return da - db;
  });

  const mealMatchCount = 3;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: T.bg, position: "relative" }}>
      <PageHeader title="Pantry" subtitle="Smart inventory for AI meal planning" profile={profile} onProfile={onProfile} />

      <PageScroll>
        {/* AI chip banner */}
        <div style={{ margin: "0 20px 16px", borderRadius: T.rCard, background: `linear-gradient(135deg, ${T.violet}33, ${T.orange}22)`, border: `1px solid ${T.violet}44`, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${T.violet}, ${T.orange})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon name="sparkle" size={18} color="#0A0A0F" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 2 }}>AI uses this for meal suggestions</div>
            <div style={{ fontSize: 11, color: T.orange }}>
              {mealMatchCount} meal ideas match your current pantry · tap to see
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
            <EmptyState icon="pantry" title="Nothing here" subtitle={filter === "all" ? "Tap + to add what's in your kitchen" : "No items in this category"} />
          )}
          {sorted.map(item => (
            <ItemCard key={item.id} item={item} onClick={() => setSelectedItem(item)} />
          ))}
        </div>
      </PageScroll>

      <Fab onClick={() => setShowAdd(true)} icon="plus" color={T.orange} />
      {showAdd && <AddItemSheet onClose={() => setShowAdd(false)} onAdded={reload} />}
      {selectedItem && (
        <PantryDetailPage
          item={{
            ...selectedItem,
            expiry_days: selectedItem.expiry_days,
            location: selectedItem.location || "Fridge",
          }}
          onBack={() => setSelectedItem(null)}
          onChanged={reload}
          onDelete={() => {
            setItems(prev => prev.filter(i => i.id !== selectedItem.id));
            setSelectedItem(null);
          }}
        />
      )}
    </div>
  );
}
