import { type Actions, addPlayer, removePlayer } from "../players";

// FIXME(ja): add support for vibration/rumble when you hit a mine

export type GamepadButton = {
  pressed: boolean;
  previouslyPressed?: boolean;
};

export function initGamepads() {
  // Gamepad events
  globalThis.addEventListener("gamepadconnected", connectGamepad);
  globalThis.addEventListener("gamepaddisconnected", disconnectGamepad);
}

// FIXME(ja): if you are the first player to connect, you get to set the location,
// otherwise you get to join the game near the other players
function connectGamepad(e: GamepadEvent) {
  console.log("Gamepad connected:", e.gamepad, e.gamepad.id);

  const gamepad = e.gamepad;
  addPlayer({
    name: `Gamepad ${e.gamepad.index}`,
    id: e.gamepad.id,
    poll: () => {
      const rv: Actions = {};
      // D-pad movement
      // Standard mapping usually has D-pad as buttons 12-15

      // Up (button 12 or left stick/d-pad up)
      if (gamepad.buttons[12]?.pressed || gamepad.axes[1] < -0.5) {
        rv.dZ = -1;
      }
      // Down (button 13 or left stick/d-pad down)
      if (gamepad.buttons[13]?.pressed || gamepad.axes[1] > 0.5) {
        rv.dZ = 1;
      }
      // Left (button 14 or left stick/d-pad left)
      if (gamepad.buttons[14]?.pressed || gamepad.axes[0] < -0.5) {
        rv.dX = -1;
      }
      // Right (button 15 or left stick/d-pad right)
      if (gamepad.buttons[15]?.pressed || gamepad.axes[0] > 0.5) {
        rv.dX = 1;
      }

      // Zoom controls with shoulder buttons (L1/R1 or LB/RB)
      if (gamepad.buttons[4]?.pressed) {
        rv.zoomBy = 0.95;
      }

      if (gamepad.buttons[5]?.pressed) {
        rv.zoomBy = 1.05;
      }

      // Button 0 (A on Xbox, X on PlayStation) - Reveal cell
      if (gamepad.buttons[0]?.pressed) {
        rv.revealCell = true;
      }

      // Button 1 (B on Xbox, Circle on PlayStation) - Toggle flag
      if (gamepad.buttons[1]?.pressed) {
        rv.toggleFlag = true;
      }
      return rv;
    },
  });
}

// Handle gamepad disconnection
function disconnectGamepad(e: GamepadEvent) {
  console.log("Gamepad disconnected:", e.gamepad);
  removePlayer({ id: e.gamepad.id });
}
