import * as config from "./config";
import { revealCell, toggleFlag } from "./game";
import { zoomBy } from "./gfx/camera";
import * as THREE from "three";
import {
  on,
  emit,
  TELEPORT_PLAYERS,
  PLAYER_ADDED,
  PLAYER_REMOVED,
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
  disabled: boolean;
  tilesRevealed: number;
  bombsDefused: number;
  flagsPlaced: number;
  x: number;
  z: number;
  color: number;
  mesh: THREE.Mesh | undefined;
  poll: () => Actions;
};

export const players: Record<string, Player> = {};

export function teleportAllPlayers(dX: number, dZ: number) {
  for (const player of Object.values(players)) {
    player.x = (player.x + dX + config.W) % config.W;
    player.z = (player.z + dZ + config.H) % config.H;
    if (player.mesh) {
      player.mesh.position.set(player.x, 0.4, player.z);
    }
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
    tilesRevealed: 0,
    bombsDefused: 0,
    flagsPlaced: 0,
    disabled: false,
    x: spawnX,
    z: spawnZ,
    color: color ?? Math.floor(Math.random() * 0xffffff),
    mesh: undefined,
  };

  emit(PLAYER_ADDED, players[id]);

  return players[id];
}

export function removePlayer({ id }: { id: string }) {
  const player = players[id];

  // Remove the mesh from the scene if it exists
  if (player && player.mesh) {
    const scene = player.mesh.parent;
    if (scene) {
      scene.remove(player.mesh);
    }
  }

  delete players[id];

  emit(PLAYER_REMOVED, { id });
}

export function pollPlayers() {
  for (const player of Object.values(players)) {
    pollPlayer(player);
  }

  // Update player info if UI is visible
  const ui = globalThis.document.getElementById("ui");
  if (ui && ui.classList.contains("visible")) {
    // Import dynamically to avoid circular dependencies
    import("./gfx/ui").then((ui) => {
      if (typeof ui.updatePlayerInfo === "function") {
        ui.updatePlayerInfo();
      }
    });
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
    zoomBy(actions.zoomBy);
  }

  // Update player mesh position if it exists
  if (player.mesh) {
    player.mesh.position.set(player.x, 0.4, player.z);
  }
}
