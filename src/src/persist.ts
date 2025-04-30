import { get, set } from "idb-keyval";
import { states } from "./game";

// Track pending changes to be saved
let dirty: ArrayBuffer | ArrayBufferLike | null = null;

// Define user preferences type
export interface UserPreferences {
  darkMode?: boolean;
  cameraPosition?: { x: number; y: number; z: number };
  targetPosition?: { x: number; y: number; z: number };
  zoom?: number;
  seed?: string;
}

// Mark state as dirty for saving in the next cycle
export function saveState({ buffer }: { buffer:  ArrayBufferLike }) {
  dirty = buffer;
}

// Retrieve the game state
export async function loadState(): Promise<Uint8Array | null> {
  const buf = await get<ArrayBuffer>("gameState");
  return buf ? new Uint8Array(buf) : null;
}

export async function updatePreferences(
  prefs: Partial<UserPreferences>,
): Promise<void> {
  const currentPrefs = await loadPreferences() || { darkMode: false };
  return set("userPreferences", { ...currentPrefs, ...prefs });
}

export async function loadPreferences(): Promise<UserPreferences | null> {
  const prefs = await get<UserPreferences>("userPreferences");
  return prefs || null;
}

// Set up periodic saving (4 times per second)
setInterval(() => {
  if (dirty) {
    set("gameState", dirty);
    dirty = null;
  }
}, 250);
