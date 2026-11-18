/**
 * Powder smoke as the gun captains see it (implementation plan N7.5a, "the weather position must pay"): the wind lays
 * both ships' smoke on the one to leeward and none on the one to windward; it clears faster the harder it blows; and
 * while it hangs her gun captains' shot scatters wider.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leeOf, smokeAfter } from '../src/sim/guns/smoke.ts';
import { battery } from '../src/sim/guns/guns.ts';
import { fireShot } from '../src/sim/guns/shot.ts';
import { startMotion } from '../src/sim/ship/motion.ts';
import { SMOKE } from '../src/sim/rules/guns.ts';
import { STEPS_PER_SECOND } from '../src/sim/units.ts';

/** A broadside's guns, fired in one step by the two ships together. */
const BROADSIDE = 9;
/** A light breeze and a strong one, m/s. */
const LIGHT = 3;
const STRONG = 12;
/** Seconds the smoke is left to clear. */
const CLEARING = 10;
/** Shots fired to compare the scatter. */
const SHOTS = 40;

test('the wind lays the smoke on the ship to leeward, none on the one to windward or abeam of it', () => {
  // The wind blows toward +x: the ship at x = 100 lies dead to leeward of the one at 0.
  assert.equal(leeOf(100, 0, 0, 0, 1, 0), 1);
  assert.equal(leeOf(0, 0, 100, 0, 1, 0), 0);
  assert.ok(Math.abs(leeOf(0, 100, 0, 0, 1, 0)) < 1e-12);
  assert.equal(smokeAfter(0, BROADSIDE, 0, LIGHT), 0, 'to windward she stays clear');
  const lee = smokeAfter(0, BROADSIDE, 1, LIGHT);
  assert.ok(Math.abs(lee - BROADSIDE * SMOKE.gun) < 1e-12 && lee <= 1, `a broadside lays ${lee} on her`);
  assert.equal(smokeAfter(1, BROADSIDE, 1, LIGHT), 1, 'at most thick');
});

test('it clears as the wind carries it off, faster the harder it blows', () => {
  let light = 1, strong = 1;
  for (let k = 0; k < CLEARING * STEPS_PER_SECOND; k++) { light = smokeAfter(light, 0, 1, LIGHT); strong = smokeAfter(strong, 0, 1, STRONG); }
  assert.ok(light < 1 && strong < light / 2, `after ${CLEARING} s: ${light.toFixed(2)} in a light breeze, ${strong.toFixed(2)} in a strong one`);
});

test('in thick smoke her gun captains\' shot scatters wider', () => {
  const place = battery().find((g) => g.side > 0 && g.gun === 'carronade')!, pose = startMotion(0, 0, 0).pose;
  const spread = (smoke: number): number => {
    let sum = 0;
    for (let tick = 0; tick < SHOTS; tick++) {
      const s = fireShot({ seed: 1, ship: 0, gun: 0, tick, place, firing: { shot: 'round', trained: 0, elevated: 0 }, pose, going: { ahead: 0, leeway: 0 }, men: place.crew.length, asTheyBear: false, sea: null, t: 0, smoke });
      const p = s.balls[0]!.path, a = p[0]!, b = p[1]!;
      sum += Math.abs(Math.atan2(b[1] - a[1], Math.hypot(b[0] - a[0], b[2] - a[2])));
    }
    return sum / SHOTS;
  };
  const clear = spread(0), thick = spread(1);
  assert.ok(thick > 1.5 * clear, `mean off level ${clear.toFixed(4)} rad clear, ${thick.toFixed(4)} in thick smoke`);
});
