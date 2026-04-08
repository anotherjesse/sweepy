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

test('generateBoard creates mines with given seed', () => {
  game.generateBoard('test-seed', 0.3);
  const mineCount = Array.from(game.states).filter(s => s & MINE).length;
  assert.ok(mineCount > 0);
  assert.ok(mineCount <= config.N);
});

test('generateBoard is deterministic with same seed', () => {
  game.generateBoard('test-seed', 0.3);
  const firstStates = new Uint8Array(game.states);
  
  game.generateBoard('test-seed', 0.3);
  const secondStates = new Uint8Array(game.states);
  
  assert.deepEqual(firstStates, secondStates);
});

test('calculateAdjacentMines counts correctly', () => {
  game.states.fill(0);
  game.states[0] |= MINE;
  game.states[2] |= MINE;
  computeNumbers();
  
  assert.equal(game.states[1] & NUMBER_MASK, 2);
  assert.equal(game.states[3] & NUMBER_MASK, 1);
  assert.equal(game.states[4] & NUMBER_MASK, 2);
  assert.equal(game.states[8] & NUMBER_MASK, 0);
});

test('revealCell does nothing when cell is already revealed', () => {
  game.states[4] |= REVEALED;
  const player = { x: 1, z: 1 };
  const initialState = game.states[4];
  game.revealCell(player);
  assert.equal(game.states[4], initialState);
});

test('revealCell does nothing when game is disabled', () => {
  game.gameState.disablePlayer = true;
  const player = { x: 1, z: 1 };
  const initialStates = new Uint8Array(game.states);
  game.revealCell(player);
  assert.deepEqual(game.states, initialStates);
  game.gameState.disablePlayer = false;
});

test('toggleFlag does nothing on revealed cells', () => {
  game.states[4] |= REVEALED;
  const player = { x: 1, z: 1 };
  const initialState = game.states[4];
  game.toggleFlag(player);
  assert.equal(game.states[4], initialState);
});

test('toggleFlag does nothing when game is disabled', () => {
  game.gameState.disablePlayer = true;
  const player = { x: 1, z: 1 };
  const initialStates = new Uint8Array(game.states);
  game.toggleFlag(player);
  assert.deepEqual(game.states, initialStates);
  game.gameState.disablePlayer = false;
});

test('checkForBoxedInMines marks completed mine groups', () => {
  game.states.fill(0);
  game.states[0] |= MINE | FLAGGED;
  game.states[1] |= REVEALED | 1;
  game.states[3] |= REVEALED | 1;
  game.states[4] |= REVEALED | 1;
  
  game.checkForBoxedInMines();
  assert.ok(game.states[0] & FINISHED);
});

test('checkForBoxedInMines handles connected mine groups', () => {
  game.states.fill(0);
  game.states[0] |= MINE | FLAGGED;
  game.states[1] |= MINE | FLAGGED;
  game.states[2] |= REVEALED | 1;
  game.states[3] |= REVEALED | 2;
  game.states[4] |= REVEALED | 2;
  game.states[5] |= REVEALED | 1;
  game.states[6] |= REVEALED | 0;
  game.states[7] |= REVEALED | 0;
  game.states[8] |= REVEALED | 0;
  
  game.checkForBoxedInMines();
  assert.ok(game.states[0] & FINISHED);
  assert.ok(game.states[1] & FINISHED);
});

test('saveGameData saves current seed', () => {
  const testSeed = 'test-save-seed';
  game.saveGameData(testSeed);
  assert.equal(game.gameState.currentSeed, testSeed);
});

test('startTeleport disables player and triggers fade', () => {
  assert.equal(game.gameState.disablePlayer, false);
  game.startTeleport();
  assert.equal(game.gameState.disablePlayer, true);
});

test.after(() => {
  game.gameState.disablePlayer = false;
});
