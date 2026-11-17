import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readParams } from '../src/app/params.ts';

test('no query: WebGPU, no HUD, a morning that moves', () => {
  assert.deepEqual(readParams(''), { forceWebGL: false, hud: false, hour: 10, dayMinutes: 24, probe: false });
});

test('the query sets the backend, the HUD, the hour and the day length', () => {
  assert.deepEqual(readParams('?gl&hud&hour=17.5&day=0'), { forceWebGL: true, hud: true, hour: 17.5, dayMinutes: 0, probe: false });
});

test('nonsense falls back, and numbers are held to their range', () => {
  assert.equal(readParams('?hour=noon').hour, 10);
  assert.equal(readParams('?hour=24').hour, 0);
  assert.equal(readParams('?hour=-3').hour, 0);
  assert.equal(readParams('?day=-1').dayMinutes, 0);
});

test('?probe asks for the probe page instead of the game', () => {
  assert.equal(readParams('?probe').probe, true);
});
