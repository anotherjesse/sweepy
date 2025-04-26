import seedrandom from "seedrandom";
import SimplexNoise from "simplex-noise";
import { type GamepadState, gamepadState } from "./gamepad";
import { renderState, updateMeshes } from "./render";
import { loadState, saveState } from "./persist";
import { fade, unfade } from "./ui";
import * as config from "./config";

// Game state type
export type GameState = {
    disablePlayer: boolean;
    gameStarted: boolean;
    debugMode: boolean;
    hoveredCellIndex: number;
    currentSeed: string;
};

// Use Uint8Array for memory efficiency (1 byte per cell) as specified in README
export const states = new Uint8Array(config.N);

// Game state object
export const gameState: GameState = {
    disablePlayer: false,
    gameStarted: false,
    debugMode: false,
    hoveredCellIndex: -1,
    currentSeed: "",
};

export function generateBoard(
    seed: string,
    minePercentage = 0.3,
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

    for (let i = 0; i < config.N; i++) {
        const x = i % config.W, z = Math.floor(i / config.W);

        // Use noise to determine mine placement
        const noiseValue =
            (simplex.noise2D(x * noiseScale, z * noiseScale) + 1) / 2; // Convert to 0-1 range

        if (noiseValue > threshold) {
            states[i] |= config.cellStateConstants.MINE;
            mineCount++;
        }
    }

    console.log(
        `Generated ${mineCount} mines (${(mineCount / config.N * 100).toFixed(2)}%)`,
    );

    // Calculate adjacent mines for each cell
    calculateAdjacentMines();

    // Update the mesh display
    updateMeshes(gameState);

    // Save the current seed and game state
    saveGameData(seed);
}

// Calculate adjacent mines for each cell
function calculateAdjacentMines() {
    const { MINE, NUMBER_MASK } = config.cellStateConstants;

    for (let i = 0; i < config.N; i++) {
        if (states[i] & MINE) continue; // Skip if this is a mine

        const x = i % config.W, z = Math.floor(i / config.W);
        let count = 0;

        // Check all 8 adjacent cells
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                if (dx === 0 && dz === 0) continue; // Skip self

                const nx = x + dx;
                const nz = z + dz;

                // Check bounds
                if (nx < 0 || nx >= config.W || nz < 0 || nz >= config.H) continue;

                const ni = nx + nz * config.W;
                if (states[ni] & config.cellStateConstants.MINE) count++;
            }
        }

        // Store adjacent mine count in the NUMBER_MASK bits
        states[i] = (states[i] & ~NUMBER_MASK) | count;
    }
}

// We'll define a type for the function that resets keyboard cursor
// to avoid circular dependencies
type KeyboardResetFunction = (x: number, z: number) => void;
let resetKeyboardCursorFn: KeyboardResetFunction | null = null;

// Function to register the keyboard reset function
export function registerKeyboardReset(resetFn: KeyboardResetFunction) {
    resetKeyboardCursorFn = resetFn;
}

export const startTeleport = () => {
    gameState.disablePlayer = true;
    fade();

    // Allow restart after a delay
    setTimeout(finishTeleport, 1000);
};

export const finishTeleport = () => {
    // Move the player to a random location on the board
    // Choose a new random position within a reasonable range (not the entire board)
    const viewRange = 100; // A more reasonable view range
    const randomX = Math.floor(Math.random() * (config.W - viewRange));
    const randomZ = Math.floor(Math.random() * (config.H - viewRange));
    const newCenterX = randomX + viewRange / 2;
    const newCenterZ = randomZ + viewRange / 2;

    // Ensure we have integer coordinates for the cursors
    const newCenterXInt = Math.floor(newCenterX);
    const newCenterZInt = Math.floor(newCenterZ);

    // Move both camera position and target coherently
    renderState.camera.position.set(
        newCenterX,
        renderState.camera.position.y,
        newCenterZ,
    );
    renderState.controls.target.set(
        newCenterX,
        0,
        newCenterZ,
    );
    // // Set zoom using the centralized zoom function
    // setZoom(20);

    // Update controls
    renderState.controls.update();

    // Move gamepad cursor to new position
    gamepadState.gamepadCursorX = newCenterXInt;
    gamepadState.gamepadCursorZ = newCenterZInt;
    gamepadState.gamepadCursorIndex = newCenterXInt + newCenterZInt * config.W;

    // Set the hovered cell index to match the new position
    gameState.hoveredCellIndex = newCenterXInt + newCenterZInt * config.W;

    // Move keyboard cursor to new position if the reset function is registered
    if (resetKeyboardCursorFn) {
        resetKeyboardCursorFn(newCenterXInt, newCenterZInt);
    }

    console.log(
        `Reset positions - Camera: (${newCenterX}, ${newCenterZ}), Cursor: (${newCenterXInt}, ${newCenterZInt})`,
    );

    unfade();

    gameState.disablePlayer = false;
};

// Reveal a cell
export function revealCell(
    index: number,
    gamepadState: GamepadState,
) {
    const { disablePlayer } = gameState;
    if (disablePlayer) return;

    if (!gameState.gameStarted) {
        gameState.gameStarted = true;
    }

    const state = states[index];

    // Skip if already revealed or flagged
    if (state & config.cellStateConstants.REVEALED || state & config.cellStateConstants.FLAGGED) return;

    // Check if mine first
    if (state & config.cellStateConstants.MINE) {
        startTeleport();
        return;
    }

    // Mark as revealed
    states[index] |= config.cellStateConstants.REVEALED;

    // Auto-reveal empty cells
    const adjacentMines = state & config.cellStateConstants.NUMBER_MASK;
    if (adjacentMines === 0) {
        // Flood fill to reveal adjacent empty cells
        floodFillReveal(index);
    }

    // Check for mines that are now completely boxed in
    checkForBoxedInMines();

    // Update display
    updateMeshes(gameState);

    // Save the updated state
    saveState(states);
}

// Flood fill to reveal adjacent empty cells
function floodFillReveal(index: number) {
    const { NUMBER_MASK, REVEALED, FLAGGED } = config.cellStateConstants;

    const queue = [index];
    const visited = new Set([index]);

    while (queue.length > 0) {
        const currentIndex = queue.shift()!;
        const x = currentIndex % config.W;
        const z = Math.floor(currentIndex / config.W);

        // Check all adjacent cells
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                if (dx === 0 && dz === 0) continue;

                const nx = x + dx;
                const nz = z + dz;

                // Check bounds
                if (nx < 0 || nx >= config.W || nz < 0 || nz >= config.H) continue;

                const ni = nx + nz * config.W;

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
    for (let i = 0; i < config.N; i++) {
        // Skip if not a mine or already marked as finished
        if (
            !(states[i] & config.cellStateConstants.MINE) ||
            (states[i] & config.cellStateConstants.FINISHED)
        ) continue;

        const x = i % config.W, z = Math.floor(i / config.W);
        let allRevealed = true;

        // Check all 8 adjacent cells
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                if (dx === 0 && dz === 0) continue; // Skip self

                const nx = x + dx;
                const nz = z + dz;

                // Check bounds
                if (nx < 0 || nx >= config.W || nz < 0 || nz >= config.H) {
                    continue;
                }

                const ni = nx + nz * config.W;
                // If any adjacent cell is not revealed, the mine is not boxed in
                if (!(states[ni] & config.cellStateConstants.REVEALED)) {
                    allRevealed = false;
                    break;
                }
            }
            if (!allRevealed) break;
        }

        // If all adjacent cells are revealed, mark the mine as finished
        if (allRevealed) {
            states[i] |= config.cellStateConstants.FINISHED;
        }
    }
}

// Toggle flag on a cell
export function toggleFlag(index: number) {
    const { disablePlayer } = gameState;
    const { REVEALED, FLAGGED } = config.cellStateConstants;

    if (disablePlayer) return;

    if (!gameState.gameStarted) {
        gameState.gameStarted = true;
    }

    // Skip if already revealed
    if (states[index] & REVEALED) return;

    // Toggle flag
    states[index] ^= FLAGGED;

    // Update display
    updateMeshes(gameState);

    // Check for any boxed-in mines that may need updating
    checkForBoxedInMines();

    // Save the updated state
    saveState(states);
}

// Generate a random seed for the game
export function generateRandomSeed(): string {
    const seed = Math.floor(Math.random() * 1000000000).toString();
    gameState.currentSeed = seed;
    return seed;
}

// Save game data to IndexedDB
export function saveGameData(seed: string) {
    gameState.currentSeed = seed;
    saveState(states);

    // Also store the seed separately in localStorage as a fallback
    localStorage.setItem("gameSeed", seed);

    // Import dynamically to avoid circular dependency
    import("./persist").then(({ updatePreferences }) => {
        updatePreferences({ seed });
    });
}

// Load game data from IndexedDB
export async function loadGameData(): Promise<boolean> {
    // Load game state
    const savedState = await loadState();

    // Try to load preferences (including seed)
    const { loadPreferences } = await import("./persist");
    const prefs = await loadPreferences();

    // First check if we have the board state
    if (savedState) {
        // Copy saved state to our game state array
        states.set(savedState);

        // Try to get seed from preferences first, then fallback to localStorage
        let savedSeed = prefs?.seed;
        if (!savedSeed) {
            const localStorageSeed = localStorage.getItem("gameSeed");
            if (localStorageSeed) {
                savedSeed = localStorageSeed;
            }
        }

        if (savedSeed) {
            gameState.currentSeed = savedSeed;
            gameState.gameStarted = true;

            // Update display
            updateMeshes(gameState);
            return true;
        }
    }

    return false;
}
