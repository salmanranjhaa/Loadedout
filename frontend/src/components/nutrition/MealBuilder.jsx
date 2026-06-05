import { useState, useMemo } from "react";
import { T } from "../../design/tokens";
import { Icon } from "../../design/icons";
import { Card, Chip, BottomSheet } from "../../design/components";
import FoodSearch from "./FoodSearch";

const MEAL_GROUPS = ["Breakfast", "Lunch", "Dinner", "Snacks"];

function inp() {
  return {
    width: "100%",
    background: T.elevated,
    border: `1px solid ${T.border}`,
    borderRadius: T.rInput,
    padding: "10px 12px",
    color: T.text,
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
    textAlign: "center",
    fontWeight: 700,
    fontFamily: T.fontMono,
  };
}

function MacroPill({ label, value, color }) {
  return (
    <div
      style={{
        background: T.surface,
        borderRadius: 8,
        padding: "8px 6px",
        textAlign: "center",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 9,
          color: T.textDim,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color,
          fontFamily: T.fontMono,
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

export default function MealBuilder({
  open,
  onClose,
  groupName,
  todayMeals,
  onLogFood,
}) {
  const [selectedFood, setSelectedFood] = useState(null);
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState("serving"); // "serving" | "g"
  const [logging, setLogging] = useState(false);

  const activeGroup = useMemo(() => {
    const key = groupName.toLowerCase();
    return todayMeals.filter((m) => {
      const t = (m.meal_type || "").toLowerCase();
      if (key === "snacks") return t === "snack" || t === "snacks";
      return t === key;
    });
  }, [todayMeals, groupName]);

  const groupTotals = useMemo(() => {
    return activeGroup.reduce(
      (acc, m) => {
        acc.calories += m.calories || 0;
        acc.protein += m.protein_g || 0;
        acc.carbs += m.carbs_g || 0;
        acc.fat += m.fat_g || 0;
        return acc;
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
  }, [activeGroup]);

  const previewMacros = useMemo(() => {
    if (!selectedFood || !amount) return null;
    const amt = parseFloat(amount) || 0;
    let multiplier = 0;
    if (unit === "g") {
      multiplier = amt / 100;
    } else {
      // serving
      multiplier = (amt * selectedFood.serving_g) / 100;
    }
    return {
      calories: Math.round(selectedFood.calories * multiplier),
      protein_g: Math.round(selectedFood.protein_g * multiplier * 10) / 10,
      carbs_g: Math.round(selectedFood.carbs_g * multiplier * 10) / 10,
      fat_g: Math.round(selectedFood.fat_g * multiplier * 10) / 10,
    };
  }, [selectedFood, amount, unit]);

  async function handleLog() {
    if (!selectedFood || !amount || logging) return;
    setLogging(true);
    try {
      const mealType = groupName.toLowerCase().replace("snacks", "snack");
      const amt = parseFloat(amount) || 1;
      let multiplier = 0;
      if (unit === "g") {
        multiplier = amt / 100;
      } else {
        multiplier = (amt * selectedFood.serving_g) / 100;
      }
      await onLogFood?.({
        name: `${selectedFood.name} (${unit === "g" ? amt + "g" : amt + " serving" + (amt !== 1 ? "s" : "")})`,
        meal_type: mealType,
        calories: Math.round(selectedFood.calories * multiplier),
        protein_g: Math.round(selectedFood.protein_g * multiplier * 10) / 10,
        carbs_g: Math.round(selectedFood.carbs_g * multiplier * 10) / 10,
        fat_g: Math.round(selectedFood.fat_g * multiplier * 10) / 10,
      });
      setSelectedFood(null);
      setAmount("");
      setUnit("serving");
    } catch {}
    setLogging(false);
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={`Add to ${groupName}`}>
      {!selectedFood ? (
        <>
          <FoodSearch onSelectFood={setSelectedFood} />
          {activeGroup.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: T.textMuted,
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                {groupName} so far today
              </div>
              <Card style={{ padding: "10px 14px" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4,1fr)",
                    gap: 6,
                  }}
                >
                  <MacroPill label="Cal" value={Math.round(groupTotals.calories)} color={T.amber} />
                  <MacroPill label="P" value={Math.round(groupTotals.protein)} color={T.teal} />
                  <MacroPill label="C" value={Math.round(groupTotals.carbs)} color={T.amber} />
                  <MacroPill label="F" value={Math.round(groupTotals.fat)} color={T.violet} />
                </div>
              </Card>
            </div>
          )}
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <button
            onClick={() => {
              setSelectedFood(null);
              setAmount("");
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "none",
              border: "none",
              color: T.textMuted,
              cursor: "pointer",
              fontSize: 12,
              fontFamily: "inherit",
              padding: 0,
            }}
          >
            <Icon name="chev-left" size={14} />
            Back to search
          </button>

          <div
            style={{
              background: T.elevated,
              border: `1px solid ${T.border}`,
              borderRadius: T.rCard,
              padding: 14,
            }}
          >
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: T.text,
                marginBottom: 4,
              }}
            >
              {selectedFood.name}
            </div>
            <div
              style={{
                fontSize: 11,
                color: T.textMuted,
                fontFamily: T.fontMono,
              }}
            >
              {selectedFood.calories} kcal · {selectedFood.protein_g}g P ·{" "}
              {selectedFood.carbs_g}g C · {selectedFood.fat_g}g F / 100g
            </div>
            <div
              style={{
                fontSize: 10,
                color: T.textDim,
                marginTop: 4,
              }}
            >
              Typical serving: {selectedFood.serving_name} ({selectedFood.serving_g}g)
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 10,
                  color: T.textMuted,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 6,
                }}
              >
                Amount
              </div>
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={unit === "g" ? "grams" : "servings"}
                style={inp()}
              />
            </div>
            <div style={{ display: "flex", gap: 6, paddingTop: 20 }}>
              {["serving", "g"].map((u) => (
                <Chip
                  key={u}
                  active={unit === u}
                  onClick={() => setUnit(u)}
                  size="lg"
                >
                  {u}
                </Chip>
              ))}
            </div>
          </div>

          {previewMacros && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4,1fr)",
                gap: 8,
              }}
            >
              {[
                ["Cal", previewMacros.calories, T.amber],
                ["P", Math.round(previewMacros.protein_g), T.teal],
                ["C", Math.round(previewMacros.carbs_g), T.amber],
                ["F", Math.round(previewMacros.fat_g), T.violet],
              ].map(([l, v, c]) => (
                <MacroPill key={l} label={l} value={v} color={c} />
              ))}
            </div>
          )}

          <button
            onClick={handleLog}
            disabled={logging || !amount}
            style={{
              padding: "13px 0",
              background:
                logging || !amount ? T.elevated : `linear-gradient(135deg,${T.teal},${T.violet})`,
              color: logging || !amount ? T.textMuted : "#0A0A0F",
              border: "none",
              borderRadius: T.rCard,
              fontSize: 14,
              fontWeight: 700,
              cursor: logging || !amount ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <Icon name="plus" size={16} />
            {logging ? "Logging…" : `Add to ${groupName}`}
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
