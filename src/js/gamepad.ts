import { H, revealCell, toggleFlag, W } from "./game";
import { renderState, zoomIn, zoomOut } from "./render";

// Extend GamepadButton interface
export type GamepadButton = {
  pressed: boolean;
  previouslyPressed?: boolean;
};

// Gamepad state interface
export type GamepadState = {
  gamepadCursorX: number;
  gamepadCursorZ: number;
  gamepadCursorIndex: number;
  gamepadCursorMesh: THREE.Mesh | null;
  lastGamepadTimestamp: number;
  gamepads: Record<number, Gamepad>;
  hasGamepad: boolean;
}

// Create the gamepad state object
export const gamepadState: GamepadState = {
  gamepadCursorX: 500, // Start at center of board
  gamepadCursorZ: 500,
  gamepadCursorIndex: 500 + 500 * W,
  gamepadCursorMesh: null,
  lastGamepadTimestamp: 0,
  gamepads: {},
  hasGamepad: false,
};

// Gamepad throttle time
const GAMEPAD_THROTTLE_MS = 150; // Time between movements in ms

// Handle gamepad connection
export function connectGamepad(e: GamepadEvent) {
  console.log("Gamepad connected:", e.gamepad);
  gamepadState.gamepads[e.gamepad.index] = e.gamepad;
  gamepadState.hasGamepad = true;

  if (gamepadState.gamepadCursorMesh) {
    gamepadState.gamepadCursorMesh.visible = true;

    // Move cursor to center of current view
    const centerX = Math.floor(renderState.camera.position.x);
    const centerZ = Math.floor(renderState.camera.position.z);
    gamepadState.gamepadCursorX = Math.min(Math.max(centerX, 0), W - 1);
    gamepadState.gamepadCursorZ = Math.min(Math.max(centerZ, 0), H - 1);
    gamepadState.gamepadCursorIndex = gamepadState.gamepadCursorX +
      gamepadState.gamepadCursorZ * W;
    updateGamepadCursor();
  }
}

// Handle gamepad disconnection
export function disconnectGamepad(e: GamepadEvent) {
  console.log("Gamepad disconnected:", e.gamepad);
  delete gamepadState.gamepads[e.gamepad.index];

  // Check if any gamepads remain connected
  gamepadState.hasGamepad = Object.keys(gamepadState.gamepads).length > 0;

  if (gamepadState.gamepadCursorMesh) {
    gamepadState.gamepadCursorMesh.visible = gamepadState.hasGamepad;
  }
}

// Update the position of the gamepad cursor
export function updateGamepadCursor() {
  const { gamepadCursorMesh, gamepadCursorX, gamepadCursorZ } = gamepadState;

  if (!gamepadCursorMesh) return;

  gamepadCursorMesh.position.set(gamepadCursorX, 0.1, gamepadCursorZ);
  gamepadState.gamepadCursorIndex = gamepadCursorX + gamepadCursorZ * W;

  // Move camera if cursor approaches edge of view
  const padding = 5; // Cells from edge to trigger camera move
  const moveAmount = 3; // Cells to move camera by

  const { camera } = renderState;
  const viewportWidth = window.innerWidth / camera.zoom;
  const viewportHeight = window.innerHeight / camera.zoom;

  const leftEdge = camera.position.x - viewportWidth / 2;
  const rightEdge = camera.position.x + viewportWidth / 2;
  const topEdge = camera.position.z - viewportHeight / 2;
  const bottomEdge = camera.position.z + viewportHeight / 2;

  if (gamepadCursorX < leftEdge + padding) {
    camera.position.x -= moveAmount;
    renderState.controls.target.x -= moveAmount;
  } else if (gamepadCursorX > rightEdge - padding) {
    camera.position.x += moveAmount;
    renderState.controls.target.x += moveAmount;
  }

  if (gamepadCursorZ < topEdge + padding) {
    camera.position.z -= moveAmount;
    renderState.controls.target.z -= moveAmount;
  } else if (gamepadCursorZ > bottomEdge - padding) {
    camera.position.z += moveAmount;
    renderState.controls.target.z += moveAmount;
  }
}

// Poll gamepads for input
export function pollGamepads() {
  if (!gamepadState.hasGamepad) return;

  // Only poll at a reasonable rate to prevent ultra-fast movement
  const now = Date.now();
  if (now - gamepadState.lastGamepadTimestamp < GAMEPAD_THROTTLE_MS) return;

  // Get fresh gamepad data
  const freshGamepads = navigator.getGamepads ? navigator.getGamepads() : [];

  for (let i = 0; i < freshGamepads.length; i++) {
    const gamepad = freshGamepads[i];
    if (!gamepad) continue;

    // D-pad movement
    // Standard mapping usually has D-pad as buttons 12-15
    let moved = false;

    // Up (button 12 or left stick/d-pad up)
    if (gamepad.buttons[12]?.pressed || gamepad.axes[1] < -0.5) {
      gamepadState.gamepadCursorZ = Math.max(
        0,
        gamepadState.gamepadCursorZ - 1,
      );
      moved = true;
    }
    // Down (button 13 or left stick/d-pad down)
    if (gamepad.buttons[13]?.pressed || gamepad.axes[1] > 0.5) {
      gamepadState.gamepadCursorZ = Math.min(
        H - 1,
        gamepadState.gamepadCursorZ + 1,
      );
      moved = true;
    }
    // Left (button 14 or left stick/d-pad left)
    if (gamepad.buttons[14]?.pressed || gamepad.axes[0] < -0.5) {
      gamepadState.gamepadCursorX = Math.max(
        0,
        gamepadState.gamepadCursorX - 1,
      );
      moved = true;
    }
    // Right (button 15 or left stick/d-pad right)
    if (gamepad.buttons[15]?.pressed || gamepad.axes[0] > 0.5) {
      gamepadState.gamepadCursorX = Math.min(
        W - 1,
        gamepadState.gamepadCursorX + 1,
      );
      moved = true;
    }

    if (moved) {
      gamepadState.lastGamepadTimestamp = now;
      updateGamepadCursor();
    }

    // Zoom controls with shoulder buttons (L1/R1 or LB/RB)
    // Button 4 (L1 on PlayStation, LB on Xbox) - Zoom out
    if (gamepad.buttons[4]?.pressed) {
      zoomOut(0.95); // Use a slightly different factor for gamepad
    }

    // Button 5 (R1 on PlayStation, RB on Xbox) - Zoom in
    if (gamepad.buttons[5]?.pressed) {
      zoomIn(1.05); // Use a slightly different factor for gamepad
    }

    // Button actions
    // Button 0 (A on Xbox, X on PlayStation) - Reveal cell
    if (
      gamepad.buttons[0]?.pressed &&
      !(gamepad.buttons[0] as any).previouslyPressed
    ) {
      // We need the fadeOverlay from the main file
      const fadeOverlay = document.getElementById(
        "fadeOverlay",
      ) as HTMLDivElement;
      revealCell(gamepadState.gamepadCursorIndex, fadeOverlay, gamepadState);
      (gamepad.buttons[0] as any).previouslyPressed = true;
    } else if (!gamepad.buttons[0]?.pressed) {
      (gamepad.buttons[0] as any).previouslyPressed = false;
    }

    // Button 1 (B on Xbox, Circle on PlayStation) - Toggle flag
    if (
      gamepad.buttons[1]?.pressed &&
      !(gamepad.buttons[1] as any).previouslyPressed
    ) {
      toggleFlag(gamepadState.gamepadCursorIndex);
      (gamepad.buttons[1] as any).previouslyPressed = true;
    } else if (!gamepad.buttons[1]?.pressed) {
      (gamepad.buttons[1] as any).previouslyPressed = false;
    }
  }
}
