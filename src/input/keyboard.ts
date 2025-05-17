import { gameState, startTeleport } from "../game";
import { toggleUI } from "../gfx/ui";
import { toggleDarkMode } from "../gfx/darkmode";
import { zoomBy } from "../gfx/camera";
import {
  type Actions,
  addPlayer,
  Player,
  removePlayer,
} from "../players";

// Active keys tracker
const activeKeys = new Set<string>();

let player: Player | undefined;
let actions: Actions = {};

export function initKeyboard() {
  globalThis.addEventListener("keydown", onKeyDown);
  globalThis.addEventListener("keyup", onKeyUp);
}

// Keys that allow a keyboard player to join
const joinKeys = new Set([
  "Space",
  "Enter",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

// Handler for keydown events
export function onKeyDown(event: KeyboardEvent) {
  // Handle UI toggle keys regardless of player state
  switch (event.code) {
    case "Slash":
    case "?":
    case "/":
      toggleUI();
      break;

    case "KeyM":
    case "m":
      toggleDarkMode();
      break;

    case "Escape":
      if (player) {
        removePlayer(player);
        player = undefined;
      }
      break;

    case "Minus":
    case "MinusSign":
      zoomBy(0.95);
      break;

    case "Equal":
    case "Plus":
    case "PlusSign":
      zoomBy(1.05);
      break;
  }

  // Skip if player is disabled
  if (gameState.disablePlayer) return;

  // Skip if key is already pressed (avoid repeat)
  if (activeKeys.has(event.code)) return;

  // If no keyboard player exists, allow join keys to create one without
  // triggering actions for this press
  if (!player && joinKeys.has(event.code)) {
    player = addPlayer({
      id: "keyboard",
      name: "Keyboard",
      poll: () => {
        const rv = actions;
        actions = {};
        return rv;
      },
    });
    activeKeys.add(event.code);
    return;
  }

  // Add key to active keys
  activeKeys.add(event.code);

  // Movement keys - WASD/Arrows (process on initial keydown)
  switch (event.code) {
    case "KeyT":
      startTeleport();
      break;

    case "KeyW":
    case "ArrowUp":
      actions.dZ = -1;
      break;

    case "KeyA":
    case "ArrowLeft":
      actions.dX = -1;
      break;

    case "KeyS":
    case "ArrowDown":
      actions.dZ = 1;
      break;

    case "KeyD":
    case "ArrowRight":
      actions.dX = 1;
      break;

    case "Space":
    case "Enter":
      actions.revealCell = true;
      break;

    case "KeyF":
      actions.toggleFlag = true;
      break;
  }

  // Only add keyboard player if it doesn't already exist
  if (Object.keys(actions).length > 0 && !player) {
    player = addPlayer({
      id: "keyboard",
      name: "Keyboard",
      poll: () => {
        const rv = actions;
        actions = {};
        return rv;
      },
    });
  }
}
// Handler for keyup events
export function onKeyUp(event: KeyboardEvent) {
  // Remove key from active keys
  activeKeys.delete(event.code);
}
