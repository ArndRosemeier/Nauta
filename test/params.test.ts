import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readParams } from '../src/app/params.ts';
import { DEGREE } from '../src/sim/units.ts';

/** A brace the address asks for, degrees. */
const BRACED = 30;

test('no query: WebGPU, no HUD, a morning that moves', () => {
  assert.deepEqual(readParams(''), { hud: false, hour: 10, dayMinutes: 24, probe: false, rig: false, ship: null, quality: null, eye: 4.5, wind: 4, look: null, toLight: null, bench: 0, walk: null, motion: null, brace: 0, sail: false });
});

test('the query sets the backend, the HUD, the hour, the day length, the eye and the wind', () => {
  assert.deepEqual(readParams('?hud&hour=17.5&day=0&eye=30&wind=7'), { hud: true, hour: 17.5, dayMinutes: 0, probe: false, rig: false, ship: null, quality: null, eye: 30, wind: 7, look: null, toLight: null, bench: 0, walk: null, motion: null, brace: 0, sail: false });
});

test('nonsense falls back, and numbers are held to their range', () => {
  assert.equal(readParams('?hour=noon').hour, 10);
  assert.equal(readParams('?hour=24').hour, 0);
  assert.equal(readParams('?hour=-3').hour, 0);
  assert.equal(readParams('?day=-1').dayMinutes, 0);
  assert.equal(readParams('?eye=-90').eye, -40);
  assert.equal(readParams('?wind=12').wind, 8);
  assert.equal(readParams('?sail').sail, true);
  assert.equal(readParams('?wind=2.6').wind, 3);
});

test('?probe asks for the probe page instead of the game', () => {
  assert.equal(readParams('?probe').probe, true);
});

test('?rig shows the light rig test bodies', () => {
  assert.equal(readParams('?rig').rig, true);
});

test('?yaw and ?pitch set where the captain looks at the start, in degrees', () => {
  const look = readParams('?yaw=90&pitch=-10').look!;
  assert.ok(Math.abs(look.yaw - Math.PI / 2) < 1e-12 && Math.abs(look.pitch + Math.PI / 18) < 1e-12);
  assert.equal(readParams('?pitch=-200').look!.pitch, -1.5);
});

test('?ship stands on the brig, at the standpoint named; ?slice still works', () => {
  assert.equal(readParams('?ship').ship, '');
  assert.equal(readParams('?ship=hold').ship, 'hold');
  assert.equal(readParams('?slice=below').ship, 'below');
  assert.equal(readParams('').ship, null);
});

test('?quality names a level, or leaves the choice to measuring', () => {
  assert.equal(readParams('?quality=low').quality, 'low');
  assert.equal(readParams('').quality, null);
});

test('?sea names a sea by the wind that raises it, and ?wind wins over it', () => {
  assert.equal(readParams('?sea=calm').wind, 0);
  assert.equal(readParams('?sea=breeze').wind, 4);
  assert.equal(readParams('?sea=gale').wind, 8);
  assert.equal(readParams('?sea=gale&wind=2').wind, 2);
  assert.equal(readParams('?sea=storm').wind, 4);
});

test('?look turns the eye off the light and tilts it, in degrees', () => {
  const look = readParams('?look=90,-6').toLight!;
  assert.ok(Math.abs(look.off - Math.PI / 2) < 1e-12 && Math.abs(look.up + (6 * Math.PI) / 180) < 1e-12);
  assert.deepEqual(readParams('?look').toLight, { off: 0, up: 0 });
  assert.deepEqual(readParams('?look=x,').toLight, { off: 0, up: 0 });
});

test('?bench flies for 60 s, or the seconds named within its range', () => {
  assert.equal(readParams('?bench').bench, 60);
  assert.equal(readParams('?bench=30').bench, 30);
  assert.equal(readParams('?bench=1').bench, 5);
  assert.equal(readParams('').bench, 0);
});

test('the address braces her yards round, in degrees, held to a half turn', () => {
  assert.equal(readParams('?brace=30').brace, BRACED * DEGREE);
  assert.equal(readParams('?brace=-30').brace, -BRACED * DEGREE);
});
