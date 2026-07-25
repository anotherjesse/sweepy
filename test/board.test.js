import test from "node:test";
import assert from "node:assert/strict";
import {
  Board,
  FINISHED,
  FLAGGED,
  MINE,
  REVEALED,
} from "../src/board.ts";

test("reveals connected empty cells", () => {
  const board = new Board(3, 3);
  board.calculateAdjacentMines();

  board.reveal(1, 1);

  assert.ok(board.states.every((s) => (s & REVEALED) !== 0));
});

test("does not reveal around numbered cells or flags", () => {
  const board = new Board(3, 3);
  board.states[0] |= MINE;
  board.states[8] |= FLAGGED;
  board.calculateAdjacentMines();

  board.reveal(1, 1);

  assert.ok(board.states[4] & REVEALED);
  assert.equal(board.states[8] & REVEALED, 0);
  assert.equal(board.states[1] & REVEALED, 0);
});

test("revealing a mine reports it and leaves the board unchanged", () => {
  const board = new Board(3, 3);
  board.states[4] |= MINE;
  board.calculateAdjacentMines();

  assert.equal(board.reveal(1, 1), "mine");
  assert.equal(board.states[4] & REVEALED, 0);
});

test("toggleFlag flips flag state", () => {
  const board = new Board(3, 3);

  assert.ok(board.toggleFlag(2, 2));
  assert.ok(board.states[8] & FLAGGED);

  assert.ok(board.toggleFlag(2, 2));
  assert.equal(board.states[8] & FLAGGED, 0);
});

test("toggleFlag refuses revealed cells", () => {
  const board = new Board(3, 3);
  board.states[4] |= REVEALED;

  assert.equal(board.toggleFlag(1, 1), false);
  assert.equal(board.states[4] & FLAGGED, 0);
});

test("getFinishedMinesCount counts finished mines", () => {
  const board = new Board(3, 3);
  board.states[0] = MINE | FINISHED;
  board.states[1] = MINE;

  assert.equal(board.getFinishedMinesCount(), 1);
});

test("flagged mine surrounded by revealed cells becomes finished", () => {
  const board = new Board(3, 3);
  board.states[4] |= MINE; // center mine
  board.calculateAdjacentMines();

  // Reveal every non-mine cell, then flag the mine
  for (let z = 0; z < 3; z++) {
    for (let x = 0; x < 3; x++) {
      if (x === 1 && z === 1) continue;
      board.reveal(x, z);
    }
  }
  board.toggleFlag(1, 1);

  assert.ok(board.states[4] & FINISHED);
  assert.equal(board.getFinishedMinesCount(), 1);
});

test("mine cluster is only finished when every mine is flagged", () => {
  const board = new Board(4, 1);
  board.states[0] |= MINE;
  board.states[1] |= MINE; // adjacent mine, same cluster
  board.calculateAdjacentMines();

  board.reveal(2, 0);
  board.reveal(3, 0);
  board.toggleFlag(0, 0); // only one of the two mines flagged

  assert.equal(board.states[0] & FINISHED, 0);

  board.toggleFlag(1, 0); // now both flagged

  assert.ok(board.states[0] & FINISHED);
  assert.ok(board.states[1] & FINISHED);
});

test("generate places mines and computes numbers", () => {
  const board = new Board(3, 3);
  const count = board.generate((x, z) => x === 0 && z === 0);

  assert.equal(count, 1);
  assert.ok(board.states[0] & MINE);
  assert.equal(board.states[4] & 0x0f, 1); // center touches one mine
  assert.equal(board.states[8] & 0x0f, 0);
});

test("load rejects size mismatch and clears stale FINISHED bits", () => {
  const board = new Board(3, 3);

  assert.equal(board.load(new Uint8Array(4)), false);

  const saved = new Uint8Array(9);
  saved[0] = MINE | FLAGGED | FINISHED; // stale FINISHED, not surrounded
  assert.equal(board.load(saved), true);
  assert.equal(board.states[0] & FINISHED, 0);
});
