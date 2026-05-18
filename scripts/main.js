import { CraftingWindow } from "./apps/CraftingWindow.js";
import { dnd5eAdapter } from "./adapters/dnd5e-adapter.js";
import { coreApi } from "./core-api.js";
const BRIDGE_ID = "adventurecraft-dnd5e";

Hooks.once("init", () => {
  console.log(`${BRIDGE_ID} | init`);

  const core = game.modules.get("adventurecraft-core");
  if (!core?.active) {
    console.error(`${BRIDGE_ID} | adventurecraft-core is required`);
    return;
  }

  game.settings.register(BRIDGE_ID, "enableCombine", {
    name: "ADVENTURECRAFT.Settings.CombineItemsName",
    hint: "ADVENTURECRAFT.Settings.CombineItemsHint",
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
  });

  game.settings.register(BRIDGE_ID, "showRecipeResultProps", {
    name: "ADVENTURECRAFT.Settings.ShowRecipeResultPropsName",
    hint: "ADVENTURECRAFT.Settings.ShowRecipeResultPropsHint",
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
    onChange: () => {
      for (const app of Object.values(ui.windows)) {
        if (app instanceof CraftingWindow && app.rendered) app.render(false);
      }
    },
  });
});

Hooks.once("setup", () => {
  const core = game.modules.get("adventurecraft-core");
  if (!core?.active) return;
  try {
    coreApi().registerSystemAdapter(dnd5eAdapter);
  } catch (e) {
    console.error(`${BRIDGE_ID} | failed to register system adapter`, e);
  }
});

Hooks.once("ready", () => {
  console.log(`${BRIDGE_ID} | ready`);
  const core = coreApi();
  game.adventurecraft = {
    ...core,
    CraftingWindow,
  };
});

function _injectCraftingButton(app, html) {
  const doc = app.document ?? app.object;
  if (!doc || doc.documentName !== "Actor") return;

  const core = coreApi();
  const canExtraHub =
    core.userCan("createRecipe") ||
    core.userCan("viewAllRecipes") ||
    core.userCan("combineItems");
  if (!doc.isOwner && !canExtraHub) return;

  const root = html instanceof HTMLElement ? html : html[0];
  if (!root || root.querySelector(".ac-crafting-btn")) return;

  const header = root.querySelector(".window-header");
  if (!header) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ac-crafting-btn header-button control";
  btn.title = game.i18n.localize("ADVENTURECRAFT.Sidebar.OpenHub");
  btn.setAttribute("aria-label", game.i18n.localize("ADVENTURECRAFT.Sidebar.OpenHub"));
  btn.innerHTML = '<i class="fas fa-hammer"></i>';
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    new core.AdventureCraftHub(doc).render(true);
  });

  const closeBtn = header.querySelector("button[data-action='close'], a.close");
  if (closeBtn) header.insertBefore(btn, closeBtn);
  else header.appendChild(btn);
}

Hooks.on("renderActorSheetV2", _injectCraftingButton);
Hooks.on("renderActorSheet", _injectCraftingButton);

function _injectTagButton(app, html) {
  const doc = app.document ?? app.object;
  if (!doc || doc.documentName !== "Item") return;
  if (!doc.isOwner && !game.user.isGM) return;

  const root = html instanceof HTMLElement ? html : html[0];
  if (!root || root.querySelector(".ac-tags-btn")) return;

  const header = root.querySelector(".window-header");
  if (!header) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ac-tags-btn header-button control";
  btn.title = game.i18n.localize("ADVENTURECRAFT.Sidebar.OpenTags");
  btn.setAttribute("aria-label", game.i18n.localize("ADVENTURECRAFT.Label.Tags"));
  btn.innerHTML = '<i class="fas fa-tags"></i>';
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const current = (doc.getFlag("adventurecraft-core", "tags")
      ?? doc.getFlag("adventurecraft-dnd5e", "tags")
      ?? []).join(", ");
    const escapedCurrent = foundry.utils.escapeHTML(current);
    const result = await Dialog.prompt({
      title: game.i18n.localize("ADVENTURECRAFT.Sidebar.OpenTags"),
      content: `<p style="margin-bottom:6px;font-size:0.85rem">${game.i18n.localize("ADVENTURECRAFT.Dialog.TagsPrompt")}</p>
        <input type="text" id="ac-tag-input" value="${escapedCurrent}" style="width:100%;padding:4px 6px;border-radius:3px;" autofocus/>`,
      callback: (html) => html.find("#ac-tag-input").val(),
      rejectClose: false,
    });
    if (result === null || result === undefined) return;
    if (!doc.isOwner && !game.user.isGM) {
      ui.notifications.warn(game.i18n.localize("ADVENTURECRAFT.Error.NoPermission"));
      return;
    }
    const tags = result.split(",").map(t => t.trim()).filter(Boolean);
    await doc.setFlag("adventurecraft-core", "tags", tags);
    if (tags.length) ui.notifications.info(game.i18n.format("ADVENTURECRAFT.Message.TagsSet", { tags: tags.join(", ") }));
    else ui.notifications.info(game.i18n.localize("ADVENTURECRAFT.Message.TagsCleared"));
  });

  const closeBtn = header.querySelector("button[data-action='close'], a.close");
  if (closeBtn) header.insertBefore(btn, closeBtn);
  else header.appendChild(btn);
}

Hooks.on("renderItemSheetV2", _injectTagButton);
Hooks.on("renderItemSheet", _injectTagButton);

function _injectOriginButton(app, html) {
  const doc = app.document ?? app.object;
  if (!doc || doc.documentName !== "Item") return;

  let core;
  try {
    core = coreApi();
  } catch {
    return;
  }
  if (!core.hasCraftOrigin(doc)) return;

  const root = html instanceof HTMLElement ? html : html[0];
  if (!root || root.querySelector(".ac-origin-btn")) return;

  const header = root.querySelector(".window-header");
  if (!header) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ac-origin-btn header-button control";
  btn.title = game.i18n.localize("ADVENTURECRAFT.Origin.ShowButton");
  btn.setAttribute("aria-label", game.i18n.localize("ADVENTURECRAFT.Origin.ShowButton"));
  btn.innerHTML = '<i class="fas fa-scroll"></i>';
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const speakerActor = doc.actor ?? doc.parent ?? null;
    await core.postOriginToChat(doc, { speakerActor });
  });

  const closeBtn = header.querySelector("button[data-action='close'], a.close");
  if (closeBtn) header.insertBefore(btn, closeBtn);
  else header.appendChild(btn);
}

Hooks.on("renderItemSheetV2", _injectOriginButton);
Hooks.on("renderItemSheet", _injectOriginButton);

function _injectSidebarButton(app, html) {
  const core = coreApi();
  if (!core.userCan("createRecipe") && !core.userCan("viewAllRecipes") && !core.userCan("combineItems")) return;

  const root = html instanceof HTMLElement ? html : html[0];
  if (!root || root.querySelector(".ac-crafting-sidebar-btn")) return;

  const actionsBar = root.querySelector(".action-buttons.flexrow")
    ?? root.querySelector(".action-buttons")
    ?? root.querySelector(".header-actions.flexrow")
    ?? root.querySelector(".header-actions")
    ?? root.querySelector(".directory-header");
  if (!actionsBar) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ac-crafting-sidebar-btn";
  btn.title = game.i18n.localize("ADVENTURECRAFT.Sidebar.OpenHub");
  btn.innerHTML = '<i class="fas fa-hammer"></i>';
  btn.addEventListener("click", () => new core.AdventureCraftHub(null).render(true));
  actionsBar.appendChild(btn);
}

Hooks.on("renderItemDirectory", _injectSidebarButton);
