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
  for (const listener of list) listener(detail);
}

export const TELEPORT_PLAYERS = "teleportPlayers";
export const PLAYER_ADDED = "playerAdded";
export const PLAYER_REMOVED = "playerRemoved";
export const RUMBLE_GAMEPADS = "rumbleGamepads";
