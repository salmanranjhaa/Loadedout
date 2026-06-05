import { useState, useEffect, useMemo } from "react";
import { T } from "../design/tokens";
import { Icon } from "../design/icons";
import {
  PageHeader, PageScroll, Chip, Card,
  MacroBar, MacroRing, IllustratedEmptyState, LoadingDots, SkeletonRing, SkeletonCard, BottomSheet,
} from "../design/components";
import { mealsAPI, userAPI, aiAPI } from "../utils/api";
import MealDetailPage from "./details/MealDetailPage";
import FoodSearch from "../components/nutrition/FoodSearch";
import WaterTracker from "../components/nutrition/WaterTracker";
import WeightGoalCalculator from "../components/nutrition/WeightGoalCalculator";
import WeeklyCalendar from "../components/nutrition/WeeklyCalendar";

const DAYS_SHORT = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MEAL_GROUPS = ["Breakfast","Lunch","Dinner","Snacks"];
const DAY_NAMES_FULL = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

function todayDOW() { return (new Date().getDay() + 6) % 7; }
function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function getTodayISO() { return toISO(new Date()); }

function adherenceColor(pct) {
  if (pct >= 0.8) return T.teal;
  if (pct >= 0.5) return T.amber;
  return T.negative;
}

function WeekStrip({ history, calorieTarget, selectedDate, onSelectDate }) {
  const todayIdx = todayDOW();
  const slots = DAYS_SHORT.map((d, i) => {
    const date = new Date();
    date.setDate(date.getDate() + (i - todayIdx));
    const iso = toISO(date);
    const bucket = history?.[iso];
    const kcal = bucket?.total_calories || 0;
    const pct = calorieTarget ? Math.min(kcal / calorieTarget, 1) : 0;
    const isSelected = iso === selectedDate;
    const isFuture = date > new Date() && !isSelected;
    return { d, i, iso, pct, hasData: !!bucket, isSelected, isFuture };
  });
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 56 }}>
      {slots.map(({ d, i, iso, pct, hasData, isSelected, isFuture }) => {
        const isToday = i === todayIdx;
        const color = isSelected ? T.teal : hasData ? adherenceColor(pct) : T.border;
        const barH = isSelected ? Math.max(pct * 36, 6) : Math.max(pct * 36, hasData ? 4 : 2);
        return (
          <div
            key={d}
            onClick={() => !isFuture && onSelectDate?.(iso)}
            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: isFuture ? "default" : "pointer" }}
          >
            <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
              <div
                style={{
                  width: "100%",
                  height: barH,
                  background: color,
                  borderRadius: 3,
                  opacity: isFuture ? 0.3 : isToday || isSelected ? 1 : 0.7,
                  transition: "all 0.25s ease",
                  boxShadow: isSelected ? `0 0 8px ${T.teal}66` : undefined,
                }}
              />
            </div>
            <span
              style={{
                fontSize: 9,
                fontWeight: isToday || isSelected ? 700 : 500,
                color: isSelected ? T.teal : isToday ? T.teal : T.textDim,
                letterSpacing: 0.3,
                fontFamily: T.fontMono,
              }}
            >
              {d}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function DayNav({ selectedDate, onNav }) {
  const d = new Date(selectedDate + "T12:00:00");
  const dow = (d.getDay() + 6) % 7;
  const dayLabel = selectedDate === getTodayISO() ? "Today" : DAY_NAMES_FULL[dow];
  const dateStr = `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  const todayISO = getTodayISO();
  const isToday = selectedDate === todayISO;
  const isFuture = selectedDate > todayISO;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 16px 10px" }}>
      <button
        onClick={() => onNav(-1)}
        style={{
          width: 32,
          height: 32,
          borderRadius: 9999,
          background: T.elevated,
          border: `1px solid ${T.border}`,
          color: T.text,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        <Icon name="chev-left" size={15} />
      </button>
      <div style={{ flex: 1, textAlign: "center" }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{dayLabel}</span>
        <span style={{ fontSize: 13, color: T.textMuted, marginLeft: 6 }}>{dateStr}</span>
        {isToday && (
          <span
            style={{
              marginLeft: 6,
              fontSize: 9,
              fontWeight: 700,
              color: T.teal,
              background: `${T.teal}22`,
              padding: "2px 6px",
              borderRadius: 6,
              verticalAlign: "middle",
            }}
          >
            NOW
          </span>
        )}
      </div>
      <button
        onClick={() => !isFuture && onNav(1)}
        style={{
          width: 32,
          height: 32,
          borderRadius: 9999,
          background: T.elevated,
          border: `1px solid ${T.border}`,
          color: isFuture ? T.textDim : T.text,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: isFuture ? "default" : "pointer",
          flexShrink: 0,
          opacity: isFuture ? 0.4 : 1,
        }}
      >
        <Icon name="chev-right" size={15} />
      </button>
    </div>
  );
}

function SupplementChip({ sup, checked, onToggle }) {
  return (
    <button
      onClick={onToggle}
      style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px 6px 8px",
        borderRadius: 9999,
        border: `1px solid ${checked ? T.teal : T.border}`,
        background: checked ? `${T.teal}18` : T.elevated,
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: 9999,
          border: `1.5px solid ${checked ? T.teal : T.textDim}`,
          background: checked ? T.teal : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          transition: "all 0.15s",
        }}
      >
        {checked && <Icon name="check" size={9} color="#0A0A0F" strokeWidth={2.5} />}
      </div>
      <div style={{ textAlign: "left" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: checked ? T.teal : T.text, whiteSpace: "nowrap" }}>{sup.name}</div>
        {sup.dose && <div style={{ fontSize: 9, color: T.textDim, fontFamily: T.fontMono }}>{sup.dose}</div>}
      </div>
    </button>
  );
}

function MealRow({ meal, onDelete, deleting, onClick }) {
  const [pressed, setPressed] = useState(false);
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        borderBottom: `0.5px solid ${T.border}`,
        background: pressed ? T.elevated2 : "transparent",
        transition: "background 0.1s",
        cursor: "pointer",
      }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
    >
      <div style={{ width: 8, height: 8, borderRadius: 9999, background: T.amber, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {meal.name}
        </div>
        <div style={{ fontSize: 10, color: T.textMuted, fontFamily: T.fontMono, marginTop: 1 }}>
          {Math.round(meal.protein_g || 0)}g P{meal.carbs_g ? ` · ${Math.round(meal.carbs_g)}g C` : ""}
          {meal.fat_g ? ` · ${Math.round(meal.fat_g)}g F` : ""}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.amber, fontFamily: T.fontMono }}>{Math.round(meal.calories || 0)}</div>
        <div style={{ fontSize: 9, color: T.textDim }}>kcal</div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(meal.id);
        }}
        disabled={deleting}
        style={{ background: "none", border: "none", padding: 4, cursor: "pointer", color: T.textDim, borderRadius: 6, opacity: deleting ? 0.4 : 1, flexShrink: 0 }}
      >
        <Icon name="trash" size={13} color={T.textDim} />
      </button>
    </div>
  );
}

function MealGroup({ groupName, meals, onDelete, deletingId, onAddClick, onMealClick }) {
  const [open, setOpen] = useState(true);
  const total = meals.reduce((s, m) => s + (m.calories || 0), 0);
  return (
    <div style={{ marginBottom: 8 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 16px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <Icon name={open ? "chev-down" : "chev-right"} size={14} color={T.textMuted} />
        <span style={{ fontSize: 12, fontWeight: 700, color: T.textMuted, letterSpacing: 0.5, textTransform: "uppercase", flex: 1 }}>{groupName}</span>
        {total > 0 && <span style={{ fontSize: 11, color: T.amber, fontFamily: T.fontMono, fontWeight: 600 }}>{Math.round(total)} kcal</span>}
        <span style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>
          {meals.length} item{meals.length !== 1 ? "s" : ""}
        </span>
      </button>
      {open && (
        <Card style={{ margin: "0 16px", padding: 0, overflow: "hidden" }}>
          {meals.length === 0 ? (
            <div style={{ padding: "12px 16px", fontSize: 12, color: T.textDim }}>Nothing logged yet</div>
          ) : (
            meals.map((m) => (
              <MealRow key={m.id} meal={m} onDelete={onDelete} deleting={deletingId === m.id} onClick={() => onMealClick?.(m)} />
            ))
          )}
          <button
            onClick={() => onAddClick(groupName)}
            style={{
              width: "100%",
              padding: "10px 14px",
              background: "none",
              border: "none",
              borderTop: meals.length > 0 ? `1px dashed ${T.border}` : "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: T.textDim,
            }}
          >
            <Icon name="plus" size={13} color={T.textDim} />
            <span style={{ fontSize: 11, fontWeight: 500, fontFamily: T.fontFamily }}>Add to {groupName}</span>
          </button>
        </Card>
      )}
    </div>
  );
}

export default function MealsPage({ profile, onProfile }) {
  const [todayMeals, setTodayMeals] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [history, setHistory] = useState({});
  const [supplements, setSupplements] = useState([]);
  const [checkedSupplements, setCheckedSupplements] = useState({});
  const [targets, setTargets] = useState({ calories: 2400, protein: 180, carbs: 260, fat: 75 });
  const [selectedDate, setSelectedDate] = useState(getTodayISO());
  const [selectedMeal, setSelectedMeal] = useState(null);
  const [addModal, setAddModal] = useState(null); // { groupName }
  const [loading, setLoading] = useState(true);
  const [showGoalCalc, setShowGoalCalc] = useState(false);
  const [showRecipeImporter, setShowRecipeImporter] = useState(false);
  const [recipeText, setRecipeText] = useState("");
  const [recipeLoading, setRecipeLoading] = useState(false);
  const [recipeResult, setRecipeResult] = useState(null);
  const [recipeMealType, setRecipeMealType] = useState("dinner");

  async function refresh() {
    try {
      const [today, tmpl, hist] = await Promise.all([
        mealsAPI.getToday(),
        mealsAPI.getTemplates(),
        mealsAPI.getHistory(14),
      ]);
      if (today) {
        setTodayMeals(today.meals || []);
        setSupplements(today.supplements || []);
        setCheckedSupplements(today.checked_supplements || {});
      }
      if (tmpl?.templates) setTemplates(tmpl.templates);
      if (hist?.history) setHistory(hist.history);
    } catch {}
  }

  useEffect(() => {
    if (profile) {
      setTargets({
        calories: profile.daily_calorie_target || 2400,
        protein: profile.daily_protein_target || 180,
        carbs: profile.daily_carbs_target || 260,
        fat: profile.daily_fat_target || 75,
      });
    }
  }, [profile]);

  useEffect(() => {
    (async () => {
      try {
        await refresh();
      } catch {}
      setLoading(false);
    })();
  }, []);

  const dayMeals = useMemo(() => {
    if (selectedDate === getTodayISO()) return todayMeals;
    const bucket = history[selectedDate];
    return bucket?.meals || [];
  }, [selectedDate, todayMeals, history]);

  const totals = useMemo(() => {
    return dayMeals.reduce(
      (acc, m) => {
        acc.calories += m.calories || 0;
        acc.protein += m.protein_g || 0;
        acc.carbs += m.carbs_g || 0;
        acc.fat += m.fat_g || 0;
        return acc;
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
  }, [dayMeals]);

  const adherence = targets.calories ? Math.min(totals.calories / targets.calories, 1.5) : 0;

  const weeklyData = useMemo(() => {
    const arr = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = toISO(d);
      const bucket = history[iso];
      arr.push({ day: DAYS_SHORT[(d.getDay() + 6) % 7], calories: bucket?.total_calories || 0 });
    }
    return arr;
  }, [history]);

  async function handleDeleteMeal(id) {
    try {
      await mealsAPI.deleteLog(id);
      refresh();
    } catch {}
  }

  async function handleToggleSupplement(name) {
    const next = { ...checkedSupplements, [name]: !checkedSupplements[name] };
    setCheckedSupplements(next);
    try {
      await userAPI.updateProfile({ checked_supplements: next });
    } catch {}
  }

  async function handleAIEstimate() {
    if (!recipeText.trim()) return;
    setRecipeLoading(true);
    try {
      const result = await aiAPI.estimateMacros(recipeText);
      setRecipeResult(result);
    } catch {}
    setRecipeLoading(false);
  }

  async function handleAddFood(food, groupName) {
    const mealType = (groupName || "breakfast").toLowerCase().replace("snacks", "snack");
    try {
      await mealsAPI.logManual({
        name: food.name,
        meal_type: mealType,
        calories: food.calories,
        protein_g: food.protein_g,
        carbs_g: food.carbs_g,
        fat_g: food.fat_g,
        date: selectedDate,
      });
      if (food._saveAsTemplate) {
        mealsAPI.saveTemplate({ name: food.name, meal_type: mealType, calories: food.calories, protein_g: food.protein_g, carbs_g: food.carbs_g, fat_g: food.fat_g }).catch(() => {});
      }
      setAddModal(null);
      refresh();
    } catch {}
  }

  async function handleUpdateMeal(id, payload) {
    await mealsAPI.updateLog(id, payload);
    setSelectedMeal((prev) => prev ? { ...prev, ...payload } : prev);
    refresh();
  }

  async function handleDeleteMealFromDetail(id) {
    try {
      await mealsAPI.deleteLog(id);
      setSelectedMeal(null);
      refresh();
    } catch {}
  }

  async function handleSaveAsTemplate(meal) {
    try {
      await mealsAPI.saveTemplate({
        name: meal.name,
        meal_type: meal.meal_type || "lunch",
        calories: meal.calories || 0,
        protein_g: meal.protein_g || 0,
        carbs_g: meal.carbs_g || 0,
        fat_g: meal.fat_g || 0,
      });
      refresh();
    } catch {}
  }

  function handleUpdateTargets(newTargets) {
    setTargets((prev) => ({ ...prev, ...newTargets }));
    userAPI.updateProfile({
      daily_calorie_target: newTargets.daily_calorie_target,
      daily_protein_target: newTargets.daily_protein_target,
      target_weight_kg: newTargets.target_weight_kg,
    }).catch(() => {});
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: T.bg, position: "relative" }}>
      <PageHeader
        title="Meals"
        subtitle={`${Math.round(adherence * 100)}% adherence · ${Math.round(totals.calories)} kcal`}
        profile={profile}
        onProfile={onProfile}
      />

      <PageScroll>
        {/* Macro ring + bars */}
        {loading ? (
          <SkeletonRing />
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "8px 20px 16px" }}>
            <MacroRing pct={adherence} value={Math.round(totals.calories)} target={targets.calories} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
              <MacroBar label="Protein" value={Math.round(totals.protein)} target={targets.protein} color={T.teal} />
              <MacroBar label="Carbs" value={Math.round(totals.carbs)} target={targets.carbs} color={T.amber} />
              <MacroBar label="Fat" value={Math.round(totals.fat)} target={targets.fat} color={T.textMuted} />
            </div>
          </div>
        )}

        {/* Week strip */}
        <div style={{ padding: "0 20px 12px" }}>
          <WeekStrip history={history} calorieTarget={targets.calories} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
        </div>

        <DayNav
          selectedDate={selectedDate}
          onNav={(dir) => {
            const d = new Date(selectedDate + "T12:00:00");
            d.setDate(d.getDate() + dir);
            setSelectedDate(toISO(d));
          }}
        />

        {/* Supplements */}
        {supplements.length > 0 && (
          <div style={{ padding: "0 16px 12px", display: "flex", gap: 8, overflowX: "auto", scrollbarWidth: "none" }}>
            {supplements.map((sup) => (
              <SupplementChip key={sup.name} sup={sup} checked={!!checkedSupplements[sup.name]} onToggle={() => handleToggleSupplement(sup.name)} />
            ))}
          </div>
        )}

        {/* Weekly calendar */}
        <WeeklyCalendar data={weeklyData} calorieTarget={targets.calories} />

        {/* Water tracker */}
        <WaterTracker />

        {/* Weight goal calculator toggle */}
        <div style={{ padding: "0 20px 12px" }}>
          <button
            onClick={() => setShowGoalCalc((s) => !s)}
            style={{
              width: "100%",
              padding: "10px 0",
              background: T.elevated,
              border: `1px solid ${T.border}`,
              borderRadius: T.rCard,
              color: T.text,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <Icon name="trend-up" size={14} color={T.violet} />
            {showGoalCalc ? "Hide Goal Calculator" : "Weight Goal Calculator"}
          </button>
        </div>
        {showGoalCalc && <WeightGoalCalculator profile={profile} onUpdate={handleUpdateTargets} />}

        {/* Recipe importer */}
        <div style={{ padding: "0 20px 12px" }}>
          <button
            onClick={() => setShowRecipeImporter(true)}
            style={{
              width: "100%",
              padding: "10px 0",
              background: T.elevated,
              border: `1px solid ${T.border}`,
              borderRadius: T.rCard,
              color: T.text,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <Icon name="sparkle" size={14} color={T.teal} />
            AI Recipe Importer
          </button>
        </div>

        {/* Meal groups */}
        <div style={{ padding: "0 0 16px" }}>
          {MEAL_GROUPS.map((group) => (
            <MealGroup
              key={group}
              groupName={group}
              meals={dayMeals.filter((m) => (m.meal_type || "breakfast").toLowerCase() === group.toLowerCase().replace("snacks", "snack"))}
              onDelete={handleDeleteMeal}
              deletingId={null}
              onAddClick={(g) => setAddModal({ groupName: g })}
              onMealClick={(m) => setSelectedMeal(m)}
            />
          ))}
        </div>

        {loading && <LoadingDots />}
        {!loading && dayMeals.length === 0 && (
          <IllustratedEmptyState
            variant="meals"
            action={
              <button
                onClick={() => setAddModal({ groupName: "Breakfast" })}
                style={{
                  marginTop: 8,
                  padding: "8px 16px",
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
                Log First Meal
              </button>
            }
          />
        )}
      </PageScroll>

      {/* Add meal modal */}
      <BottomSheet open={!!addModal} onClose={() => setAddModal(null)} title={`Add to ${addModal?.groupName || ""}`}>
        <FoodSearch
          onSelect={(food) => {
            handleAddFood(food, addModal?.groupName);
          }}
        />
      </BottomSheet>

      {/* Recipe importer */}
      <BottomSheet open={showRecipeImporter} onClose={() => setShowRecipeImporter(false)} title="AI Recipe Importer">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <textarea
            value={recipeText}
            onChange={(e) => setRecipeText(e.target.value)}
            rows={4}
            placeholder="Paste ingredients here, e.g. 200g chicken breast, 1 cup rice, 100g broccoli..."
            style={{
              width: "100%",
              background: T.elevated,
              border: `1px solid ${T.border}`,
              borderRadius: T.rInput,
              padding: "10px 12px",
              color: T.text,
              fontSize: 13,
              fontFamily: "inherit",
              outline: "none",
              resize: "none",
              boxSizing: "border-box",
            }}
          />
          {!recipeResult && (
            <button
              onClick={handleAIEstimate}
              disabled={recipeLoading || !recipeText.trim()}
              style={{
                padding: "12px 0",
                background: recipeLoading ? T.elevated : `linear-gradient(135deg,${T.teal},${T.violet})`,
                color: recipeLoading ? T.textMuted : "#0A0A0F",
                border: "none",
                borderRadius: T.rCard,
                fontSize: 14,
                fontWeight: 700,
                cursor: recipeLoading ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <Icon name="sparkle" size={16} color={recipeLoading ? T.textMuted : "#0A0A0F"} />
              {recipeLoading ? "Estimating…" : "Estimate Macros"}
            </button>
          )}
          {recipeResult && (
            <div style={{ background: T.elevated, border: `1px solid ${T.teal}44`, borderRadius: T.rCard, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.teal }}>Estimated Macros</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  ["Calories", `${recipeResult.calories} kcal`, T.amber],
                  ["Protein", `${recipeResult.protein_g}g`, T.teal],
                  ["Carbs", `${recipeResult.carbs_g}g`, T.amber],
                  ["Fat", `${recipeResult.fat_g}g`, T.textMuted],
                ].map(([label, val, color]) => (
                  <div key={label} style={{ background: T.surface, borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color, fontFamily: T.fontMono }}>{val}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setRecipeResult(null)}
                  style={{ flex: 1, padding: "8px 0", background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 8, color: T.textMuted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
                >
                  Back
                </button>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 10, color: T.textDim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 5 }}>Log as</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {["breakfast", "lunch", "dinner", "snack"].map((mt) => (
                        <button key={mt} onClick={() => setRecipeMealType(mt)}
                          style={{ flex: 1, padding: "5px 2px", borderRadius: 7, background: recipeMealType === mt ? T.teal : T.elevated, color: recipeMealType === mt ? "#0A0A0F" : T.text, border: `1px solid ${recipeMealType === mt ? T.teal : T.border}`, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize" }}>
                          {mt}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      handleAddFood({ name: "Recipe", ...recipeResult }, recipeMealType.charAt(0).toUpperCase() + recipeMealType.slice(1));
                      setShowRecipeImporter(false);
                      setRecipeResult(null);
                      setRecipeText("");
                    }}
                    style={{ width: "100%", padding: "10px 0", background: T.teal, color: "#0A0A0F", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                  >
                    Log Meal
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </BottomSheet>

      {selectedMeal && (
        <MealDetailPage
          meal={selectedMeal}
          targets={targets}
          onBack={() => setSelectedMeal(null)}
          onDelete={() => handleDeleteMealFromDetail(selectedMeal.id)}
          onUpdate={(payload) => handleUpdateMeal(selectedMeal.id, payload)}
          onSaveAsTemplate={() => handleSaveAsTemplate(selectedMeal)}
        />
      )}
    </div>
  );
}
