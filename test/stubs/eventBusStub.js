export const listeners = {};

export function on(event, listener) {
  (listeners[event] ||= []).push(listener);
}

export function off(event, listener) {
  const list = listeners[event];
  if (!list) return;
  const i = list.indexOf(listener);
  if (i !== -1) list.splice(i, 1);
}

export function emit(event, detail) {
  const list = listeners[event];
  if (!list) return;
  for (const listener of list) listener(detail);
}

export const TELEPORT_PLAYERS = "teleportPlayers";
export const PLAYER_ADDED = "playerAdded";
export const PLAYER_REMOVED = "playerRemoved";
export const RUMBLE_GAMEPADS = "rumbleGamepads";