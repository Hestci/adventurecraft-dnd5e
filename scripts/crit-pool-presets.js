/**
 * Suggested crit-success pool options by recipe result item type/subtype.
 */

import {
  ARMOR_AC_TYPES,
  critScrollUsesMax,
  getConsumableSubtype,
  getEquipmentSubtype,
  inferCritSuccessFromResult,
} from "./crit-defaults.js";

/**
 * @param {object} result - plain recipe.result
 * @returns {object[]}
 */
export function getSuggestedPoolOptions(result) {
  if (!result || typeof result !== "object") {
    return [{ type: "qty", qty: 1 }];
  }

  const itemType = result.type ?? "loot";
  const primary = inferCritSuccessFromResult(result);
  const options = [JSON.parse(JSON.stringify(primary))];

  if (itemType === "weapon") {
    if (primary.type !== "qty") options.push({ type: "qty", qty: 1 });
    options.push({ type: "itemProperty", propertyKey: "mgc" });
    return _dedupeOptions(options);
  }

  if (itemType === "equipment") {
    const ev = getEquipmentSubtype(result);
    if (ARMOR_AC_TYPES.has(ev) || ev === "shield") {
      if (primary.property !== "armor.magicalBonus") {
        options.push({ type: "property", property: "armor.magicalBonus", value: 1, mode: "add" });
      }
      options.push({ type: "qty", qty: 1 });
    } else {
      options.push({ type: "qty", qty: 1 });
    }
    return _dedupeOptions(options);
  }

  if (itemType === "consumable") {
    const ct = getConsumableSubtype(result);
    if (ct === "scroll") {
      options.push(critScrollUsesMax());
    } else if (ct !== "ammo") {
      options.push({ type: "property", property: "uses.max", value: 1, mode: "add" });
    }
    if (primary.type !== "qty" || (primary.qty ?? 1) !== 1) {
      options.push({ type: "qty", qty: 1 });
    }
    return _dedupeOptions(options);
  }

  if (itemType === "tool") {
    options.push({ type: "qty", qty: 1 });
    return _dedupeOptions(options);
  }

  return _dedupeOptions(options);
}

/** @param {object[]} options */
function _dedupeOptions(options) {
  const seen = new Set();
  const out = [];
  for (const o of options) {
    const key = JSON.stringify(o);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(o);
  }
  return out.length ? out : [{ type: "qty", qty: 1 }];
}
