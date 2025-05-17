import test from 'node:test';
import assert from 'node:assert/strict';
import * as config from '../dist/config.js';
import * as game from '../dist/game.js';

const { NUMBER_MASK, REVEALED, FLAGGED, MINE, FINISHED } = config.cellStateConstants;

function computeNumbers() {
  const { W, H, N } = config;
  for (let i = 0; i < N; i++) {
    if (game.states[i] & MINE) continue;
    game.states[i] &= ~NUMBER_MASK;
    const x = i % W;
    const z = Math.floor(i / W);
    let count = 0;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0) continue;
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nx >= W || nz < 0 || nz >= H) continue;
        const ni = nx + nz * W;
        if (game.states[ni] & MINE) count++;
      }
    }
    game.states[i] |= count;
  }
}

test.beforeEach(() => {
  game.states.fill(0);
});

test('reveals connected empty cells', () => {
  computeNumbers();
  const player = { x: 1, z: 1 };
  game.revealCell(player);
  assert.ok(game.states.every(s => (s & REVEALED) !== 0));
});

test('does not reveal around numbered cells or flags', () => {
  game.states[0] |= MINE;
  game.states[8] |= FLAGGED;
  computeNumbers();
  const player = { x: 1, z: 1 };
  game.revealCell(player);
  assert.ok(game.states[4] & REVEALED);
  assert.equal(game.states[8] & REVEALED, 0);
  assert.equal(game.states[1] & REVEALED, 0);
});

test('toggleFlag flips flag state', () => {
  const player = { x: 2, z: 2 };
  game.toggleFlag(player);
  assert.ok(game.states[8] & FLAGGED);
  game.toggleFlag(player);
  assert.equal(game.states[8] & FLAGGED, 0);
});

test('getFinishedMinesCount counts finished mines', () => {
  game.states[0] = MINE | FINISHED;
  game.states[1] = MINE;
  assert.equal(game.getFinishedMinesCount(), 1);
});
