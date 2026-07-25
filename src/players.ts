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

/** Random fully-saturated color (HSL with s=1, l=0.5) as a 0xRRGGBB hex. */
function randomBrightColor(): number {
  const h = Math.random() * 6;
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
    color: color ?? randomBrightColor(),
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
