import { coreApi } from "../core-api.js";
import { _log } from "../ac-debug-log.js";
import {
  mapDamageTypesWithSelection,
  buildPropertyPresetUiState,
  getCritItemPropertyOptions,
  getCritPropertyPresetOptions,
  getDamageTypeSelectOptions,
} from "../crit-field-options.js";
import {
  applyResultSubtypeToPlainResult,
  describeAutoCritPreview,
  getConsumableSubtype,
  getConsumableSubtypeSelectOptions,
  getEquipmentSubtype,
  getEquipmentSubtypeSelectOptions,
} from "../crit-defaults.js";
import { getSuggestedPoolOptions } from "../crit-pool-presets.js";
const MODULE_ID = "adventurecraft-dnd5e";
const BRIDGE_ID = MODULE_ID;

function _core() {
  return coreApi();
}

const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"];
const ABILITY_I18N = {
  str: "DND5E.AbilityStr", dex: "DND5E.AbilityDex", con: "DND5E.AbilityCon",
  int: "DND5E.AbilityInt", wis: "DND5E.AbilityWis", cha: "DND5E.AbilityCha",
};

const SKILL_KEYS = [
  "acr","ani","arc","ath","dec","his","ins","itm","inv",
  "med","nat","prc","prf","per","rel","slt","ste","sur",
];
const SKILL_I18N = {
  acr: "DND5E.SkillAcr", ani: "DND5E.SkillAni", arc: "DND5E.SkillArc",
  ath: "DND5E.SkillAth", dec: "DND5E.SkillDec", his: "DND5E.SkillHis",
  ins: "DND5E.SkillIns", itm: "DND5E.SkillItm", inv: "DND5E.SkillInv",
  med: "DND5E.SkillMed", nat: "DND5E.SkillNat", prc: "DND5E.SkillPrc",
  prf: "DND5E.SkillPrf", per: "DND5E.SkillPer", rel: "DND5E.SkillRel",
  slt: "DND5E.SkillSlt", ste: "DND5E.SkillSte", sur: "DND5E.SkillSur",
};

const TOOL_KEYS = [
  "alchemist","brewer","calligrapher","carpenter","cartographer","cobbler","cook",
  "glassblower","jeweler","leatherworker","mason","painter","potter","smith",
  "tinker","weaver","woodcarver","disguise","forgery","gaming","herbalism",
  "musical","navigator","poisoner","thieves",
];

const ITEM_TYPE_KEYS = [
  "weapon","equipment","consumable","tool","loot",
  "background","class","feat","spell",
];

function _abilityOptions() {
  return ABILITY_KEYS.map(value => ({ value, label: game.i18n.localize(ABILITY_I18N[value]) }));
}
function _skillOptions() {
  return SKILL_KEYS.map(value => ({ value, label: game.i18n.localize(SKILL_I18N[value]) }));
}
function _itemTypeOptions() {
  return ITEM_TYPE_KEYS.map(value => ({ value, label: game.i18n.localize(`TYPES.Item.${value}`) }));
}

function _emptyRecipeCheck() {
  return {
    type: null,
    key: null,
    dc: 15,
    consumeOnFail: true,
    critThreshold: 5,
    critSuccess: { type: "auto" },
  };
}

export class CraftingWindow extends FormApplication {
  constructor(actor, options = {}) {
    super(actor, options);
    this._combineItems = [];
    this._includedActivities = new Set(); // "itemIdx:activityId"
    this._customCombineImg = null;
    this._recipeIngredients = [];
    this._recipeResult = null;
    this._customRecipeImg = null;
    this._recipeName = "";
    this._editingRecipeId = null;
    this._initialTab = null;
    this._tabsAutoActivated = false;
    this._recipeCheck = _emptyRecipeCheck();
    this._recipeCategory = "";
    this._recipeResultQty = 1;
    this._recipeToolItem = null;
    this._recipeBookId = null;
    this._recipeCritQualityNames = false;
    this._recipeMasteryEnabled = false;
    this._recipeMasteryThreshold = 20;
    this._recipeMasteryAllowCritRoll = false;
  }

  static openForEdit(actor, recipe) {
    const win = new CraftingWindow(actor);
    win._editingRecipeId = recipe.id;
    win._recipeName = recipe.name;
    win._recipeIngredients = recipe.ingredients.map(i => ({ ...i }));
    win._recipeResult = recipe.result ? foundry.utils.deepClone(recipe.result) : null;
    win._recipeCheck = recipe.check
      ? foundry.utils.deepClone(recipe.check)
      : _emptyRecipeCheck();
    win._recipeCategory = recipe.category ?? "";
    win._recipeResultQty = recipe.result?.quantity ?? 1;
    if (recipe.check?.type === "tool" && recipe.check.toolName) {
      win._recipeToolItem = {
        name:       recipe.check.toolName,
        img:        recipe.check.toolImg ?? "icons/svg/mystery-man.svg",
        identifier: recipe.check.toolIdentifier ?? "",
      };
    }
    win._recipeBookId = recipe.bookId ?? null;
    win._recipeCritQualityNames = recipe.critQualityNames === true;
    const m = recipe.mastery;
    win._recipeMasteryEnabled = m?.enabled === true && Number(m.masteryThreshold) > 0;
    win._recipeMasteryThreshold = m?.enabled ? Math.max(1, Number(m.masteryThreshold) || 20) : 20;
    win._recipeMasteryAllowCritRoll = m?.allowCritRoll === true;
    win._initialTab = "recipe";
    win.render(true);
    return win;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "ac-crafting-window",
      classes: ["adventurecraft", "crafting-window"],
      template: `modules/${MODULE_ID}/templates/crafting-window.hbs`,
      title: "ADVENTURECRAFT.Window.CraftingTitle",
      width: 780,
      height: 860,
      resizable: true,
      tabs: [{ navSelector: ".tabs", contentSelector: ".content", initial: "combine" }],
      dragDrop: [
        { dropSelector: "[data-drop-target='combine']" },
        { dropSelector: "[data-drop-target='recipe-ingredients']" },
        { dropSelector: "[data-drop-target='recipe-result']" },
        { dropSelector: "[data-drop-target='recipe-tool']" },
      ],
    });
  }

  get title() {
    return game.i18n.localize("ADVENTURECRAFT.Window.CraftingTitle");
  }

  get actor() { return this.object; }

  getData() {
    const resultType = this._recipeResult?.type ?? "loot";
    const equipSubtype = this._recipeResult && resultType === "equipment" ? getEquipmentSubtype(this._recipeResult) : "";
    const consumSubtype = this._recipeResult && resultType === "consumable" ? getConsumableSubtype(this._recipeResult) : "";
    const critItemPropertyOptions = getCritItemPropertyOptions(resultType);
    const chk = this._recipeCheck;
    const checkKey = chk.key ?? "";
    const tool = this._recipeToolItem;
    let enableCombine = false;
    let showRecipeResultProps = false;
    try { enableCombine = game.settings.get(MODULE_ID, "enableCombine"); } catch { /* noop */ }
    try { showRecipeResultProps = game.settings.get(MODULE_ID, "showRecipeResultProps"); } catch { /* noop */ }
    const canCombineItems = enableCombine && _core().userCan("combineItems");
    const canCreateRecipe = _core().userCan("createRecipe");
    const damageTypePickOptions = getDamageTypeSelectOptions();
    return {
      combineEnabled: enableCombine,
      showRecipeResultProps,
      canCombineItems,
      canCreateRecipe,
      combineItems: this._combineItems,
      combineActivities: this._getCombineActivities(),
      customCombineImg: this._customCombineImg,
      combineItemGroups: this._buildItemGroups(this._combineItems),
      combineName: this._combineItems.map(i => i.name).join(" + "),

      damageTypePickOptions,

      recipeIngredients: this._recipeIngredients.map(i => ({
        ...i,
        tagsStr: (i.tags ?? []).join(", "),
      })),
      recipeResult: this._recipeResult,
      customRecipeImg: this._customRecipeImg,
      recipeItemGroups: this._recipeResult ? this._buildItemGroups([this._recipeResult]) : [],
      recipeName: this._recipeName,
      recipeCategory: this._recipeCategory,
      recipeResultQty: this._recipeResultQty,
      recipeCritQualityNames: this._recipeCritQualityNames === true,

      itemTypes: _itemTypeOptions().map(t => ({ ...t, selected: t.value === resultType })),
      showEquipmentSubtype: !!this._recipeResult && resultType === "equipment",
      showConsumableSubtype: !!this._recipeResult && resultType === "consumable",
      equipmentSubtypeOptions: getEquipmentSubtypeSelectOptions().map((o) => ({
        ...o,
        selected: o.value === equipSubtype,
      })),
      consumableSubtypeOptions: getConsumableSubtypeSelectOptions().map((o) => ({
        ...o,
        selected: o.value === consumSubtype,
      })),

      recipeCheck: {
        type: chk.type,
        dc: chk.dc ?? 15,
        consumeOnFail: chk.consumeOnFail !== false,
        critThreshold: chk.critThreshold ?? 5,
        critSuccess: (() => {
          const cs = chk.critSuccess ?? (chk.critSuccessQty != null
            ? { type: "qty", qty: chk.critSuccessQty }
            : { type: "auto" });
          const t = cs.type ?? "qty";
          const dmgSel = cs.damageTypes ?? cs.damageType;
          const critDamageTypeOptions = mapDamageTypesWithSelection(dmgSel);
          const damageTypesSelected = critDamageTypeOptions.filter(o => o.selected).map(o => ({ value: o.value, label: o.label }));
          const propTrim = (cs.property ?? "").trim();
          const prState = buildPropertyPresetUiState(propTrim, resultType);
          const critPropertyPresetSelect = [
            { value: "", label: game.i18n.localize("ADVENTURECRAFT.CritProperty.choose"), selected: t !== "property" || !propTrim },
            ...getCritPropertyPresetOptions(resultType).map((p) => ({
              value: p.value,
              label: p.label,
              selected: t === "property" && propTrim === p.value,
            })),
            {
              value: "__custom__",
              label: game.i18n.localize("ADVENTURECRAFT.CritProperty.customPath"),
              selected: t === "property" && prState.presetValue === "__custom__",
            },
          ];
          const poolOptsRaw = Array.isArray(cs.options) && cs.options.length
            ? cs.options
            : [{ type: "qty", qty: 1 }];
          const poolOptions = poolOptsRaw.map((o, index) => {
            const ot = o.type ?? "qty";
            const optProp = (o.property ?? "").trim();
            const optPr = buildPropertyPresetUiState(optProp, resultType);
            const optDmgSel = o.damageTypes ?? o.damageType;
            const optDmgOpts = mapDamageTypesWithSelection(optDmgSel);
            const itemPropKey = String(o.propertyKey ?? "").trim();
            return {
              index,
              type: ot,
              label: o.label ?? "",
              qty: o.qty ?? 1,
              property: o.property ?? "",
              propertyKey: itemPropKey,
              value: o.value ?? 1,
              isAdd: (o.mode ?? "add") === "add",
              isSet: o.mode === "set",
              damageFormula: o.damageFormula ?? "",
              isQty: ot === "qty",
              isProperty: ot === "property",
              isDamage: ot === "damage",
              isItemProperty: ot === "itemProperty",
              itemPropertySelect: critItemPropertyOptions.map((p) => ({
                ...p,
                selected: ot === "itemProperty" && p.value === itemPropKey,
              })),
              damageTypePickOptions,
              damageTypesSelected: optDmgOpts.filter(x => x.selected).map(x => ({ value: x.value, label: x.label })),
              propertyPresetSelect: [
                { value: "", label: game.i18n.localize("ADVENTURECRAFT.CritProperty.choose"), selected: ot !== "property" || !optProp },
                ...getCritPropertyPresetOptions(resultType).map((p) => ({
                  value: p.value,
                  label: p.label,
                  selected: ot === "property" && optProp === p.value,
                })),
                {
                  value: "__custom__",
                  label: game.i18n.localize("ADVENTURECRAFT.CritProperty.customPath"),
                  selected: ot === "property" && optPr.presetValue === "__custom__",
                },
              ],
              propertyCustomValue: optPr.customValue,
              propertyCustomVisible: optPr.customVisible,
            };
          });
          const defaultSizeTable = JSON.stringify(
            [{ min: 1, max: 1, count: 1 }, { min: 2, max: 6, count: 3 }],
          );
          return {
            type: t,
            qty: cs.qty ?? 1,
            property: cs.property ?? "",
            value: cs.value ?? 1,
            isAdd: (cs.mode ?? "add") === "add",
            isSet: cs.mode === "set",
            damageFormula: cs.damageFormula ?? "",
            isQty:      t === "qty",
            isProperty: t === "property",
            isDamage:   t === "damage",
            isAuto: t === "auto",
            isPool: t === "pool",
            poolPresentIsFullPool: cs.presentMode === "fullPool",
            poolPresentMode: cs.presentMode === "fullPool" ? "fullPool" : "randomSubset",
            poolPresentCount: cs.presentCount ?? 3,
            poolSizeFormula: cs.sizeRoll?.formula ?? "",
            poolSizeTableJson: cs.sizeRoll?.table?.length ? JSON.stringify(cs.sizeRoll.table) : defaultSizeTable,
            poolOptions,
            damageTypesSelected,
            critPropertyPresetSelect,
            propertyCustomValue: prState.customValue,
            propertyCustomVisible: prState.customVisible,
            critAutoPreview: this._recipeResult
              ? game.i18n.format("ADVENTURECRAFT.CritAuto.Preview", {
                summary: describeAutoCritPreview(this._recipeResult),
              })
              : game.i18n.localize("ADVENTURECRAFT.CritAuto.PreviewNoResult"),
          };
        })(),
        isAbility: chk.type === "ability",
        isSkill:   chk.type === "skill",
        isTool:    chk.type === "tool",
        toolName:         tool?.name ?? "",
        toolImg:          tool?.img  ?? "",
        allowWithoutTool: chk.allowWithoutTool ?? false,
        isFallbackSkill:   !chk.fallbackType || chk.fallbackType === "skill",
        isFallbackAbility: chk.fallbackType === "ability",
        fallbackKey:      chk.fallbackKey ?? "",
      },
      abilityOptions: _abilityOptions().map(a => ({ ...a, selected: chk.type === "ability" && checkKey === a.value })),
      skillOptions:   _skillOptions().map(s =>   ({ ...s, selected: chk.type === "skill"   && checkKey === s.value })),
      fallbackSkillOptions:   _skillOptions().map(s => ({ ...s,
        selected: chk.type === "tool" && chk.fallbackType !== "ability" && chk.fallbackKey === s.value })),
      fallbackAbilityOptions: _abilityOptions().map(a => ({ ...a,
        selected: chk.type === "tool" && chk.fallbackType === "ability" && chk.fallbackKey === a.value })),

      recipeBookId: this._recipeBookId ?? "",
      recipeMastery: {
        enabled: this._recipeMasteryEnabled === true,
        threshold: Math.max(1, Number(this._recipeMasteryThreshold) || 20),
        allowCritRoll: this._recipeMasteryAllowCritRoll === true,
      },
      books: (() => {
        try {
          return _core().RecipeStore.getBooks().map(b => ({ ...b, selected: b.id === this._recipeBookId }));
        } catch { return []; }
      })(),
    };
  }

  // Build per-item property groups with editable input metadata
  _buildItemGroups(items) {
    return items.map((item, index) => {
      const data = item.toObject ? item.toObject() : { ...item };
      const flat = {};
      this._flattenObject(data.system ?? {}, "", flat);

      const properties = Object.entries(flat)
        .filter(([path, value]) => {
          if (value === null || value === undefined) return false;
          if (typeof value === "object") return false;  // arrays, objects — skip
          if (Array.isArray(value)) return false;
          if (typeof value === "string" && value.length > 300) return false;  // HTML/long text
          if (typeof value === "string" && value.startsWith("<")) return false;  // HTML
          if (path.startsWith("_")) return false;
          return true;
        })
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([path, value]) => {
          const isBoolean = typeof value === "boolean";
          const isNumber = typeof value === "number";
          return {
            uniqueKey: `${index}|||${path}`,
            path,
            value: String(value),       // used for text/number inputs
            boolChecked: value === true, // used for boolean checkboxes (Handlebars-safe)
            isBoolean,
            isNumber,
            isText: !isBoolean && !isNumber,
          };
        });

      return {
        index,
        name: data.name ?? item.name ?? "Unknown",
        img: data.img ?? item.img ?? "icons/svg/mystery-man.svg",
        properties,
      };
    });
  }

  _getCombineActivities() {
    const ACT_KEYS = ["attack","heal","damage","save","check","utility","cast","enchant","summon","transform","forward"];
    const TYPE_LABELS = Object.fromEntries(
      ACT_KEYS.map(k => [k, game.i18n.localize(`ADVENTURECRAFT.Activity.${k}`)])
    );
    const result = [];
    _log.group("AdventureCraft | _getCombineActivities() — items:", this._combineItems.length);
    for (const [idx, item] of this._combineItems.entries()) {
      const plain = item.toObject ? item.toObject() : { ...item };
      const actKeys = Object.keys(plain.system?.activities ?? {});
      _log.log(`  [${idx}] "${plain.name}" — activities:`, actKeys, "| effects:", (plain.effects ?? []).length);
      if (actKeys.length === 0) {
        _log.warn(`  [${idx}] "${plain.name}" — NO activities found. Full plain.system:`, plain.system);
      }
      for (const [actId, act] of Object.entries(plain.system?.activities ?? {})) {
        const key = `${idx}:${actId}`;
        _log.log(`    activity key="${key}" type="${act.type}" name="${act.name}" full:`, act);
        result.push({
          key,
          sourceName: plain.name ?? "Unknown",
          sourceImg:  plain.img ?? "icons/svg/mystery-man.svg",
          type:       act.type,
          typeLabel:  TYPE_LABELS[act.type] ?? act.type,
          name:       act.name || (TYPE_LABELS[act.type] ?? act.type),
          summary:    this._summarizeActivity(act),
          included:   this._includedActivities.has(key),
        });
      }
    }
    _log.log("  _includedActivities Set:", [...this._includedActivities]);
    _log.end();
    return result;
  }

  _summarizeActivity(act) {
    const parts = [];
    const dmg = act.damage?.parts;
    switch (act.type) {
      case "attack":
        if (dmg?.length) parts.push(dmg.map(p => p.formula).join("+"));
        if (act.attack?.type?.value) parts.push(game.i18n.localize(`ADVENTURECRAFT.AttackType.${act.attack.type.value}`));
        break;
      case "heal":
        if (act.healing?.formula) parts.push(game.i18n.format("ADVENTURECRAFT.ActivitySummary.HealingFormula", { formula: act.healing.formula }));
        break;
      case "damage":
        if (dmg?.length) parts.push(dmg.map(p => p.formula).join("+"));
        break;
      case "save":
        if (act.save?.dc?.formula) parts.push(game.i18n.format("ADVENTURECRAFT.ActivitySummary.DCFormula", { dc: act.save.dc.formula }));
        if (dmg?.length) parts.push(dmg.map(p => p.formula).join("+"));
        break;
      case "check":
        if (act.check?.ability) parts.push(act.check.ability.toUpperCase());
        if (act.check?.dc?.formula) parts.push(game.i18n.format("ADVENTURECRAFT.ActivitySummary.DCFormula", { dc: act.check.dc.formula }));
        break;
      case "utility":
        if (act.roll?.formula) parts.push(act.roll.formula);
        break;
    }
    if (act.activation?.type) parts.push(act.activation.type);
    return parts.join(" · ") || "—";
  }

  activateListeners(html) {
    super.activateListeners(html);
    if (this._initialTab) {
      this._tabs[0]?.activate(this._initialTab);
      this._initialTab = null;
    } else if (!this._tabsAutoActivated) {
      this._tabsAutoActivated = true;
      let enableCombine = false;
      try { enableCombine = game.settings.get(MODULE_ID, "enableCombine"); } catch { /* noop */ }
      const canCombineItems = enableCombine && _core().userCan("combineItems");
      const canCreateRecipe = _core().userCan("createRecipe");
      if (canCombineItems) this._tabs[0]?.activate("combine");
      else if (canCreateRecipe) this._tabs[0]?.activate("recipe");
    }
    html.find(".ac-activity-check").on("change", e => {
      const key = e.currentTarget.dataset.key;
      if (e.currentTarget.checked) this._includedActivities.add(key);
      else this._includedActivities.delete(key);
    });
    html.find(".ac-remove-item").on("click", this._onRemoveItem.bind(this));
    html.find(".ac-remove-result").on("click", this._onRemoveResult.bind(this));
    html.find(".ac-create-item").on("click", this._onCreateItem.bind(this));
    html.find(".ac-save-recipe").on("click", this._onSaveRecipe.bind(this));
    html.find(".ac-open-browser").on("click", () => new _core().RecipeBrowser(this.actor).render(true));
    html.find("#ac-recipe-crit-quality-names").on("change", e => {
      this._recipeCritQualityNames = e.currentTarget.checked;
    });
    html.find("#ac-recipe-mastery-enabled").on("change", e => {
      this._recipeMasteryEnabled = e.currentTarget.checked;
      html.find("#ac-mastery-threshold-row, #ac-mastery-crit-roll-row").toggle(e.currentTarget.checked);
    });
    html.find("#ac-recipe-mastery-threshold").on("change", e => {
      this._recipeMasteryThreshold = Math.max(1, Number(e.currentTarget.value) || 20);
    });
    html.find("#ac-recipe-mastery-allow-crit-roll").on("change", e => {
      this._recipeMasteryAllowCritRoll = e.currentTarget.checked;
    });

    html.on("change", ".ac-damage-type-pick", this._onDamageTypePick.bind(this));
    html.on("click", ".ac-damage-type-chip-remove", this._onDamageTypeChipRemove.bind(this));

    html.find("input[name='combineImg'], input[name='recipeImg']").on("change", event => {
      if (event.currentTarget.value === "__browse__") {
        this._openFilePicker(event.currentTarget.name === "combineImg" ? "combine" : "recipe");
      }
    });

    html.find(".ac-qty-input").on("change", event => {
      const idx = Number(event.currentTarget.dataset.index);
      this._recipeIngredients[idx].quantity = Math.max(1, Number(event.currentTarget.value) || 1);
    });

    html.find(".ac-tags-input").on("blur", event => {
      const idx = Number(event.currentTarget.dataset.index);
      const raw = event.currentTarget.value;
      this._recipeIngredients[idx].tags = raw.split(",").map(t => t.trim()).filter(Boolean);
    });

    html.find("#ac-check-type").on("change", event => {
      const type = event.currentTarget.value || null;
      this._captureRecipeCheckFromForm(html);
      if (type && !this._recipeCheck.critSuccess) {
        this._recipeCheck.critSuccess = { type: "auto" };
      }
      html.find(".ac-check-detail").hide();
      if (type === "ability") html.find("#ac-check-ability-row, #ac-check-dc-row").show();
      if (type === "skill")   html.find("#ac-check-skill-row, #ac-check-dc-row").show();
      if (type === "tool")    html.find("#ac-check-tool-row, #ac-check-dc-row").show();
    });

    html.find("#ac-crit-success-type").on("change", e => {
      const t = e.currentTarget.value || "qty";
      this._syncCritSuccessType(t);
      const h = this.element;
      const $h = $(h);
      $h.find("#ac-crit-qty-row").toggle(t === "qty");
      $h.find("#ac-crit-property-row").toggle(t === "property");
      $h.find("#ac-crit-damage-row").toggle(t === "damage");
      $h.find("#ac-crit-pool-panel").toggle(t === "pool");
      $h.find("#ac-crit-auto-preview-row").toggle(t === "auto");
      this._captureRecipeCheckFromForm($h);
      this.render();
    });
    html.find(".ac-suggest-crit-pool").on("click", this._onSuggestCritPool.bind(this));
    html.find("#ac-recipe-result-type").on("change", this._onRecipeResultTypeChange.bind(this));
    html.find("#ac-recipe-equipment-subtype, #ac-recipe-consumable-subtype").on("change", () => {
      this._onRecipeResultSubtypeChange($(this.element));
    });
    html.find("#ac-crit-property-preset").on("change", (e) => {
      html.find("#ac-crit-property-custom-row").toggle(e.target.value === "__custom__");
    });
    html.find("#ac-crit-pool-panel").on("change", ".ac-pool-opt-property-preset", (e) => {
      const row = e.target.closest(".ac-pool-opt");
      if (!row) return;
      html.find(row).find(".ac-pool-opt-property-custom-row").toggle(e.target.value === "__custom__");
    });
    html.find(".ac-crit-pool-add").on("click", this._onAddPoolCritOption.bind(this));
    html.find(".ac-crit-pool-remove").on("click", this._onRemovePoolCritOption.bind(this));
    html.find("#ac-crit-pool-panel").on("change", ".ac-pool-opt-type", (e) => {
      const row = e.target.closest(".ac-pool-opt");
      if (!row) return;
      const t = e.target.value;
      const $r = html.find(row);
      $r.find(".ac-pool-opt-qty-row").toggle(t === "qty");
      $r.find(".ac-pool-opt-property-block").toggle(t === "property");
      $r.find(".ac-pool-opt-damage-block").toggle(t === "damage");
      $r.find(".ac-pool-opt-item-property-block").toggle(t === "itemProperty");
    });

    html.find(".ac-remove-tool").on("click", () => {
      this._recipeToolItem = null;
      this.render();
    });
    html.find("#ac-tool-allow-without").on("change", e => {
      html.find("#ac-tool-fallback-row").toggle(e.currentTarget.checked);
    });
    html.find("#ac-tool-fallback-type").on("change", e => {
      const isSkill = e.currentTarget.value === "skill";
      html.find("#ac-tool-fallback-skill-row").toggle(isSkill);
      html.find("#ac-tool-fallback-ability-row").toggle(!isSkill);
    });
  }

  async _onDrop(event) {
    const target = event.currentTarget?.dataset?.dropTarget
      ?? event.target?.closest("[data-drop-target]")?.dataset?.dropTarget;

    let data;
    try {
      // v13 uses foundry.applications.ux.TextEditor; older builds use global TextEditor
      const TE = foundry.applications?.ux?.TextEditor?.implementation ?? TextEditor;
      data = TE.getDragEventData(event);
    } catch {
      return;
    }

    if (data?.type !== "Item") {
      ui.notifications.warn(game.i18n.localize("ADVENTURECRAFT.Error.OnlyItems"));
      return;
    }

    const item = await fromUuid(data.uuid);
    if (!item) return;

    if (target === "combine") {
      if (this._combineItems.find(i => i.uuid === item.uuid)) return;
      this._combineItems.push(item);
      const plain = item.toObject ? item.toObject() : { ...item };
      const newIdx = this._combineItems.length - 1;
      _log.group(`AdventureCraft | DROP→combine [${newIdx}] "${item.name}"`);
      _log.log("  uuid:", item.uuid);
      _log.log("  id:", item.id);
      _log.log("  parent id:", item.parent?.id, "| parent name:", item.parent?.name);
      _log.log("  parent === actor?", item.parent?.id === this.actor?.id);
      _log.log("  system.uses:", plain.system?.uses);
      _log.log("  system.quantity:", plain.system?.quantity);
      _log.log("  activities keys:", Object.keys(plain.system?.activities ?? {}));
      _log.log("  effects count:", (plain.effects ?? []).length);
      _log.log("  effects:", plain.effects);
      _log.log("  FULL plain.system (condensed):", JSON.stringify(plain.system ?? {}));
      for (const actId of Object.keys(plain.system?.activities ?? {})) {
        this._includedActivities.add(`${newIdx}:${actId}`);
      }
      _log.log("  _includedActivities after add:", [...this._includedActivities]);
      _log.end();
      this.render();
    } else if (target === "recipe-ingredients") {
      if (this._recipeIngredients.find(i => i.uuid === item.uuid)) return;
      const plain = item.toObject ? item.toObject() : { ...item };
      this._recipeIngredients.push({ ...plain, uuid: item.uuid, quantity: 1 });
      this.render();
    } else if (target === "recipe-result") {
      this._recipeResult = item.toObject ? item.toObject() : { ...item };
      this._recipeResult.uuid = item.uuid;
      this.render();
    } else if (target === "recipe-tool") {
      const plain = item.toObject ? item.toObject() : { ...item };
      this._recipeToolItem = {
        name:       plain.name,
        img:        plain.img ?? "icons/svg/mystery-man.svg",
        uuid:       item.uuid,
        identifier: plain.system?.identifier ?? plain.name.toLowerCase().replace(/\s+/g, "-"),
      };
      this.render();
    }
  }

  // Collect checked property values from the form, grouped by `data-group` attribute
  _collectPropValues(html, group) {
    const checkedKeys = new Set();
    html.find(`.ac-prop-check[data-group='${group}']:checked`).each((_, el) => checkedKeys.add(el.value));

    const flatProps = {};
    html.find(`.ac-prop-val[data-group='${group}']`).each((_, el) => {
      const key = el.dataset.propKey;
      if (!checkedKeys.has(key)) return;

      const sepIdx = key.indexOf("|||");
      if (sepIdx === -1) return;
      const path = key.substring(sepIdx + 3);

      let value;
      if (el.type === "checkbox") value = el.checked;
      else if (el.type === "number") value = el.value === "" ? null : Number(el.value);
      else value = el.value;

      if (value !== null && value !== undefined) flatProps[path] = value;
    });

    return this._unflattenObject(flatProps);
  }

  _resolveImage(html, radioName, customImg) {
    const checked = html.find(`input[name='${radioName}']:checked`).val();
    if (!checked || checked === "__browse__") return customImg ?? "icons/svg/mystery-man.svg";
    return checked;
  }

  async _onCreateItem(event) {
    if (!_core().userCan("combineItems")) return _core().denyAndWarn();
    const html = $(this.element);
    if (!this._combineItems.length) {
      ui.notifications.warn(game.i18n.localize("ADVENTURECRAFT.Error.DropOneItem"));
      return;
    }
    const name = html.find("#ac-combine-name").val()?.trim();
    if (!name) {
      ui.notifications.warn(game.i18n.localize("ADVENTURECRAFT.Error.EnterItemName"));
      return;
    }
    const type = html.find("#ac-combine-type").val() ?? "loot";
    const img = this._resolveImage(html, "combineImg", this._customCombineImg);

    // Подтверждение + показ того что будет потрачено
    const willConsume = this.actor
      ? this._combineItems.filter(i => this.actor.items.get(i.id))
      : [];
    const consumeNote = willConsume.length
      ? `<p style="margin-top:8px;font-size:0.85rem;color:#888">${game.i18n.format("ADVENTURECRAFT.Dialog.ConsumeNote", { items: willConsume.map(i => foundry.utils.escapeHTML(i.name)).join(", ") })}</p>`
      : "";
    const confirmed = await Dialog.confirm({
      title: game.i18n.localize("ADVENTURECRAFT.Dialog.CombineItemsTitle"),
      content: `<p>${game.i18n.format("ADVENTURECRAFT.Dialog.CombineItemsContent", { name: foundry.utils.escapeHTML(name) })}</p>${consumeNote}`,
      yes: () => true, no: () => false, defaultYes: true,
    });
    if (!confirmed) return;

    // Собрать индексы source-items с выбранными activities
    const selectedByItem = new Map(); // itemIdx → Set<actId>
    for (const actInfo of this._getCombineActivities()) {
      if (!this._includedActivities.has(actInfo.key)) continue;
      const [idxStr, actId] = actInfo.key.split(":");
      const idx = Number(idxStr);
      if (!selectedByItem.has(idx)) selectedByItem.set(idx, new Set());
      selectedByItem.get(idx).add(actId);
    }

    // Построить маппинг старых ID эффектов → новые и собрать их
    _log.group("AdventureCraft | _onCreateItem — selectedByItem:", [...selectedByItem.entries()].map(([i, s]) => `${i}:[${[...s]}]`));
    const effectIdMap = {};
    const combinedEffects = [];
    for (const [idx] of selectedByItem) {
      const plain = this._combineItems[idx].toObject
        ? this._combineItems[idx].toObject()
        : { ...this._combineItems[idx] };
      _log.group(`  Effects for [${idx}] "${plain.name}"`);
      _log.log("  plain.effects:", plain.effects);
      _log.log("  plain.effects count:", (plain.effects ?? []).length);
      for (const eff of (plain.effects ?? [])) {
        if (!eff._id) { _log.warn("  effect has no _id:", eff); continue; }
        const newEffId = foundry.utils.randomID();
        effectIdMap[eff._id] = newEffId;
        _log.log(`  effect "${eff.name}" _id: ${eff._id} → ${newEffId}`);
        const cloned = foundry.utils.deepClone(eff);
        cloned._id = newEffId;
        combinedEffects.push(cloned);
      }
      _log.end();
    }
    _log.log("  effectIdMap:", effectIdMap);

    // Собрать activities с обновлёнными ссылками на эффекты
    const activitiesObj = {};
    for (const [idx, actIds] of selectedByItem) {
      const plain = this._combineItems[idx].toObject
        ? this._combineItems[idx].toObject()
        : { ...this._combineItems[idx] };
      _log.group(`  Activities for [${idx}] "${plain.name}" — actIds: [${[...actIds]}]`);
      _log.log("  plain.system.activities:", plain.system?.activities);
      for (const actId of actIds) {
        const rawAct = plain.system?.activities?.[actId];
        if (!rawAct) { _log.warn(`  activity ${actId} NOT FOUND in plain.system.activities`); continue; }
        _log.log(`  rawAct[${actId}]:`, rawAct);
        _log.log(`  rawAct.effects:`, rawAct.effects);
        const newAct = foundry.utils.deepClone(rawAct);
        const newActId = foundry.utils.randomID();
        newAct._id = newActId;
        // Убрать consumption по зарядам исходного предмета — у нового их нет,
        // расход будет через quantity при использовании
        if (newAct.consumption?.targets) {
          newAct.consumption.targets = newAct.consumption.targets.filter(t => t.type !== "itemUses");
        }
        // Перебиндить ссылки на эффекты внутри activity
        if (Array.isArray(newAct.effects)) {
          newAct.effects = newAct.effects.map(ref => {
            const newEffId = effectIdMap[ref._id];
            _log.log(`    effect ref _id=${ref._id} → ${newEffId ?? "(NOT REMAPPED)"}`);
            return newEffId ? { ...ref, _id: newEffId } : ref;
          });
        }
        activitiesObj[newActId] = newAct;
        _log.log(`  → newActId=${newActId} stored`);
      }
      _log.end();
    }
    _log.end();

    // Диагностика: показываем что войдёт в предмет
    _log.log("AdventureCraft | FINAL activitiesObj:", JSON.stringify(activitiesObj, null, 2));
    _log.log("AdventureCraft | FINAL combinedEffects:", JSON.stringify(combinedEffects, null, 2));

    const system = this._collectPropValues(html, "combine");
    if (Object.keys(activitiesObj).length) system.activities = activitiesObj;
    // Если перенесли activities — отключить зависимость от зарядов, использовать quantity
    if (Object.keys(activitiesObj).length) {
      system.uses ??= {};
      system.uses.max = "";
      system.uses.spent = 0;
      system.uses.autoDestroy = false;
    }

    // Автоматически переносим damage.base из исходных предметов (поле "Ammunition Damage" в Details).
    // Именно оно добавляет доп. урон при выстреле луком. Берём первый непустой damage.base.
    // Исключаем лечение/временные HP — они не должны превращаться в урон.
    const NON_DAMAGE_TYPES = new Set(["healing", "temphp"]);
    const mergedDamageBase = this._combineItems
      .map(i => { const p = i.toObject ? i.toObject() : { ...i }; return p.system?.damage?.base; })
      .find(b => {
        if (!b) return false;
        if (!(b.denomination > 0 || (b.bonus && String(b.bonus).trim()))) return false;
        // Пропускаем базы, где ВСЕ типы — лечение или temporaryHP
        const types = b.types ?? [];
        if (types.length > 0 && types.every(t => NON_DAMAGE_TYPES.has(t))) return false;
        return true;
      });
    if (mergedDamageBase) {
      system.damage ??= {};
      system.damage.base = foundry.utils.deepClone(mergedDamageBase);
      _log.log("AdventureCraft | auto-merged damage.base:", system.damage.base);
    }

    const itemData = {
      name, type, img, system,
      effects: combinedEffects,
      flags: { [MODULE_ID]: { crafted: true, sources: this._combineItems.map(i => i.uuid ?? i.name) } },
    };
    _log.log("AdventureCraft | FINAL itemData before Item.create:", JSON.stringify(itemData, null, 2));
    const createOptions = this.actor ? { parent: this.actor } : {};
    await Item.create(itemData, createOptions);

    // Потратить исходные предметы из инвентаря
    _log.group("AdventureCraft | CONSUME phase — actor:", this.actor?.name, "| items count:", this._combineItems.length);
    _log.log("  this.actor?.id:", this.actor?.id);
    if (this.actor) {
      _log.log("  actor.items ids:", [...this.actor.items.keys()]);
      for (const srcItem of this._combineItems) {
        _log.group(`  srcItem "${srcItem.name}"`);
        _log.log("    srcItem.id:", srcItem.id);
        _log.log("    srcItem.uuid:", srcItem.uuid);
        _log.log("    srcItem.parent?.id:", srcItem.parent?.id);
        _log.log("    srcItem.parent?.name:", srcItem.parent?.name);
        _log.log("    srcItem.parent?.id === actor.id:", srcItem.parent?.id === this.actor.id);
        const byParent = srcItem.parent?.id === this.actor.id ? srcItem : null;
        const byGet = this.actor.items.get(srcItem.id);
        _log.log("    byParent (direct):", byParent ? "FOUND" : "null");
        _log.log("    byGet (actor.items.get):", byGet ? "FOUND" : "null");
        // Ищем предмет в инвентаре актора — прямо по живому документу или по ID
        const actorItem = byParent ?? byGet;
        if (!actorItem) {
          _log.warn("    SKIP — not found in actor inventory!");
          _log.end();
          continue;
        }
        _log.log("    actorItem found:", actorItem.name, "id:", actorItem.id);
        _log.log("    actorItem.system.uses (full):", actorItem.system?.uses);
        _log.log("    actorItem.system.quantity:", actorItem.system?.quantity);
        // uses.max в dnd5e 5.x — строка-формула, Number() нормализует
        const rawMax = actorItem.system?.uses?.max;
        const usesMax = Number(rawMax) || 0;
        _log.log("    rawMax:", rawMax, "| usesMax (Number):", usesMax, "| usesMax > 0:", usesMax > 0);
        if (usesMax > 0) {
          const curVal = actorItem.system?.uses?.value ?? usesMax;
          const newVal = Math.max(0, Number(curVal) - 1);
          _log.log(`    → update uses.value: ${curVal} → ${newVal}`);
          await actorItem.update({ "system.uses.value": newVal });
        } else {
          const qty = actorItem.system?.quantity ?? 1;
          _log.log(`    → qty=${qty}, will ${qty <= 1 ? "DELETE" : `update quantity → ${qty - 1}`}`);
          if (qty <= 1) await actorItem.delete();
          else await actorItem.update({ "system.quantity": qty - 1 });
        }
        _log.end();
      }
    } else {
      _log.log("  No actor — skip consumption.");
    }
    _log.end();

    const dest = this.actor ? `"${this.actor.name}"` : "Items (world)";
    ui.notifications.info(game.i18n.format("ADVENTURECRAFT.Message.ItemCreated", { name, destination: dest }));
    this._combineItems = [];
    this._includedActivities = new Set();
    this._customCombineImg = null;
    this.render();
  }

  async _onSaveRecipe(event) {
    if (this._editingRecipeId) {
      if (!_core().userCan("editAnyRecipe")) return _core().denyAndWarn();
    } else if (!_core().userCan("createRecipe")) {
      return _core().denyAndWarn();
    }
    const html = $(this.element);
    const recipeName = html.find("#ac-recipe-name").val()?.trim();
    if (!recipeName) {
      ui.notifications.warn(game.i18n.localize("ADVENTURECRAFT.Error.EnterRecipeName"));
      return;
    }
    if (!this._recipeIngredients.length) {
      ui.notifications.warn(game.i18n.localize("ADVENTURECRAFT.Error.AddIngredient"));
      return;
    }

    let resultName = recipeName;
    let resultType = "loot";
    let resultSystem = {};
    let img = "icons/svg/mystery-man.svg";

    if (this._recipeResult) {
      resultName = html.find("#ac-recipe-result-name").val()?.trim() || this._recipeResult.name;
      resultType = html.find("#ac-recipe-result-type").val() ?? this._recipeResult.type ?? "loot";
      img = this._resolveImage(html, "recipeImg", this._customRecipeImg);
      // Use the full system from the template item as base so complex fields
      // like activities, effects, uses etc. are preserved intact.
      // Then merge user-edited primitive overrides on top.
      const baseSystem = foundry.utils.deepClone(this._recipeResult.system ?? {});
      const userOverrides = this._collectPropValues(html, "recipe");
      resultSystem = foundry.utils.mergeObject(baseSystem, userOverrides);
      const subtypeStub = { type: resultType, system: resultSystem };
      if (resultType === "equipment") {
        applyResultSubtypeToPlainResult(
          subtypeStub,
          "equipment",
          html.find("#ac-recipe-equipment-subtype").val(),
        );
      } else if (resultType === "consumable") {
        applyResultSubtypeToPlainResult(
          subtypeStub,
          "consumable",
          html.find("#ac-recipe-consumable-subtype").val(),
        );
      }
      resultSystem = subtypeStub.system;
    }

    const checkType = html.find("#ac-check-type").val() || null;
    let check = null;
    if (checkType) {
      const critSuccessRead = this._readCritSuccess(html);
      if (critSuccessRead?.__invalid) return;
      if (critSuccessRead?.type === "pool") {
        const err = _core().validateCritPoolConfig(critSuccessRead);
        if (err) {
          ui.notifications.warn(err);
          return;
        }
      }

      let key = "";
      if (checkType === "ability") key = html.find("#ac-check-ability-key").val();
      if (checkType === "skill")   key = html.find("#ac-check-skill-key").val();
      if (checkType === "tool") {
        const toolItem = this._recipeToolItem;
        const allowWithoutTool = html.find("#ac-tool-allow-without").is(":checked");
        const fallbackType = html.find("#ac-tool-fallback-type").val() || "skill";
        const fallbackKey = fallbackType === "skill"
          ? html.find("#ac-tool-fallback-skill-key").val()
          : html.find("#ac-tool-fallback-ability-key").val();
        key = toolItem?.identifier ?? "";
        check = {
          type: "tool",
          toolName:       toolItem?.name ?? "",
          toolImg:        toolItem?.img  ?? "icons/svg/mystery-man.svg",
          toolIdentifier: toolItem?.identifier ?? "",
          key,
          dc:            Number(html.find("#ac-check-dc").val()) || 15,
          consumeOnFail: html.find("#ac-check-fail").val() === "consume",
          critThreshold: Number(html.find("#ac-check-crit-threshold").val()) || 5,
          critSuccess:   critSuccessRead,
          allowWithoutTool,
          ...(allowWithoutTool ? { fallbackType, fallbackKey } : {}),
        };
      }
      if (!check) {
        check = {
          type: checkType,
          key,
          dc:            Number(html.find("#ac-check-dc").val()) || 15,
          consumeOnFail: html.find("#ac-check-fail").val() === "consume",
          critThreshold: Number(html.find("#ac-check-crit-threshold").val()) || 5,
          critSuccess:   critSuccessRead,
        };
      }
    }
    this._recipeCheck = check ?? _emptyRecipeCheck();

    const category = html.find("#ac-recipe-category").val()?.trim() ?? "";
    const bookId = html.find("#ac-recipe-book").val()?.trim() || null;
    this._recipeBookId = bookId;
    this._recipeCritQualityNames = html.find("#ac-recipe-crit-quality-names").is(":checked");

    const masteryEnabled = html.find("#ac-recipe-mastery-enabled").is(":checked");
    const masteryTh = Math.max(1, Math.floor(Number(html.find("#ac-recipe-mastery-threshold").val()) || 20));
    if (masteryEnabled && !check?.type) {
      ui.notifications.warn(game.i18n.localize("ADVENTURECRAFT.Error.MasteryNeedsCheck"));
      return;
    }
    this._recipeMasteryEnabled = masteryEnabled;
    this._recipeMasteryThreshold = masteryTh;
    this._recipeMasteryAllowCritRoll = html.find("#ac-recipe-mastery-allow-crit-roll").is(":checked");

    const recipe = {
      ...(this._editingRecipeId ? { id: this._editingRecipeId } : {}),
      name: recipeName,
      ...(category ? { category } : {}),
      ...(bookId ? { bookId } : {}),
      ...(check ? { check } : {}),
      ...(masteryEnabled ? {
        mastery: {
          enabled: true,
          masteryThreshold: masteryTh,
          allowCritRoll: this._recipeMasteryAllowCritRoll,
        },
      } : {}),
      critQualityNames: this._recipeCritQualityNames,
      ingredients: this._recipeIngredients.map(i => ({
        name: i.name, img: i.img, quantity: i.quantity ?? 1, uuid: i.uuid,
        ...(i.tags?.length ? { tags: i.tags } : {}),
      })),
      result: {
        name: resultName, type: resultType, img, system: resultSystem,
        quantity: Math.max(1, Number(html.find("#ac-recipe-result-qty").val()) || 1),
        flags: { [MODULE_ID]: { crafted: true, recipeId: this._editingRecipeId ?? null } },
      },
    };

    await _core().RecipeStore.save(recipe);

    ui.notifications.info(game.i18n.localize(
      this._editingRecipeId ? "ADVENTURECRAFT.Message.RecipeUpdated" : "ADVENTURECRAFT.Message.RecipeSaved"
    ));
    this._recipeIngredients = [];
    this._recipeResult = null;
    this._customRecipeImg = null;
    this._recipeName = "";
    this._editingRecipeId = null;
    this._recipeCheck = _emptyRecipeCheck();
    this._recipeCategory = "";
    this._recipeResultQty = 1;
    this._recipeToolItem = null;
    this._recipeBookId = null;
    this._recipeCritQualityNames = false;
    this._recipeMasteryEnabled = false;
    this._recipeMasteryThreshold = 20;
    this._recipeMasteryAllowCritRoll = false;
    this.render();
  }

  _onRemoveItem(event) {
    const idx = Number(event.currentTarget.dataset.index);
    const tab = event.currentTarget.dataset.tab;
    if (tab === "combine") {
      this._combineItems.splice(idx, 1);
      const newSet = new Set();
      this._includedActivities.forEach(key => {
        const colon = key.indexOf(":");
        const i = Number(key.slice(0, colon));
        const actId = key.slice(colon + 1);
        if (i === idx) return;
        newSet.add(`${i > idx ? i - 1 : i}:${actId}`);
      });
      this._includedActivities = newSet;
    } else if (tab === "recipe-ingredients") {
      this._recipeIngredients.splice(idx, 1);
    }
    this.render();
  }

  /**
   * Sync `this._recipeCheck` from the recipe-tab form so `render()` does not drop Check Type / DC / crit fields.
   * @param {JQuery} html
   */
  _captureRecipeCheckFromForm(html) {
    const checkType = html.find("#ac-check-type").val() || null;
    const dc = Number(html.find("#ac-check-dc").val()) || 15;
    const consumeOnFail = html.find("#ac-check-fail").val() === "consume";
    const critThreshold = Number(html.find("#ac-check-crit-threshold").val()) || 5;

    if (!checkType) {
      const crit = this._readCritSuccess(html);
      this._recipeCheck = {
        type: null,
        key: null,
        dc,
        consumeOnFail,
        critThreshold,
      };
      if (crit && !crit.__invalid) this._recipeCheck.critSuccess = crit;
      return;
    }

    let critSuccessRead = this._readCritSuccess(html);
    if (critSuccessRead?.__invalid) {
      critSuccessRead = foundry.utils.deepClone(this._recipeCheck.critSuccess ?? { type: "auto" });
    } else if (critSuccessRead?.type === "pool") {
      const err = _core().validateCritPoolConfig(critSuccessRead);
      if (err) critSuccessRead = foundry.utils.deepClone(this._recipeCheck.critSuccess ?? { type: "auto" });
    }

    let key = "";
    if (checkType === "ability") key = String(html.find("#ac-check-ability-key").val() ?? "");
    if (checkType === "skill") key = String(html.find("#ac-check-skill-key").val() ?? "");

    if (checkType === "tool") {
      const toolItem = this._recipeToolItem;
      const allowWithoutTool = html.find("#ac-tool-allow-without").is(":checked");
      const fallbackType = html.find("#ac-tool-fallback-type").val() || "skill";
      const fallbackKey = fallbackType === "skill"
        ? String(html.find("#ac-tool-fallback-skill-key").val() ?? "")
        : String(html.find("#ac-tool-fallback-ability-key").val() ?? "");
      this._recipeCheck = {
        type: "tool",
        toolName:       toolItem?.name ?? "",
        toolImg:        toolItem?.img  ?? "icons/svg/mystery-man.svg",
        toolIdentifier: toolItem?.identifier ?? "",
        key:            toolItem?.identifier ?? "",
        dc,
        consumeOnFail,
        critThreshold,
        critSuccess: critSuccessRead,
        allowWithoutTool,
        ...(allowWithoutTool ? { fallbackType, fallbackKey } : {}),
      };
      return;
    }

    this._recipeCheck = {
      type: checkType,
      key,
      dc,
      consumeOnFail,
      critThreshold,
      critSuccess: critSuccessRead,
    };
  }

  _syncCritSuccessType(t) {
    const prev = foundry.utils.deepClone(this._recipeCheck.critSuccess ?? {});
    this._recipeCheck.critSuccess = { ...prev, type: t };
    if (t === "pool") {
      this._recipeCheck.critSuccess.options ??= [{ type: "qty", qty: 1 }];
      if (this._recipeCheck.critSuccess.presentMode === undefined) {
        this._recipeCheck.critSuccess.presentMode = "randomSubset";
      }
      if (this._recipeCheck.critSuccess.presentCount === undefined) {
        this._recipeCheck.critSuccess.presentCount = 3;
      }
    }
  }

  _onAddPoolCritOption() {
    this._captureRecipeCheckFromForm($(this.element));
    this._syncCritSuccessType("pool");
    this._recipeCheck.critSuccess.options.push({ type: "qty", qty: 1 });
    this.render();
  }

  _onRecipeResultTypeChange(event) {
    if (!this._recipeResult) return;
    this._captureRecipeCheckFromForm($(this.element));
    this._recipeResult.type = event.currentTarget.value ?? "loot";
    this.render();
  }

  _onRecipeResultSubtypeChange(html) {
    if (!this._recipeResult) return;
    this._captureRecipeCheckFromForm(html);
    const t = this._recipeResult.type;
    if (t === "equipment") {
      applyResultSubtypeToPlainResult(this._recipeResult, "equipment", html.find("#ac-recipe-equipment-subtype").val());
    } else if (t === "consumable") {
      applyResultSubtypeToPlainResult(this._recipeResult, "consumable", html.find("#ac-recipe-consumable-subtype").val());
    }
    this._updateCritAutoPreview(html);
  }

  _updateCritAutoPreview(html) {
    if (!this._recipeResult) return;
    const t = html.find("#ac-crit-success-type").val();
    if (t !== "auto") return;
    const summary = describeAutoCritPreview(this._recipeResult);
    html.find("#ac-crit-auto-preview-text").text(
      game.i18n.format("ADVENTURECRAFT.CritAuto.Preview", { summary }),
    );
  }

  async _onSuggestCritPool(event) {
    event.preventDefault();
    const html = $(this.element);
    if (!this._recipeResult) {
      ui.notifications.warn(game.i18n.localize("ADVENTURECRAFT.Error.NeedRecipeResultForCritPool"));
      return;
    }
    this._captureRecipeCheckFromForm(html);
    const existing = this._recipeCheck.critSuccess?.options ?? [];
    if (existing.length > 1 && !await Dialog.confirm({
      title: game.i18n.localize("ADVENTURECRAFT.Dialog.SuggestCritPoolTitle"),
      content: game.i18n.localize("ADVENTURECRAFT.Dialog.SuggestCritPoolContent"),
    })) {
      return;
    }
    const options = getSuggestedPoolOptions(this._recipeResult);
    this._recipeCheck.critSuccess = {
      type: "pool",
      selectionMode: "pick1",
      presentMode: "randomSubset",
      presentCount: 3,
      sizeRoll: null,
      options,
    };
    this.render();
  }

  _onRemovePoolCritOption(event) {
    this._captureRecipeCheckFromForm($(this.element));
    const idx = Number(event.currentTarget.dataset.index);
    this._syncCritSuccessType("pool");
    const opts = this._recipeCheck.critSuccess.options;
    if (Number.isFinite(idx) && idx >= 0 && idx < opts.length) opts.splice(idx, 1);
    if (!opts.length) opts.push({ type: "qty", qty: 1 });
    this.render();
  }

  _onRemoveResult() {
    this._recipeResult = null;
    this.render();
  }

  /**
   * @param {JQuery} $chipContainer
   * @returns {string[]}
   */
  _readDamageTypesFromChips($chipContainer) {
    return $chipContainer.find(".ac-damage-type-chip").map((_, el) => String(el.getAttribute("data-value") ?? "").trim()).get().filter(Boolean);
  }

  /**
   * @param {JQuery} $chips
   * @param {string} value
   * @param {string} label
   */
  _appendDamageTypeChip($chips, value, label) {
    const v = String(value ?? "").trim();
    if (!v) return;
    const $chip = $(document.createElement("span")).addClass("ac-damage-type-chip").attr({ "data-value": v, role: "listitem" });
    $(document.createElement("span")).addClass("ac-damage-type-chip-label").text(label).appendTo($chip);
    const $btn = $(document.createElement("button")).attr({
      type: "button",
      class: "ac-damage-type-chip-remove",
      "data-value": v,
      title: game.i18n.localize("ADVENTURECRAFT.Button.Remove"),
      "aria-label": game.i18n.localize("ADVENTURECRAFT.Aria.RemoveDamageType"),
    }).text("×");
    $chip.append($btn);
    $chips.append($chip);
  }

  _onDamageTypePick(event) {
    const pick = event.currentTarget;
    const val = String(pick.value || "").trim();
    if (!val) return;
    const $pick = $(pick);
    const $chips = $pick.hasClass("ac-pool-damage-type-pick")
      ? $pick.closest(".ac-pool-opt").find(".ac-pool-damage-type-chips")
      : $(this.element).find("#ac-crit-damage-type-chips");
    const exists = $chips.find(".ac-damage-type-chip").filter((_, el) => el.getAttribute("data-value") === val).length > 0;
    if (exists) {
      pick.value = "";
      return;
    }
    const opt = pick.options[pick.selectedIndex];
    const label = opt ? String(opt.textContent ?? "").trim() : val;
    this._appendDamageTypeChip($chips, val, label);
    pick.value = "";
  }

  _onDamageTypeChipRemove(event) {
    event.preventDefault();
    $(event.currentTarget).closest(".ac-damage-type-chip").remove();
  }

  _readCritSuccess(html) {
    const type = html.find("#ac-crit-success-type").val() || "qty";
    if (type === "auto") return { type: "auto" };
    if (type === "property") {
      let prop = html.find("#ac-crit-property-preset").val();
      if (prop === "__custom__") prop = html.find("#ac-crit-property-custom").val()?.trim() ?? "";
      else prop = prop == null ? "" : String(prop).trim();
      return {
        type,
        property: prop,
        value:    Number(html.find("#ac-crit-property-value").val()) || 1,
        mode:     html.find("#ac-crit-property-mode").val() || "add",
      };
    }
    if (type === "damage") {
      const damageTypes = this._readDamageTypesFromChips(html.find("#ac-crit-damage-type-chips"));
      return {
        type,
        damageFormula: html.find("#ac-crit-damage-formula").val()?.trim() || "",
        ...(damageTypes.length ? { damageTypes } : {}),
      };
    }
    if (type === "pool") {
      const options = [];
      html.find(".ac-pool-opt").each((_, el) => {
        const row = html.find(el);
        const typ = row.find(".ac-pool-opt-type").val() || "qty";
        const o = { type: typ };
        const lb = row.find(".ac-pool-opt-label").val()?.trim();
        if (lb) o.label = lb;
        if (typ === "qty") o.qty = Math.max(1, Number(row.find(".ac-pool-opt-qty").val()) || 1);
        if (typ === "property") {
          let prop = row.find(".ac-pool-opt-property-preset").val();
          if (prop === "__custom__") prop = row.find(".ac-pool-opt-property-custom").val()?.trim() ?? "";
          else prop = prop == null ? "" : String(prop).trim();
          o.property = prop;
          o.value = Number(row.find(".ac-pool-opt-value").val()) || 1;
          o.mode = row.find(".ac-pool-opt-mode").val() || "add";
        }
        if (typ === "damage") {
          o.damageFormula = row.find(".ac-pool-opt-dmg-formula").val()?.trim() || "";
          const damageTypes = this._readDamageTypesFromChips(row.find(".ac-pool-damage-type-chips"));
          if (damageTypes.length) o.damageTypes = damageTypes;
        }
        if (typ === "itemProperty") {
          o.propertyKey = row.find(".ac-pool-opt-item-property").val()?.trim() ?? "";
        }
        options.push(o);
      });
      let sizeRoll = null;
      const sf = html.find("#ac-crit-pool-size-formula").val()?.trim() ?? "";
      if (sf) {
        let table;
        try {
          table = JSON.parse(html.find("#ac-crit-pool-size-table").val()?.trim() || "[]");
        } catch {
          ui.notifications.warn(game.i18n.localize("ADVENTURECRAFT.Error.CritPoolSizeJson"));
          return { __invalid: true };
        }
        if (!Array.isArray(table)) {
          ui.notifications.warn(game.i18n.localize("ADVENTURECRAFT.Error.CritPoolSizeJson"));
          return { __invalid: true };
        }
        sizeRoll = { formula: sf, table };
      }
      return {
        type: "pool",
        selectionMode: "pick1",
        presentMode: html.find("#ac-crit-pool-present-mode").val() || "randomSubset",
        presentCount: Math.max(1, Number(html.find("#ac-crit-pool-present-count").val()) || 3),
        sizeRoll,
        options,
      };
    }
    return { type: "qty", qty: Number(html.find("#ac-crit-qty").val()) || 1 };
  }

  _openFilePicker(context) {
    new FilePicker({
      type: "image",
      current: context === "combine" ? (this._customCombineImg ?? "") : (this._customRecipeImg ?? ""),
      callback: (path) => {
        if (context === "combine") this._customCombineImg = path;
        else this._customRecipeImg = path;
        this.render();
      },
    }).render(true);
  }

  _flattenObject(obj, prefix, result) {
    for (const [key, value] of Object.entries(obj ?? {})) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        this._flattenObject(value, path, result);
      } else {
        result[path] = value;
      }
    }
  }

  _unflattenObject(flat) {
    const result = {};
    for (const [path, value] of Object.entries(flat)) {
      const keys = path.split(".");
      let obj = result;
      for (let i = 0; i < keys.length - 1; i++) {
        obj[keys[i]] ??= {};
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;
    }
    return result;
  }

  async _updateObject(_event, _formData) {}
}
