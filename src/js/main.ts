import { animate, initMeshes } from "./gfx/render";
import { fade, initUI, setupFadeOverlay, unfade } from "./gfx/ui";
import { setupColorScheme } from "./gfx/darkmode";
import { generateBoard, loadGameData } from "./game";
import { initGamepads } from "./input/gamepad";
import { initKeyboard } from "./input/keyboard";
import { pollPlayers } from "./players";

// Start the application when DOM is ready
window.addEventListener("DOMContentLoaded", async () => {
  setupFadeOverlay();
  fade();
  await setupColorScheme();
  initUI();
  initKeyboard();
  initGamepads();
  initMeshes();

  // get saved game, fallback to generating a new board
  await loadGameData() || generateBoard();

  animate(pollPlayers);

  unfade();
});
