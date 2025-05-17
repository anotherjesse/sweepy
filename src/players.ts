import * as config from "./config";
import { revealCell, toggleFlag } from "./game";
import { zoomBy } from "./gfx/camera";
import { updateMeshes } from "./gfx/render";
import { updateJoinInstructions } from "./gfx/ui";
import * as THREE from "three";

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
  players[id] = {
    id,
    name,
    poll,
    tilesRevealed: 0,
    bombsDefused: 0,
    flagsPlaced: 0,
    disabled: false,
    x: x ?? config.W / 2,
    z: z ?? config.H / 2,
    color: color ?? Math.floor(Math.random() * 0xffffff),
    mesh: undefined,
  };

  updateMeshes();
  updateJoinInstructions();

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

  // Update instructions overlay when a player is removed
  import("./gfx/ui").then((ui) => ui.updateJoinInstructions());
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
