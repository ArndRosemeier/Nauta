/**
 * The sound of the ship in the game's seas (plan N2.8): with eyes shut a calm can be told from a breeze by her alone.
 * She lies still in the sea of force 1 and of force 5 for a minute and a half (after half a minute to settle), floated
 * as the game floats her, and is heard from her quarterdeck and from her berth deck. In a file of its own: the runs are
 * most of a test's 2 s.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roomAt } from '../src/audio/acoustics.ts';
import { CounterWatch } from '../src/audio/counter.ts';
import { CreakWatch } from '../src/audio/creaks.ts';
import { HullWater } from '../src/audio/hullWater.ts';
import { standpoint } from '../src/app/standpoints.ts';
import { makeWind, meanWind } from '../src/sim/wind.ts';
import { followWind, startSea } from '../src/sim/sea/sea.ts';
import { lyingStill, poseBetween, startMotion, stepMotion } from '../src/sim/ship/motion.ts';
import { shipPlan } from '../src/sim/ship/plan.ts';
import { STEP_SECONDS } from '../src/sim/units.ts';

const SEED = 1805;
/** Heard at 30 frames a second, s; she settles for SETTLE s and is heard for HEARD s. */
const FRAME = 1 / 30;
const SETTLE = 30;
const HEARD = 90;
/** The bearing the wind blows from, rad (main.ts's). */
const WIND_FROM = 4.32;

interface Heard { creaks: number; creakGain: number; slaps: number; run: number; inside: number }

/** Her sounds lying still in the sea of `force`, from her quarterdeck (creaks, slaps, the run along her side) and below (the sea against her planking). */
function hearIn(force: number): Heard {
  const wind = makeWind(SEED, force, WIND_FROM), blow = meanWind(wind, 0), deck = standpoint('quarterdeck').eye, below = standpoint('berth deck').eye;
  let sea = startSea(SEED, { speed: blow.speed, toward: blow.toward }, 0), m = startMotion(0, 0, 0), prev = m, stepped = 0;
  const creaks = new CreakWatch(SEED), counter = new CounterWatch(), onDeck = new HullWater(SEED), inside = new HullWater(SEED);
  const heard: Heard = { creaks: 0, creakGain: 0, slaps: 0, run: 0, inside: 0 };
  let frames = 0;
  for (let t = 0; t < SETTLE + HEARD; t += FRAME) {
    meanWind(wind, t, blow);
    sea = followWind(sea, { speed: blow.speed, toward: blow.toward }, t);
    while (stepped + STEP_SECONDS <= t) { prev = m; m = stepMotion(m, sea, stepped, lyingStill(0)); stepped += STEP_SECONDS; }
    const pose = poseBetween(prev.pose, m.pose, (t - stepped) / STEP_SECONDS), counting = t >= SETTLE;
    const c = creaks.creaks(pose, FRAME, deck, 0), s = counter.slaps(pose, sea, t, FRAME);
    const run = onDeck.beds(pose, sea, t, FRAME, 0, deck, 0), low = inside.beds(pose, sea, t, FRAME, 0, below, 1);
    if (!counting) continue;
    frames++;
    heard.creaks += c.length;
    heard.creakGain += c.reduce((g, e) => g + e.gain, 0);
    heard.slaps += s.length;
    heard.run += run.filter((b) => b.bus === 'world').reduce((g, b) => g + b.level * b.level, 0);
    heard.inside += low.filter((b) => b.bus === 'body').reduce((g, b) => g + b.level * b.level, 0);
  }
  return { ...heard, creakGain: heard.creakGain / Math.max(heard.creaks, 1), run: Math.sqrt(heard.run / frames), inside: Math.sqrt(heard.inside / frames) };
}

const results = new Map<number, Heard>();
/** Light air and a fresh breeze. */
const CALM = 1;
const BREEZE = 5;

test(`her sound lying still in light air (force ${CALM})`, () => {
  const h = hearIn(CALM);
  results.set(CALM, h);
  assert.equal(h.slaps, 0, 'no sea reaches her counter');
  assert.ok(h.inside > 0, 'below deck the sea against her planking is still heard');
});

test(`her sound lying still in a fresh breeze (force ${BREEZE}), told from light air by her alone`, () => {
  const h = hearIn(BREEZE), calm = results.get(CALM) ?? hearIn(CALM);
  assert.ok(h.creaks > 4 * calm.creaks, `creaks ${calm.creaks} in light air, ${h.creaks} in a breeze`);
  assert.ok(h.creakGain > calm.creakGain, 'louder');
  assert.ok(h.slaps > 0, 'the sea slaps under her counter');
  assert.ok(h.run > 2 * calm.run && h.inside > calm.inside, `the water along her: ${calm.run.toFixed(2)} and ${h.run.toFixed(2)} on deck, ${calm.inside.toFixed(2)} and ${h.inside.toFixed(2)} below`);
  // And the two places sound apart: on deck the open air, below deck a room.
  const plan = shipPlan();
  assert.equal(roomAt(plan, standpoint('quarterdeck').eye).below, 0);
  assert.equal(roomAt(plan, standpoint('berth deck').eye).below, 1);
});
