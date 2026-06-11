import { useState } from "react";
import { T } from "../../design/tokens";
import { Icon } from "../../design/icons";
import { Card, DetailHeader, PageScroll } from "../../design/components";
import { inventoryAPI } from "../../utils/api";

function ExpiryBadge({ daysLeft }) {
  if (daysLeft === null || daysLeft === undefined) return null;
  const isExpired = daysLeft < 0;
  const isWarning = daysLeft >= 0 && daysLeft <= 3;
  const isOk = daysLeft > 3;
  const color = isExpired ? T.negative : isWarning ? T.amber : T.teal;
  const label = isExpired ? "Expired" : daysLeft === 0 ? "Today" : `${daysLeft}d left`;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, color, background: color + "22",
      padding: "2px 8px", borderRadius: 6, letterSpacing: 0.3,
    }}>
      {label}
    </span>
  );
}

export default function PantryDetailPage({ item = {}, onBack, onDelete, onChanged }) {
  const {
    name = "Item",
    category = "Other",
    quantity = 0,
    unit = "",
    location = "Fridge",
    expiry_date = null,
    notes = "",
    nutrition = null,
  } = item;

  const [qty, setQty] = useState(quantity ?? 0);

  // Persist quantity changes (optimistic — revert silently is not worth it here)
  function changeQty(delta) {
    setQty((q) => {
      const next = Math.max(0, q + delta);
      if (item.id) inventoryAPI.update(item.id, { quantity: next }).then(() => onChanged?.()).catch(() => {});
      return next;
    });
  }

  // Calculate days until expiry
  const daysLeft = expiry_date
    ? Math.floor((new Date(expiry_date) - new Date()) / 86400000)
    : null;

  const macros = nutrition;

  const LOCATION_COLORS = {
    Fridge: T.teal,
    Freezer: T.violet,
    Pantry: T.amber,
    Counter: "#FF9F43",
  };
  const locColor = LOCATION_COLORS[location] || T.textMuted;

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
        subtitle={`${category} · ${location}`}
      />

      <PageScroll padBottom={100}>
        {/* Hero card */}
        <div style={{ padding: "0 16px 16px" }}>
          <div style={{
            borderRadius: 18, padding: 20,
            background: `linear-gradient(135deg, ${locColor}1A, ${locColor}08)`,
            border: `1px solid ${locColor}33`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: locColor + "22", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="pantry" size={26} color={locColor} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: T.text, letterSpacing: -0.4 }}>{name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: T.textMuted }}>{category}</span>
                  <span style={{ fontSize: 9, color: T.textDim }}>·</span>
                  <span style={{ fontSize: 11, color: locColor, fontWeight: 600 }}>{location}</span>
                  {daysLeft !== null && <ExpiryBadge daysLeft={daysLeft} />}
                </div>
              </div>
            </div>

            {/* Quantity control */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 600 }}>Quantity</div>
              <div style={{ flex: 1 }} />
              <div style={{ display: "flex", alignItems: "center", gap: 0, background: T.elevated, borderRadius: 10, border: `1px solid ${T.border}`, overflow: "hidden" }}>
                <button
                  onClick={() => changeQty(-1)}
                  style={{ width: 36, height: 36, border: "none", background: "transparent", color: T.text, fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  <Icon name="minus" size={16} />
                </button>
                <div style={{ width: 48, textAlign: "center", fontSize: 16, fontWeight: 700, fontFamily: T.fontMono, color: T.text }}>
                  {qty}
                </div>
                <button
                  onClick={() => changeQty(1)}
                  style={{ width: 36, height: 36, border: "none", background: "transparent", color: T.text, fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  <Icon name="plus" size={16} />
                </button>
              </div>
              <div style={{ fontSize: 12, color: T.textDim, minWidth: 60 }}>{unit}</div>
            </div>
          </div>
        </div>

        {/* Expiry + details */}
        <div style={{ padding: "0 16px 16px" }}>
          <Card style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 12 }}>Details</div>
            {[
              { label: "Category", value: category, icon: "pantry" },
              { label: "Storage", value: location, icon: "bolt" },
              { label: "Expires", value: expiry_date || "No date set", icon: "calendar", highlight: daysLeft !== null && daysLeft <= 3 },
              { label: "Notes", value: notes || "None", icon: "edit" },
            ].map(({ label, value, icon, highlight }, i, arr) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: i < arr.length - 1 ? 10 : 0, marginBottom: i < arr.length - 1 ? 10 : 0, borderBottom: i < arr.length - 1 ? `0.5px solid ${T.border}` : "none" }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: T.elevated, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name={icon} size={14} color={T.textDim} />
                </div>
                <span style={{ fontSize: 12, color: T.textMuted, flex: 1 }}>{label}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: highlight ? T.amber : T.text }}>{value}</span>
              </div>
            ))}
          </Card>
        </div>

        {/* Nutrition */}
        {nutrition && (
          <div style={{ padding: "0 16px 16px" }}>
            <Card style={{ padding: 16 }}>
              <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 14 }}>Nutrition per serving</div>
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  { label: "Calories", value: `${macros.kcal}`, unit: "kcal", color: T.amber },
                  { label: "Protein", value: `${macros.P}g`, unit: "", color: T.teal },
                  { label: "Carbs", value: `${macros.C}g`, unit: "", color: T.amber },
                  { label: "Fat", value: `${macros.F}g`, unit: "", color: T.violet },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ flex: 1, background: T.elevated, borderRadius: 10, padding: "10px 0", textAlign: "center" }}>
                    <div style={{ fontSize: 16, fontWeight: 700, fontFamily: T.fontMono, color }}>{value}</div>
                    <div style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600, marginTop: 3 }}>{label}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* Expiry warning — only when real expiry data says so */}
        {daysLeft !== null && daysLeft <= 3 && (
          <div style={{ padding: "0 16px 20px" }}>
            <div style={{
              borderRadius: 14, padding: 14, display: "flex", gap: 10,
              background: `linear-gradient(90deg, ${T.amber}18, ${T.teal}18)`,
              border: `1px solid ${T.amber}44`,
            }}>
              <div style={{ width: 28, height: 28, borderRadius: 9999, background: T.amber, display: "flex", alignItems: "center", justifyContent: "center", color: "#0A0A0F", flexShrink: 0 }}>
                <Icon name="sparkle" size={15} strokeWidth={2.4} />
              </div>
              <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.55 }}>
                <b style={{ color: T.amber }}>{name} {daysLeft < 0 ? "has expired" : `expires in ${daysLeft}d`}</b> — use it in a meal soon so it doesn't go to waste.
              </div>
            </div>
          </div>
        )}
      </PageScroll>

      {/* Sticky actions */}
      <div style={{ position: "absolute", left: 16, right: 16, bottom: 24, display: "flex", gap: 8, zIndex: 24 }}>
        <button
          onClick={onDelete}
          style={{ flex: 1, height: 52, borderRadius: 14, background: T.elevated, border: `1px solid ${T.negative}55`, color: T.negative, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          <Icon name="trash" size={16} color={T.negative} />
          Remove from Pantry
        </button>
      </div>
    </div>
  );
}
