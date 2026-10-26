import { T } from "../design/tokens";

// Shared by the Pantry list and the item page.
export const CAT_MAP = {
  protein: { label: "Protein", color: T.negative },
  produce: { label: "Produce", color: "#5FC87A"  },
  grains:  { label: "Grains",  color: T.amber    },
  dairy:   { label: "Dairy",   color: "#5C8FFC"  },
  pantry:  { label: "Pantry",  color: T.violet   },
  other:   { label: "Other",   color: T.textMuted },
};

export function getCatMeta(id) { return CAT_MAP[id] || CAT_MAP.other; }

// Items added through the MCP tool before the categories were aligned use
// these older names; show them under the matching Pantry category.
const CAT_ALIAS = { carbs: "grains", veggies: "produce", spices: "pantry", fats: "pantry" };
export function catOf(item) { return CAT_ALIAS[item.category] || item.category || "other"; }

export const UNITS = ["g", "kg", "ml", "L", "pieces", "cans", "portions", "tbsp", "tsp", "cups"];

// Same as the Notion pantry's Status column
export const STATUSES = [
  { id: "ok",          label: "OK",          color: T.teal },
  { id: "running_low", label: "Running low", color: T.amber },
  { id: "need_to_buy", label: "Need to buy", color: T.negative },
];
export function statusMeta(id) { return STATUSES.find((s) => s.id === id) || STATUSES[0]; }

export const STORAGES = [
  { id: "pantry",  label: "Pantry",  color: T.amber },
  { id: "fridge",  label: "Fridge",  color: T.teal },
  { id: "freezer", label: "Freezer", color: T.violet },
];
export function storageMeta(id) { return STORAGES.find((s) => s.id === id) || null; }
