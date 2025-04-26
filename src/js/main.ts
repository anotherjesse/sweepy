import * as config from "./config";
import {
  animate,
  handleResize,
  initMeshes,
  initRenderer,
  renderState,
} from "./render";
import { fade, initUI, setupFadeOverlay, unfade } from "./ui";
import {
  gameState,
  generateBoard,
  loadGameData,
} from "./game";
import {
  connectGamepad,
  disconnectGamepad,
  gamepadState,
  pollGamepads,
} from "./gamepad";
import { onPointerDown, onPointerMove, onPointerUp, onWheel } from "./mouse";
import {
  keyboardState,
  onKeyDown,
  onKeyUp,
} from "./keyboard";

// Make states available globally for use in the render loop
declare global {
  interface Window {
    gamepadState: typeof gamepadState;
    keyboardState: typeof keyboardState;
    gameState: typeof gameState;
  }
}

window.gamepadState = gamepadState;
window.keyboardState = keyboardState;
window.gameState = gameState;

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

  // Start animation loop with both gamepad and keyboard polling
  animate(() => {
    pollGamepads();
  });
}

// Setup event listeners
function initEventListeners() {
  // Mouse events
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);

  // Prevent context menu
  window.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  // Mouse wheel for zoom
  window.addEventListener("wheel", onWheel);

  // Keyboard events
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  // Debug key for keyboard cursor visibility
  window.addEventListener("keydown", (event) => {
    if (event.code === "KeyK" && event.ctrlKey) {
      if (window.keyboardState && renderState.keyboardCursorMesh) {
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

  // Gamepad events
  window.addEventListener("gamepadconnected", connectGamepad);
  window.addEventListener("gamepaddisconnected", disconnectGamepad);
}

// Import user preferences functions
import { loadPreferences, updatePreferences, UserPreferences } from "./persist";

// Check system preference for dark mode
async function setupColorScheme() {
  // Try to load user preferences first
  const prefs = await loadPreferences();

  if (prefs && typeof prefs.darkMode !== "undefined") {
    // Use saved preference if available
    if (prefs.darkMode) {
      document.body.classList.add("dark-mode");
    } else {
      document.body.classList.remove("dark-mode");
    }
  } else {
    // Fall back to system preference if no saved preference
    const prefersDarkMode =
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (prefersDarkMode) {
      document.body.classList.add("dark-mode");
    }

    // Create initial preferences object
    await updatePreferences({
      darkMode: prefersDarkMode,
    });
  }

  // Listen for system changes to color scheme
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener(
    "change",
    async (event) => {
      // Only update based on system if user hasn't manually set preference
      const currentPrefs = await loadPreferences();
      if (!currentPrefs || currentPrefs.darkMode === undefined) {
        if (event.matches) {
          document.body.classList.add("dark-mode");
        } else {
          document.body.classList.remove("dark-mode");
        }

        // Save the new system preference
        await updatePreferences({
          darkMode: event.matches,
        });
      }
    },
  );
}

// Start the application when DOM is ready
window.addEventListener("DOMContentLoaded", async () => {
  await setupFadeOverlay();
  fade();
  await setupColorScheme();
  init();
  unfade();
});
