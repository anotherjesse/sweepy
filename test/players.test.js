import test from 'node:test';
import assert from 'node:assert/strict';
import * as players from '../dist/players.js';
import * as config from '../dist/config.js';
import * as eventBus from '../dist/eventBus.js';

test.beforeEach(() => {
  Object.keys(players.players).forEach(id => delete players.players[id]);
  globalThis.document = {
    getElementById: () => null
  };
});

test.afterEach(() => {
  delete globalThis.document;
});

test('addPlayer creates player with default position', () => {
  const poll = () => ({});
  const player = players.addPlayer({ id: 'test1', name: 'Test Player', poll });
  
  assert.equal(player.id, 'test1');
  assert.equal(player.name, 'Test Player');
  assert.equal(player.poll, poll);
  assert.equal(player.tilesRevealed, 0);
  assert.equal(player.bombsDefused, 0);
  assert.equal(player.flagsPlaced, 0);
  assert.equal(player.disabled, false);
  assert.equal(player.x, config.W / 2);
  assert.equal(player.z, config.H / 2);
  assert.ok(player.color);
  assert.equal(player.mesh, undefined);
});

test('addPlayer with custom position', () => {
  const poll = () => ({});
  const player = players.addPlayer({ 
    id: 'test2', 
    name: 'Test Player 2', 
    x: 0, 
    z: 0, 
    color: 0xff0000,
    poll 
  });
  
  assert.equal(player.x, 0);
  assert.equal(player.z, 0);
  assert.equal(player.color, 0xff0000);
});

test('addPlayer clamps position to board bounds', () => {
  const poll = () => ({});
  const player = players.addPlayer({ 
    id: 'test3', 
    name: 'Test Player 3', 
    x: -10, 
    z: 100,
    poll 
  });
  
  assert.equal(player.x, 0);
  assert.equal(player.z, config.H - 1);
});

test('addPlayer spawns near existing players', () => {
  const poll = () => ({});
  
  players.addPlayer({ id: 'p1', name: 'Player 1', x: 1, z: 1, poll });
  
  const player2 = players.addPlayer({ id: 'p2', name: 'Player 2', poll });
  
  const distance = Math.abs(player2.x - 1) + Math.abs(player2.z - 1);
  assert.ok(distance <= 20);
});

test('removePlayer removes player from players object', () => {
  const poll = () => ({});
  players.addPlayer({ id: 'toRemove', name: 'Remove Me', poll });
  
  assert.ok(players.players['toRemove']);
  
  players.removePlayer({ id: 'toRemove' });
  
  assert.equal(players.players['toRemove'], undefined);
});

test('teleportAllPlayers moves all players', () => {
  const poll = () => ({});
  players.addPlayer({ id: 'p1', name: 'Player 1', x: 0, z: 0, poll });
  players.addPlayer({ id: 'p2', name: 'Player 2', x: 1, z: 1, poll });
  
  players.teleportAllPlayers(1, 1);
  
  assert.equal(players.players['p1'].x, 1);
  assert.equal(players.players['p1'].z, 1);
  assert.equal(players.players['p2'].x, 2);
  assert.equal(players.players['p2'].z, 2);
});

test('teleportAllPlayers wraps around board edges', () => {
  const poll = () => ({});
  players.addPlayer({ id: 'p1', name: 'Player 1', x: config.W - 1, z: config.H - 1, poll });
  
  players.teleportAllPlayers(1, 1);
  
  assert.equal(players.players['p1'].x, 0);
  assert.equal(players.players['p1'].z, 0);
});

test('pollPlayers processes player actions', () => {
  let moveCount = 0;
  
  const poll = () => {
    moveCount++;
    if (moveCount === 1) return { dX: 1 };
    if (moveCount === 2) return { dZ: 1 };
    return {};
  };
  
  const player = players.addPlayer({ id: 'mover', name: 'Mover', x: 0, z: 0, poll });
  
  players.pollPlayers();
  assert.equal(player.x, 1);
  assert.equal(player.z, 0);
  
  players.pollPlayers();
  assert.equal(player.x, 1);
  assert.equal(player.z, 1);
});

test('pollPlayers clamps movement to board bounds', () => {
  const poll = () => ({ dX: -10, dZ: -10 });
  
  const player = players.addPlayer({ id: 'bounded', name: 'Bounded', x: 0, z: 0, poll });
  
  players.pollPlayers();
  
  assert.equal(player.x, 0);
  assert.equal(player.z, 0);
});

test('pollPlayers handles zoomBy action', () => {
  let zoomRequested = false;
  
  const originalZoomBy = globalThis.zoomBy;
  globalThis.zoomBy = (amount) => {
    zoomRequested = amount;
  };
  
  const poll = () => ({ zoomBy: 0.5 });
  players.addPlayer({ id: 'zoomer', name: 'Zoomer', poll });
  
  players.pollPlayers();
  
  assert.equal(zoomRequested, 0.5);
  
  globalThis.zoomBy = originalZoomBy;
});

test('TELEPORT_PLAYERS event triggers teleportAllPlayers', () => {
  const poll = () => ({});
  players.addPlayer({ id: 'p1', name: 'Player 1', x: 0, z: 0, poll });
  
  eventBus.emit(eventBus.TELEPORT_PLAYERS, { dX: 2, dZ: 2 });
  
  assert.equal(players.players['p1'].x, 2);
  assert.equal(players.players['p1'].z, 2);
});

test('addPlayer emits PLAYER_ADDED event', () => {
  let addedPlayer = null;
  
  const listener = (player) => {
    addedPlayer = player;
  };
  
  eventBus.on(eventBus.PLAYER_ADDED, listener);
  
  const poll = () => ({});
  const player = players.addPlayer({ id: 'new', name: 'New Player', poll });
  
  assert.equal(addedPlayer, player);
  
  eventBus.off(eventBus.PLAYER_ADDED, listener);
});

test('removePlayer emits PLAYER_REMOVED event', () => {
  let removedId = null;
  
  const listener = (detail) => {
    removedId = detail.id;
  };
  
  eventBus.on(eventBus.PLAYER_REMOVED, listener);
  
  const poll = () => ({});
  players.addPlayer({ id: 'toRemove', name: 'Remove Me', poll });
  players.removePlayer({ id: 'toRemove' });
  
  assert.equal(removedId, 'toRemove');
  
  eventBus.off(eventBus.PLAYER_REMOVED, listener);
});