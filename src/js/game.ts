import seedrandom from 'seedrandom';
import SimplexNoise from 'simplex-noise';
import type { GameState, CellStateConstants, RenderState, GamepadState } from './types';
import { updateMeshes, renderState } from './render';

// --- CONFIG ---
// Use a 1000x1000 grid as specified in README
export const BOARD_SIZE = 1000;
export const W = BOARD_SIZE, H = BOARD_SIZE, N = W * H;

// Cell state bitfield flags
export const cellStateConstants: CellStateConstants = {
  NUMBER_MASK: 0x0f, // 00001111 (4 bits for adjacent mines, bits 0-3)
  REVEALED: 0x10,    // 00010000
  FLAGGED: 0x20,     // 00100000
  MINE: 0x40,        // 01000000
  FINISHED: 0x80     // 10000000 (for completely boxed-in mines)
};

// Use Uint8Array for memory efficiency (1 byte per cell) as specified in README
export const states = new Uint8Array(N);

// Game state object
export const gameState: GameState = {
  disablePlayer: false,
  gameStarted: false,
  firstClick: true,
  debugMode: false,
  hoveredCellIndex: -1
};

// Generate a new game board
export function generateBoard(
  seed: string, 
  minePercentage = 0.3
) {
  console.log(`Generating board with seed: ${seed}`);
  const rng = seedrandom(seed);
  const simplex = new SimplexNoise(rng);

  // Clear existing state
  states.fill(0);

  // FIXME(ja): the board layout isn't good right now... too many mines touching each other

  // Distribute mines using simplex noise for more natural clustering
  const noiseScale = 0.25; // Scale factor for noise
  const threshold = 1 - minePercentage; // Threshold value for mine placement

  let mineCount = 0;

  for (let i = 0; i < N; i++) {
    const x = i % W, z = Math.floor(i / W);

    // Use noise to determine mine placement
    const noiseValue =
      (simplex.noise2D(x * noiseScale, z * noiseScale) + 1) / 2; // Convert to 0-1 range

    if (noiseValue > threshold) {
      states[i] |= cellStateConstants.MINE;
      mineCount++;
    }
  }

  console.log(
    `Generated ${mineCount} mines (${(mineCount / N * 100).toFixed(2)}%)`,
  );

  // Calculate adjacent mines for each cell
  calculateAdjacentMines();

  // Update the mesh display
  updateMeshes(gameState, cellStateConstants);
}

// Calculate adjacent mines for each cell
function calculateAdjacentMines() {
  const { MINE, NUMBER_MASK } = cellStateConstants;
  
  for (let i = 0; i < N; i++) {
    if (states[i] & MINE) continue; // Skip if this is a mine

    const x = i % W, z = Math.floor(i / W);
    let count = 0;

    // Check all 8 adjacent cells
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0) continue; // Skip self

        const nx = x + dx;
        const nz = z + dz;

        // Check bounds
        if (nx < 0 || nx >= W || nz < 0 || nz >= H) continue;

        const ni = nx + nz * W;
        if (states[ni] & MINE) count++;
      }
    }

    // Store adjacent mine count in the NUMBER_MASK bits
    states[i] = (states[i] & ~NUMBER_MASK) | count;
  }
}

// Reveal a cell
export function revealCell(
  index: number, 
  fadeOverlay: HTMLDivElement,
  gamepadState: GamepadState
) {
  const { disablePlayer, gameStarted, firstClick } = gameState;
  const { NUMBER_MASK, REVEALED, FLAGGED, MINE } = cellStateConstants;
  
  if (disablePlayer) return;
  
  if (!gameState.gameStarted) {
    gameState.gameStarted = true;
  }

  // Handle first click
  if (gameState.firstClick) {
    // Ensure first click is never a mine
    if (states[index] & MINE) {
      // Remove the mine
      states[index] &= ~MINE;

      // Find a new spot for the mine
      let newIndex;
      do {
        newIndex = Math.floor(Math.random() * N);
      } while ((newIndex === index) || (states[newIndex] & MINE));

      // Place the mine in the new spot
      states[newIndex] |= MINE;

      // Recalculate adjacent mine counts
      calculateAdjacentMines();
    }
    gameState.firstClick = false;
  }

  const state = states[index];

  // Skip if already revealed or flagged
  if (state & REVEALED || state & FLAGGED) return;

  // Mark as revealed
  states[index] |= REVEALED;

  // Check if mine
  if (state & MINE) {
    gameState.disablePlayer = true;
    if (fadeOverlay) fadeOverlay.style.opacity = "1";

    // Allow restart after a delay
    setTimeout(() => {
      // Move the player to a random location on the board
      // Choose a new random position within a reasonable range (not the entire board)
      const viewRange = 100; // A more reasonable view range
      const randomX = Math.floor(Math.random() * (W - viewRange));
      const randomZ = Math.floor(Math.random() * (H - viewRange));

      // Move both camera position and target coherently
      renderState.camera.position.set(
        randomX + viewRange / 2,
        renderState.camera.position.y,
        randomZ + viewRange / 2
      );
      renderState.controls.target.set(
        randomX + viewRange / 2,
        0,
        randomZ + viewRange / 2
      );
      renderState.camera.zoom = 20; // Set a higher default zoom level

      // Update camera and controls
      renderState.camera.updateProjectionMatrix();
      renderState.controls.update();

      // Move gamepad cursor to new position
      gamepadState.gamepadCursorX = randomX + viewRange / 2;
      gamepadState.gamepadCursorZ = randomZ + viewRange / 2;
      gamepadState.gamepadCursorIndex = gamepadState.gamepadCursorX + gamepadState.gamepadCursorZ * W;

      if (fadeOverlay) fadeOverlay.style.opacity = "0";

      gameState.disablePlayer = false;
    }, 1000);

    return;
  }

  // Auto-reveal empty cells
  const adjacentMines = state & NUMBER_MASK;
  if (adjacentMines === 0) {
    // Flood fill to reveal adjacent empty cells
    floodFillReveal(index);
  }

  // Check for mines that are now completely boxed in
  checkForBoxedInMines();

  // Update display
  updateMeshes(gameState, cellStateConstants);
}

// Flood fill to reveal adjacent empty cells
function floodFillReveal(index: number) {
  const { NUMBER_MASK, REVEALED, FLAGGED } = cellStateConstants;
  
  const queue = [index];
  const visited = new Set([index]);

  while (queue.length > 0) {
    const currentIndex = queue.shift()!;
    const x = currentIndex % W;
    const z = Math.floor(currentIndex / W);

    // Check all adjacent cells
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0) continue;

        const nx = x + dx;
        const nz = z + dz;

        // Check bounds
        if (nx < 0 || nx >= W || nz < 0 || nz >= H) continue;

        const ni = nx + nz * W;

        // Skip if already visited, revealed, or flagged
        if (
          visited.has(ni) || (states[ni] & REVEALED) ||
          (states[ni] & FLAGGED)
        ) continue;

        // Mark as visited
        visited.add(ni);

        // Reveal this cell
        states[ni] |= REVEALED;

        // If this is also an empty cell, add to queue
        const adjacentMinesNi = states[ni] & NUMBER_MASK;
        if (adjacentMinesNi === 0) {
          queue.push(ni);
        }
      }
    }
  }
}

// Function to check for mines that are completely boxed in
export function checkForBoxedInMines() {
  const { MINE, FINISHED, REVEALED } = cellStateConstants;
  
  for (let i = 0; i < N; i++) {
    // Skip if not a mine or already marked as finished
    if (!(states[i] & MINE) || (states[i] & FINISHED)) continue;

    const x = i % W, z = Math.floor(i / W);
    let allRevealed = true;

    // Check all 8 adjacent cells
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0) continue; // Skip self

        const nx = x + dx;
        const nz = z + dz;

        // Check bounds
        if (nx < 0 || nx >= W || nz < 0 || nz >= H) continue;

        const ni = nx + nz * W;
        // If any adjacent cell is not revealed, the mine is not boxed in
        if (!(states[ni] & REVEALED)) {
          allRevealed = false;
          break;
        }
      }
      if (!allRevealed) break;
    }

    // If all adjacent cells are revealed, mark the mine as finished
    if (allRevealed) {
      states[i] |= FINISHED;
    }
  }
}

// Toggle flag on a cell
export function toggleFlag(index: number) {
  const { disablePlayer, gameStarted } = gameState;
  const { REVEALED, FLAGGED } = cellStateConstants;
  
  if (disablePlayer) return;
  
  if (!gameState.gameStarted) {
    gameState.gameStarted = true;
  }

  // Skip if already revealed
  if (states[index] & REVEALED) return;

  // Toggle flag
  states[index] ^= FLAGGED;

  // Update display
  updateMeshes(gameState, cellStateConstants);

  // Check for any boxed-in mines that may need updating
  checkForBoxedInMines();
}

// Generate a random seed for the game
export function generateRandomSeed(): string {
  const seed = Math.floor(Math.random() * 1000000000).toString();
  window.location.hash = seed;
  return seed;
}
