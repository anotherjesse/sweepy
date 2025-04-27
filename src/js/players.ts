import * as config from "./config";
import { revealCell, toggleFlag } from "./game";
import { zoomBy } from "./gfx/camera";

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
) {
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
}

export function removePlayer({ id }: { id: string }) {
    delete players[id];
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
    if (actions.revealCell) {
        revealCell(player);
    }
    if (actions.toggleFlag) {
        toggleFlag(player);
    }
    if (actions.zoomBy) {
        zoomBy(actions.zoomBy);
    }
    // FIXME(ja): deal with the from input ...
    // if (player.mesh) {
    //     player.mesh.position.set(player.x, 0, player.z);
    // }
}
