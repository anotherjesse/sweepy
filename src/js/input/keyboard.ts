import * as config from "../config";
import {
  gameState,
  startTeleport,
} from "../game";
import { toggleUI } from "../gfx/ui";
import { toggleDarkMode } from "../gfx/darkmode";
import { type Actions, addPlayer, Player, removePlayer } from "../players";

// Active keys tracker
const activeKeys = new Set<string>();

let player: Player | undefined;
let actions: Actions = {};

export function initKeyboard() {
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
}

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
  }

  // Skip if player is disabled
  if (gameState.disablePlayer) return;

  // Skip if key is already pressed (avoid repeat)
  if (activeKeys.has(event.code)) return;

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

  if (Object.keys(actions).length > 0) {
    addPlayer({
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
