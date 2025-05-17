import { type Actions, addPlayer, removePlayer } from "../players";
import * as config from "../config";

// FIXME(ja): add support for vibration/rumble when you hit a mine

export type GamepadButton = {
  pressed: boolean;
  previouslyPressed?: boolean;
};

// Utilities for edge-trigger implementation
type PadMemory = {
  btn: boolean[]; // previous button states
  axes: number[]; // previous axes (rounded to -1/0/1 so noise is ignored)
};
const padMemory = new Map<string, PadMemory>(); // keyed by gamepad.id
const pendingGamepads = new Set<string>();

function axisDir(v: number): -1 | 0 | 1 {
  if (v < -0.5) return -1;
  if (v > 0.5) return 1;
  return 0;
}

function createPoll(id: string): () => Actions {
  return () => {
    const gamepad = globalThis.navigator.getGamepads().find((g) => g?.id === id);
    if (!gamepad) {
      console.error("Gamepad not found:", id);
      removePlayer({ id });
      return {};
    }

    if (!padMemory.has(id)) {
      padMemory.set(id, {
        btn: gamepad.buttons.map((b) => b.pressed),
        axes: gamepad.axes.map(axisDir),
      });
    }

    const mem = padMemory.get(id)!;
    const out: Actions = {};

    const axX = axisDir(gamepad.axes[0]);
    const axY = axisDir(gamepad.axes[1]);

    if ((gamepad.buttons[14]?.pressed || axX === -1) && mem.axes[0] !== -1) {
      out.dX = -1;
    }
    if ((gamepad.buttons[15]?.pressed || axX === 1) && mem.axes[0] !== 1) {
      out.dX = 1;
    }
    if ((gamepad.buttons[12]?.pressed || axY === -1) && mem.axes[1] !== -1) {
      out.dZ = -1;
    }
    if ((gamepad.buttons[13]?.pressed || axY === 1) && mem.axes[1] !== 1) {
      out.dZ = 1;
    }

    if (gamepad.buttons[4]?.pressed) out.zoomBy = config.ZOOM_OUT_FACTOR;
    if (gamepad.buttons[5]?.pressed) out.zoomBy = config.ZOOM_IN_FACTOR;
    if (gamepad.buttons[0]?.pressed && !mem.btn[0]) out.revealCell = true;
    if (gamepad.buttons[1]?.pressed && !mem.btn[1]) out.toggleFlag = true;

    if (out.dX !== undefined || out.dZ !== undefined) {
      console.log("Gamepad movement:", out.dX, out.dZ);
    }

    mem.btn = gamepad.buttons.map((b) => b.pressed);
    mem.axes = gamepad.axes.map(axisDir);

    return out;
  };
}

function addGamepadPlayer(gamepad: Gamepad) {
  addPlayer({
    name: `Gamepad ${gamepad.index}`,
    id: gamepad.id,
    poll: createPoll(gamepad.id),
  });
}

export function pollGamepads() {
  const pads = globalThis.navigator.getGamepads();
  for (const id of Array.from(pendingGamepads)) {
    const pad = pads.find((p) => p && p.id === id);
    if (!pad) {
      pendingGamepads.delete(id);
      continue;
    }

    if (pad.buttons[0]?.pressed || pad.buttons[1]?.pressed) {
      pendingGamepads.delete(id);
      addGamepadPlayer(pad);
    }
  }
}

export function initGamepads() {
  // Gamepad events
  console.log("initGamepads");
  globalThis.addEventListener("gamepadconnected", connectGamepad);
  globalThis.addEventListener("gamepaddisconnected", disconnectGamepad);
}

// FIXME(ja): if you are the first player to connect, you get to set the location,
// otherwise you get to join the game near the other players
function connectGamepad(e: GamepadEvent) {
  console.log("Gamepad connected:", e.gamepad, e.gamepad.id);

  pendingGamepads.add(e.gamepad.id);
}

// Handle gamepad disconnection
function disconnectGamepad(e: GamepadEvent) {
  console.log("Gamepad disconnected:", e.gamepad);
  pendingGamepads.delete(e.gamepad.id);
  removePlayer({ id: e.gamepad.id });
}
