import { useState } from "react";
import { T } from "../../design/tokens";
import { Icon } from "../../design/icons";
import { Card, DetailHeader, PageScroll, MacroBar, MacroRing } from "../../design/components";
import { showToast } from "../../utils/toast";

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"];
const MEAL_TYPE_COLORS = { breakfast: T.amber, lunch: T.teal, dinner: T.violet, snack: T.textMuted, default: T.textMuted };

function inp(focused) {
  return {
    width: "100%", background: T.elevated, border: `1px solid ${focused ? T.teal : T.border}`,
    borderRadius: 10, padding: "10px 12px", color: T.text, fontSize: 14,
    fontFamily: "inherit", outline: "none", boxSizing: "border-box",
  };
}

function NumField({ label, value, onChange, color }) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <div style={{ fontSize: 10, color: color || T.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        min={0}
        style={{ ...inp(focused), textAlign: "center", fontSize: 18, fontWeight: 700, fontFamily: T.fontMono, padding: "8px 0" }}
      />
    </div>
  );
}

export default function MealDetailPage({ meal = {}, targets = {}, onBack, onDelete, onUpdate, onSaveAsTemplate }) {
  const {
    id,
    name: initialName = "Meal",
    meal_type: initialMealType = "lunch",
    calories: initialCal = 0,
    protein_g: initialP = 0,
    carbs_g: initialC = 0,
    fat_g: initialF = 0,
    date: mealDate,
  } = meal;

  const defaultTargets = { calories: 2100, protein: 190, carbs: 200, fat: 70 };
  const t = { ...defaultTargets, ...targets };

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [eName, setEName] = useState(initialName);
  const [eMealType, setEMealType] = useState(initialMealType);
  const [eCal, setECal] = useState(String(Math.round(initialCal)));
  const [eP, setEP] = useState(String(Math.round(initialP)));
  const [eC, setEC] = useState(String(Math.round(initialC)));
  const [eF, setEF] = useState(String(Math.round(initialF)));

  // Display values (shown when not editing)
  const displayName = initialName;
  const displayCal = Math.round(initialCal);
  const displayP = Math.round(initialP);
  const displayC = Math.round(initialC);
  const displayF = Math.round(initialF);
  const displayType = initialMealType || "lunch";

  async function handleSave() {
    if (!onUpdate) return;
    if ([eCal, eP, eC, eF].some((v) => parseFloat(v) < 0)) {
      showToast("Calories and macros can't be negative", "error");
      return;
    }
    setSaving(true);
    try {
      await onUpdate({
        name: eName.trim() || displayName,
        meal_type: eMealType,
        calories: parseFloat(eCal) || 0,
        protein_g: parseFloat(eP) || 0,
        carbs_g: parseFloat(eC) || 0,
        fat_g: parseFloat(eF) || 0,
      });
      setEditing(false);
    } catch {}
    setSaving(false);
  }

  function handleCancelEdit() {
    setEName(initialName);
    setEMealType(initialMealType);
    setECal(String(Math.round(initialCal)));
    setEP(String(Math.round(initialP)));
    setEC(String(Math.round(initialC)));
    setEF(String(Math.round(initialF)));
    setEditing(false);
  }

  const mealTypeColor = MEAL_TYPE_COLORS[displayType] || MEAL_TYPE_COLORS.default;

  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 10,
      background: T.bg, display: "flex", flexDirection: "column",
      animation: "lo-slide-in 0.25s cubic-bezier(0.32,0.72,0,1) forwards",
    }}>
      <DetailHeader
        onBack={editing ? handleCancelEdit : onBack}
        title={displayName.length > 24 ? displayName.slice(0, 24) + "…" : displayName}
        subtitle={`${displayType} · ${mealDate || "today"}`}
        trailing={
          editing ? (
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                height: 30, padding: "0 14px", background: T.teal, border: "none",
                borderRadius: 8, color: "#0A0A0F", fontSize: 12, fontWeight: 700,
                cursor: saving ? "default" : "pointer", fontFamily: "inherit",
                opacity: saving ? 0.5 : 1,
              }}
            >
              {saving ? "…" : "Save"}
            </button>
          ) : (
            <button
              aria-label="Edit meal"
              title="Edit"
              onClick={() => setEditing(true)}
              style={{
                width: 34, height: 34, borderRadius: 9999, background: T.elevated,
                border: `1px solid ${T.border}`, color: T.text, padding: 0,
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
              }}
            >
              <Icon name="edit" size={15} />
            </button>
          )
        }
      />

      <PageScroll padBottom={`calc(${T.navHeight} + 120px)`}>
        {/* Meal type pill */}
        <div style={{ padding: "0 16px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase",
              color: mealTypeColor, background: `${mealTypeColor}22`,
              padding: "3px 10px", borderRadius: 6,
            }}>
              {displayType}
            </span>
            {mealDate && (
              <span style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>{mealDate}</span>
            )}
          </div>
        </div>

        {/* Edit form */}
        {editing ? (
          <div style={{ padding: "0 16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Name */}
            <div>
              <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Meal name</div>
              <input
                value={eName}
                onChange={e => setEName(e.target.value)}
                style={{ ...inp(false), fontSize: 15, fontWeight: 600 }}
                placeholder="Meal name"
              />
            </div>

            {/* Meal type */}
            <div>
              <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Type</div>
              <div style={{ display: "flex", gap: 6 }}>
                {MEAL_TYPES.map(mt => (
                  <button key={mt} onClick={() => setEMealType(mt)}
                    style={{
                      flex: 1, padding: "7px 4px", borderRadius: 8,
                      background: eMealType === mt ? T.teal : T.elevated,
                      color: eMealType === mt ? "#0A0A0F" : T.text,
                      border: `1px solid ${eMealType === mt ? T.teal : T.border}`,
                      fontSize: 11, fontWeight: eMealType === mt ? 700 : 500,
                      cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize",
                    }}
                  >
                    {mt}
                  </button>
                ))}
              </div>
            </div>

            {/* Macros grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <NumField label="Calories (kcal)" value={eCal} onChange={setECal} color={T.amber} />
              <NumField label="Protein (g)" value={eP} onChange={setEP} color={T.teal} />
              <NumField label="Carbs (g)" value={eC} onChange={setEC} color={T.amber} />
              <NumField label="Fat (g)" value={eF} onChange={setEF} color={T.violet} />
            </div>

            <button onClick={handleSave} disabled={saving}
              style={{
                padding: "13px 0", background: saving ? T.elevated : T.teal, border: "none",
                borderRadius: 12, color: saving ? T.textMuted : "#0A0A0F",
                fontSize: 14, fontWeight: 700, cursor: saving ? "default" : "pointer", fontFamily: "inherit",
              }}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        ) : (
          <>
            {/* Macro ring + bars */}
            <div style={{ padding: "0 16px 16px" }}>
              <Card style={{ padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <MacroRing pct={displayCal / t.calories} value={displayCal} target={t.calories} />
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                    <MacroBar label="Protein" value={displayP} target={t.protein} color={T.teal} unit="g" />
                    <MacroBar label="Carbs" value={displayC} target={t.carbs} color={T.amber} unit="g" />
                    <MacroBar label="Fat" value={displayF} target={t.fat} color={T.violet} unit="g" />
                  </div>
                </div>

                {/* Mini stats row */}
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: `0.5px solid ${T.border}`, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                  {[
                    { label: "Protein", value: `${displayP}g`, color: T.teal },
                    { label: "Carbs", value: `${displayC}g`, color: T.amber },
                    { label: "Fat", value: `${displayF}g`, color: T.violet },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 16, fontWeight: 700, fontFamily: T.fontMono, color }}>{value}</div>
                      <div style={{ fontSize: 9, color: T.textDim, letterSpacing: 0.3, textTransform: "uppercase", fontWeight: 600, marginTop: 2 }}>{label}</div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* AI insight */}
            <div style={{ padding: "0 16px 20px" }}>
              <div style={{
                borderRadius: 14, padding: 14, display: "flex", gap: 10,
                background: `linear-gradient(90deg, ${T.violet}18, ${T.teal}18)`,
                border: `1px solid ${T.violet}44`,
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 9999, background: T.violet,
                  display: "flex", alignItems: "center", justifyContent: "center", color: "#0A0A0F", flexShrink: 0,
                }}>
                  <Icon name="sparkle" size={15} strokeWidth={2.4} />
                </div>
                <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.55 }}>
                  This meal provides <b style={{ color: T.text }}>{displayP}g protein</b> and <b style={{ color: T.text }}>{displayCal} kcal</b> — {displayP >= 30 ? "solid protein hit. " : "low on protein. "}
                  {displayCal > 0 ? `That's ${Math.round((displayCal / t.calories) * 100)}% of your daily calorie target.` : ""}
                </div>
              </div>
            </div>
          </>
        )}
      </PageScroll>

      {/* Sticky actions (view mode only) */}
      {!editing && (
        <div style={{ position: "absolute", left: 16, right: 16, bottom: `calc(${T.navHeight} + 16px)`, display: "flex", gap: 8, zIndex: 24 }}>
          <button
            aria-label="Delete meal"
            title="Delete"
            onClick={onDelete}
            style={{
              width: 52, height: 52, borderRadius: 14, background: T.elevated,
              border: `1px solid ${T.border}`, color: T.negative, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <Icon name="trash" size={17} />
          </button>
          <button
            onClick={onSaveAsTemplate}
            style={{
              flex: 1, height: 52, borderRadius: 14, background: T.teal, border: "none",
              color: "#0A0A0F", fontWeight: 700, fontSize: 13, cursor: "pointer",
              fontFamily: "inherit", boxShadow: `0 10px 30px ${T.teal}55`,
            }}
          >
            Save as template
          </button>
        </div>
      )}
    </div>
  );
}
