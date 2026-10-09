import { useState, useEffect, useMemo, useRef } from "react";
import { T } from "../../design/tokens";
import { Icon } from "../../design/icons";
import { Badge, Hint } from "../../design/components";
import { mealsAPI, aiAPI, foodAPI, isNativePlatform } from "../../utils/api";
import { showToast } from "../../utils/toast";
import { pickImage, decodeBarcodeFromImage, startLiveBarcodeScan, scanBarcodeNative } from "../../utils/camera";

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

// ── Shared: scale a macro set by a multiplier ─────────────────────────────────
function scaleMacros(m, factor) {
  return {
    calories:  Math.round((m.calories  || 0) * factor),
    protein_g: Math.round((m.protein_g || 0) * factor * 10) / 10,
    carbs_g:   Math.round((m.carbs_g   || 0) * factor * 10) / 10,
    fat_g:     Math.round((m.fat_g     || 0) * factor * 10) / 10,
  };
}

// ── Shared: "how much of this did you eat" row for Photo/AI estimates ─────────
const SCALE_OPTIONS = [[0.5, "½"], [0.75, "¾"], [1, "All"], [1.5, "1.5×"], [2, "2×"]];

function ScaleRow({ scale, onChange }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: T.textDim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 5 }}>
        Portion eaten
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {SCALE_OPTIONS.map(([v, label]) => (
          <button key={v} onClick={() => onChange(v)}
            style={{ flex: 1, padding: "6px 0", borderRadius: 7, background: scale === v ? T.teal : T.elevated, color: scale === v ? "#0A0A0F" : T.text, border: `1px solid ${scale === v ? T.teal : T.border}`, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Shared: food detail / portion selector ────────────────────────────────────
function PortionSelector({ food, onAdd, onBack }) {
  const base = food.serving_g || 100;
  // Real serving size (from the barcode/product data) beats the 100g default
  const [portion, setPortion] = useState(String(food.serving_size_g || base));
  const grams = parseFloat(portion);
  const valid = Number.isFinite(grams) && grams > 0;
  const ratio = valid ? grams / base : 0;
  const scaled = scaleMacros(food, ratio);

  // Quick picks: real serving and whole pack when known, sensible grams otherwise
  const quickPicks = [];
  if (food.serving_size_g) quickPicks.push({ g: food.serving_size_g, label: `Serving ${food.serving_size_g}g` });
  for (const g of [50, 100, 150, 200]) {
    if (quickPicks.length >= 4) break;
    if (!quickPicks.some((p) => p.g === g) && g !== food.package_size_g) quickPicks.push({ g, label: `${g}` });
  }
  if (food.package_size_g && !quickPicks.some((p) => p.g === food.package_size_g)) {
    quickPicks.splice(3);
    quickPicks.push({ g: food.package_size_g, label: `Pack ${food.package_size_g}g` });
  }

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
          {quickPicks.map(({ g, label }) => (
            <button key={g} onClick={() => setPortion(String(g))}
              style={{ flex: 1, padding: "5px 2px", borderRadius: 7, background: grams === g ? T.teal : T.elevated, color: grams === g ? "#0A0A0F" : T.text, border: `1px solid ${grams === g ? T.teal : T.border}`, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
              {label}
            </button>
          ))}
        </div>
        <input
          type="number" inputMode="numeric" value={portion} onChange={(e) => setPortion(e.target.value)} min={1}
          style={{ width: "100%", background: T.elevated, border: `1px solid ${valid ? T.border : T.negative}`, borderRadius: 8, padding: "8px 12px", color: T.text, fontSize: 14, fontFamily: T.fontMono, outline: "none", boxSizing: "border-box", textAlign: "center" }}
        />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onBack}
          style={{ flex: 1, padding: "9px 0", background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 9, color: T.textMuted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
          Back
        </button>
        <button onClick={() => valid && onAdd({ ...food, portion_g: grams, ...scaled })} disabled={!valid}
          style={{ flex: 2, padding: "9px 0", background: valid ? T.teal : T.elevated, color: valid ? "#0A0A0F" : T.textMuted, border: "none", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: valid ? "pointer" : "default", fontFamily: "inherit" }}>
          Add to Meal
        </button>
      </div>
      {!valid && <Hint>Enter an amount above 0 g.</Hint>}
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
    let stale = false; // ignore answers to searches the user has already moved past
    const handle = setTimeout(() => {
      foodAPI.search(q)
        .then((data) => { if (!stale) setOnlineResults(data?.items || []); })
        .catch(() => { if (!stale) setOnlineResults([]); })
        .finally(() => { if (!stale) setOnlineLoading(false); });
    }, 450);
    return () => { stale = true; clearTimeout(handle); };
  }, [query]);

  if (selected) {
    return <PortionSelector food={selected} onBack={() => setSelected(null)} onAdd={(food) => { onSelect(food); setSelected(null); setQuery(""); }} />;
  }

  // Dedupe online hits against the ENTIRE built-in list (not just the visible
  // slice), normalized so "Chicken Breast" and "chicken breast, raw" collapse.
  const normName = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const localNames = new Set(FOOD_DB.map((f) => normName(f.name)));
  const online = onlineResults.filter((f) => !localNames.has(normName(f.name)));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0 }}>
      <div style={{ position: "relative" }}>
        <Icon name="search" size={14} color={T.textDim} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
        <input
          value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search any food or product…"
          style={{ width: "100%", background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px 10px 36px", color: T.text, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minHeight: 0, overflowY: "auto" }}>
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

// One saved meal: tap to add it; the pencil opens an editor under the row.
function SavedMealRow({ t, onSelect, onSaved, onDeleted }) {
  const [draft, setDraft] = useState(null); // set while editing
  const [busy, setBusy] = useState(false);
  const MACROS = [["calories", "kcal"], ["protein_g", "Protein g"], ["carbs_g", "Carbs g"], ["fat_g", "Fat g"]];

  async function save() {
    const data = { name: draft.name.trim() || t.name };
    for (const [k] of MACROS) data[k] = Math.max(0, parseFloat(draft[k]) || 0);
    setBusy(true);
    try {
      onSaved(await mealsAPI.updateTemplate(t.id, data));
      setDraft(null);
      showToast("Saved meal updated", "success");
    } catch (e) { showToast(e?.message || "Couldn't save", "error"); }
    setBusy(false);
  }

  async function remove() {
    if (!window.confirm(`Delete the saved meal ${t.name}?`)) return;
    setBusy(true);
    try {
      await mealsAPI.deleteTemplate(t.id);
      onDeleted();
      showToast("Saved meal deleted", "success");
    } catch (e) { showToast(e?.message || "Couldn't delete", "error"); setBusy(false); }
  }

  const box = { width: "100%", background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 10px", color: T.text, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ background: T.surface, border: `1px solid ${draft ? T.teal + "66" : T.border}`, borderRadius: 10, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <button
          onClick={() => onSelect({ name: t.name, calories: t.calories || 0, protein_g: t.protein_g || 0, carbs_g: t.carbs_g || 0, fat_g: t.fat_g || 0 })}
          style={{ flex: 1, minWidth: 0, background: "none", border: "none", padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
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
        <button aria-label={`Edit ${t.name}`} aria-expanded={!!draft} title="Edit"
          onClick={() => setDraft(draft ? null : { name: t.name, calories: t.calories ?? 0, protein_g: t.protein_g ?? 0, carbs_g: t.carbs_g ?? 0, fat_g: t.fat_g ?? 0 })}
          style={{ width: 40, alignSelf: "stretch", background: "none", border: "none", borderLeft: `1px solid ${T.border}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name={draft ? "x" : "edit"} size={14} color={T.textMuted} />
        </button>
      </div>
      {draft && (
        <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          <input aria-label="Meal name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={box} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
            {MACROS.map(([k, lbl]) => (
              <label key={k} style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 }}>
                {lbl}
                <input type="number" inputMode="decimal" min={0} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                  style={{ ...box, marginTop: 4, padding: "8px 4px", textAlign: "center", fontFamily: T.fontMono }} />
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button aria-label={`Delete ${t.name}`} title="Delete" onClick={remove} disabled={busy}
              style={{ width: 44, background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="trash" size={14} color={T.negative} />
            </button>
            <button onClick={save} disabled={busy}
              style={{ flex: 1, padding: "9px 0", background: busy ? T.elevated : T.teal, color: busy ? T.textMuted : "#0A0A0F", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 2: Templates / Saved Meals ────────────────────────────────────────────
function TemplatesTab({ onSelect }) {
  const [templates, setTemplates] = useState([]);
  const [loading,   setLoading]   = useState(true);
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
    <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0 }}>
      <div style={{ position: "relative" }}>
        <Icon name="search" size={14} color={T.textDim} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
        <input
          value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search templates…"
          style={{ width: "100%", background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px 10px 36px", color: T.text, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minHeight: 0, overflowY: "auto" }}>
        {filtered.map((t) => (
          <SavedMealRow
            key={t.id || t.name}
            t={t}
            onSelect={onSelect}
            onSaved={(next) => setTemplates((all) => all.map((x) => (x.id === t.id ? { ...x, ...next } : x)))}
            onDeleted={() => setTemplates((all) => all.filter((x) => x.id !== t.id))}
          />
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
  const [scale,      setScale]      = useState(1);

  async function handleEstimate() {
    if (!text.trim()) return;
    setLoading(true);
    setResult(null);
    setScale(1);
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

  const scaled = result ? scaleMacros(result, scale) : null;

  function handleAdd() {
    if (!result) return;
    onSelect({
      name:      mealName || "AI Estimate",
      ...scaled,
      fiber_g:   result.fiber_g != null ? Math.round(result.fiber_g * scale * 10) / 10 : undefined,
      _ingredients: Array.isArray(result.ingredients) && result.ingredients.length ? result.ingredients : undefined,
      _saveAsTemplate: saveAsTemplate,
    });
    setText("");
    setResult(null);
    setMealName("");
    setSave(false);
    setScale(1);
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
                ["Kcal",    scaled.calories,   T.amber],
                ["Protein", `${scaled.protein_g}g`, T.teal],
                ["Carbs",   `${scaled.carbs_g}g`,   T.amber],
                ["Fat",     `${scaled.fat_g}g`,     T.textMuted],
              ].map(([label, val, color]) => (
                <div key={label} style={{ background: T.elevated, borderRadius: 8, padding: "6px 4px", textAlign: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color, fontFamily: T.fontMono }}>{val}</div>
                  <div style={{ fontSize: 8, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 1 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          <ScaleRow scale={scale} onChange={setScale} />

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
    <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minHeight: 0, overflowY: "auto" }}>
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

// ── Tab 5: Photo (Gemini Vision) ──────────────────────────────────────────────
// I read the mime-type out of a data URL, clamped to what the backend accepts
// (jpeg/png/webp). The native camera can hand back png/heic; sending the wrong
// mime makes Gemini Vision reject the image, so we never just assume jpeg.
function mimeFromDataUrl(dataUrl) {
  const m = /^data:([^;]+);/.exec(dataUrl || "");
  const mime = (m && m[1] || "").toLowerCase();
  return ["image/jpeg", "image/png", "image/webp"].includes(mime) ? mime : "image/jpeg";
}

function PhotoTab({ onSelect }) {
  const [preview,  setPreview]  = useState(null);
  const [base64,   setBase64]   = useState(null);
  const [mimeType, setMimeType] = useState("image/jpeg");
  const [hint,     setHint]     = useState("");
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState(null);
  const [picking,  setPicking]  = useState(false);
  const [scale,    setScale]    = useState(1);

  async function choose(source) {
    if (picking) return;
    setPicking(true);
    try {
      const img = await pickImage({ source });
      if (!img) return; // user cancelled
      setResult(null);
      setScale(1);
      setPreview(img.dataUrl);
      setBase64(img.base64);
      setMimeType(mimeFromDataUrl(img.dataUrl));
    } catch (err) {
      showToast(err?.message || "Couldn't open the camera", "error");
    } finally {
      setPicking(false);
    }
  }

  async function handleEstimate() {
    if (!base64) return;
    setLoading(true);
    try {
      const r = await mealsAPI.photoEstimate({ image_base64: base64, mime_type: mimeType, hint: hint || undefined });
      const est = r?.estimated;
      const isNotFood = (est?.name || "").toLowerCase().trim() === "not food";
      if (est && !isNotFood) {
        setResult(est);
        setScale(1);
      } else {
        showToast(isNotFood ? "That doesn't look like food 🤔" : "Couldn't analyze the photo", "error");
      }
    } catch (err) {
      // 422 = AI couldn't read the food; anything else is usually connectivity.
      const msg = err?.status === 422
        ? "Couldn't read the food — try a clearer, well-lit photo"
        : (err?.message || "Photo analysis failed — check your connection");
      showToast(msg, "error");
    }
    setLoading(false);
  }

  function reset() {
    setPreview(null); setBase64(null); setResult(null); setHint(""); setMimeType("image/jpeg"); setScale(1);
  }

  const scaled = result ? scaleMacros(result, scale) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0, maxWidth: "100%" }}>
      {!preview && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "26px 16px", background: T.elevated, border: `1.5px dashed ${T.teal}55`, borderRadius: 14 }}>
          <Icon name="sparkle" size={26} color={T.teal} />
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Snap or upload your meal</div>
          <div style={{ fontSize: 11, color: T.textMuted, textAlign: "center" }}>AI looks at the photo and estimates macros for the whole portion</div>
          <div style={{ display: "flex", gap: 8, width: "100%", marginTop: 2 }}>
            <button
              onClick={() => choose("camera")} disabled={picking}
              style={{ flex: 1, padding: "11px 0", background: T.teal, color: "#0A0A0F", border: "none", borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: picking ? "default" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: picking ? 0.6 : 1 }}
            >
              <Icon name="sparkle" size={14} color="#0A0A0F" /> Take Photo
            </button>
            <button
              onClick={() => choose("photos")} disabled={picking}
              style={{ flex: 1, padding: "11px 0", background: T.surface, color: T.text, border: `1px solid ${T.border}`, borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: picking ? "default" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: picking ? 0.6 : 1 }}
            >
              <Icon name="search" size={14} color={T.text} /> Gallery
            </button>
          </div>
        </div>
      )}

      {preview && (
        <>
          <div style={{ position: "relative" }}>
            <img src={preview} alt="meal" style={{ width: "100%", maxWidth: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 12, border: `1px solid ${T.border}` }} />
            <button onClick={reset} style={{ position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: 9999, background: "rgba(10,11,16,0.8)", border: `1px solid ${T.border}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="x" size={12} color={T.text} />
            </button>
          </div>

          {!result && (
            <>
              <input
                value={hint} onChange={(e) => setHint(e.target.value)}
                placeholder="Optional hint, e.g. 'about 200g of rice'"
                style={{ width: "100%", background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 10, padding: "9px 12px", color: T.text, fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
              />
              <button
                onClick={handleEstimate} disabled={loading || !base64}
                style={{ padding: "12px 0", background: loading ? T.elevated : `linear-gradient(135deg,${T.teal},${T.violet})`, color: loading ? T.textMuted : "#0A0A0F", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: loading ? "default" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              >
                <Icon name="sparkle" size={15} color={loading ? T.textMuted : "#0A0A0F"} />
                {loading ? "Analyzing photo…" : "Analyze with AI"}
              </button>
            </>
          )}

          {result && (
            <div style={{ background: T.surface, border: `1px solid ${T.teal}44`, borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.text, flex: 1 }}>{result.name}</span>
                {result.confidence && (
                  <Badge color={result.confidence === "high" ? T.teal : result.confidence === "medium" ? T.amber : T.negative} size="sm">
                    {result.confidence} confidence
                  </Badge>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                {[["Kcal", scaled.calories, T.amber], ["Protein", `${scaled.protein_g}g`, T.teal], ["Carbs", `${scaled.carbs_g}g`, T.amber], ["Fat", `${scaled.fat_g}g`, T.textMuted]].map(([label, val, color]) => (
                  <div key={label} style={{ background: T.elevated, borderRadius: 8, padding: "6px 4px", textAlign: "center" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color, fontFamily: T.fontMono }}>{val}</div>
                    <div style={{ fontSize: 8, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 1 }}>{label}</div>
                  </div>
                ))}
              </div>
              {result.ingredients?.length > 0 && (
                <div style={{ fontSize: 11, color: T.textMuted }}>
                  {result.ingredients.map((i) => `${i.amount ? i.amount + " " : ""}${i.name}`).join(" · ")}
                </div>
              )}
              <ScaleRow scale={scale} onChange={setScale} />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setResult(null)} style={{ flex: 1, padding: "9px 0", background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 9, color: T.textMuted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                  Retry
                </button>
                <button
                  onClick={() => {
                    onSelect({
                      name: result.name,
                      ...scaled,
                      fiber_g: result.fiber_g != null ? Math.round(result.fiber_g * scale * 10) / 10 : undefined,
                      _ingredients: Array.isArray(result.ingredients) && result.ingredients.length ? result.ingredients : undefined,
                    });
                    reset();
                  }}
                  style={{ flex: 2, padding: "9px 0", background: T.teal, color: "#0A0A0F", border: "none", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                >
                  Log This Meal
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Tab 6: Barcode ────────────────────────────────────────────────────────────
function BarcodeTab({ onSelect, onSwitchTab }) {
  const [code,     setCode]     = useState("");
  const [loading,  setLoading]  = useState(false);
  const [selected, setSelected] = useState(null);
  const [scanning, setScanning] = useState(false); // web live scan active
  const [busy,     setBusy]     = useState(false);  // native snapshot decode
  const [notFound, setNotFound] = useState(false);  // last lookup found nothing
  const videoRef = useRef(null);
  const stopRef  = useRef(null);
  const native   = isNativePlatform();
  // Web live scanning needs getUserMedia (https) and a camera. On native we
  // snapshot via the Camera plugin and decode the still image instead.
  const canLiveScan = !native && typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  async function lookup(barcode) {
    // Scanners can hand back values with separators/checksums the API rejects
    const digits = String(barcode || "").replace(/\D/g, "");
    if (!digits) return;
    if (digits.length < 6 || digits.length > 14) {
      showToast("That doesn't look like a product barcode", "error");
      return;
    }
    setLoading(true);
    setNotFound(false);
    try {
      const r = await foodAPI.barcode(digits);
      if (r?.item) {
        setSelected(r.item);
      } else {
        setNotFound(true);
        showToast(r?.error === "not_found" ? "Product not in the database" : "No nutrition data for this barcode", "error");
      }
    } catch (err) {
      showToast(err.message || "Lookup failed", "error");
    }
    setLoading(false);
  }

  // Native: ML Kit live scanner (reliable). Falls back to a still-photo ZXing
  // decode only if the native scanner module is unavailable on the device.
  async function scanNative() {
    if (busy) return;
    setBusy(true);
    try {
      let found = null;
      try {
        found = await scanBarcodeNative();
        if (found === null) return; // user dismissed the scanner
      } catch (mlErr) {
        // ML Kit unavailable (no Play Services / module) — fall back to a snapshot.
        const img = await pickImage({ source: "camera" });
        if (!img) return;
        found = await decodeBarcodeFromImage(img.dataUrl);
      }
      if (found) {
        setCode(found);
        await lookup(found);
      } else {
        showToast("No barcode detected — hold steady and fill the frame, or type it", "error");
      }
    } catch (err) {
      showToast(err?.message || "Couldn't open the camera", "error");
    } finally {
      setBusy(false);
    }
  }

  // Web: live-decode from the rear camera into the <video> element.
  useEffect(() => {
    if (!scanning) return;
    let cancelled = false;
    (async () => {
      // The video element mounts in the same render that flips `scanning`.
      await new Promise((r) => requestAnimationFrame(r));
      if (cancelled || !videoRef.current) return;
      const stop = await startLiveBarcodeScan(
        videoRef.current,
        (text) => { setScanning(false); setCode(text); lookup(text); },
        () => { showToast("Camera unavailable — type the barcode instead", "error"); setScanning(false); },
      );
      // If the user closed the scanner while the camera was still starting
      // (permission prompt, slow getUserMedia), cleanup already ran with a null
      // stopRef — stop immediately or the camera stays on with no UI.
      if (cancelled) { stop(); return; }
      stopRef.current = stop;
    })();
    return () => {
      cancelled = true;
      if (stopRef.current) { stopRef.current(); stopRef.current = null; }
    };
  }, [scanning]);

  if (selected) {
    return (
      <PortionSelector
        food={{ ...selected, name: selected.brand ? `${selected.name} (${selected.brand})` : selected.name }}
        onBack={() => setSelected(null)}
        onAdd={(food) => { onSelect(food); setSelected(null); setCode(""); }}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0, maxWidth: "100%" }}>
      {scanning ? (
        <div style={{ position: "relative" }}>
          <video ref={videoRef} muted playsInline style={{ width: "100%", maxWidth: "100%", height: 220, objectFit: "cover", borderRadius: 12, background: "#000" }} />
          <div style={{ position: "absolute", inset: "35% 12%", border: `2px solid ${T.teal}`, borderRadius: 8, pointerEvents: "none" }} />
          <button onClick={() => setScanning(false)} style={{ position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: 9999, background: "rgba(10,11,16,0.8)", border: `1px solid ${T.border}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="x" size={12} color={T.text} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => (native ? scanNative() : setScanning(true))}
          disabled={busy || (!native && !canLiveScan)}
          style={{ padding: "14px 0", background: T.elevated, border: `1.5px dashed ${T.teal}55`, borderRadius: 12, color: T.teal, fontSize: 13, fontWeight: 700, cursor: busy ? "default" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: busy || (!native && !canLiveScan) ? 0.55 : 1 }}
        >
          <Icon name="search" size={15} color={T.teal} />
          {busy ? "Reading barcode…" : native ? "Scan Barcode with Camera" : canLiveScan ? "Scan Barcode with Camera" : "Camera unavailable — type below"}
        </button>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && lookup(code)}
          placeholder="Or type barcode digits…"
          inputMode="numeric"
          style={{ flex: 1, background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px", color: T.text, fontSize: 13, fontFamily: T.fontMono, outline: "none", boxSizing: "border-box" }}
        />
        <button
          onClick={() => lookup(code)} disabled={loading || code.length < 6}
          style={{ padding: "0 18px", background: loading || code.length < 6 ? T.elevated : T.teal, color: loading || code.length < 6 ? T.textMuted : "#0A0A0F", border: "none", borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
        >
          {loading ? "…" : "Look up"}
        </button>
      </div>
      {notFound && (
        <div style={{ background: T.elevated, border: `1px solid ${T.amber}44`, borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.5 }}>
            This product isn't in the database yet — you can still log it from a photo or a short description.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => onSwitchTab?.("photo")}
              style={{ flex: 1, padding: "9px 0", background: T.teal, color: "#0A0A0F", border: "none", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              Estimate from Photo
            </button>
            <button onClick={() => onSwitchTab?.("ai")}
              style={{ flex: 1, padding: "9px 0", background: T.surface, color: T.text, border: `1px solid ${T.border}`, borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Describe It
            </button>
          </div>
        </div>
      )}

      <div style={{ fontSize: 11, color: T.textDim, textAlign: "center" }}>
        Powered by Open Food Facts — packaged foods worldwide
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
const TABS = [
  { id: "database",  label: "Foods",   icon: "search" },
  { id: "photo",     label: "Photo",   icon: "sparkle" },
  { id: "barcode",   label: "Barcode", icon: "pantry" },
  { id: "recent",    label: "Recent",  icon: "history" },
  { id: "templates", label: "Saved",   icon: "edit" },
  { id: "ai",        label: "AI",      icon: "bolt" },
];

export default function FoodSearch({ onSelect }) {
  const [activeTab, setActiveTab] = useState("database");

  return (
    // flex + minHeight 0: fill the sheet so only the result list scrolls,
    // with the tabs and search box pinned above it.
    <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0, maxWidth: "100%", flex: 1, minHeight: 0 }}>
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
      {activeTab === "photo"     && <PhotoTab     onSelect={onSelect} />}
      {activeTab === "barcode"   && <BarcodeTab   onSelect={onSelect} onSwitchTab={setActiveTab} />}
      {activeTab === "recent"    && <RecentTab    onSelect={onSelect} />}
      {activeTab === "templates" && <TemplatesTab onSelect={onSelect} />}
      {activeTab === "ai"        && <AIEstimateTab onSelect={onSelect} />}
    </div>
  );
}
