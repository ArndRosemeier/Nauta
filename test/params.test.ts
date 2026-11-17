import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readParams } from '../src/app/params.ts';

test('no query: WebGPU, no HUD, a morning that moves', () => {
  assert.deepEqual(readParams(''), { forceWebGL: false, hud: false, hour: 10, dayMinutes: 24, probe: false, rig: false, eye: 4.5, wind: 4 });
});

test('the query sets the backend, the HUD, the hour, the day length, the eye and the wind', () => {
  assert.deepEqual(readParams('?gl&hud&hour=17.5&day=0&eye=30&wind=7'), { forceWebGL: true, hud: true, hour: 17.5, dayMinutes: 0, probe: false, rig: false, eye: 30, wind: 7 });
});

test('nonsense falls back, and numbers are held to their range', () => {
  assert.equal(readParams('?hour=noon').hour, 10);
  assert.equal(readParams('?hour=24').hour, 0);
  assert.equal(readParams('?hour=-3').hour, 0);
  assert.equal(readParams('?day=-1').dayMinutes, 0);
  assert.equal(readParams('?eye=0').eye, 0.5);
  assert.equal(readParams('?wind=12').wind, 8);
  assert.equal(readParams('?wind=2.6').wind, 3);
});

test('?probe asks for the probe page instead of the game', () => {
  assert.equal(readParams('?probe').probe, true);
});

test('?rig shows the light rig test bodies', () => {
  assert.equal(readParams('?rig').rig, true);
});
