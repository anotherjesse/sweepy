// Pure minesweeper board logic. No imports — this module is the testable
// core: cell state lives in a Uint8Array (1 byte per cell), and every
// operation here is synchronous and side-effect free beyond that array.

// Cell state bit layout
export const NUMBER_MASK = 0x0f; // bits 0-3: adjacent mine count
export const REVEALED = 0x10;
export const FLAGGED = 0x20;
export const MINE = 0x40;
export const FINISHED = 0x80; // mine in a fully flagged + surrounded cluster

export class Board {
  readonly w: number;
  readonly h: number;
  readonly n: number;
  readonly states: Uint8Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.n = w * h;
    this.states = new Uint8Array(this.n);
  }

  index(x: number, z: number): number {
    return x + z * this.w;
  }

  inBounds(x: number, z: number): boolean {
    return x >= 0 && x < this.w && z >= 0 && z < this.h;
  }

  /** Visit the up-to-8 neighbours of a cell index. */
  private forEachNeighbor(index: number, visit: (ni: number) => void) {
    const x = index % this.w;
    const z = Math.floor(index / this.w);

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0) continue;
        const nx = x + dx;
        const nz = z + dz;
        if (!this.inBounds(nx, nz)) continue;
        visit(this.index(nx, nz));
      }
    }
  }

  /**
   * Regenerate the board. `mineAt` decides mine placement per cell (this is
   * where procedural noise gets injected). Returns the mine count.
   */
  generate(mineAt: (x: number, z: number) => boolean): number {
    this.states.fill(0);

    let mineCount = 0;
    for (let i = 0; i < this.n; i++) {
      if (mineAt(i % this.w, Math.floor(i / this.w))) {
        this.states[i] |= MINE;
        mineCount++;
      }
    }

    this.calculateAdjacentMines();
    return mineCount;
  }

  calculateAdjacentMines() {
    for (let i = 0; i < this.n; i++) {
      if (this.states[i] & MINE) continue;

      let count = 0;
      this.forEachNeighbor(i, (ni) => {
        if (this.states[ni] & MINE) count++;
      });

      this.states[i] = (this.states[i] & ~NUMBER_MASK) | count;
    }
  }

  /**
   * Reveal the cell at (x, z).
   * Returns "mine" when a mine was hit, "revealed" when at least one cell
   * was uncovered, and "noop" when nothing changed (already revealed,
   * flagged, or out of bounds).
   */
  reveal(x: number, z: number): "mine" | "revealed" | "noop" {
    if (!this.inBounds(x, z)) return "noop";
    const index = this.index(x, z);
    const state = this.states[index];

    if (state & REVEALED || state & FLAGGED) return "noop";
    if (state & MINE) return "mine";

    this.states[index] |= REVEALED;

    if ((state & NUMBER_MASK) === 0) {
      this.floodFillReveal(index);
    }

    this.checkForBoxedInMines();
    return "revealed";
  }

  private floodFillReveal(index: number) {
    const queue = [index];
    const visited = new Set([index]);

    while (queue.length > 0) {
      const currentIndex = queue.shift()!;

      this.forEachNeighbor(currentIndex, (ni) => {
        if (
          visited.has(ni) || (this.states[ni] & REVEALED) ||
          (this.states[ni] & FLAGGED) || (this.states[ni] & MINE)
        ) return;

        visited.add(ni);
        this.states[ni] |= REVEALED;

        if ((this.states[ni] & NUMBER_MASK) === 0) {
          queue.push(ni);
        }
      });
    }
  }

  /**
   * Toggle the flag at (x, z). Returns true when the flag state changed
   * (revealed cells can't be flagged).
   */
  toggleFlag(x: number, z: number): boolean {
    if (!this.inBounds(x, z)) return false;
    const index = this.index(x, z);

    if (this.states[index] & REVEALED) return false;

    this.states[index] ^= FLAGGED;
    this.checkForBoxedInMines();
    return true;
  }

  /**
   * Mark mine clusters as FINISHED once every mine in the cluster is
   * flagged and every non-mine neighbour of the cluster is revealed.
   */
  checkForBoxedInMines() {
    const visitedMines = new Set<number>();

    for (let idx = 0; idx < this.n; idx++) {
      if (visitedMines.has(idx)) continue;

      // Only start from flagged, unfinished mines
      if (
        !(this.states[idx] & MINE) || (this.states[idx] & FINISHED) ||
        !(this.states[idx] & FLAGGED)
      ) continue;

      visitedMines.add(idx);
      const cluster = this.findMineCluster(idx);
      cluster.forEach((mine) => visitedMines.add(mine));

      const allFlagged = Array.from(cluster).every((mine) =>
        this.states[mine] & FLAGGED
      );
      if (!allFlagged) continue;

      const allSurrounded = Array.from(cluster).every((mine) =>
        this.isMineSurrounded(mine)
      );
      if (!allSurrounded) continue;

      cluster.forEach((mine) => {
        this.states[mine] |= FINISHED;
      });
    }
  }

  /** Flood-fill the 8-connected cluster of mines containing `index`. */
  private findMineCluster(index: number): Set<number> {
    const queue = [index];
    const cluster = new Set<number>([index]);

    while (queue.length > 0) {
      const currentIndex = queue.shift()!;

      this.forEachNeighbor(currentIndex, (ni) => {
        if (cluster.has(ni) || !(this.states[ni] & MINE)) return;
        cluster.add(ni);
        queue.push(ni);
      });
    }

    return cluster;
  }

  /** Every neighbour is either a flagged mine or a revealed non-mine. */
  private isMineSurrounded(index: number): boolean {
    let surrounded = true;
    this.forEachNeighbor(index, (ni) => {
      const s = this.states[ni];
      if (
        (!(s & MINE) && !(s & REVEALED)) ||
        ((s & MINE) && !(s & FLAGGED))
      ) {
        surrounded = false;
      }
    });
    return surrounded;
  }

  getFinishedMinesCount(): number {
    let count = 0;
    for (let i = 0; i < this.n; i++) {
      if ((this.states[i] & MINE) && (this.states[i] & FINISHED)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Replace the board with a previously saved state. FINISHED bits are
   * recomputed rather than trusted. Returns false when the size mismatches.
   */
  load(saved: Uint8Array): boolean {
    if (saved.length !== this.n) return false;
    this.states.set(saved);
    for (let i = 0; i < this.n; i++) {
      this.states[i] &= ~FINISHED;
    }
    this.checkForBoxedInMines();
    return true;
  }
}
