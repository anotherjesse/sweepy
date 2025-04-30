import { animate, initMeshes, renderer } from "./gfx/render";
import { fade, initUI, setupFadeOverlay, unfade } from "./gfx/ui";
import { setupColorScheme } from "./gfx/darkmode";
import { generateBoard, loadGameData } from "./game";
import { initGamepads } from "./input/gamepad";
import { initKeyboard } from "./input/keyboard";
import { pollPlayers } from "./players";

// Start the application when DOM is ready
globalThis.addEventListener("DOMContentLoaded", async () => {
  setupFadeOverlay();
  fade();
  await setupColorScheme();
  initUI();
  initKeyboard();
  initGamepads();
  initMeshes();

  // Check for vertex texture support
  const maxVertexTex = renderer.capabilities.maxVertexTextures;
  if (maxVertexTex === 0) {
    console.warn(
      "This device does not support vertex textures - falling back to attribute mode",
    );
  }

  // get saved game, fallback to generating a new board
  await loadGameData() || generateBoard();

  animate(pollPlayers);

  unfade();
});
