import { initMeshes } from "./gfx/render";
import { fade, initUI, setupFadeOverlay, unfade } from "./gfx/ui";
import { setupColorScheme } from "./gfx/darkmode";
import { generateBoard, loadGameData } from "./game";
import { initGamepads } from "./input/gamepad";
import { initKeyboard } from "./input/keyboard";

// Initialize the application
async function init() {
  initMeshes();
  initEventListeners();
  initUI();
  initKeyboard();
  initGamepads();
}

// Setup event listeners
function initEventListeners() {

}

// Start the application when DOM is ready
window.addEventListener("DOMContentLoaded", async () => {
  setupFadeOverlay();
  fade();
  await setupColorScheme();
  init();

  // get saved game, fallback to generating a new board
  await loadGameData() || generateBoard();

  unfade();
});
