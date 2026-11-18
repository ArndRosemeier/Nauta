import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLASS_POWER, Spyglass } from '../src/app/glass.ts';

/** A frame, s. */
const FRAME = 1 / 60;
/** Frames enough for the glass to come up or go down. */
const SECOND = 60;
/** Her roll: its period (s) and swing (rad, about 6°). */
const ROLL_PERIOD = 6.3;
const ROLL = 0.1;
/** A tenth of a degree, rad. */
const TENTH_DEGREE = 0.00175;
const SEED = 7;

const run = (g: Spyglass, frames: number) => { for (let i = 0; i < frames; i++) g.step(FRAME); };

test('the button raises the glass to its power and lowers it again, eased between', () => {
  const g = new Spyglass(SEED);
  assert.equal(g.magnification, 1);
  g.toggle();
  g.step(FRAME * 10);
  assert.ok(g.magnification > 1 && g.magnification < GLASS_POWER.start);
  run(g, SECOND);
  assert.equal(g.raised, 1);
  assert.equal(g.magnification, GLASS_POWER.start);
  g.toggle();
  run(g, SECOND);
  assert.equal(g.magnification, 1);
});

test('two fingers spread raise it, then draw it out and in within its range, and pinched right in lower it', () => {
  const g = new Spyglass(SEED);
  g.pinchStart();
  g.pinch(1.1);
  assert.equal(g.up, false, 'a small spread is not yet a raise');
  g.pinch(1.5);
  assert.equal(g.up, true);
  g.pinch(1.5 * 2);
  assert.equal(g.power, GLASS_POWER.start * 2);
  g.pinch(1.5 * 2 * 2);
  assert.equal(g.power, GLASS_POWER.most);
  g.pinchEnd();
  g.pinchStart();
  g.pinch(1 / 5);
  assert.equal(g.power, GLASS_POWER.least);
  assert.equal(g.up, true);
  g.pinch(1 / 8);
  assert.equal(g.up, false);
});

test('the hands take her slow roll out of the glass and leave a sway of a tenth of it; the tremble is a fraction of a degree', () => {
  const g = new Spyglass(SEED, GLASS_POWER.start);
  let most = 0, shake = 0;
  for (let i = 0; i < SECOND * 10; i++) {
    const t = i * FRAME, roll = ROLL * Math.sin((2 * Math.PI * t) / ROLL_PERIOD);
    const [, r] = g.hold(0, roll, FRAME);
    g.step(FRAME);
    if (t > ROLL_PERIOD) most = Math.max(most, Math.abs(r));
    const a = g.aim({ yaw: 0, pitch: 0 });
    shake = Math.max(shake, Math.abs(a.yaw), Math.abs(a.pitch));
  }
  assert.ok(most > 0 && most < ROLL / 8, `sway ${most} rad`);
  assert.ok(shake > 0 && shake < TENTH_DEGREE / 2, `tremble ${shake} rad`);
});

test('?glass raises it from the start at the power asked, held to its range', () => {
  assert.equal(new Spyglass(SEED, GLASS_POWER.most * 2).magnification, GLASS_POWER.most);
  assert.equal(new Spyglass(SEED, null).up, false);
});
