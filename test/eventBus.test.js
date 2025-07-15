import test from 'node:test';
import assert from 'node:assert/strict';
import * as eventBus from '../dist/eventBus.js';

test('on and emit work correctly', () => {
  let called = false;
  let receivedDetail = null;
  
  const listener = (detail) => {
    called = true;
    receivedDetail = detail;
  };
  
  eventBus.on('test-event', listener);
  eventBus.emit('test-event', { data: 'test' });
  
  assert.ok(called);
  assert.deepEqual(receivedDetail, { data: 'test' });
});

test('multiple listeners work correctly', () => {
  let count = 0;
  
  const listener1 = () => count++;
  const listener2 = () => count++;
  
  eventBus.on('multi-test', listener1);
  eventBus.on('multi-test', listener2);
  eventBus.emit('multi-test');
  
  assert.equal(count, 2);
});

test('off removes listener correctly', () => {
  let called = false;
  
  const listener = () => {
    called = true;
  };
  
  eventBus.on('remove-test', listener);
  eventBus.off('remove-test', listener);
  eventBus.emit('remove-test');
  
  assert.equal(called, false);
});

test('off handles non-existent listener gracefully', () => {
  const listener = () => {};
  
  assert.doesNotThrow(() => {
    eventBus.off('non-existent', listener);
  });
});

test('emit handles non-existent event gracefully', () => {
  assert.doesNotThrow(() => {
    eventBus.emit('non-existent-event');
  });
});

test('emit works without detail parameter', () => {
  let called = false;
  let receivedDetail = null;
  
  const listener = (detail) => {
    called = true;
    receivedDetail = detail;
  };
  
  eventBus.on('no-detail', listener);
  eventBus.emit('no-detail');
  
  assert.ok(called);
  assert.equal(receivedDetail, undefined);
});

test('event constants are defined', () => {
  assert.equal(typeof eventBus.TELEPORT_PLAYERS, 'string');
  assert.equal(typeof eventBus.PLAYER_ADDED, 'string');
  assert.equal(typeof eventBus.PLAYER_REMOVED, 'string');
  assert.equal(typeof eventBus.RUMBLE_GAMEPADS, 'string');
});

test('listeners array is created lazily', () => {
  let called = false;
  
  const listener = () => {
    called = true;
  };
  
  eventBus.on('lazy-event', listener);
  eventBus.emit('lazy-event');
  
  assert.ok(called);
});

test('off only removes specific listener', () => {
  let count = 0;
  
  const listener1 = () => count++;
  const listener2 = () => count++;
  
  eventBus.on('specific-remove', listener1);
  eventBus.on('specific-remove', listener2);
  eventBus.off('specific-remove', listener1);
  eventBus.emit('specific-remove');
  
  assert.equal(count, 1);
});