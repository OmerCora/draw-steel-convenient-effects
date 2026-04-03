/**
 * Visual Active Effects integration for Draw Steel Convenient Effects.
 * Adds stacking mechanic (left-click +1, right-click -1) and
 * a book icon that posts an effect's description to chat.
 */

const MODULE_ID = "draw-steel-convenient-effects";
const VAE_MODULE = "visual-active-effects";

Hooks.once("setup", () => {
  const vaeActive = game.modules.get(VAE_MODULE)?.active;
  if (!vaeActive) return;

  const VAEClass = CONFIG.ui?.visualActiveEffects;
  if (!VAEClass) return;

  // Wrap VAE's _onRender to inject stack badges, book icons, and click handlers.
  libWrapper.register(MODULE_ID, "CONFIG.ui.visualActiveEffects.prototype._onRender",
    async function (wrapped, ...args) {
      await wrapped(...args);
      _injectVAEExtensions(this);
    }, "WRAPPER"
  );
});

/**
 * Inject stack badges, book icons, and click handlers into the VAE panel.
 * @param {Application} app - The VAE application instance.
 */
function _injectVAEExtensions(app) {
  const container = app.element;
  if (!container) return;

  for (const item of container.querySelectorAll(".effect-item[data-effect-uuid]")) {
    const uuid = item.dataset.effectUuid;
    const iconEl = item.querySelector(".effect-icon");
    if (!iconEl || !uuid) continue;

    const effect = fromUuidSync(uuid);
    if (!effect) continue;

    // --- Stack badge ---
    const stackCount = effect.getFlag(MODULE_ID, "stackCount") ?? 1;
    if (stackCount > 1) {
      const badge = document.createElement("span");
      badge.classList.add("dsce-stack-badge");
      badge.textContent = stackCount;
      iconEl.appendChild(badge);
    }

    // --- Book icon ---
    const bookIcon = document.createElement("i");
    bookIcon.classList.add("dsce-book-icon", "fa-solid", "fa-book-open");
    bookIcon.dataset.tooltip = "Post Description";
    item.appendChild(bookIcon);

    // --- Left-click: increment stack ---
    let clickTimer = null;

    iconEl.addEventListener("click", (event) => {
      // Ignore clicks on the book icon
      if (event.target.closest(".dsce-book-icon")) return;

      // Double-click discrimination: cancel if second click arrives quickly
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
        return;
      }

      clickTimer = setTimeout(async () => {
        clickTimer = null;
        const eff = await fromUuid(uuid);
        if (!eff) return;
        const current = eff.getFlag(MODULE_ID, "stackCount") ?? 1;
        await eff.setFlag(MODULE_ID, "stackCount", current + 1);
      }, 250);
    });

    // Cancel click timer on double-click so VAE's toggle still works
    iconEl.addEventListener("dblclick", () => {
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
      }
    });

    // --- Right-click: decrement stack or delete ---
    iconEl.addEventListener("contextmenu", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const eff = await fromUuid(uuid);
      if (!eff) return;

      const current = eff.getFlag(MODULE_ID, "stackCount") ?? 1;
      if (current > 1) {
        await eff.setFlag(MODULE_ID, "stackCount", current - 1);
      } else {
        // Single stack: prompt to delete
        if (event.shiftKey && game.user.isGM) {
          await eff.delete();
        } else {
          eff.deleteDialog();
        }
      }
    });

    // --- Book icon: post description to chat ---
    bookIcon.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const eff = await fromUuid(uuid);
      if (!eff) return;

      const description = eff.description;
      if (!description) {
        ui.notifications.warn("This effect has no description.");
        return;
      }

      let rollData = {};
      try {
        rollData = eff.parent?.getRollData?.() ?? {};
      } catch {
        rollData = {};
      }

      const enriched = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        description, { rollData, relativeTo: eff }
      );

      await ChatMessage.create({
        content: `<div class="dsce-description-card">
          <h3>${eff.name}</h3>
          <div>${enriched}</div>
        </div>`,
        speaker: ChatMessage.getSpeaker(),
      });
    });
  }
}
