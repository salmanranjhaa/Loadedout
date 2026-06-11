import { useState, useEffect, useMemo } from "react";
import { T } from "../../design/tokens";
import { Icon } from "../../design/icons";
import { Badge } from "../../design/components";
import { mealsAPI, aiAPI, foodAPI } from "../../utils/api";
import { showToast } from "../../utils/toast";

// ── Hardcoded food database (per 100g) ────────────────────────────────────────
const FOOD_DB = [
  { name: "Chicken Breast",          calories: 165, protein_g: 31,   carbs_g: 0,    fat_g: 3.6,  serving_g: 100 },
  { name: "Rice (white, cooked)",    calories: 130, protein_g: 2.7,  carbs_g: 28,   fat_g: 0.3,  serving_g: 100 },
  { name: "Rice (brown, cooked)",    calories: 112, protein_g: 2.6,  carbs_g: 24,   fat_g: 0.9,  serving_g: 100 },
  { name: "Broccoli",                calories: 34,  protein_g: 2.8,  carbs_g: 7,    fat_g: 0.4,  serving_g: 100 },
  { name: "Salmon",                  calories: 208, protein_g: 20,   carbs_g: 0,    fat_g: 13,   serving_g: 100 },
  { name: "Eggs (whole)",            calories: 155, protein_g: 13,   carbs_g: 1.1,  fat_g: 11,   serving_g: 100 },
  { name: "Egg Whites",              calories: 52,  protein_g: 11,   carbs_g: 0.7,  fat_g: 0.2,  serving_g: 100 },
  { name: "Oats (dry)",              calories: 389, protein_g: 16.9, carbs_g: 66,   fat_g: 6.9,  serving_g: 100 },
  { name: "Greek Yogurt",            calories: 59,  protein_g: 10,   carbs_g: 3.6,  fat_g: 0.4,  serving_g: 100 },
  { name: "Banana",                  calories: 89,  protein_g: 1.1,  carbs_g: 23,   fat_g: 0.3,  serving_g: 100 },
  { name: "Apple",                   calories: 52,  protein_g: 0.3,  carbs_g: 14,   fat_g: 0.2,  serving_g: 100 },
  { name: "Almonds",                 calories: 579, protein_g: 21,   carbs_g: 22,   fat_g: 49,   serving_g: 100 },
  { name: "Peanut Butter",           calories: 588, protein_g: 25,   carbs_g: 20,   fat_g: 50,   serving_g: 100 },
  { name: "Sweet Potato",            calories: 86,  protein_g: 1.6,  carbs_g: 20,   fat_g: 0.1,  serving_g: 100 },
  { name: "Avocado",                 calories: 160, protein_g: 2,    carbs_g: 9,    fat_g: 15,   serving_g: 100 },
  { name: "Tuna (canned)",           calories: 132, protein_g: 28,   carbs_g: 0,    fat_g: 1,    serving_g: 100 },
  { name: "Turkey Breast",           calories: 135, protein_g: 30,   carbs_g: 0,    fat_g: 1,    serving_g: 100 },
  { name: "Cottage Cheese",          calories: 98,  protein_g: 11,   carbs_g: 3.4,  fat_g: 4.3,  serving_g: 100 },
  { name: "Quinoa (cooked)",         calories: 120, protein_g: 4.4,  carbs_g: 21,   fat_g: 1.9,  serving_g: 100 },
  { name: "Pasta (cooked)",          calories: 131, protein_g: 5,    carbs_g: 25,   fat_g: 1.1,  serving_g: 100 },
  { name: "Ground Beef (95% lean)",  calories: 171, protein_g: 26,   carbs_g: 0,    fat_g: 7,    serving_g: 100 },
  { name: "Pork Tenderloin",         calories: 143, protein_g: 26,   carbs_g: 0,    fat_g: 3.5,  serving_g: 100 },
  { name: "Shrimp",                  calories: 99,  protein_g: 24,   carbs_g: 0.2,  fat_g: 0.3,  serving_g: 100 },
  { name: "Tofu",                    calories: 76,  protein_g: 8,    carbs_g: 1.9,  fat_g: 4.8,  serving_g: 100 },
  { name: "Lentils (cooked)",        calories: 116, protein_g: 9,    carbs_g: 20,   fat_g: 0.4,  serving_g: 100 },
  { name: "Chickpeas (cooked)",      calories: 164, protein_g: 8.9,  carbs_g: 27,   fat_g: 2.6,  serving_g: 100 },
  { name: "Black Beans",             calories: 132, protein_g: 8.9,  carbs_g: 24,   fat_g: 0.5,  serving_g: 100 },
  { name: "Whole Wheat Bread",       calories: 247, protein_g: 13,   carbs_g: 41,   fat_g: 3.4,  serving_g: 100 },
  { name: "Milk (2%)",               calories: 50,  protein_g: 3.4,  carbs_g: 4.8,  fat_g: 2,    serving_g: 100 },
  { name: "Whey Protein",            calories: 400, protein_g: 80,   carbs_g: 8,    fat_g: 5,    serving_g: 100 },
  { name: "Olive Oil",               calories: 884, protein_g: 0,    carbs_g: 0,    fat_g: 100,  serving_g: 100 },
  { name: "Cheese (cheddar)",        calories: 402, protein_g: 25,   carbs_g: 1.3,  fat_g: 33,   serving_g: 100 },
  { name: "Mozzarella",              calories: 280, protein_g: 28,   carbs_g: 3.1,  fat_g: 17,   serving_g: 100 },
  { name: "Spinach",                 calories: 23,  protein_g: 2.9,  carbs_g: 3.6,  fat_g: 0.4,  serving_g: 100 },
  { name: "Kale",                    calories: 49,  protein_g: 4.3,  carbs_g: 9,    fat_g: 0.9,  serving_g: 100 },
  { name: "Carrots",                 calories: 41,  protein_g: 0.9,  carbs_g: 10,   fat_g: 0.2,  serving_g: 100 },
  { name: "Bell Pepper",             calories: 31,  protein_g: 1,    carbs_g: 6,    fat_g: 0.3,  serving_g: 100 },
  { name: "Sweet Corn",              calories: 86,  protein_g: 3.3,  carbs_g: 19,   fat_g: 1.2,  serving_g: 100 },
  { name: "Potato",                  calories: 77,  protein_g: 2,    carbs_g: 17,   fat_g: 0.1,  serving_g: 100 },
  { name: "Blueberries",             calories: 57,  protein_g: 0.7,  carbs_g: 14,   fat_g: 0.3,  serving_g: 100 },
  { name: "Strawberries",            calories: 32,  protein_g: 0.7,  carbs_g: 7.7,  fat_g: 0.3,  serving_g: 100 },
  { name: "Orange",                  calories: 47,  protein_g: 0.9,  carbs_g: 12,   fat_g: 0.1,  serving_g: 100 },
  { name: "Mango",                   calories: 60,  protein_g: 0.8,  carbs_g: 15,   fat_g: 0.4,  serving_g: 100 },
  { name: "Watermelon",              calories: 30,  protein_g: 0.6,  carbs_g: 8,    fat_g: 0.2,  serving_g: 100 },
];

// ── Shared: food detail / portion selector ────────────────────────────────────
function PortionSelector({ food, onAdd, onBack }) {
  const [portion, setPortion] = useState(String(food.serving_g || 100));
  const ratio  = parseFloat(portion) / (food.serving_g || 100);
  const scaled = {
    calories:  Math.round((food.calories  || 0) * ratio),
    protein_g: Math.round((food.protein_g || 0) * ratio * 10) / 10,
    carbs_g:   Math.round((food.carbs_g   || 0) * ratio * 10) / 10,
    fat_g:     Math.round((food.fat_g     || 0) * ratio * 10) / 10,
  };

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.teal}44`, borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{food.name}</div>

      {/* Live macro preview */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
        {[
          ["Kcal",    scaled.calories,   T.amber],
          ["Protein", `${scaled.protein_g}g`, T.teal],
          ["Carbs",   `${scaled.carbs_g}g`,   T.amber],
          ["Fat",     `${scaled.fat_g}g`,     T.textMuted],
        ].map(([label, val, color]) => (
          <div key={label} style={{ background: T.elevated, borderRadius: 8, padding: "6px 4px", textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color, fontFamily: T.fontMono }}>{val}</div>
            <div style={{ fontSize: 8, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Portion quick picks */}
      <div>
        <div style={{ fontSize: 10, color: T.textDim, marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>Amount (g)</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          {[50, 100, 150, 200].map((g) => (
            <button key={g} onClick={() => setPortion(String(g))}
              style={{ flex: 1, padding: "5px 0", borderRadius: 7, background: portion === String(g) ? T.teal : T.elevated, color: portion === String(g) ? "#0A0A0F" : T.text, border: `1px solid ${portion === String(g) ? T.teal : T.border}`, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              {g}
            </button>
          ))}
        </div>
        <input
          type="number" inputMode="numeric" value={portion} onChange={(e) => setPortion(e.target.value)} min={1}
          style={{ width: "100%", background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 12px", color: T.text, fontSize: 14, fontFamily: T.fontMono, outline: "none", boxSizing: "border-box", textAlign: "center" }}
        />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onBack}
          style={{ flex: 1, padding: "9px 0", background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 9, color: T.textMuted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
          Back
        </button>
        <button onClick={() => onAdd({ ...food, portion_g: parseFloat(portion), ...scaled })}
          style={{ flex: 2, padding: "9px 0", background: T.teal, color: "#0A0A0F", border: "none", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          Add to Meal
        </button>
      </div>
    </div>
  );
}

function FoodRow({ food, onSelect }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onClick={() => onSelect(food)}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{ background: pressed ? T.elevated2 : T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontFamily: "inherit", textAlign: "left", width: "100%", transition: "background 0.1s" }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{food.name}</div>
        <div style={{ fontSize: 10, color: T.textDim, marginTop: 2, fontFamily: T.fontMono }}>
          {food.calories} kcal · {food.protein_g}g P · {food.carbs_g}g C · {food.fat_g}g F
          {food.serving_g ? ` / ${food.serving_g}g` : ""}
        </div>
      </div>
      <Icon name="chev-right" size={14} color={T.textDim} />
    </button>
  );
}

// ── Tab 1: Food Database ──────────────────────────────────────────────────────
function DatabaseTab({ onSelect }) {
  const [query,         setQuery]         = useState("");
  const [selected,      setSelected]      = useState(null);
  const [onlineResults, setOnlineResults] = useState([]);
  const [onlineLoading, setOnlineLoading] = useState(false);

  const filtered = useMemo(() => {
    if (!query.trim()) return FOOD_DB.slice(0, 12);
    const q = query.toLowerCase();
    return FOOD_DB.filter((f) => f.name.toLowerCase().includes(q));
  }, [query]);

  // Debounced Open Food Facts search for anything beyond the built-in list
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setOnlineResults([]);
      setOnlineLoading(false);
      return;
    }
    setOnlineLoading(true);
    const handle = setTimeout(() => {
      foodAPI.search(q)
        .then((data) => setOnlineResults(data?.items || []))
        .catch(() => setOnlineResults([]))
        .finally(() => setOnlineLoading(false));
    }, 450);
    return () => clearTimeout(handle);
  }, [query]);

  if (selected) {
    return <PortionSelector food={selected} onBack={() => setSelected(null)} onAdd={(food) => { onSelect(food); setSelected(null); setQuery(""); }} />;
  }

  const localNames = new Set(filtered.map((f) => f.name.toLowerCase()));
  const online = onlineResults.filter((f) => !localNames.has(f.name.toLowerCase()));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ position: "relative" }}>
        <Icon name="search" size={14} color={T.textDim} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
        <input
          autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search any food or product…"
          style={{ width: "100%", background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px 10px 36px", color: T.text, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: "50vh", overflowY: "auto" }}>
        {filtered.map((f) => <FoodRow key={f.name} food={f} onSelect={setSelected} />)}

        {query.trim().length >= 3 && (
          <>
            <div style={{ fontSize: 10, color: T.textDim, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, padding: "8px 2px 2px" }}>
              {onlineLoading ? "Searching food database…" : online.length > 0 ? "Food database" : ""}
            </div>
            {online.map((f) => (
              <FoodRow key={`${f.name}-${f.barcode || f.brand || ""}`} food={{ ...f, name: f.brand ? `${f.name} (${f.brand})` : f.name }} onSelect={setSelected} />
            ))}
          </>
        )}

        {filtered.length === 0 && !onlineLoading && online.length === 0 && (
          <div style={{ textAlign: "center", padding: "24px 0", color: T.textDim, fontSize: 13 }}>
            No results for "{query}" — try the AI Estimate tab.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tab 2: Templates / Saved Meals ────────────────────────────────────────────
function TemplatesTab({ onSelect }) {
  const [templates, setTemplates] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [selected,  setSelected]  = useState(null);
  const [query,     setQuery]     = useState("");

  useEffect(() => {
    mealsAPI.getTemplates()
      .then((data) => setTemplates(data?.templates || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return templates;
    const q = query.toLowerCase();
    return templates.filter((t) => (t.name || "").toLowerCase().includes(q));
  }, [templates, query]);

  if (selected) {
    const food = {
      name:      selected.name,
      calories:  selected.calories || 0,
      protein_g: selected.protein_g || 0,
      carbs_g:   selected.carbs_g   || 0,
      fat_g:     selected.fat_g     || 0,
      serving_g: 1,
    };
    return <PortionSelector food={{ ...food, serving_g: 100 }} onBack={() => setSelected(null)} onAdd={(f) => { onSelect({ name: food.name, calories: food.calories, protein_g: food.protein_g, carbs_g: food.carbs_g, fat_g: food.fat_g }); setSelected(null); }} />;
  }

  if (loading) {
    return <div style={{ textAlign: "center", padding: "32px 0", color: T.textDim, fontSize: 13 }}>Loading templates…</div>;
  }

  if (templates.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "32px 20px", color: T.textDim, fontSize: 13 }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>📋</div>
        <div>No saved meal templates yet.</div>
        <div style={{ marginTop: 4, fontSize: 11 }}>Ask Claude to suggest meals — they'll appear here once saved.</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ position: "relative" }}>
        <Icon name="search" size={14} color={T.textDim} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
        <input
          value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search templates…"
          style={{ width: "100%", background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px 10px 36px", color: T.text, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: "50vh", overflowY: "auto" }}>
        {filtered.map((t) => (
          <button
            key={t.id || t.name}
            onClick={() => onSelect({ name: t.name, calories: t.calories || 0, protein_g: t.protein_g || 0, carbs_g: t.carbs_g || 0, fat_g: t.fat_g || 0 })}
            style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontFamily: "inherit", textAlign: "left", width: "100%" }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
              <div style={{ fontSize: 10, color: T.textDim, marginTop: 2, fontFamily: T.fontMono }}>
                {t.calories ? `${t.calories} kcal` : ""}
                {t.protein_g ? ` · ${t.protein_g}g P` : ""}
                {t.meal_type && <span style={{ marginLeft: 6, color: T.textDim, textTransform: "capitalize" }}>{t.meal_type}</span>}
              </div>
            </div>
            <span style={{ fontSize: 11, color: T.teal, fontWeight: 700 }}>Add</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Tab 3: AI Estimate ────────────────────────────────────────────────────────
function AIEstimateTab({ onSelect }) {
  const [text,       setText]       = useState("");
  const [loading,    setLoading]    = useState(false);
  const [result,     setResult]     = useState(null);
  const [mealName,   setMealName]   = useState("");
  const [saveAsTemplate, setSave]   = useState(false);

  async function handleEstimate() {
    if (!text.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const r = await aiAPI.estimateMacros(text.trim());
      if (r && !r.error) {
        setResult(r);
        setMealName(text.trim().slice(0, 40));
      } else {
        showToast("AI couldn't estimate this — try being more specific (e.g. '200g chicken breast, 1 cup rice')", "error");
      }
    } catch {
      showToast("Estimation failed. Are you online?", "error");
    }
    setLoading(false);
  }

  function handleAdd() {
    if (!result) return;
    onSelect({
      name:      mealName || "AI Estimate",
      calories:  result.calories   || 0,
      protein_g: result.protein_g  || 0,
      carbs_g:   result.carbs_g    || 0,
      fat_g:     result.fat_g      || 0,
      _saveAsTemplate: saveAsTemplate,
    });
    setText("");
    setResult(null);
    setMealName("");
    setSave(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ background: T.elevated, border: `1px solid ${T.teal}33`, borderRadius: 12, padding: "10px 12px", fontSize: 11, color: T.textMuted, lineHeight: 1.5 }}>
        <strong style={{ color: T.teal }}>Describe what you're eating</strong> — ingredient list, dish name, restaurant meal, anything. Claude will estimate the macros.
      </div>

      <textarea
        value={text} onChange={(e) => setText(e.target.value)} rows={3}
        placeholder="e.g. 200g chicken breast, 1 cup cooked rice, tbsp olive oil&#10;or: Big Mac meal with medium fries&#10;or: bowl of oats with honey and banana"
        style={{ width: "100%", background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px", color: T.text, fontSize: 13, fontFamily: "inherit", outline: "none", resize: "none", boxSizing: "border-box" }}
      />

      {!result ? (
        <button
          onClick={handleEstimate} disabled={loading || !text.trim()}
          style={{ padding: "12px 0", background: loading || !text.trim() ? T.elevated : `linear-gradient(135deg,${T.teal},${T.violet})`, color: loading || !text.trim() ? T.textMuted : "#0A0A0F", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: loading || !text.trim() ? "default" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          <Icon name="sparkle" size={15} color={loading || !text.trim() ? T.textMuted : "#0A0A0F"} />
          {loading ? "Estimating…" : "Estimate Macros"}
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Macro result */}
          <div style={{ background: T.surface, border: `1px solid ${T.teal}44`, borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.teal, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Estimated Macros</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
              {[
                ["Kcal",    result.calories,   T.amber],
                ["Protein", `${result.protein_g}g`, T.teal],
                ["Carbs",   `${result.carbs_g}g`,   T.amber],
                ["Fat",     `${result.fat_g}g`,     T.textMuted],
              ].map(([label, val, color]) => (
                <div key={label} style={{ background: T.elevated, borderRadius: 8, padding: "6px 4px", textAlign: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color, fontFamily: T.fontMono }}>{val}</div>
                  <div style={{ fontSize: 8, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 1 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Meal name */}
          <div>
            <div style={{ fontSize: 10, color: T.textDim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 5 }}>Meal name (optional)</div>
            <input
              value={mealName} onChange={(e) => setMealName(e.target.value)} placeholder="My meal"
              style={{ width: "100%", background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 12px", color: T.text, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
            />
          </div>

          {/* Save as template toggle */}
          <button
            onClick={() => setSave((s) => !s)}
            style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}
          >
            <div style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${saveAsTemplate ? T.teal : T.border}`, background: saveAsTemplate ? T.teal : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {saveAsTemplate && <Icon name="check" size={10} color="#0A0A0F" />}
            </div>
            <span style={{ fontSize: 12, color: T.textMuted }}>Also save as template for quick reuse</span>
          </button>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { setResult(null); }}
              style={{ flex: 1, padding: "9px 0", background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 9, color: T.textMuted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              Re-estimate
            </button>
            <button onClick={handleAdd}
              style={{ flex: 2, padding: "9px 0", background: T.teal, color: "#0A0A0F", border: "none", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Icon name="plus" size={13} color="#0A0A0F" />
              Add to Meal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 4: Recent ─────────────────────────────────────────────────────────────
function RecentTab({ onSelect }) {
  const [recent,  setRecent]  = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    mealsAPI.getHistory(7)
      .then((data) => {
        const byDate = data?.history || {};
        const meals = Object.values(byDate).flatMap((d) => d.meals || []);
        // Deduplicate by name, keep highest calorie entry
        const seen = {};
        for (const m of meals) {
          if (!m.name) continue;
          if (!seen[m.name] || (m.calories || 0) > (seen[m.name].calories || 0)) {
            seen[m.name] = m;
          }
        }
        setRecent(Object.values(seen).slice(0, 10));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ textAlign: "center", padding: "32px 0", color: T.textDim, fontSize: 13 }}>Loading recent meals…</div>;

  if (recent.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "32px 20px", color: T.textDim, fontSize: 13 }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>🍽️</div>
        <div>No recent meals yet.</div>
        <div style={{ marginTop: 4, fontSize: 11 }}>Log some meals and they'll appear here for quick re-logging.</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: "55vh", overflowY: "auto" }}>
      {recent.map((m) => (
        <button
          key={m.id || m.name}
          onClick={() => onSelect({ name: m.name, calories: m.calories || 0, protein_g: m.protein_g || 0, carbs_g: m.carbs_g || 0, fat_g: m.fat_g || 0 })}
          style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontFamily: "inherit", textAlign: "left", width: "100%" }}
        >
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.amber, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</div>
            <div style={{ fontSize: 10, color: T.textDim, marginTop: 2, fontFamily: T.fontMono }}>
              {m.calories ? `${Math.round(m.calories)} kcal` : ""}
              {m.protein_g ? ` · ${Math.round(m.protein_g)}g P` : ""}
              <span style={{ marginLeft: 6, textTransform: "capitalize", color: T.textDim }}>{m.meal_type || ""}</span>
            </div>
          </div>
          <span style={{ fontSize: 11, color: T.teal, fontWeight: 700, flexShrink: 0 }}>Log again</span>
        </button>
      ))}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
const TABS = [
  { id: "database",  label: "Foods",     icon: "search" },
  { id: "recent",    label: "Recent",    icon: "history" },
  { id: "templates", label: "Templates", icon: "edit" },
  { id: "ai",        label: "AI Estimate", icon: "sparkle" },
];

export default function FoodSearch({ onSelect }) {
  const [activeTab, setActiveTab] = useState("database");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, background: T.elevated, borderRadius: 10, padding: 3 }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1, padding: "7px 4px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit",
              background: activeTab === tab.id ? T.surface : "transparent",
              color: activeTab === tab.id ? T.text : T.textDim,
              fontSize: 10, fontWeight: activeTab === tab.id ? 700 : 500,
              display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
              transition: "background 0.15s, color 0.15s",
            }}
          >
            <Icon name={tab.icon} size={14} color={activeTab === tab.id ? T.teal : T.textDim} />
            <span style={{ whiteSpace: "nowrap" }}>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "database"  && <DatabaseTab  onSelect={onSelect} />}
      {activeTab === "recent"    && <RecentTab    onSelect={onSelect} />}
      {activeTab === "templates" && <TemplatesTab onSelect={onSelect} />}
      {activeTab === "ai"        && <AIEstimateTab onSelect={onSelect} />}
    </div>
  );
}
