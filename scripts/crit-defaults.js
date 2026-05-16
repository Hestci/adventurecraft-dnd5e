/**
 * Infers a concrete crit-success payload from a recipe result item (plain Item-like object).
 *
 * Field conventions are aligned with **dnd5e system 4.4.x** (Foundry v13+):
 * - Equipment: `system.type.value` — armor categories (`light`, `medium`, `heavy`, `natural`),
 *   `shield`, `clothing`, `trinket`, etc.
 * - Consumable: `system.type.value` — `potion`, `scroll`, `ammo`, `food`, …
 * - Tool: `system.bonus` is a **formula string**; numeric stacking in `applyCritEffect`.
 * - Weapon/equipment **item properties** (dnd5e): `system.properties` is typically a **Set**
 *   of keys (`mgc`, `fin`, …) — see CONFIG.DND5E.itemProperties; applied via `type: "itemProperty"`.
 *
 * Legacy: `system.armor.type`, `system.consumableType`.
 */

/** @type {ReadonlySet<string>} */
export const ARMOR_AC_TYPES = new Set(["light", "medium", "heavy", "natural"]);

/** @type {readonly string[]} */
export const FALLBACK_EQUIPMENT_SUBTYPES = Object.freeze([
  "light", "medium", "heavy", "natural", "shield", "clothing", "trinket",
]);

/** @type {readonly string[]} */
export const FALLBACK_CONSUMABLE_SUBTYPES = Object.freeze([
  "potion", "scroll", "ammo", "food", "poison", "trinket", "rod", "wand",
]);

/**
 * @param {object} result
 * @returns {string}
 */
export function getEquipmentSubtype(result) {
  const sys = result?.system ?? {};
  return String(sys.type?.value ?? sys.armor?.type ?? "").trim();
}

/**
 * @param {object} result
 * @returns {string}
 */
export function getConsumableSubtype(result) {
  const sys = result?.system ?? {};
  return String(sys.type?.value ?? sys.consumableType ?? "").trim();
}

/**
 * @param {object} result
 * @returns {{ type: string, [key: string]: unknown }}
 */
export function inferCritSuccessFromResult(result) {
  if (!result || typeof result !== "object") return { type: "qty", qty: 1 };

  const itemType = result.type ?? "loot";
  const sys = result.system ?? {};

  if (itemType === "weapon") {
    return { type: "damage", damageFormula: "@prof", damageTypes: [] };
  }

  if (itemType === "equipment") {
    const ev = getEquipmentSubtype(result);
    if (ev === "shield" || ARMOR_AC_TYPES.has(ev)) {
      return { type: "property", property: "armor.value", value: 1, mode: "add" };
    }
    if (ev === "clothing" || ev === "trinket") {
      return { type: "qty", qty: 1 };
    }
    return { type: "qty", qty: 1 };
  }

  if (itemType === "consumable") {
    const ct = getConsumableSubtype(result);
    if (ct === "ammo") return { type: "qty", qty: 10 };
    return { type: "qty", qty: 1 };
  }

  if (itemType === "tool") {
    return { type: "property", property: "bonus", value: 1, mode: "add" };
  }

  if (itemType === "loot" || itemType === "container") {
    return { type: "qty", qty: 1 };
  }

  return { type: "qty", qty: 1 };
}

/**
 * Scroll consumables: optional alternate crit (pool only by default).
 * @returns {{ type: string, property: string, value: number, mode: string }}
 */
export function critScrollUsesMax() {
  return { type: "property", property: "uses.max", value: 1, mode: "add" };
}

/**
 * @param {object} cs - atomic crit payload
 * @param {object|null|undefined} result - recipe.result (for context labels)
 * @param {{ localize?: (key: string) => string, format?: (key: string, data: object) => string }} [i18n]
 * @returns {string}
 */
export function describeAtomicCrit(cs, result = null, i18n = null) {
  if (!cs || typeof cs !== "object") return "";

  const loc = (key) => {
    if (i18n?.localize) return i18n.localize(key);
    try {
      if (typeof game !== "undefined" && game?.i18n?.localize) return game.i18n.localize(key);
    } catch { /* not in Foundry */ }
    return key;
  };
  const fmt = (key, data) => {
    if (i18n?.format) return i18n.format(key, data);
    try {
      if (typeof game !== "undefined" && game?.i18n?.format) return game.i18n.format(key, data);
    } catch { /* not in Foundry */ }
    return key;
  };

  const t = cs.type ?? "qty";
  if (t === "qty") {
    return fmt("ADVENTURECRAFT.CritSuccess.PreviewQty", { qty: cs.qty ?? 1 });
  }
  if (t === "property") {
    const prop = cs.property ?? "";
    const mode = cs.mode === "set" ? loc("ADVENTURECRAFT.PropertyMode.Set") : loc("ADVENTURECRAFT.PropertyMode.Add");
    return fmt("ADVENTURECRAFT.CritSuccess.PreviewProperty", {
      prop,
      value: cs.value ?? 1,
      mode,
    });
  }
  if (t === "damage") {
    const formula = cs.damageFormula ?? "";
    const types = cs.damageTypes ?? (cs.damageType ? [cs.damageType] : []);
    const typeStr = Array.isArray(types) && types.length ? types.join(", ") : "—";
    return fmt("ADVENTURECRAFT.CritSuccess.PreviewDamage", { formula, types: typeStr });
  }
  if (t === "itemProperty") {
    const key = cs.propertyKey ?? "";
    let label = key;
    try {
      const cfg = typeof CONFIG !== "undefined" && CONFIG?.DND5E?.itemProperties?.[key];
      if (cfg?.label) label = loc(cfg.label);
    } catch { /* CONFIG unavailable */ }
    return fmt("ADVENTURECRAFT.CritSuccess.PreviewItemProperty", { property: label, key });
  }
  return loc("ADVENTURECRAFT.CritSuccess.PreviewUnknown");
}

/**
 * @param {object|null|undefined} result
 * @param {{ localize?: Function, format?: Function }} [i18n]
 * @returns {string}
 */
export function describeAutoCritPreview(result, i18n = null) {
  const cs = inferCritSuccessFromResult(result);
  return describeAtomicCrit(cs, result, i18n);
}

/**
 * Apply equipment/consumable subtype from editor onto a plain result object.
 * @param {object} result
 * @param {string} itemType
 * @param {string} subtypeValue
 */
export function applyResultSubtypeToPlainResult(result, itemType, subtypeValue) {
  if (!result || !subtypeValue) return;
  result.system ??= {};
  const v = String(subtypeValue).trim();
  if (!v) return;
  if (itemType === "equipment") {
    result.system.type ??= {};
    result.system.type.value = v;
    if (result.system.armor && typeof result.system.armor === "object") {
      result.system.armor.type = v;
    }
  } else if (itemType === "consumable") {
    result.system.type ??= {};
    result.system.type.value = v;
    result.system.consumableType = v;
  }
}

/**
 * @returns {{ value: string, label: string }[]}
 */
export function getEquipmentSubtypeSelectOptions() {
  try {
    const cfg = typeof CONFIG !== "undefined" && CONFIG?.DND5E?.armorTypes;
    if (cfg && typeof cfg === "object") {
      return Object.entries(cfg).map(([value, data]) => ({
        value,
        label: (typeof game !== "undefined" && game?.i18n?.localize)
          ? game.i18n.localize(data?.label ?? value)
          : String(data?.label ?? value),
      }));
    }
  } catch { /* CONFIG not ready */ }
  return FALLBACK_EQUIPMENT_SUBTYPES.map((value) => ({ value, label: value }));
}

/**
 * @returns {{ value: string, label: string }[]}
 */
export function getConsumableSubtypeSelectOptions() {
  try {
    const cfg = typeof CONFIG !== "undefined" && CONFIG?.DND5E?.consumableTypes;
    if (cfg && typeof cfg === "object") {
      return Object.entries(cfg).map(([value, data]) => ({
        value,
        label: (typeof game !== "undefined" && game?.i18n?.localize)
          ? game.i18n.localize(data?.label ?? value)
          : String(data?.label ?? value),
      }));
    }
  } catch { /* CONFIG not ready */ }
  return FALLBACK_CONSUMABLE_SUBTYPES.map((value) => ({ value, label: value }));
}
