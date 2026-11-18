import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beaufortSpeed } from '../src/sim/rules/beaufort.ts';
import { LOAD_WATERLINE, ROLL_PERIOD } from '../src/sim/rules/ships.ts';
import { WIND_PRESETS } from '../src/sim/rules/wind.ts';
import { startSea, type SeaState } from '../src/sim/sea/sea.ts';
import type { WaveSet } from '../src/sim/sea/waves.ts';
import { designWaterline } from '../src/sim/ship/hull.ts';
import { lyingStill, poseBetween, poseRotation, shipOrigin, startMotion, stepMotion, toWorld, type ShipMotion } from '../src/sim/ship/motion.ts';
import { DEGREE, STEP_SECONDS, STEPS_PER_SECOND } from '../src/sim/units.ts';
import { pace } from './support/pace.ts';

const SEED = 1805;
const STILL = lyingStill(0);
/** A sail's heeling moment for the test, kN·m. */
const HEELING = 1000;
/** A gale's sea (the strongest wind the game sails in). */
const gale = startSea(SEED, { speed: beaufortSpeed(WIND_PRESETS.length - 1), toward: 0.4 }, 0);

/** A sea without a ripple: every wave of the swell and the wind's sets stilled (the game's calm still has its swell). */
const stilled = (w: WaveSet): WaveSet => ({ ...w, amp: w.amp.map(() => 0), reach: w.reach.map(() => 0), lift: 0 });
const base = startSea(SEED, { speed: 0, toward: 0 }, 0);
const flat: SeaState = { ...base, seaSwell: stilled(base.seaSwell), seaLayers: base.seaLayers.map((l) => ({ ...l, waves: stilled(l.waves) })) };

/** Steps from `m` over `seconds` from time `t0`, calling `each` after every step. */
function run(m: ShipMotion, sea: SeaState, t0: number, seconds: number, course = STILL, each?: (m: ShipMotion) => void): ShipMotion {
  const steps = Math.round(seconds * STEPS_PER_SECOND);
  for (let i = 0; i < steps; i++) {
    m = stepMotion(m, sea, t0 + i * STEP_SECONDS, course);
    each?.(m);
  }
  return m;
}

/** How high the draught's load waterline stands over the water at a place along her, m (0 when she floats on it). */
const overWater = (m: ShipMotion, along: number) => toWorld(m.pose, 0, designWaterline(along) - LOAD_WATERLINE, -along)[1];

/** At rest on still water: put on it high and trimmed wrong, then let settle for a minute and a half. */
let rest: ShipMotion | null = null;
const resting = () => (rest ??= run((() => {
  const m = startMotion(0, 0, 0);
  return { pose: { ...m.pose, heave: m.pose.heave + 0.3, pitch: m.pose.pitch - DEGREE } };
})(), flat, 0, 90));

test('in calm she settles at her waterline: the draught\'s load waterline on the water from stern to bow, upright and still', () => {
  const m = resting();
  for (const along of [-10, -5, 0, 5, 10, 15, 19]) {
    assert.ok(Math.abs(overWater(m, along)) < 0.03, `${along} m forward of the mainmast: ${(overWater(m, along) * 100).toFixed(1)} cm`);
  }
  assert.ok(Math.abs(m.pose.roll) < 0.1 * DEGREE, `roll ${m.pose.roll}`);
  assert.ok(Math.abs(m.pose.heaveRate) < 1e-3 && Math.abs(m.pose.pitchRate) < 1e-4 && Math.abs(m.pose.rollRate) < 1e-4, 'still');
  // Put on the water at the draught's line she is already there.
  const placed = startMotion(0, 0, 0);
  assert.ok(Math.abs(placed.pose.heave - m.pose.heave) < 0.03 && Math.abs(placed.pose.pitch - m.pose.pitch) < 0.1 * DEGREE);
});

/** Heeled 20° on still water and let go: her roll after every step for two minutes. */
let heeled: number[] | null = null;
const heelRun = () => {
  if (heeled) return heeled;
  const out: number[] = [], r = resting();
  run({ pose: { ...r.pose, roll: 20 * DEGREE } }, flat, 0, 120, STILL, (m) => out.push(m.pose.roll));
  return (heeled = out);
};
/** Her swings: the roll at each turn (where the rate changes sign). */
const swings = (roll: number[]) => roll.filter((r, i) => i > 0 && i < roll.length - 1 && Math.abs(r) >= Math.abs(roll[i - 1]!) && Math.abs(r) > Math.abs(roll[i + 1]!));

test('heeled 20° and let go she rights herself, and the roll dies out', () => {
  const roll = heelRun(), turns = swings(roll);
  assert.ok(turns.length >= 6, `${turns.length} swings`);
  // She swings back through upright and each swing is smaller than the last, to the other side.
  for (let i = 1; i < 6; i++) {
    assert.ok(Math.sign(turns[i]!) !== Math.sign(turns[i - 1]!), `swing ${i} to the other side`);
    assert.ok(Math.abs(turns[i]!) < Math.abs(turns[i - 1]!), `swing ${i}: ${(turns[i]! / DEGREE).toFixed(2)}° after ${(turns[i - 1]! / DEGREE).toFixed(2)}°`);
  }
  assert.ok(Math.abs(turns[0]!) < 15 * DEGREE, 'the first swing back is well short of 20°');
  const last = roll.slice(-STEPS_PER_SECOND * 30);
  assert.ok(Math.max(...last.map(Math.abs)) < 0.1 * DEGREE, `after 90 s she lies within 0.1° of upright: ${(Math.max(...last.map(Math.abs)) / DEGREE).toFixed(3)}°`);
});

test("her roll period is in the table's range", () => {
  const roll = heelRun(), ups: number[] = [];
  for (let i = 1; i < roll.length; i++) if (roll[i - 1]! < 0 && roll[i]! >= 0) ups.push(i * STEP_SECONDS);
  const periods = ups.slice(1, 5).map((u, i) => u - ups[i]!);
  const mean = periods.reduce((s, p) => s + p, 0) / periods.length;
  assert.ok(mean >= ROLL_PERIOD.least && mean <= ROLL_PERIOD.most, `${mean.toFixed(2)} s (${periods.map((p) => p.toFixed(2)).join(', ')})`);
});

test('two runs agree bit for bit', () => {
  const course = { ...lyingStill(0.8), ahead: 4, rollMoment: 300 };
  const a = run(startMotion(10, -20, 0.8), gale, 50, 30, course), b = run(startMotion(10, -20, 0.8), gale, 50, 30, course);
  assert.deepEqual(a, b);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a, 'her state is plain data');
});

test('she goes ahead along her heading at her speed and sideways at her leeway, and her frame turns with her', () => {
  const east = { ...lyingStill(90 * DEGREE), ahead: 3 };
  const m = run(startMotion(0, 0, east.heading), flat, 0, 10, east);
  assert.ok(Math.abs(m.pose.x - 30) < 1e-6 && Math.abs(m.pose.z) < 1e-6, `at ${m.pose.x}, ${m.pose.z}`);
  // Heading east, her leeway (to starboard) carries her south (+z).
  const drift = run(startMotion(0, 0, east.heading), flat, 0, 10, { ...east, ahead: 0, leeway: 0.5 });
  assert.ok(Math.abs(drift.pose.x) < 1e-6 && Math.abs(drift.pose.z - 5) < 1e-6, `at ${drift.pose.x}, ${drift.pose.z}`);
  // Her bow (ship space -z) lies east of her stern, her starboard side (+x) south of her port side.
  const bow = toWorld(m.pose, 0, 0, -10), stern = toWorld(m.pose, 0, 0, 10), port = toWorld(m.pose, -3, 0, 0), starboard = toWorld(m.pose, 3, 0, 0);
  assert.ok(bow[0] > stern[0] + 19 && starboard[2] > port[2] + 5.9);
  // The rotation is a rotation, and the origin is where ship space's 0 lands.
  const r = poseRotation({ ...m.pose, pitch: 0.2, roll: -0.3 });
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const dot = r[i]! * r[j]! + r[i + 3]! * r[j + 3]! + r[i + 6]! * r[j + 6]!;
      assert.ok(Math.abs(dot - (i === j ? 1 : 0)) < 1e-8, `${i}·${j}: ${dot}`);
    }
  }
  assert.deepEqual(shipOrigin(m.pose), toWorld(m.pose, 0, 0, 0));
  // Rolled to starboard her starboard side is lower.
  const rolled = { ...m.pose, roll: 0.1 };
  assert.ok(toWorld(rolled, 3, 0, 0)[1] < toWorld(rolled, -3, 0, 0)[1]);
});

test('her sails\' moment heels her to its side and holds her there', () => {
  const heeled = (moment: number) => run(startMotion(0, 0, 0), flat, 0, 40, { ...STILL, rollMoment: moment }).pose.roll;
  // About 1000 kN·m, the heeling of battle sail on a beam reach in a fresh breeze: a few degrees to starboard.
  const starboard = heeled(HEELING), larboard = heeled(-HEELING);
  assert.ok(starboard > 2 * DEGREE && starboard < 10 * DEGREE, `${(starboard / DEGREE).toFixed(1)}°`);
  assert.ok(Math.abs(starboard + larboard) < 0.2 * DEGREE, 'the same either way');
});

test('her pose between two steps runs from one to the other, the heading the short way round', () => {
  const a = { ...startMotion(0, 0, 6.2).pose, roll: 0.1 }, b = { ...a, heading: 0.1, roll: 0.2, x: 1 };
  assert.deepEqual(poseBetween(a, b, 0), a);
  const half = poseBetween(a, b, 0.5);
  assert.ok(Math.abs(half.roll - 0.15) < 1e-12 && Math.abs(half.x - 0.5) < 1e-12);
  assert.ok(Math.abs(half.heading - (6.2 + (0.1 + 2 * Math.PI - 6.2) / 2)) < 1e-9, `${half.heading}`);
});

test('a step costs no more than about 6000 sine and cosine pairs (the duel steps two ships 30 times a second)', () => {
  const m = startMotion(0, 0, 0);
  const ratio = pace(() => { stepMotion(m, gale, 77, STILL); }, 6000);
  assert.ok(ratio < 1, `a step takes ${ratio.toFixed(2)} times 6000 pairs`);
});
