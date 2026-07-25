import type { Player } from "./players";

export const TELEPORT_PLAYERS = "teleportPlayers" as const;
export const PLAYER_ADDED = "playerAdded" as const;
export const PLAYER_REMOVED = "playerRemoved" as const;
export const RUMBLE_GAMEPADS = "rumbleGamepads" as const;
// Emitted whenever cell states change and the display should refresh
export const BOARD_CHANGED = "boardChanged" as const;
// Visual layers fade/fly on these
export const TELEPORT_STARTED = "teleportStarted" as const;
export const TELEPORT_FINISHED = "teleportFinished" as const;
// Zoom factor requested by an input device
export const ZOOM_BY = "zoomBy" as const;

// Payload for each event; `undefined` means the event carries no detail
export type EventMap = {
  [TELEPORT_PLAYERS]: { dX: number; dZ: number };
  [PLAYER_ADDED]: Player;
  [PLAYER_REMOVED]: { id: string };
  [RUMBLE_GAMEPADS]: undefined;
  [BOARD_CHANGED]: undefined;
  [TELEPORT_STARTED]: { flightMs: number };
  [TELEPORT_FINISHED]: undefined;
  [ZOOM_BY]: number;
};

type EventName = keyof EventMap;
type Listener<K extends EventName> = (detail: EventMap[K]) => void;

// Internally untyped; the on/off/emit signatures enforce payload types
type AnyListener = (detail: never) => void;
const listeners: Record<string, AnyListener[]> = {};

export function on<K extends EventName>(event: K, listener: Listener<K>) {
  (listeners[event] ||= []).push(listener as AnyListener);
}

export function off<K extends EventName>(event: K, listener: Listener<K>) {
  const list = listeners[event];
  if (!list) return;
  const i = list.indexOf(listener as AnyListener);
  if (i !== -1) list.splice(i, 1);
}

export function emit<K extends EventName>(
  event: K,
  ...args: EventMap[K] extends undefined ? [] : [detail: EventMap[K]]
) {
  const list = listeners[event];
  if (!list) return;
  // Snapshot + isolate: a throwing or self-removing listener must not
  // starve the others (game logic and gfx both ride this bus)
  for (const listener of [...list]) {
    try {
      listener(args[0] as never);
    } catch (err) {
      console.error(`Listener for "${event}" failed`, err);
    }
  }
}
