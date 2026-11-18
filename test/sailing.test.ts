/**
 * The sailing model (implementation plan N3.3): her speed on each point of sail against the table, tacking at speed
 * in under a minute, missing stays without way and falling back, wearing, being taken aback, the canvas set for the
 * wind. The sailing model alone, in a steady wind, her pose level (test/support/sail.ts); the sea and her roll are in
 * test/sailingSea.test.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { angleDiff } from '@futuremagic/core';
import {
  CANVAS, CLOSE_HAULED, HELMSMAN, SPEED_CANVAS, SPEED_TABLE, SPEED_TOLERANCE, SPEED_WIND_FORCE,
} from '../src/sim/rules/sailing.ts';
import { WIND_PRESETS } from '../src/sim/rules/wind.ts';
import { rigPlan } from '../src/sim/ship/rig.ts';
import { canvasFor, layAback, sailsStanding, startSailing, steerTo, stepSailing, type Sailing } from '../src/sim/ship/sailing.ts';
import { startMotion } from '../src/sim/ship/motion.ts';
import { DEGREE, KNOT } from '../src/sim/units.ts';
import { firstEvent, sail, speedAt, steadyWind } from './support/sail.ts';
import { pace } from './support/pace.ts';

/** The wind blows from the north in these tests: a heading is then the wind's angle off her bow, to larboard. */
const FROM = 0;
const knots = (v: number) => v / KNOT;

/** Half the speed table per test (each point of sail is a few seconds of her sailing). */
const half = Math.ceil(SPEED_TABLE.length / 2);
const speeds = new Map<number, number>();
for (const [part, rows] of [[1, SPEED_TABLE.slice(0, half)], [2, SPEED_TABLE.slice(half)]] as const) {
  test(`her speed on each point of sail matches the table (part ${part} of 2: ${rows.map((r) => r[0]).join(', ')}°)`, () => {
    for (const [angle, table] of rows) {
      const v = knots(speedAt(angle, SPEED_WIND_FORCE, SPEED_CANVAS, FROM));
      speeds.set(angle, v);
      if (table === 0) assert.ok(v < SPEED_TOLERANCE, `${angle}° off the wind she makes no way: ${v.toFixed(2)} kn`);
      else assert.ok(Math.abs(v - table) <= SPEED_TOLERANCE, `${angle}°: ${v.toFixed(2)} kn, the table ${table} kn`);
    }
  });
}

test('she is fastest with the wind abaft the beam, and makes no way within about 60° of it', () => {
  assert.equal(speeds.size, SPEED_TABLE.length, 'the table was sailed first');
  const [fastest] = [...speeds].sort((a, b) => b[1] - a[1])[0]!;
  assert.ok(fastest > 90 && fastest < 180, `fastest at ${fastest}°`);
  assert.ok(speeds.get(90)! > speeds.get(CLOSE_HAULED / DEGREE)!, 'faster on the beam than close-hauled');
  assert.ok(knots(speedAt(45, SPEED_WIND_FORCE, SPEED_CANVAS, FROM)) < 0, 'pointed 45° off the wind her sails are aback and she goes astern');
});

/** Settled on a heading in a steady wind. */
function settled(heading: number, force: number, canvas: 'battle' | 'plain', seconds = 120): Sailing {
  const wind = steadyWind(force, FROM);
  return sail(steerTo(startSailing({ heading, canvas, speed: 2 }, wind, force), heading, 0), wind, seconds);
}

/** Which side the wind is on: +1 her starboard side (the wind's bearing clockwise from her heading), -1 larboard. */
const windSide = (s: Sailing) => Math.sign(angleDiff(s.heading, FROM));
/** Close-hauled on the other tack: wind on the starboard bow becomes wind on the larboard bow and the other way. */
const otherTack = (s: Sailing) => FROM + windSide(s) * CLOSE_HAULED;

for (const [force, canvas, from] of [[4, 'battle', 90], [5, 'battle', CLOSE_HAULED / DEGREE], [6, 'plain', CLOSE_HAULED / DEGREE]] as const) {
  test(`a tack ordered at speed completes in under a minute (force ${force}, ${canvas} sail, from ${from.toFixed(1)}° off the wind)`, () => {
    const start = settled(from * DEGREE, force, canvas);
    assert.ok(knots(start.ahead) > 3, `under way at ${knots(start.ahead).toFixed(1)} kn`);
    const target = otherTack(start);
    // Through the wind: turning toward the side it is on.
    const order = steerTo(start, target, windSide(start));
    const { at, end, seen } = firstEvent(order, steadyWind(force, FROM), 60, 'tacked');
    assert.ok(at < 60, `tacked after ${at.toFixed(1)} s (${seen.join(', ') || 'nothing happened'})`);
    assert.ok(!seen.includes('missed stays'), 'she did not miss stays');
    assert.ok(Math.abs(angleDiff(end.heading, target)) < 2 * HELMSMAN.settled, `heading ${(end.heading / DEGREE).toFixed(0)}° a minute on, ordered ${(target / DEGREE).toFixed(0)}°`);
    assert.deepEqual(end.sides, [1, 1].map(() => -start.sides[0]!), 'every sail has gone over to the new tack');
  });
}

test('a tack without way fails: she misses stays and falls back onto her old tack, then gathers way again', () => {
  const wind = steadyWind(SPEED_WIND_FORCE, FROM);
  // Close-hauled but barely moving (1 knot): just after setting sail.
  const start = { ...settled(CLOSE_HAULED, SPEED_WIND_FORCE, 'battle'), ahead: KNOT };
  const { at, end, seen } = firstEvent(steerTo(start, otherTack(start), windSide(start)), wind, 200, 'missed stays');
  assert.ok(at < 90, `missed stays after ${at.toFixed(1)} s (${seen.join(', ')})`);
  assert.ok(!seen.includes('tacked'), 'she never came through the wind');
  assert.equal(windSide(end), windSide(start), 'back on her old tack');
  assert.deepEqual(end.sides, start.sides, 'her sails still on the old tack');
  assert.ok(end.ahead > KNOT, `making way again: ${knots(end.ahead).toFixed(1)} kn`);
  // Dead in the water she misses at once.
  assert.ok(firstEvent(steerTo({ ...start, ahead: 0 }, otherTack(start), windSide(start)), wind, 1, 'missed stays').at < 1);
});

test('wearing: she turns away from the wind, gybes her boom sail across and comes up on the other tack', () => {
  const start = settled(CLOSE_HAULED, SPEED_WIND_FORCE, 'battle');
  const target = otherTack(start);
  // Away from the wind: turning from the side it is on, round through the wind's direction.
  const { at, end, seen } = firstEvent(steerTo(start, target, -windSide(start)), steadyWind(SPEED_WIND_FORCE, FROM), 120, 'wore');
  assert.ok(at < 90, `wore after ${at.toFixed(1)} s (${seen.join(', ')})`);
  assert.ok(!seen.includes('tacked') && !seen.includes('missed stays'));
  assert.ok(Math.abs(angleDiff(end.heading, target)) < 2 * HELMSMAN.settled, `heading ${(end.heading / DEGREE).toFixed(0)}°`);
  assert.ok(end.ahead > 2 * KNOT, `under way on the new tack at ${knots(end.ahead).toFixed(1)} kn`);
});

test('taken aback: steered into the wind\'s eye her sails go aback and she gathers sternway; laid aback she loses her way', () => {
  const wind = steadyWind(SPEED_WIND_FORCE, FROM);
  const reach = settled(90 * DEGREE, SPEED_WIND_FORCE, 'battle');
  // Into the eye, the short way, the yards left as they are.
  const eye = sail(steerTo(reach, FROM + 5 * DEGREE, 0), wind, 90);
  assert.ok(eye.ahead < 0, `sternway ${knots(eye.ahead).toFixed(1)} kn`);
  assert.ok(sailsStanding(eye, wind).some((s) => s.area > 0 && s.aback), 'her sails are aback');
  // The main laid aback (heaving to) slows her steadily; both masts laid aback (the headsails backed with them) slow her
  // faster, and in three minutes she has all but stopped (her boom sail still drawing, she forereaches a little).
  const hove = sail(layAback(reach, 'main', true), wind, 90);
  const both = sail(layAback(layAback(reach, 'fore', true), 'main', true), wind, 90);
  assert.ok(hove.ahead < 0.75 * reach.ahead, `${knots(hove.ahead).toFixed(1)} kn hove to, from ${knots(reach.ahead).toFixed(1)}`);
  assert.ok(both.ahead < 0.5 * reach.ahead && both.ahead < hove.ahead, `${knots(both.ahead).toFixed(1)} kn all aback`);
  const later = sail(both, wind, 90);
  assert.ok(Math.abs(later.ahead) < 1.5 * KNOT, `all aback for three minutes: ${knots(later.ahead).toFixed(1)} kn`);
});

test('the crew sets canvas for the wind: battle, plain and all sail, reefed and taken in as it freshens', () => {
  const sails = rigPlan().sails, ids = (c: ReturnType<typeof canvasFor>) => sails.filter((_, i) => c[i]!.set).map((s) => s.id);
  assert.deepEqual(ids(canvasFor('bare', 3)), []);
  assert.deepEqual(new Set(ids(canvasFor('battle', 4))), new Set(CANVAS.battle));
  assert.equal(ids(canvasFor('all', 3)).length, sails.length, 'all sail sets every sail she has');
  // In a gale she lies under close-reefed topsails, the fore topmast staysail and a reefed boom sail, whatever was ordered.
  const gale = WIND_PRESETS.length - 1, inGale = canvasFor('all', gale);
  assert.deepEqual(new Set(ids(inGale)), new Set(['fore-topsail', 'main-topsail', 'fore-topmast-staysail', 'boom-sail']));
  const topsail = sails.findIndex((s) => s.id === 'main-topsail');
  assert.equal(inGale[topsail]!.reefs, sails[topsail]!.reefs, 'close-reefed');
  assert.equal(canvasFor('plain', 5)[topsail]!.reefs, 0);
});

test('her sails heel her to leeward, and a step is pure and plain data', () => {
  const wind = steadyWind(SPEED_WIND_FORCE, FROM), level = startMotion(0, 0, 0).pose;
  // Heading east, the north wind is on her larboard beam: she heels to starboard (+).
  const east = settled(90 * DEGREE, SPEED_WIND_FORCE, 'battle', 30), west = settled(270 * DEGREE, SPEED_WIND_FORCE, 'battle', 30);
  assert.ok(stepSailing(east, level, wind).way.rollMoment > 0 && stepSailing(west, level, wind).way.rollMoment < 0);
  assert.ok(east.leeway > 0, 'and makes leeway to starboard');
  const copy = JSON.parse(JSON.stringify(east)) as Sailing;
  assert.deepEqual(copy, east, 'plain data');
  const a = stepSailing(east, level, wind), b = stepSailing(copy, level, wind);
  assert.deepEqual(a, b, 'the same in, the same out');
  assert.deepEqual(copy, east, 'the state given is not changed');
});

test('a step under sail costs no more than about 1000 sine and cosine pairs', () => {
  const wind = steadyWind(SPEED_WIND_FORCE, FROM), level = startMotion(0, 0, 0).pose;
  const s = settled(90 * DEGREE, SPEED_WIND_FORCE, 'plain', 10);
  const ratio = pace(() => { stepSailing(s, level, wind); }, 1000);
  assert.ok(ratio < 1, `a step takes ${ratio.toFixed(2)} times 1000 pairs`);
});
