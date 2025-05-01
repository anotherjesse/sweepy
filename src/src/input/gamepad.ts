import { type Actions, addPlayer, removePlayer } from "../players";

// FIXME(ja): add support for vibration/rumble when you hit a mine

export type GamepadButton = {
  pressed: boolean;
  previouslyPressed?: boolean;
};

// Utilities for edge-trigger implementation
type PadMemory = {
  btn: boolean[];    // previous button states
  axes: number[];    // previous axes (rounded to -1/0/1 so noise is ignored)
};
const padMemory = new Map<string, PadMemory>();  // keyed by gamepad.id

function axisDir(v: number): -1 | 0 | 1 {
  if (v < -0.5) return -1;
  if (v > 0.5)  return 1;
  return 0;
}

export function initGamepads() {
  // Gamepad events
  globalThis.addEventListener("gamepadconnected", connectGamepad);
  globalThis.addEventListener("gamepaddisconnected", disconnectGamepad);
}

// FIXME(ja): if you are the first player to connect, you get to set the location,
// otherwise you get to join the game near the other players
function connectGamepad(e: GamepadEvent) {
  console.log("Gamepad connected:", e.gamepad, e.gamepad.id);

  const id = e.gamepad.id;
  addPlayer({
    name: `Gamepad ${e.gamepad.index}`,
    id,
    poll: () => {
      const gamepad = globalThis.navigator.getGamepads().find((g) => g?.id === id);
      if (!gamepad) {
        console.error("Gamepad not found:", id);
        removePlayer({ id });
        return {};
      }

      // Create memory for this pad on first poll
      if (!padMemory.has(id)) {
        padMemory.set(id, {
          btn: gamepad.buttons.map((b) => b.pressed),
          axes: gamepad.axes.map(axisDir),
        });
      }

      const mem = padMemory.get(id)!;
      const out: Actions = {};

      // AXES (d-pad + left stick)
      const axX = axisDir(gamepad.axes[0]);
      const axY = axisDir(gamepad.axes[1]);

      // Only emit actions when state changes
      if ((gamepad.buttons[14]?.pressed || axX === -1) && mem.axes[0] !== -1) out.dZ = 1;
      if ((gamepad.buttons[15]?.pressed || axX === 1) && mem.axes[0] !== 1) out.dZ = -1;
      if ((gamepad.buttons[12]?.pressed || axY === -1) && mem.axes[1] !== -1) out.dX = -1;
      if ((gamepad.buttons[13]?.pressed || axY === 1) && mem.axes[1] !== 1) out.dX = 1;

      // BUTTONS
      if (gamepad.buttons[4]?.pressed && !mem.btn[4]) out.zoomBy = 0.98;
      if (gamepad.buttons[5]?.pressed && !mem.btn[5]) out.zoomBy = 1.02;
      if (gamepad.buttons[0]?.pressed && !mem.btn[0]) out.revealCell = true;
      if (gamepad.buttons[1]?.pressed && !mem.btn[1]) out.toggleFlag = true;

      // Log movement changes for debugging
      if (out.dX !== undefined || out.dZ !== undefined) {
        console.log("Gamepad movement:", out.dX, out.dZ);
      }

      // Update memory for the next frame
      mem.btn = gamepad.buttons.map((b) => b.pressed);
      mem.axes = gamepad.axes.map(axisDir);

      return out;
    },
  });
}

// Handle gamepad disconnection
function disconnectGamepad(e: GamepadEvent) {
  console.log("Gamepad disconnected:", e.gamepad);
  removePlayer({ id: e.gamepad.id });
}
