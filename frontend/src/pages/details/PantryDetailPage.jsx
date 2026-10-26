import { useState } from "react";
import { T } from "../../design/tokens";
import { Icon } from "../../design/icons";
import { Card, DetailHeader, PageScroll } from "../../design/components";
import { inventoryAPI } from "../../utils/api";
import { showToast } from "../../utils/toast";
import { CAT_MAP, catOf, getCatMeta, STATUSES, statusMeta, STORAGES, storageMeta, UNITS } from "../../utils/pantry";

function ExpiryBadge({ daysLeft }) {
  if (daysLeft === null || daysLeft === undefined) return null;
  const color = daysLeft < 0 ? T.negative : daysLeft <= 3 ? T.amber : T.teal;
  const label = daysLeft < 0 ? "Expired" : daysLeft === 0 ? "Today" : `${daysLeft}d left`;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color, background: color + "22", padding: "2px 8px", borderRadius: 6, letterSpacing: 0.3 }}>
      {label}
    </span>
  );
}

function Badge({ meta }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: meta.color, background: meta.color + "22", padding: "2px 8px", borderRadius: 6, letterSpacing: 0.3 }}>
      {meta.label}
    </span>
  );
}

// "2026-11-14" counted in local days, so it doesn't drift a day near midnight
function daysUntil(iso) {
  if (!iso) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(iso + "T00:00:00") - today) / 86400000);
}
const fmtDate = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const FIELDS = ["name", "quantity", "unit", "category", "status", "storage", "expiry_date", "notes"];

function toDraft(item) {
  return {
    name: item.name || "",
    quantity: item.quantity == null ? "" : String(item.quantity),
    unit: item.unit || "g",
    category: catOf(item),
    status: item.status || "ok",
    storage: item.storage || "",
    expiry_date: item.expiry_date || "",
    notes: item.notes || "",
  };
}

function Chips({ options, value, onChange, allowNone }) {
  const all = allowNone ? [{ id: "", label: "Not set", color: T.textMuted }, ...options] : options;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {all.map((o) => {
        const on = value === o.id;
        return (
          <button key={o.id || "none"} onClick={() => onChange(o.id)} aria-pressed={on}
            style={{ padding: "6px 12px", borderRadius: 9999, background: on ? o.color + "22" : T.elevated, border: `1px solid ${on ? o.color + "66" : T.border}`, color: on ? o.color : T.textMuted, fontSize: 12, fontWeight: on ? 700 : 500, cursor: "pointer", fontFamily: "inherit" }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const fieldLabel = { fontSize: 10, color: T.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 };
const input = { width: "100%", background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px", color: T.text, fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box", colorScheme: "dark" };

export default function PantryDetailPage({ item = {}, onBack, onDelete, onSaved }) {
  const [saved, setSaved] = useState(item);            // what the server has
  const [draft, setDraft] = useState(() => toDraft(item));
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const base = toDraft(saved);
  const changed = FIELDS.filter((f) => draft[f] !== base[f]);
  const dirty = changed.length > 0;
  const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }));

  const qtyNum = draft.quantity === "" ? 0 : parseFloat(draft.quantity);
  const qtyInvalid = Number.isNaN(qtyNum) || qtyNum < 0;
  const step = ["g", "ml"].includes(draft.unit) ? 10 : 1;
  function bump(dir) {
    const current = qtyInvalid ? 0 : qtyNum;
    set("quantity", String(Math.max(0, Math.round((current + dir * step) * 100) / 100)));
  }

  async function save() {
    if (qtyInvalid) { showToast("Quantity can't be negative", "error"); return; }
    if (!draft.name.trim()) { showToast("Give the item a name", "error"); return; }
    const body = {};
    for (const f of changed) {
      const v = draft[f];
      if (f === "quantity") body.quantity = qtyNum;
      else if (f === "name") body.name = v.trim();
      else if (f === "storage" || f === "expiry_date") body[f] = v || null;
      else body[f] = v;
    }
    setBusy(true);
    try {
      const updated = await inventoryAPI.update(saved.id, body);
      setSaved(updated);
      setDraft(toDraft(updated));
      setEditing(false);
      onSaved?.(updated);
      showToast("Changes saved", "success");
    } catch (e) {
      showToast(e?.message || "Couldn't save the changes", "error");
    }
    setBusy(false);
  }

  function discard() {
    setDraft(toDraft(saved));
    setEditing(false);
  }

  function back() {
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    onBack();
  }

  const cat = getCatMeta(catOf(saved));
  const storage = storageMeta(saved.storage);
  const status = statusMeta(saved.status);
  const daysLeft = daysUntil(saved.expiry_date);
  const accent = storage?.color || cat.color;

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 10, background: T.bg, display: "flex", flexDirection: "column", animation: "lo-slide-in 0.25s cubic-bezier(0.32,0.72,0,1) forwards" }}>
      <DetailHeader
        onBack={back}
        title={saved.name}
        subtitle={[cat.label, storage?.label].filter(Boolean).join(" · ")}
        trailing={!editing && (
          <button aria-label="Edit item" title="Edit" onClick={() => setEditing(true)}
            style={{ width: 34, height: 34, borderRadius: 9999, background: T.elevated, border: `1px solid ${T.border}`, color: T.text, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <Icon name="edit" size={15} />
          </button>
        )}
      />

      <PageScroll padBottom={`calc(${T.navHeight} + 100px)`}>
        {/* Hero card with the quantity, editable straight away */}
        <div style={{ padding: "0 16px 16px" }}>
          <div style={{ borderRadius: 18, padding: 20, background: `linear-gradient(135deg, ${accent}1A, ${accent}08)`, border: `1px solid ${accent}33` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: accent + "22", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon name="pantry" size={26} color={accent} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: T.text, letterSpacing: -0.4 }}>{saved.name}</div>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 6 }}>
                  <Badge meta={cat} />
                  {saved.status && saved.status !== "ok" && <Badge meta={status} />}
                  {storage && <Badge meta={storage} />}
                  <ExpiryBadge daysLeft={daysLeft} />
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 600 }}>Quantity</div>
              <div style={{ flex: 1 }} />
              <div style={{ display: "flex", alignItems: "center", background: T.elevated, borderRadius: 10, border: `1px solid ${qtyInvalid ? T.negative : T.border}`, overflow: "hidden" }}>
                <button aria-label="Decrease quantity" title={`−${step}`} onClick={() => bump(-1)}
                  style={{ width: 40, height: 40, border: "none", background: "transparent", color: T.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name="minus" size={16} />
                </button>
                {/* Tap the number to type it (opens the number pad on a phone) */}
                <input aria-label="Quantity" type="number" inputMode="decimal" min={0} step="any" value={draft.quantity}
                  onChange={(e) => set("quantity", e.target.value)} onFocus={(e) => e.target.select()}
                  style={{ width: 72, height: 40, border: "none", borderLeft: `1px solid ${T.border}`, borderRight: `1px solid ${T.border}`, background: "transparent", color: T.text, textAlign: "center", fontSize: 16, fontWeight: 700, fontFamily: T.fontMono, outline: "none" }} />
                <button aria-label="Increase quantity" title={`+${step}`} onClick={() => bump(1)}
                  style={{ width: 40, height: 40, border: "none", background: "transparent", color: T.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name="plus" size={16} />
                </button>
              </div>
              {editing ? (
                <select aria-label="Unit" value={draft.unit} onChange={(e) => set("unit", e.target.value)}
                  style={{ ...input, width: 76, padding: "9px 6px", fontSize: 13 }}>
                  {[...new Set([draft.unit, ...UNITS])].map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              ) : (
                <div style={{ fontSize: 12, color: T.textDim, minWidth: 40 }}>{draft.unit}</div>
              )}
            </div>
          </div>
        </div>

        {editing ? (
          <div style={{ padding: "0 16px 16px" }}>
            <Card style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <div style={fieldLabel}>Name</div>
                <input aria-label="Name" value={draft.name} onChange={(e) => set("name", e.target.value)} maxLength={100} style={input} />
              </div>
              <div>
                <div style={fieldLabel}>Category</div>
                <Chips options={Object.entries(CAT_MAP).map(([id, m]) => ({ id, ...m }))} value={draft.category} onChange={(v) => set("category", v)} />
              </div>
              <div>
                <div style={fieldLabel}>Status</div>
                <Chips options={STATUSES} value={draft.status} onChange={(v) => set("status", v)} />
              </div>
              <div>
                <div style={fieldLabel}>Storage</div>
                <Chips options={STORAGES} value={draft.storage} onChange={(v) => set("storage", v)} allowNone />
              </div>
              <div>
                <div style={fieldLabel}>Expires</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input aria-label="Expiry date" type="date" value={draft.expiry_date} onChange={(e) => set("expiry_date", e.target.value)} style={{ ...input, flex: 1 }} />
                  {draft.expiry_date && (
                    <button onClick={() => set("expiry_date", "")} style={{ padding: "0 14px", background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 10, color: T.textMuted, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                      Clear
                    </button>
                  )}
                </div>
              </div>
              <div>
                <div style={fieldLabel}>Notes</div>
                <textarea aria-label="Notes" value={draft.notes} onChange={(e) => set("notes", e.target.value)} rows={3} placeholder="e.g. brand, where it's kept, use within 2 days once opened"
                  style={{ ...input, resize: "vertical", lineHeight: 1.45 }} />
              </div>
            </Card>
          </div>
        ) : (
          <div style={{ padding: "0 16px 16px" }}>
            <Card style={{ padding: 16 }}>
              <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 12 }}>Details</div>
              {[
                { label: "Category", value: cat.label, icon: "pantry" },
                { label: "Status", value: status.label, icon: "bolt", color: status.id === "ok" ? T.text : status.color },
                { label: "Storage", value: storage?.label || "Not set", icon: "location" },
                { label: "Expires", value: saved.expiry_date ? fmtDate(saved.expiry_date) : "No date set", icon: "calendar", color: daysLeft !== null && daysLeft <= 3 ? T.amber : T.text },
                { label: "Notes", value: saved.notes || "None", icon: "edit" },
              ].map(({ label, value, icon, color }, i, arr) => (
                <div key={label} style={{ display: "flex", alignItems: "flex-start", gap: 10, paddingBottom: i < arr.length - 1 ? 10 : 0, marginBottom: i < arr.length - 1 ? 10 : 0, borderBottom: i < arr.length - 1 ? `0.5px solid ${T.border}` : "none" }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: T.elevated, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon name={icon} size={14} color={T.textDim} />
                  </div>
                  <span style={{ fontSize: 12, color: T.textMuted, flex: 1, paddingTop: 6 }}>{label}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: color || T.text, paddingTop: 6, maxWidth: "62%", textAlign: "right", whiteSpace: "pre-wrap" }}>{value}</span>
                </div>
              ))}
            </Card>
          </div>
        )}

        {/* Expiry warning, only when there is a real date */}
        {!editing && daysLeft !== null && daysLeft <= 3 && (
          <div style={{ padding: "0 16px 20px" }}>
            <div style={{ borderRadius: 14, padding: 14, display: "flex", gap: 10, background: `linear-gradient(90deg, ${T.amber}18, ${T.teal}18)`, border: `1px solid ${T.amber}44` }}>
              <div style={{ width: 28, height: 28, borderRadius: 9999, background: T.amber, display: "flex", alignItems: "center", justifyContent: "center", color: "#0A0A0F", flexShrink: 0 }}>
                <Icon name="sparkle" size={15} strokeWidth={2.4} />
              </div>
              <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.55 }}>
                <b style={{ color: T.amber }}>{saved.name} {daysLeft < 0 ? "has expired" : `expires in ${daysLeft}d`}</b> — use it in a meal soon so it doesn't go to waste.
              </div>
            </div>
          </div>
        )}
      </PageScroll>

      {/* Sticky actions, above the tab bar. Nothing is saved until Save is pressed. */}
      <div style={{ position: "absolute", left: 16, right: 16, bottom: `calc(${T.navHeight} + 16px)`, display: "flex", gap: 8, zIndex: 24 }}>
        {dirty || editing ? (
          <>
            <button onClick={discard} disabled={busy}
              style={{ flex: 1, height: 52, borderRadius: 14, background: T.elevated, border: `1px solid ${T.border}`, color: T.text, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              {dirty ? "Discard" : "Cancel"}
            </button>
            <button onClick={save} disabled={busy || !dirty}
              style={{ flex: 2, height: 52, borderRadius: 14, background: !dirty || busy ? T.elevated2 : T.orange, border: "none", color: !dirty || busy ? T.textMuted : "#0A0A0F", fontWeight: 700, fontSize: 14, cursor: !dirty || busy ? "default" : "pointer", fontFamily: "inherit" }}>
              {busy ? "Saving…" : "Save changes"}
            </button>
          </>
        ) : (
          <button onClick={onDelete}
            style={{ flex: 1, height: 52, borderRadius: 14, background: T.elevated, border: `1px solid ${T.negative}55`, color: T.negative, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Icon name="trash" size={16} color={T.negative} />
            Remove from Pantry
          </button>
        )}
      </div>
    </div>
  );
}
