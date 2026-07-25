export type Listener = (detail?: any) => void;

const listeners: Record<string, Listener[]> = {};

export function on(event: string, listener: Listener) {
  (listeners[event] ||= []).push(listener);
}

export function off(event: string, listener: Listener) {
  const list = listeners[event];
  if (!list) return;
  const i = list.indexOf(listener);
  if (i !== -1) list.splice(i, 1);
}

export function emit(event: string, detail?: any) {
  const list = listeners[event];
  if (!list) return;
  // Snapshot + isolate: a throwing or self-removing listener must not
  // starve the others (game logic and gfx both ride this bus)
  for (const listener of [...list]) {
    try {
      listener(detail);
    } catch (err) {
      console.error(`Listener for "${event}" failed`, err);
    }
  }
}

export const TELEPORT_PLAYERS = "teleportPlayers";
export const PLAYER_ADDED = "playerAdded";
export const PLAYER_REMOVED = "playerRemoved";
export const RUMBLE_GAMEPADS = "rumbleGamepads";
// Emitted whenever cell states change and the display should refresh
export const BOARD_CHANGED = "boardChanged";
// detail: { flightMs: number } — visual layers fade/fly on these
export const TELEPORT_STARTED = "teleportStarted";
export const TELEPORT_FINISHED = "teleportFinished";
// detail: number — zoom factor requested by an input device
export const ZOOM_BY = "zoomBy";
