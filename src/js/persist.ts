import { set, get } from 'idb-keyval';

// Track pending changes to be saved
let dirty: ArrayBuffer | null = null;

// Mark state as dirty for saving in the next cycle
export async function saveState(states: Uint8Array) {
  dirty = states.buffer;
}

// Retrieve the game state
export async function loadState(): Promise<Uint8Array | null> {
  const buf = await get<ArrayBuffer>("gameState");
  return buf ? new Uint8Array(buf) : null;
}

// Set up periodic saving (4 times per second)
setInterval(() => {
  if (dirty) {
    set('gameState', dirty);
    dirty = null;
  }
}, 250);