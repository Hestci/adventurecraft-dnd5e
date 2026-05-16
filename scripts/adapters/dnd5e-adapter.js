import { inferCritSuccessFromResult } from "../crit-defaults.js";
import {
  applyItemPropertyToResultData,
  formatItemPropertyLabel,
  resolveDamageTypesForCritPart,
} from "../crit-field-options.js";
const CORE_ID = "adventurecraft-core";

const _log = {
  log(...a) { console.log(...a); },
  warn(...a) { console.warn(...a); },
};

function buildDnd5eDamagePartData(formula, types) {
  const f = String(formula ?? "").trim();
  const dieSteps = typeof CONFIG !== "undefined" && CONFIG?.DND5E?.dieSteps;
  const parsed = f.match(/^\s*(\d+)d(\d+)(?:\s*([+|-])\s*(@?[\w\d.-]+))?\s*$/i);
  const data = {
    number: null,
    denomination: null,
    bonus: "",
    types: Array.isArray(types) ? [...types] : [],
    custom: { enabled: false, formula: "" },
    scaling: { mode: "", number: null, formula: "" },
  };
  if (parsed && Array.isArray(dieSteps) && dieSteps.includes(Number(parsed[2]))) {
    data.number = Number(parsed[1]);
    data.denomination = Number(parsed[2]);
    if (parsed[4]) data.bonus = parsed[3] === "-" ? `-${parsed[4]}` : parsed[4];
  } else if (f) {
    data.custom.enabled = true;
    data.custom.formula = f;
  }
  return data;
}

async function _rollActorAbilityCheck(actor, abilityId) {
  if (typeof actor.rollAbilityCheck === "function") return actor.rollAbilityCheck({ ability: abilityId });
  if (typeof actor.rollAbilityTest === "function") return actor.rollAbilityTest(abilityId);
  throw new TypeError("Actor has no rollAbilityCheck / rollAbilityTest");
}

async function _rollActorSkill(actor, skillId) {
  if (typeof actor.rollSkill !== "function") throw new TypeError("Actor has no rollSkill");
  if (typeof actor.rollAbilityCheck === "function") return actor.rollSkill({ skill: skillId });
  return actor.rollSkill(skillId);
}

function applyCritEffect(resultData, recipe, cs) {
  const type = cs.type ?? "qty";

  if (type === "itemProperty") {
    const key = String(cs.propertyKey ?? "").trim();
    if (key && applyItemPropertyToResultData(resultData, key)) {
      const label = formatItemPropertyLabel(key);
      return {
        label: game.i18n.format("ADVENTURECRAFT.CritSuccess.ItemPropertyApplied", { property: label }),
      };
    }
    return { label: "" };
  }

  if (type === "property") {
    const prop = cs.property?.trim() ?? "";
    if (prop) {
      const fullPath = `system.${prop}`;
      const cur = foundry.utils.getProperty(resultData, fullPath);

      if (resultData.type === "tool" && prop === "bonus" && (typeof cur === "string" || cur == null || cur === "")) {
        const addition = Number(cs.value ?? 1);
        const piece = Number.isFinite(addition) ? String(addition) : "1";
        const base = typeof cur === "string" ? cur : "";
        const next = base.trim() ? `${base.trim()} + ${piece}` : piece;
        foundry.utils.setProperty(resultData, fullPath, next);
        return {
          label: game.i18n.format("ADVENTURECRAFT.CritSuccess.ToolBonusDelta", { formula: next }),
        };
      }

      const curNum = Number(cur) || 0;
      const newVal = cs.mode === "set"
        ? Number(cs.value ?? 1)
        : curNum + Number(cs.value ?? 1);
      foundry.utils.setProperty(resultData, fullPath, newVal);
      return {
        label: cs.mode === "set"
          ? `${prop}=${newVal}`
          : game.i18n.format("ADVENTURECRAFT.CritSuccess.PropertyDelta", { value: cs.value, prop }),
      };
    }
    return { label: "" };
  }

  if (type === "damage") {
    const formula = cs.damageFormula?.trim() ?? "";
    if (formula) {
      const { types, picked, all } = resolveDamageTypesForCritPart(cs);
      const typesList = types.length
        ? types
        : (resultData.type === "weapon" ? ["slashing"] : ["force"]);
      const part = buildDnd5eDamagePartData(formula, typesList);
      const acts = resultData.system?.activities ?? {};
      let applied = false;
      for (const act of Object.values(acts)) {
        if (act?.type === "attack" || act?.type === "damage") {
          act.damage ??= {};
          act.damage.parts ??= [];
          act.damage.parts.push(part);
          applied = true;
          break;
        }
      }
      if (!applied) {
        for (const act of Object.values(acts)) {
          if (Array.isArray(act?.damage?.parts)) {
            act.damage.parts.push(part);
            applied = true;
            break;
          }
        }
      }
      if (!applied && resultData.type === "weapon") {
        const base = foundry.utils.getProperty(resultData, "system.damage.base");
        if (base && typeof base === "object") {
          if (base.custom?.enabled) {
            const cf = String(base.custom.formula ?? "").trim();
            foundry.utils.setProperty(
              resultData,
              "system.damage.base.custom.formula",
              cf ? `${cf} + ${formula}` : formula,
            );
          } else {
            const curBonus = String(base.bonus ?? "").trim();
            foundry.utils.setProperty(
              resultData,
              "system.damage.base.bonus",
              curBonus ? `${curBonus} + ${formula}` : formula,
            );
          }
          if (typesList.length) {
            const curT = base.types instanceof Set ? [...base.types] : (Array.isArray(base.types) ? [...base.types] : []);
            foundry.utils.setProperty(resultData, "system.damage.base.types", [...new Set([...curT, ...typesList])]);
          }
          applied = true;
        }
      }
      if (!applied) {
        _log.warn(`AdventureCraft | crit damage: no attack/damage activity or weapon damage.base name=${resultData.name ?? "?"}`);
      }
      const dmgLabel = game.i18n.localize("ADVENTURECRAFT.CritSuccess.BonusDamageLabel");
      const parts = [`+${formula}`];
      if (picked) {
        if (all.length > 1) {
          parts.push(game.i18n.format("ADVENTURECRAFT.CritSuccess.RandomDamageTypePick", {
            picked,
            list: all.join(", "),
          }));
        } else {
          parts.push(picked);
        }
      }
      parts.push(dmgLabel);
      return { label: parts.join(" ") };
    }
    return { label: "" };
  }

  const baseQty = foundry.utils.getProperty(resultData, "system.quantity") ?? (recipe.result?.quantity ?? 1);
  const bonus = Number(cs.qty ?? 1);
  foundry.utils.setProperty(resultData, "system.quantity", baseQty + bonus);
  return { label: `×${baseQty + bonus}` };
}

export const dnd5eAdapter = {
  id: "dnd5e",

  getRecipeItemType: () => "loot",
  getBookItemType: () => "container",
  getRecipeBookLink: (item) => item.system?.container || null,

  applyRecipeBookLinkToCreateData(itemCreateData, bookId) {
    if (bookId) itemCreateData.system = { container: bookId };
  },

  async applyRecipeBookLinkUpdate(item, bookId) {
    const newContainer = bookId || null;
    if ((item.system?.container || null) !== newContainer) {
      await item.update({ "system.container": newContainer });
    }
  },

  async clearRecipeBookLink(item) {
    await item.update({ "system.container": "" });
  },

  getItemQuantity(item) {
    return item?.system?.quantity ?? (item ? 1 : 0);
  },

  async consumeItemQuantity(item, needed) {
    const have = item.system?.quantity ?? 1;
    const remaining = have - needed;
    if (remaining <= 0) await item.delete();
    else await item.update({ "system.quantity": remaining });
  },

  formatItemPropertyLabel,

  inferAutoCritSuccess: inferCritSuccessFromResult,

  applyCritToResultData(resultData, recipe, cs) {
    return applyCritEffect(resultData, recipe, cs);
  },

  async rollCraftCheck(actor, recipe) {
    const { type, key, dc } = recipe.check;
    const threshold = recipe.check?.critThreshold ?? 5;
    let rolls;
    if (type === "skill") {
      _log.log(`AdventureCraft | craft check roll skill=${key} DC=${dc} thr=${threshold}`);
      rolls = await _rollActorSkill(actor, key);
    } else if (type === "ability") {
      _log.log(`AdventureCraft | craft check roll ability=${key} DC=${dc} thr=${threshold}`);
      rolls = await _rollActorAbilityCheck(actor, key);
    } else if (type === "tool") {
      const { toolName, toolIdentifier, allowWithoutTool, fallbackType, fallbackKey } = recipe.check;
      const toolItem = actor.items.find(i =>
        i.type === "tool" &&
        ((toolIdentifier && i.system?.identifier === toolIdentifier) ||
         (toolName && i.name.toLowerCase() === toolName.toLowerCase())),
      );
      if (toolItem) {
        rolls = await actor.rollToolCheck({ tool: recipe.check.key });
      } else if (allowWithoutTool) {
        ui.notifications.info(game.i18n.format("ADVENTURECRAFT.Message.ToolNotFound", { tool: toolName }));
        if (fallbackType === "ability") rolls = await _rollActorAbilityCheck(actor, fallbackKey);
        else rolls = await _rollActorSkill(actor, fallbackKey);
      } else {
        ui.notifications.warn(game.i18n.format("ADVENTURECRAFT.Message.ToolRequired", { tool: toolName }));
        return { fail: { success: false, consume: false, critSuccess: false, critFail: false } };
      }
    }
    const roll = Array.isArray(rolls) ? rolls[0] : rolls;
    if (!roll) {
      return { fail: { success: false, consume: false, critSuccess: false, critFail: false } };
    }
    return { roll, dc, threshold };
  },

  prepareResultQuantity(resultData, recipe) {
    foundry.utils.setProperty(resultData, "system.quantity", recipe.result?.quantity ?? 1);
  },

  findStackTarget(actor, resultData, critChangesProperties) {
    const recipeId = resultData.flags?.[CORE_ID]?.recipeId
      ?? resultData.flags?.["adventurecraft-dnd5e"]?.recipeId;
    if (critChangesProperties || !recipeId) return null;
    return actor.items.find(i =>
      i.getFlag?.(CORE_ID, "recipeId") === recipeId
      || i.getFlag?.("adventurecraft-dnd5e", "recipeId") === recipeId,
    ) ?? null;
  },

  async createOrStackCraftedItem(actor, resultData, qty, stackTarget) {
    if (stackTarget) {
      const currentQty = stackTarget.system?.quantity ?? 1;
      await stackTarget.update({ "system.quantity": currentQty + qty });
      return { item: stackTarget, created: false };
    }
    const created = await Item.create(resultData, { parent: actor });
    return { item: created, created: true };
  },

  patchRecipeResultFlags(resultData, recipeId) {
    resultData.flags ??= {};
    resultData.flags[CORE_ID] ??= {};
    resultData.flags[CORE_ID].recipeId = recipeId;
  },
};
