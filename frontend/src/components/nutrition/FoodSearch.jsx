import { useState, useMemo } from "react";
import { T } from "../../design/tokens";
import { Icon } from "../../design/icons";
import { Badge } from "../../design/components";

const MOCK_FOODS = [
  { name: "Chicken Breast", calories: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, serving_g: 100 },
  { name: "Rice (white, cooked)", calories: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3, serving_g: 100 },
  { name: "Rice (brown, cooked)", calories: 112, protein_g: 2.6, carbs_g: 24, fat_g: 0.9, serving_g: 100 },
  { name: "Broccoli", calories: 34, protein_g: 2.8, carbs_g: 7, fat_g: 0.4, serving_g: 100 },
  { name: "Salmon", calories: 208, protein_g: 20, carbs_g: 0, fat_g: 13, serving_g: 100 },
  { name: "Eggs (whole)", calories: 155, protein_g: 13, carbs_g: 1.1, fat_g: 11, serving_g: 100 },
  { name: "Egg Whites", calories: 52, protein_g: 11, carbs_g: 0.7, fat_g: 0.2, serving_g: 100 },
  { name: "Oats (dry)", calories: 389, protein_g: 16.9, carbs_g: 66, fat_g: 6.9, serving_g: 100 },
  { name: "Greek Yogurt", calories: 59, protein_g: 10, carbs_g: 3.6, fat_g: 0.4, serving_g: 100 },
  { name: "Banana", calories: 89, protein_g: 1.1, carbs_g: 23, fat_g: 0.3, serving_g: 100 },
  { name: "Apple", calories: 52, protein_g: 0.3, carbs_g: 14, fat_g: 0.2, serving_g: 100 },
  { name: "Almonds", calories: 579, protein_g: 21, carbs_g: 22, fat_g: 49, serving_g: 100 },
  { name: "Peanut Butter", calories: 588, protein_g: 25, carbs_g: 20, fat_g: 50, serving_g: 100 },
  { name: "Sweet Potato", calories: 86, protein_g: 1.6, carbs_g: 20, fat_g: 0.1, serving_g: 100 },
  { name: "Avocado", calories: 160, protein_g: 2, carbs_g: 9, fat_g: 15, serving_g: 100 },
  { name: "Tuna (canned)", calories: 132, protein_g: 28, carbs_g: 0, fat_g: 1, serving_g: 100 },
  { name: "Turkey Breast", calories: 135, protein_g: 30, carbs_g: 0, fat_g: 1, serving_g: 100 },
  { name: "Cottage Cheese", calories: 98, protein_g: 11, carbs_g: 3.4, fat_g: 4.3, serving_g: 100 },
  { name: "Quinoa (cooked)", calories: 120, protein_g: 4.4, carbs_g: 21, fat_g: 1.9, serving_g: 100 },
  { name: "Pasta (cooked)", calories: 131, protein_g: 5, carbs_g: 25, fat_g: 1.1, serving_g: 100 },
  { name: "Ground Beef (95% lean)", calories: 171, protein_g: 26, carbs_g: 0, fat_g: 7, serving_g: 100 },
  { name: "Pork Tenderloin", calories: 143, protein_g: 26, carbs_g: 0, fat_g: 3.5, serving_g: 100 },
  { name: "Shrimp", calories: 99, protein_g: 24, carbs_g: 0.2, fat_g: 0.3, serving_g: 100 },
  { name: "Tofu", calories: 76, protein_g: 8, carbs_g: 1.9, fat_g: 4.8, serving_g: 100 },
  { name: "Lentils (cooked)", calories: 116, protein_g: 9, carbs_g: 20, fat_g: 0.4, serving_g: 100 },
  { name: "Chickpeas (cooked)", calories: 164, protein_g: 8.9, carbs_g: 27, fat_g: 2.6, serving_g: 100 },
  { name: "Black Beans", calories: 132, protein_g: 8.9, carbs_g: 24, fat_g: 0.5, serving_g: 100 },
  { name: "Whole Wheat Bread", calories: 247, protein_g: 13, carbs_g: 41, fat_g: 3.4, serving_g: 100 },
  { name: "Milk (2%)", calories: 50, protein_g: 3.4, carbs_g: 4.8, fat_g: 2, serving_g: 100 },
  { name: "Whey Protein", calories: 400, protein_g: 80, carbs_g: 8, fat_g: 5, serving_g: 100 },
  { name: "Olive Oil", calories: 884, protein_g: 0, carbs_g: 0, fat_g: 100, serving_g: 100 },
  { name: "Butter", calories: 717, protein_g: 0.9, carbs_g: 0.1, fat_g: 81, serving_g: 100 },
  { name: "Cheese (cheddar)", calories: 402, protein_g: 25, carbs_g: 1.3, fat_g: 33, serving_g: 100 },
  { name: "Mozzarella", calories: 280, protein_g: 28, carbs_g: 3.1, fat_g: 17, serving_g: 100 },
  { name: "Spinach", calories: 23, protein_g: 2.9, carbs_g: 3.6, fat_g: 0.4, serving_g: 100 },
  { name: "Kale", calories: 49, protein_g: 4.3, carbs_g: 9, fat_g: 0.9, serving_g: 100 },
  { name: "Carrots", calories: 41, protein_g: 0.9, carbs_g: 10, fat_g: 0.2, serving_g: 100 },
  { name: "Bell Pepper", calories: 31, protein_g: 1, carbs_g: 6, fat_g: 0.3, serving_g: 100 },
  { name: "Tomato", calories: 18, protein_g: 0.9, carbs_g: 3.9, fat_g: 0.2, serving_g: 100 },
  { name: "Cucumber", calories: 15, protein_g: 0.7, carbs_g: 3.6, fat_g: 0.1, serving_g: 100 },
  { name: "Potato", calories: 77, protein_g: 2, carbs_g: 17, fat_g: 0.1, serving_g: 100 },
  { name: "Blueberries", calories: 57, protein_g: 0.7, carbs_g: 14, fat_g: 0.3, serving_g: 100 },
  { name: "Strawberries", calories: 32, protein_g: 0.7, carbs_g: 7.7, fat_g: 0.3, serving_g: 100 },
  { name: "Orange", calories: 47, protein_g: 0.9, carbs_g: 12, fat_g: 0.1, serving_g: 100 },
  { name: "Grapes", calories: 69, protein_g: 0.7, carbs_g: 18, fat_g: 0.2, serving_g: 100 },
  { name: "Mango", calories: 60, protein_g: 0.8, carbs_g: 15, fat_g: 0.4, serving_g: 100 },
  { name: "Pineapple", calories: 50, protein_g: 0.5, carbs_g: 13, fat_g: 0.1, serving_g: 100 },
  { name: "Watermelon", calories: 30, protein_g: 0.6, carbs_g: 8, fat_g: 0.2, serving_g: 100 },
];

export default function FoodSearch({ onSelect }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [portion, setPortion] = useState("100");

  const filtered = useMemo(() => {
    if (!query.trim()) return MOCK_FOODS.slice(0, 10);
    const q = query.toLowerCase();
    return MOCK_FOODS.filter((f) => f.name.toLowerCase().includes(q));
  }, [query]);

  const handleSelect = (food) => {
    setSelected(food);
    setPortion(String(food.serving_g));
  };

  const handleAdd = () => {
    if (!selected) return;
    const ratio = parseFloat(portion) / selected.serving_g;
    onSelect?.({
      ...selected,
      portion_g: parseFloat(portion),
      calories: Math.round(selected.calories * ratio),
      protein_g: Math.round(selected.protein_g * ratio * 10) / 10,
      carbs_g: Math.round(selected.carbs_g * ratio * 10) / 10,
      fat_g: Math.round(selected.fat_g * ratio * 10) / 10,
    });
    setSelected(null);
    setQuery("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ position: "relative" }}>
        <Icon name="search" size={14} color={T.textDim} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search foods…"
          style={{
            width: "100%",
            background: T.elevated,
            border: `1px solid ${T.border}`,
            borderRadius: T.rInput,
            padding: "10px 12px 10px 32px",
            color: T.text,
            fontSize: 13,
            fontFamily: "inherit",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      {!selected && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
          {filtered.map((food) => (
            <button
              key={food.name}
              onClick={() => handleSelect(food)}
              style={{
                background: T.surface,
                border: `1px solid ${T.border}`,
                borderRadius: 10,
                padding: "10px 12px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "left",
                width: "100%",
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{food.name}</div>
                <div style={{ fontSize: 10, color: T.textDim, marginTop: 2 }}>
                  {food.calories} kcal · {food.protein_g}g P · {food.carbs_g}g C · {food.fat_g}g F per {food.serving_g}g
                </div>
              </div>
              <Icon name="chev-right" size={14} color={T.textDim} />
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div style={{ background: T.surface, border: `1px solid ${T.teal}44`, borderRadius: T.rCard, padding: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 8 }}>{selected.name}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            <Badge color={T.amber} size="sm">{Math.round(selected.calories)} kcal</Badge>
            <Badge color={T.teal} size="sm">{selected.protein_g}g P</Badge>
            <Badge color={T.amber} size="sm">{selected.carbs_g}g C</Badge>
            <Badge color={T.textMuted} size="sm">{selected.fat_g}g F</Badge>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: T.textMuted }}>Portion (g):</span>
            <input
              type="number"
              value={portion}
              onChange={(e) => setPortion(e.target.value)}
              style={{
                width: 80,
                background: T.elevated,
                border: `1px solid ${T.border}`,
                borderRadius: 8,
                padding: "6px 10px",
                color: T.text,
                fontSize: 13,
                fontFamily: T.fontMono,
                textAlign: "center",
                outline: "none",
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setSelected(null)}
              style={{
                flex: 1,
                padding: "8px 0",
                background: T.elevated,
                border: `1px solid ${T.border}`,
                borderRadius: 8,
                color: T.textMuted,
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Back
            </button>
            <button
              onClick={handleAdd}
              style={{
                flex: 1,
                padding: "8px 0",
                background: T.teal,
                color: "#0A0A0F",
                border: "none",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
