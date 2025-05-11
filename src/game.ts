import seedrandom from "seedrandom";
import SimplexNoise from "simplex-noise";
import { updateMeshes } from "./gfx/render";
import { loadState, saveState, updatePreferences } from "./persist";
import { fade, unfade } from "./gfx/ui";
import * as config from "./config";
import { Player } from "./players";
const { NUMBER_MASK, REVEALED, FLAGGED, MINE, FINISHED } =
    config.cellStateConstants;

// Game state type
type GameState = {
    disablePlayer: boolean;
    debugMode: boolean;
    hoveredCellIndex: number;
    currentSeed: string;
};

// Use Uint8Array for memory efficiency (1 byte per cell) as specified in README
export const states = new Uint8Array(config.N);

// Game state object
export const gameState: GameState = {
    disablePlayer: false,
    debugMode: false,
    hoveredCellIndex: -1,
    currentSeed: "",
};

export function generateBoard(
    seed: string | null = null,
    minePercentage = 0.3,
) {
    console.log(`Generating board with seed: ${seed}`);
    const rng = seedrandom(seed ?? generateRandomSeed());
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
            states[i] |= MINE;
            mineCount++;
        }
    }

    console.log(
        `Generated ${mineCount} mines (${
            (mineCount / config.N * 100).toFixed(2)
        }%)`,
    );

    // Calculate adjacent mines for each cell
    calculateAdjacentMines();

    // Update the mesh display
    updateMeshes();
    console.log("Board generated, meshes updated");

    // Save the current seed and game state
    saveGameData(seed);
}

// Calculate adjacent mines for each cell
function calculateAdjacentMines() {
    for (let i = 0; i < config.N; i++) {
        if (states[i] & MINE) continue; // Skip if this is a mine

        // First clear the NUMBER_MASK bits
        states[i] &= ~NUMBER_MASK;

        const x = i % config.W, z = Math.floor(i / config.W);
        let count = 0;

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
                // Ensure index is valid
                if (ni >= 0 && ni < config.N && (states[ni] & MINE)) {
                    count++;
                }
            }
        }

        // Ensure count doesn't exceed the mask capacity (15)
        if (count > 8) {
            console.error(`Count is too high: ${count} for cell ${i}`);
            count = 8;
        }

        // Store adjacent mine count in the NUMBER_MASK bits
        states[i] |= count;
    }
}

export const startTeleport = () => {
    gameState.disablePlayer = true;
    fade();

    // Allow restart after a delay
    setTimeout(finishTeleport, 1000);
};

export const finishTeleport = () => {
    unfade();

    gameState.disablePlayer = false;
};

// Reveal a cell
export function revealCell(
    player: Player,
) {
    const { disablePlayer } = gameState;
    if (disablePlayer) return;

    const index = player.x + (player.z) * config.W;

    const state = states[index];

    if (
        state & REVEALED ||
        state & FLAGGED
    ) return;

    if (state & MINE) {
        return startTeleport();
    }

    states[index] |= REVEALED;

    const adjacentMines = state & NUMBER_MASK;
    if (adjacentMines === 0) {
        floodFillReveal(index);
    }

    checkForBoxedInMines();
    updateMeshes();
    saveState(states);
}

function floodFillReveal(index: number) {
    const queue = [index];
    const visited = new Set([index]);

    while (queue.length > 0) {
        const currentIndex = queue.shift()!;
        const x = currentIndex % config.W;
        const z = Math.floor(currentIndex / config.W);

        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                if (dx === 0 && dz === 0) continue;

                const nx = x + dx;
                const nz = z + dz;

                if (nx < 0 || nx >= config.W || nz < 0 || nz >= config.H) {
                    continue;
                }

                const ni = nx + nz * config.W;

                // Skip if already visited, revealed, flagged, or a mine
                if (
                    visited.has(ni) || (states[ni] & REVEALED) ||
                    (states[ni] & FLAGGED) || (states[ni] & MINE)
                ) continue;

                visited.add(ni);

                states[ni] |= REVEALED;

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
    const visitedMines = new Set<number>();

    const findLocalMines = (index: number) => {
        const { MINE } = config.cellStateConstants;

        const queue = [index];
        const localMines = new Set<number>([index]);

        while (queue.length > 0) {
            const currentIndex = queue.shift()!;
            const x = currentIndex % config.W;
            const z = Math.floor(currentIndex / config.W);

            for (let dx = -1; dx <= 1; dx++) {
                for (let dz = -1; dz <= 1; dz++) {
                    if (dx === 0 && dz === 0) continue;

                    const nx = x + dx;
                    const nz = z + dz;

                    if (nx < 0 || nx >= config.W || nz < 0 || nz >= config.H) {
                        continue;
                    }

                    const ni = nx + nz * config.W;

                    // skip if not a mine, or already visited
                    if (localMines.has(ni) || !(states[ni] & MINE)) continue;

                    localMines.add(ni);
                    visitedMines.add(ni);
                    queue.push(ni);
                }
            }
        }

        return localMines;
    };

    // First, let's check each mine individually
    for (let idx = 0; idx < config.N; idx++) {
        if (visitedMines.has(idx)) continue;

        // Skip if not a mine or already marked as finished
        if (
            !(states[idx] & MINE) || (states[idx] & FINISHED) ||
            !(states[idx] & FLAGGED)
        ) continue;

        // we are in an flagged mine that has not been marked as finished
        visitedMines.add(idx);

        const localMines = findLocalMines(idx);

        const x = idx % config.W;
        const z = Math.floor(idx / config.W);

        // at least one of localMines is not finished!
        // let's check if they are all flagged
        const allFlagged = Array.from(localMines).every((mine) => {
            const x = mine % config.W;
            const z = Math.floor(mine / config.W);

            return states[mine] & FLAGGED;
        });

        if (!allFlagged) continue;

        // check if all the cells +/- 1 in all directions are revealed
        const allRevealed = Array.from(localMines).every((mine) => {
            const x = mine % config.W;
            const z = Math.floor(mine / config.W);

            for (let dx = -1; dx <= 1; dx++) {
                for (let dz = -1; dz <= 1; dz++) {
                    if (dx === 0 && dz === 0) continue;

                    const nx = x + dx;
                    const nz = z + dz;

                    if (nx < 0 || nx >= config.W || nz < 0 || nz >= config.H) {
                        continue;
                    }

                    const ni = nx + nz * config.W;

                    if (
                        (!(states[ni] & MINE)) && !(states[ni] & REVEALED) ||
                        ((states[ni] & MINE) && !(states[ni] & FLAGGED))
                    ) {
                        return false;
                    }
                }
            }

            return true;
        });

        if (!allRevealed) continue;

        // all mines are flagged and all adjacent cells are revealed
        // we can now finish the mine
        localMines.forEach((mine) => {
            states[mine] |= FINISHED;
        });
    }

    // For debugging - count total finished mines
    let finishedCount = 0;
    for (let i = 0; i < config.N; i++) {
        if ((states[i] & MINE) && (states[i] & FINISHED)) {
            finishedCount++;
        }
    }
}

// Toggle flag on a cell
export function toggleFlag(player: Player) {
    const { disablePlayer } = gameState;
    const { REVEALED, FLAGGED } = config.cellStateConstants;

    if (disablePlayer) return;

    const index = player.x + (player.z) * config.W;

    if (states[index] & REVEALED) return;

    states[index] ^= FLAGGED;
    updateMeshes();
    checkForBoxedInMines();
    saveState(states);
}

function generateRandomSeed(): string {
    const seed = Math.floor(Math.random() * 1000000000).toString();
    gameState.currentSeed = seed;
    return seed;
}

// Save game data to IndexedDB
export function saveGameData(seed: string | null = null) {
    gameState.currentSeed = seed ?? generateRandomSeed();
    saveState(states);

    updatePreferences({ seed: gameState.currentSeed });
}

const makeGameStateValid = (state: Uint8Array | null): Uint8Array | null => {
    if (!state) return null;
    const validState = new Uint8Array(state);
    for (let i = 0; i < config.N; i++) {
        validState[i] &= ~FINISHED;
    }
    return validState;
};

// Load game data from IndexedDB
export async function loadGameData(): Promise<boolean> {
    // Load game state
    let savedState = await loadState();
    savedState = makeGameStateValid(savedState);
    // Try to load preferences (including seed)
    const { loadPreferences } = await import("./persist");
    const prefs = await loadPreferences();

    // First check if we have the board state
    if (savedState) {
        // Copy saved state to our game state array
        states.set(savedState);
        checkForBoxedInMines();

        // Try to get seed from preferences first, then fallback to localStorage
        const savedSeed = prefs?.seed;

        if (savedSeed) {
            gameState.currentSeed = savedSeed;

            // Update display
            updateMeshes();
            return true;
        }
    }

    return false;
}
