import {
  animate,
  handleResize,
  initMeshes,
  initRenderer,
  renderState,
} from "./gfx/render";
import { fade, initUI, setupFadeOverlay, unfade } from "./gfx/ui";
import { setupColorScheme } from "./gfx/darkmode";
import { generateBoard, loadGameData } from "./game";
import { initGamepads } from "./input/gamepad";
import { onKeyDown, onKeyUp } from "./input/keyboard";

// Initialize the application
async function init() {
  // Setup rendering
  await initRenderer();

  // Initialize meshes
  initMeshes();

  // Setup event listeners
  initEventListeners();

  // Initialize UI components
  initUI();

  // Try to load saved game or generate a new board if no saved game exists
  await loadGameData() || generateBoard();

  // // Start animation loop with both gamepad and keyboard polling
  // animate(() => {
  //   pollGamepads();
  // });
}

// Setup event listeners
function initEventListeners() {
  // FIXME(ja): re-add mouse support
  // window.addEventListener("pointermove", onPointerMove);
  // window.addEventListener("pointerdown", onPointerDown);
  // window.addEventListener("pointerup", onPointerUp);

  // Prevent context menu
  window.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  // Keyboard events
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  // Debug key for keyboard cursor visibility
  window.addEventListener("keydown", (event) => {
    if (event.code === "KeyK" && event.ctrlKey) {
      if (renderState.keyboardCursorMesh) {
        renderState.keyboardCursorMesh.visible = !renderState.keyboardCursorMesh
          .visible;
        console.log(
          `Keyboard cursor ${
            renderState.keyboardCursorMesh.visible ? "shown" : "hidden"
          }`,
        );
      }
    }
  });

  // Window resize
  window.addEventListener("resize", handleResize);

  initGamepads();
}

// Start the application when DOM is ready
window.addEventListener("DOMContentLoaded", async () => {
  await setupFadeOverlay();
  fade();
  await setupColorScheme();
  init();
  unfade();
});
