import * as config from "./config";
import { revealCell, toggleFlag } from "./game";
import {
  on,
  emit,
  TELEPORT_PLAYERS,
  PLAYER_ADDED,
  PLAYER_REMOVED,
  ZOOM_BY,
} from "./eventBus";

export type Actions = {
  dX?: number;
  dZ?: number;
  revealCell?: boolean;
  toggleFlag?: boolean;
  zoomBy?: number;
};

export type Player = {
  id: string;
  name: string;
  x: number;
  z: number;
  color: number;
  poll: () => Actions;
};

export const players: Record<string, Player> = {};

/** Minimum circular hue distance (fraction of the wheel) between players. */
const MIN_HUE_GAP = 0.1;

/** Hue (0-1) of a 0xRRGGBB color; 0 for grays. */
function hueOf(color: number): number {
  const r = (color >> 16) & 0xff, g = (color >> 8) & 0xff, b = color & 0xff;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h = max === r
    ? ((g - b) / d + 6) % 6
    : max === g
    ? (b - r) / d + 2
    : (r - g) / d + 4;
  return h / 6;
}

/** Shortest distance between two hues around the color wheel. */
function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 1;
  return Math.min(d, 1 - d);
}

/** Storing hues as 0xRRGGBB quantizes them by up to ~1/1530 each way. */
const HUE_TOLERANCE = 0.002;

/** Random per-session rotation of the hue slot grid. */
const hueBase = Math.random();

/**
 * Pick a hue at least MIN_HUE_GAP away from every current player's hue.
 * Hues come from a grid of 1/MIN_HUE_GAP evenly spaced slots (randomly
 * rotated per session), so the spacing is guaranteed until every slot is
 * taken — picking freely instead can strand the wheel with all gaps just
 * under 2*MIN_HUE_GAP after only ~5 players. When the wheel is full,
 * fall back to the middle of the largest gap between existing hues.
 */
function pickDistinctHue(): number {
  const existing = Object.values(players).map((p) => hueOf(p.color));
  if (existing.length === 0) return hueBase;

  const slotCount = Math.floor(1 / MIN_HUE_GAP);
  const free: number[] = [];
  for (let k = 0; k < slotCount; k++) {
    const h = (hueBase + k * MIN_HUE_GAP) % 1;
    const clear = existing.every((e) =>
      hueDistance(h, e) >= MIN_HUE_GAP - HUE_TOLERANCE
    );
    if (clear) free.push(h);
  }
  if (free.length > 0) return free[Math.floor(Math.random() * free.length)];

  // Wheel is full — most distinct hue still available
  const hues = existing.sort((a, b) => a - b);
  let largestStart = 0, largestSize = -1;
  for (let i = 0; i < hues.length; i++) {
    const end = i + 1 < hues.length ? hues[i + 1] : hues[0] + 1;
    const size = end - hues[i];
    if (size > largestSize) {
      largestSize = size;
      largestStart = hues[i];
    }
  }
  return (largestStart + largestSize / 2) % 1;
}

/** Fully-saturated color (HSL with s=1, l=0.5) at hue 0-1 as a 0xRRGGBB hex. */
function brightColor(hue: number): number {
  const h = hue * 6;
  const x = Math.round((1 - Math.abs((h % 2) - 1)) * 255);
  const c = 255;
  const [r, g, b] = h < 1
    ? [c, x, 0]
    : h < 2
    ? [x, c, 0]
    : h < 3
    ? [0, c, x]
    : h < 4
    ? [0, x, c]
    : h < 5
    ? [x, 0, c]
    : [c, 0, x];
  return (r << 16) | (g << 8) | b;
}

export function teleportAllPlayers(dX: number, dZ: number) {
  for (const player of Object.values(players)) {
    player.x = (player.x + dX + config.W) % config.W;
    player.z = (player.z + dZ + config.H) % config.H;
  }
}
on(TELEPORT_PLAYERS, ({ dX, dZ }) => teleportAllPlayers(dX, dZ));

export function addPlayer(
  { name, x, z, color, id, poll }: {
    id: string;
    name: string;
    x?: number;
    z?: number;
    color?: number;
    poll: () => Actions;
  },
): Player {
  let spawnX = x;
  let spawnZ = z;

  if ((spawnX === undefined || spawnZ === undefined) && Object.keys(players).length > 0) {
    let sumX = 0;
    let sumZ = 0;
    const list = Object.values(players);
    for (const p of list) {
      sumX += p.x;
      sumZ += p.z;
    }
    const centroidX = sumX / list.length;
    const centroidZ = sumZ / list.length;

    if (spawnX === undefined) {
      spawnX = Math.round(centroidX + (Math.random() * 20 - 10));
    }
    if (spawnZ === undefined) {
      spawnZ = Math.round(centroidZ + (Math.random() * 20 - 10));
    }
  }

  spawnX = spawnX ?? config.W / 2;
  spawnZ = spawnZ ?? config.H / 2;

  spawnX = Math.max(0, Math.min(config.W - 1, spawnX));
  spawnZ = Math.max(0, Math.min(config.H - 1, spawnZ));

  players[id] = {
    id,
    name,
    poll,
    x: spawnX,
    z: spawnZ,
    color: color ?? brightColor(pickDistinctHue()),
  };

  emit(PLAYER_ADDED, players[id]);

  return players[id];
}

export function removePlayer({ id }: { id: string }) {
  delete players[id];

  emit(PLAYER_REMOVED, { id });
}

export function pollPlayers() {
  for (const player of Object.values(players)) {
    pollPlayer(player);
  }
}

function pollPlayer(player: Player) {
  const actions = player.poll();

  if (actions.dX) {
    player.x += actions.dX;
  }
  if (actions.dZ) {
    player.z += actions.dZ;
  }

  // Clamp player position to grid bounds
  player.x = Math.max(0, Math.min(config.W - 1, player.x));
  player.z = Math.max(0, Math.min(config.H - 1, player.z));

  if (actions.revealCell) {
    revealCell(player);
  }
  if (actions.toggleFlag) {
    toggleFlag(player);
  }
  if (actions.zoomBy) {
    emit(ZOOM_BY, actions.zoomBy);
  }
}
