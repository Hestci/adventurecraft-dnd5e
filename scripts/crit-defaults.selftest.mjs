/**
 * Run from module scripts/: node crit-defaults.selftest.mjs
 */
import assert from "node:assert/strict";
import {
  describeAtomicCrit,
  describeAutoCritPreview,
  inferCritSuccessFromResult,
} from "./crit-defaults.js";
import { getSuggestedPoolOptions } from "./crit-pool-presets.js";

const i18n = {
  localize: (k) => k,
  format: (k, d) => `${k}:${JSON.stringify(d)}`,
};

assert.deepEqual(inferCritSuccessFromResult({ type: "weapon", system: { activities: {} } }), {
  type: "damage", damageFormula: "@prof", damageTypes: [],
});
assert.deepEqual(inferCritSuccessFromResult({ type: "equipment", system: { type: { value: "shield" }, armor: { value: 2 } } }), {
  type: "property", property: "armor.value", value: 1, mode: "add",
});
assert.deepEqual(inferCritSuccessFromResult({ type: "equipment", system: { type: { value: "heavy" } } }), {
  type: "property", property: "armor.value", value: 1, mode: "add",
});
assert.deepEqual(inferCritSuccessFromResult({ type: "equipment", system: { type: { value: "trinket" } } }), {
  type: "qty", qty: 1,
});
assert.deepEqual(inferCritSuccessFromResult({ type: "consumable", system: { type: { value: "ammo" } } }), {
  type: "qty", qty: 10,
});
assert.deepEqual(inferCritSuccessFromResult({ type: "consumable", system: { type: { value: "potion" } } }), {
  type: "qty", qty: 1,
});
assert.deepEqual(inferCritSuccessFromResult({ type: "consumable", system: { type: { value: "scroll" } } }), {
  type: "qty", qty: 1,
});
assert.deepEqual(inferCritSuccessFromResult({ type: "tool", system: { bonus: "1" } }), {
  type: "property", property: "bonus", value: 1, mode: "add",
});
assert.deepEqual(inferCritSuccessFromResult({ type: "loot", system: {} }), { type: "qty", qty: 1 });
assert.deepEqual(inferCritSuccessFromResult({ type: "container", system: {} }), { type: "qty", qty: 1 });
assert.deepEqual(inferCritSuccessFromResult(null), { type: "qty", qty: 1 });
assert.deepEqual(inferCritSuccessFromResult({ type: "equipment", system: { armor: { type: "shield", value: 2 } } }), {
  type: "property", property: "armor.value", value: 1, mode: "add",
});

assert.ok(describeAutoCritPreview({ type: "weapon", system: {} }, i18n).includes("PreviewDamage"));
assert.ok(describeAtomicCrit({ type: "itemProperty", propertyKey: "mgc" }, null, i18n).includes("mgc"));

const weaponPool = getSuggestedPoolOptions({ type: "weapon", system: {} });
assert.ok(weaponPool.length >= 3);
assert.ok(weaponPool.some((o) => o.type === "itemProperty" && o.propertyKey === "mgc"));

const scrollPool = getSuggestedPoolOptions({ type: "consumable", system: { type: { value: "scroll" } } });
assert.ok(scrollPool.some((o) => o.property === "uses.max"));

console.log("crit-defaults.selftest: OK");
