import seedrandom from "seedrandom";
import SimplexNoise from "simplex-noise";
import {
    loadPreferences,
    loadState,
    saveState,
    updatePreferences,
} from "./persist";
import * as config from "./config";
import { Board } from "./board";
import { Player } from "./players";
import {
    BOARD_CHANGED,
    emit,
    RUMBLE_GAMEPADS,
    TELEPORT_FINISHED,
    TELEPORT_PLAYERS,
    TELEPORT_STARTED,
} from "./eventBus";

// Game state type
type GameState = {
    disablePlayer: boolean;
    debugMode: boolean;
    hoveredCellIndex: number;
    currentSeed: string;
};

export const board = new Board(config.W, config.H);

// The cell state array, shared with the render layer (stable reference)
export const states = board.states;

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

    // FIXME(ja): the board layout isn't good right now... too many mines touching each other

    // Distribute mines using simplex noise for more natural clustering
    const noiseScale = 0.25;
    const threshold = 1 - minePercentage;

    const mineCount = board.generate((x, z) => {
        const noiseValue =
            (simplex.noise2D(x * noiseScale, z * noiseScale) + 1) / 2; // 0-1 range
        return noiseValue > threshold;
    });

    console.log(
        `Generated ${mineCount} mines (${
            (mineCount / board.n * 100).toFixed(2)
        }%)`,
    );

    emit(BOARD_CHANGED);

    // Save the current seed and game state
    saveGameData(seed);
}

// Duration of the post-death camera flight; visual layers (fade overlay,
// camera) listen for TELEPORT_STARTED and time themselves off this.
const TELEPORT_FLIGHT_MS = 2000;

export const startTeleport = () => {
    gameState.disablePlayer = true;

    // Shift all players by a fixed offset and wrap around the board
    emit(TELEPORT_PLAYERS, {
        dX: Math.floor(Math.random() * config.W),
        dZ: Math.floor(Math.random() * config.H),
    });

    emit(TELEPORT_STARTED, { flightMs: TELEPORT_FLIGHT_MS });

    setTimeout(finishTeleport, TELEPORT_FLIGHT_MS);
};

export const finishTeleport = () => {
    gameState.disablePlayer = false;
    emit(TELEPORT_FINISHED);
};

// Reveal the cell under the player
export function revealCell(player: Player) {
    if (gameState.disablePlayer) return;

    const result = board.reveal(player.x, player.z);

    if (result === "mine") {
        emit(RUMBLE_GAMEPADS);
        startTeleport();
        return;
    }

    if (result === "revealed") {
        emit(BOARD_CHANGED);
        saveState(states);
    }
}

// Toggle flag on the cell under the player
export function toggleFlag(player: Player) {
    if (gameState.disablePlayer) return;

    if (board.toggleFlag(player.x, player.z)) {
        emit(BOARD_CHANGED);
        saveState(states);
    }
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

// Load game data from IndexedDB
export async function loadGameData(): Promise<boolean> {
    const savedState = await loadState();
    const prefs = await loadPreferences();

    if (savedState && savedState.length !== board.n) {
        console.warn(
            `Discarding saved game: ${savedState.length} cells, board expects ${board.n}`,
        );
    }

    if (savedState && board.load(savedState)) {
        const savedSeed = prefs?.seed;

        if (savedSeed) {
            gameState.currentSeed = savedSeed;
            emit(BOARD_CHANGED);
            return true;
        }
    }

    return false;
}

export function getFinishedMinesCount(): number {
    return board.getFinishedMinesCount();
}
