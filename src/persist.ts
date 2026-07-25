import { get, set } from "idb-keyval";

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
export function saveState({ buffer }: { buffer: ArrayBufferLike }) {
  dirty = buffer;
}

// Retrieve the game state
export async function loadState(): Promise<Uint8Array | null> {
  const buf = await get<ArrayBuffer>("gameState");
  return buf ? new Uint8Array(buf) : null;
}

// Serialize read-merge-write pairs: concurrent updates (camera autosave vs
// seed/darkMode writes) must not interleave and drop each other's fields
let prefsChain: Promise<unknown> = Promise.resolve();

export function updatePreferences(
  prefs: Partial<UserPreferences>,
): Promise<void> {
  const result = prefsChain.then(async () => {
    const currentPrefs = await loadPreferences() || { darkMode: false };
    await set("userPreferences", { ...currentPrefs, ...prefs });
  });
  prefsChain = result.catch(() => {});
  return result;
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
