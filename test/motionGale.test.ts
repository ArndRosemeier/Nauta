/**
 * Ten simulated minutes of floating in the strongest wind the game sails in (implementation plan N2.2), in a file of
 * its own: a test file runs in its own process within its time budget (docs/CHECKS.md), and this run is most of one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beaufortSpeed } from '../src/sim/rules/beaufort.ts';
import { WIND_PRESETS } from '../src/sim/rules/wind.ts';
import { startSea } from '../src/sim/sea/sea.ts';
import { lyingStill, startMotion, stepMotion, type ShipMotion } from '../src/sim/ship/motion.ts';
import { DEGREE, STEP_SECONDS, STEPS_PER_SECOND } from '../src/sim/units.ts';

const SEED = 1805;
/** The strongest wind the game sails in, and its sea. */
const STRONGEST = WIND_PRESETS.length - 1;
const gale = startSea(SEED, { speed: beaufortSpeed(STRONGEST), toward: 0.4 }, 0);

/** Ten simulated minutes in the strongest preset, in four parts (one test may take 2 s), her heading swinging round. */
const GALE_PARTS = 4;
const GALE_MINUTES = 10;
const galeCourse = (part: number) => ({ ...lyingStill(part * 1.7), ahead: 3 });
let galeState: ShipMotion = startMotion(0, 0, 0);
const galeMost = { roll: 0, pitch: 0, heave: 0 };
for (let part = 0; part < GALE_PARTS; part++) {
  test(`ten simulated minutes in the strongest preset never blow up (part ${part + 1} of ${GALE_PARTS})`, () => {
    const seconds = (GALE_MINUTES * 60) / GALE_PARTS, trim = startMotion(0, 0, 0).pose.pitch;
    const course = galeCourse(part), t0 = part * seconds;
    for (let i = 0; i < seconds * STEPS_PER_SECOND; i++) {
      galeState = stepMotion(galeState, gale, t0 + i * STEP_SECONDS, course);
      const p = galeState.pose;
      assert.ok([p.heave, p.pitch, p.roll, p.heaveRate, p.pitchRate, p.rollRate, p.x, p.z].every(Number.isFinite), 'finite');
      galeMost.roll = Math.max(galeMost.roll, Math.abs(p.roll));
      galeMost.pitch = Math.max(galeMost.pitch, Math.abs(p.pitch - trim));
      galeMost.heave = Math.max(galeMost.heave, Math.abs(p.heave));
    }
    // She works hard but never goes over, stands on end or leaves the water.
    assert.ok(galeMost.roll < 40 * DEGREE, `roll up to ${(galeMost.roll / DEGREE).toFixed(1)}°`);
    assert.ok(galeMost.pitch < 25 * DEGREE, `pitch up to ${(galeMost.pitch / DEGREE).toFixed(1)}°`);
    assert.ok(galeMost.heave < 8, `heave up to ${galeMost.heave.toFixed(2)} m`);
    if (part === GALE_PARTS - 1) assert.ok(galeMost.roll > 3 * DEGREE && galeMost.heave > 1, 'and the gale does move her');
  });
}

