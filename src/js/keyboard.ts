import * as config from "./config";
import {
  gameState,
  registerKeyboardReset,
  revealCell,
  startTeleport,
  toggleFlag,
} from "./game";
import { renderState, zoomIn, zoomOut } from "./render";
import { gamepadState } from "./gamepad";
import { updatePreferences } from "./persist";

// Keyboard state interface
export type KeyboardState = {
  moveSpeed: number;
  cursorX: number;
  cursorZ: number;
  cursorIndex: number;
  zoomSpeed: number;
  // Track keys that have been processed for this press
  processedKeys: Set<string>;
};

// Create keyboard state object
export const keyboardState: KeyboardState = {
  moveSpeed: 1,
  cursorX: 500, // Start at center of board
  cursorZ: 500, // Start at center of board
  cursorIndex: 500 + 500 * config.W,
  zoomSpeed: 1.1,
  processedKeys: new Set<string>(),
};

// Active keys tracker
const activeKeys = new Set<string>();

// Handler for keydown events
export function onKeyDown(event: KeyboardEvent) {
  // Handle UI toggle keys regardless of player state
  if (
    event.code === "Slash" || event.key === "/" || event.key === "?" ||
    event.key === "Escape"
  ) {
    const ui = document.getElementById("ui");

    if (ui) {
      ui.classList.toggle("visible");

      return;
    }
  }

  // Handle dark mode toggle with 'm' key
  if (event.code === "KeyM" || event.key === "m") {
    const isDarkMode = document.body.classList.toggle("dark-mode");
    console.log(`Dark mode ${isDarkMode ? "enabled" : "disabled"}`);

    updatePreferences({
      darkMode: isDarkMode,
    });

    return;
  }

  // Skip if player is disabled
  if (gameState.disablePlayer) return;

  // Skip if key is already pressed (avoid repeat)
  if (activeKeys.has(event.code)) return;

  // Add key to active keys
  activeKeys.add(event.code);

  // Log for debugging
  console.log(
    `Key pressed: ${event.code}, Cursor at: (${keyboardState.cursorX}, ${keyboardState.cursorZ})`,
  );

  // Process movement on initial keydown (only once per press)
  if (!keyboardState.processedKeys.has(event.code)) {
    let cameraChanged = false;

    // Movement keys - WASD/Arrows (process on initial keydown)
    switch (event.code) {
      case "KeyT":
        startTeleport();
        break;

      case "KeyW":
      case "ArrowUp":
        renderState.camera.position.z -= keyboardState.moveSpeed;
        renderState.controls.target.z -= keyboardState.moveSpeed;
        keyboardState.cursorZ -= keyboardState.moveSpeed;
        cameraChanged = true;
        break;

      case "KeyS":
      case "ArrowDown":
        renderState.camera.position.z += keyboardState.moveSpeed;
        renderState.controls.target.z += keyboardState.moveSpeed;
        keyboardState.cursorZ += keyboardState.moveSpeed;
        cameraChanged = true;
        break;

      case "KeyA":
      case "ArrowLeft":
        renderState.camera.position.x -= keyboardState.moveSpeed;
        renderState.controls.target.x -= keyboardState.moveSpeed;
        keyboardState.cursorX -= keyboardState.moveSpeed;
        cameraChanged = true;
        break;

      case "KeyD":
      case "ArrowRight":
        renderState.camera.position.x += keyboardState.moveSpeed;
        renderState.controls.target.x += keyboardState.moveSpeed;
        keyboardState.cursorX += keyboardState.moveSpeed;
        cameraChanged = true;
        break;

      case "Minus":
      case "KeyQ":
        zoomOut();
        cameraChanged = true;
        break;

      case "Equal":
      case "KeyE":
        zoomIn();
        cameraChanged = true;
        break;
    }

    // Update camera if needed
    if (cameraChanged) {
      renderState.camera.updateProjectionMatrix();
      renderState.controls.update();

      // Keep cursor position within board bounds
      keyboardState.cursorX = Math.max(
        0,
        Math.min(config.W - 1, Math.floor(keyboardState.cursorX)),
      );
      keyboardState.cursorZ = Math.max(
        0,
        Math.min(config.H - 1, Math.floor(keyboardState.cursorZ)),
      );
      keyboardState.cursorIndex = keyboardState.cursorX +
        keyboardState.cursorZ * config.W;

      // Update hovered cell index for consistency with cursor
      gameState.hoveredCellIndex = keyboardState.cursorIndex;

      // Log updated position
      console.log(
        `Cursor moved to: (${keyboardState.cursorX}, ${keyboardState.cursorZ})`,
      );

      // Update keyboard cursor mesh position immediately for responsiveness
      if (renderState.keyboardCursorMesh) {
        renderState.keyboardCursorMesh.position.set(
          keyboardState.cursorX,
          0.1,
          keyboardState.cursorZ,
        );
      }
    }

    // Mark this key as processed
    keyboardState.processedKeys.add(event.code);
  }

  // Handle action keys immediately (reveal/flag)
  switch (event.code) {
    case "Space":
    case "Enter":
      // Select/reveal current cell
      revealCell(keyboardState.cursorIndex);
      break;
    case "KeyF":
      // Flag current cell
      toggleFlag(keyboardState.cursorIndex);
      break;
  }
}

// Handler for keyup events
export function onKeyUp(event: KeyboardEvent) {
  // Remove key from active keys
  activeKeys.delete(event.code);

  // Remove from processed keys to allow it to be processed again on next press
  keyboardState.processedKeys.delete(event.code);
}

// Reset keyboard cursor position after death
export function resetKeyboardCursor(x: number, z: number) {
  // Reset cursor position
  keyboardState.cursorX = x;
  keyboardState.cursorZ = z;
  keyboardState.cursorIndex = x + z * config.W;

  // Clear all active keys and processed keys to ensure keyboard controls work after death
  activeKeys.clear();
  keyboardState.processedKeys.clear();

  // Log for debugging
  console.log(`Keyboard cursor reset to ${x}, ${z}`);
}

// Register the keyboard cursor reset function
registerKeyboardReset(resetKeyboardCursor);
