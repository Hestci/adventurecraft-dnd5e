/**
 * UI helpers for crit-success fields (damage types, property presets).
 * Damage types align with dnd5e CONFIG.DND5E.damageTypes (PHB 5e: 13 types).
 */

/** @type {readonly string[]} Same keys as dnd5e 4.4 `CONFIG.DND5E.damageTypes` */
const FALLBACK_DAMAGE_KEYS = Object.freeze([
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "psychic",
  "radiant",
  "slashing",
  "thunder",
]);

/** @param {string} key */
function _safeLocalize(key) {
  try {
    if (typeof game !== "undefined" && game?.i18n?.localize) return game.i18n.localize(key);
  } catch {
    /* game / i18n not ready */
  }
  return key;
}

const DAMAGE_LABEL_KEYS = Object.freeze({
  acid: "DND5E.DamageAcid",
  bludgeoning: "DND5E.DamageBludgeoning",
  cold: "DND5E.DamageCold",
  fire: "DND5E.DamageFire",
  force: "DND5E.DamageForce",
  lightning: "DND5E.DamageLightning",
  necrotic: "DND5E.DamageNecrotic",
  piercing: "DND5E.DamagePiercing",
  poison: "DND5E.DamagePoison",
  psychic: "DND5E.DamagePsychic",
  radiant: "DND5E.DamageRadiant",
  slashing: "DND5E.DamageSlashing",
  thunder: "DND5E.DamageThunder",
});

/**
 * @returns {{ value: string, label: string }[]}
 */
export function getDamageTypeSelectOptions() {
  try {
    const cfg = typeof CONFIG !== "undefined" && CONFIG?.DND5E?.damageTypes;
    if (cfg && typeof cfg === "object") {
      return Object.keys(cfg).map((value) => ({
        value,
        label: _safeLocalize(cfg[value]?.label ?? DAMAGE_LABEL_KEYS[value] ?? value),
      }));
    }
  } catch {
    /* CONFIG not ready */
  }
  return FALLBACK_DAMAGE_KEYS.map((value) => ({
    value,
    label: _safeLocalize(DAMAGE_LABEL_KEYS[value] ?? value),
  }));
}

/**
 * @param {unknown} raw - string | string[] | comma string | undefined
 * @returns {string[]}
 */
export function normalizeDamageTypeSelections(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s).trim()).filter(Boolean);
  }
  const s = String(raw).trim();
  if (!s) return [];
  if (s.includes(",")) return s.split(",").map((x) => x.trim()).filter(Boolean);
  return [s];
}

/**
 * @param {string[]} selected
 * @returns {{ value: string, label: string, selected: boolean }[]}
 */
export function mapDamageTypesWithSelection(selected) {
  const set = new Set(normalizeDamageTypeSelections(selected));
  return getDamageTypeSelectOptions().map((o) => ({
    ...o,
    selected: set.has(o.value),
  }));
}

/**
 * @param {object} cs - crit fragment with damageType and/or damageTypes
 * @returns {{ types: string[], picked: string|null, all: string[] }}
 */
export function resolveDamageTypesForCritPart(cs) {
  const raw = cs?.damageTypes ?? cs?.damageType;
  const all = normalizeDamageTypeSelections(raw);
  if (!all.length) return { types: [], picked: null, all: [] };
  const picked = all[Math.floor(Math.random() * all.length)];
  return { types: picked ? [picked] : [], picked, all };
}

/** Presets: optional itemTypes limits which result `type` shows the row (null = any). */
const CRIT_PROPERTY_PRESETS = Object.freeze([
  { value: "armor.value", labelKey: "ADVENTURECRAFT.CritProperty.armorValue", itemTypes: ["equipment"] },
  { value: "armor.magicalBonus", labelKey: "ADVENTURECRAFT.CritProperty.armorMagicalBonus", itemTypes: ["equipment"] },
  { value: "armor.dex", labelKey: "ADVENTURECRAFT.CritProperty.armorDex", itemTypes: ["equipment"] },
  { value: "strength", labelKey: "ADVENTURECRAFT.CritProperty.strength", itemTypes: ["equipment"] },
  { value: "bonus", labelKey: "ADVENTURECRAFT.CritProperty.toolBonus", itemTypes: ["tool"] },
  { value: "quantity", labelKey: "ADVENTURECRAFT.CritProperty.quantity", itemTypes: null },
  { value: "uses.max", labelKey: "ADVENTURECRAFT.CritProperty.usesMax", itemTypes: ["consumable", "equipment", "tool", "weapon", "loot"] },
  { value: "weight.value", labelKey: "ADVENTURECRAFT.CritProperty.weightValue", itemTypes: null },
]);

/**
 * @param {string|null|undefined} resultItemType - recipe.result.type
 * @returns {{ value: string, label: string }[]}
 */
export function getCritPropertyPresetOptions(resultItemType) {
  const t = resultItemType ?? "";
  return CRIT_PROPERTY_PRESETS.filter((row) => {
    if (!row.itemTypes) return true;
    if (!t) return true;
    return row.itemTypes.includes(t);
  }).map((row) => ({
    value: row.value,
    label: _safeLocalize(row.labelKey),
  }));
}

/**
 * @param {string} currentProperty - path under system.* (no "system." prefix)
 * @param {string|null|undefined} resultItemType
 */
/** Fallback dnd5e item property keys when CONFIG is unavailable (weapons). */
const FALLBACK_WEAPON_ITEM_PROPERTIES = Object.freeze([
  "mgc", "ada", "fin", "foc", "hvy", "lgt", "rch", "thr", "two", "ver",
]);

/**
 * dnd5e `system.properties` keys for crit `type: "itemProperty"`.
 * @param {string|null|undefined} resultItemType
 * @returns {{ value: string, label: string }[]}
 */
export function getCritItemPropertyOptions(resultItemType) {
  const t = resultItemType ?? "";
  try {
    const cfg = typeof CONFIG !== "undefined" && CONFIG?.DND5E?.itemProperties;
    if (cfg && typeof cfg === "object") {
      return Object.entries(cfg)
        .filter(([key, data]) => {
          if (!t) return true;
          if (t === "weapon") return data?.isWeapon !== false;
          if (t === "equipment") return data?.isEquipment !== false || data?.isPhysical !== false;
          return true;
        })
        .map(([value, data]) => ({
          value,
          label: _safeLocalize(data?.label ?? value),
        }));
    }
  } catch { /* CONFIG not ready */ }
  if (t === "weapon" || !t) {
    return FALLBACK_WEAPON_ITEM_PROPERTIES.map((value) => ({ value, label: value }));
  }
  return [];
}

/**
 * Merge a dnd5e item property key into `system.properties` on plain item data.
 * @param {object} resultData
 * @param {string} propertyKey
 * @returns {boolean}
 */
export function applyItemPropertyToResultData(resultData, propertyKey) {
  const key = String(propertyKey ?? "").trim();
  if (!key || !resultData) return false;
  const path = "system.properties";
  let cur = foundry.utils.getProperty(resultData, path);
  const set = cur instanceof Set ? new Set(cur) : new Set(Array.isArray(cur) ? cur : []);
  if (set.has(key)) return true;
  set.add(key);
  foundry.utils.setProperty(resultData, path, set);
  return true;
}

/**
 * @param {string} propertyKey
 * @returns {string}
 */
export function formatItemPropertyLabel(propertyKey) {
  const key = String(propertyKey ?? "").trim();
  if (!key) return "";
  try {
    const cfg = typeof CONFIG !== "undefined" && CONFIG?.DND5E?.itemProperties?.[key];
    if (cfg?.label) return _safeLocalize(cfg.label);
  } catch { /* CONFIG */ }
  return key;
}

export function buildPropertyPresetUiState(currentProperty, resultItemType) {
  const prop = (currentProperty ?? "").trim();
  if (!prop) {
    return { presetValue: "", customValue: "", customVisible: false };
  }
  const presets = getCritPropertyPresetOptions(resultItemType);
  const match = presets.find((p) => p.value === prop);
  if (match) {
    return { presetValue: prop, customValue: "", customVisible: false };
  }
  return { presetValue: "__custom__", customValue: prop, customVisible: true };
}
