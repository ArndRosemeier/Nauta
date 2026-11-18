/**
 * The master's standing helm orders and the carpenter's sounding (implementation plan N5.3b, orders.md "The fans as
 * built"): "Steer for her" heads her for the enemy and "Her on the beam" holds her abeam at the range when given, the
 * master steering by the computer captain's helm until another helm order; "Sound the well" is answered with the
 * water in her. Pure: a duel stepped on, no page.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { angleDiff } from '@futuremagic/core';
import { startMatch, type SimState } from '../src/sim/state.ts';
import { apartOnWater, bearingTo, DEGREE } from '../src/sim/units.ts';
import { noticed } from '../src/sim/notices.ts';
import { saysOf, soundingLine } from '../src/app/speech/reports.ts';
import { run, SEED, FROM, MODERATE, underWay } from './support/orders.ts';

/** Two brigs in a north wind, mine heading east, the other `south` m to the south of mine (on my starboard beam, to leeward) heading `hers` degrees. */
const duel = (south: number, hers = 90): SimState => startMatch({
  seed: SEED, windForce: MODERATE, windFrom: FROM,
  ships: [{ x: 0, z: 0, heading: 90 * DEGREE, speed: 3 }, { x: 0, z: south, heading: hers * DEGREE, speed: 3 }],
});
/** Her bearing off my bow, rad (+ to starboard). */
const off = (s: SimState): number => angleDiff(s.ships[0]!.sailing.heading, bearingTo(s.ships[0]!.motion.pose, s.ships[1]!.motion.pose));

test('steer for her: the master bears away for her and keeps at it; a course of the captain\'s own ends it', () => {
  const { state } = run(duel(500), 30, [{ kind: 'follow', ship: 0 }]);
  assert.equal(state.ships[0]!.told.keep?.kind, 'follow');
  assert.ok(Math.abs(off(state)) < 40 * DEGREE, `she lies ${(off(state) / DEGREE).toFixed(0)}° off the bow`);
  const steered = run(state, 1, [{ kind: 'steer', ship: 0, heading: 90 * DEGREE }]).state;
  assert.equal(steered.ships[0]!.told.keep, null);
});

test('her on the beam: she bears away from us, and the master follows her round, abeam near the range it was given at', () => {
  const start = duel(300, 125), given = apartOnWater(start.ships[0]!.motion.pose, start.ships[1]!.motion.pose);
  const { state, events } = run(start, 60, [{ kind: 'abeam', ship: 0 }]);
  assert.ok(events.some(({ e }) => e.kind === 'taken' && e.order.kind === 'abeam'));
  const keep = state.ships[0]!.told.keep;
  assert.ok(keep?.kind === 'abeam' && Math.abs(keep.range - given) < 1);
  const range = apartOnWater(state.ships[0]!.motion.pose, state.ships[1]!.motion.pose);
  assert.ok(Math.abs(range - given) < 0.4 * given, `${range.toFixed(0)} m against ${given.toFixed(0)} m`);
  assert.ok(Math.abs(off(state) - 90 * DEGREE) < 45 * DEGREE, `she lies ${(off(state) / DEGREE).toFixed(0)}° off the bow`);
});

test('no ship in sight, nothing to steer by; the well sounded is answered with the water in her', () => {
  const alone = underWay(MODERATE, 90, 0);
  const { events } = run(alone, 1, [{ kind: 'follow', ship: 0 }, { kind: 'sound', ship: 0 }]);
  const refused = events.find(({ e }) => e.kind === 'refused')?.e;
  assert.equal(refused?.kind === 'refused' && refused.code, 'no enemy');
  const sounded = events.find(({ e }) => e.kind === 'answered')?.e;
  assert.ok(sounded?.kind === 'answered' && sounded.code === 'sounded' && sounded.amount === 0);
  assert.equal(soundingLine(0), 'sounded 0');
  assert.equal(soundingLine(1e6), 'sounded 3');
});

/** My ship heading east with her `ahead` m forward of my starboard beam (300 m to the south), my master keeping her abeam or not. */
const kept = (ahead: number, keeping = true): SimState => {
  const s = duel(300);
  const ships = s.ships.map((sh, i) => (i === 1 ? { ...sh, motion: { ...sh.motion, pose: { ...sh.motion.pose, x: ahead } } } : sh));
  return { ...s, tick: 1, ships: ships.map((sh, i) => (i === 0 && keeping ? { ...sh, told: { ...sh.told, keep: { kind: 'abeam', range: 300 } } } : sh)) };
};
const offBeam = (before: SimState, after: SimState) => noticed(before, after, 0).filter((n) => n.kind === 'off beam');

test('her on the beam: the master reports her drawing ahead or dropping astern, once, so the captain may make or shorten sail', () => {
  const ahead = offBeam(kept(0), kept(200));
  assert.deepEqual(ahead.map((n) => n.kind === 'off beam' && n.how), ['ahead']);
  assert.deepEqual(saysOf(ahead[0]!, 0).map((x) => [x.voice, x.line]), [['master', 'her ahead of the beam']]);
  assert.deepEqual(offBeam(kept(0), kept(-200)).map((n) => n.kind === 'off beam' && n.how), ['astern']);
  assert.equal(offBeam(kept(200), kept(210)).length, 0, 'once, not again while she stays ahead');
  assert.equal(offBeam(kept(0), kept(50)).length, 0, 'within two points of the beam he says nothing');
  assert.equal(offBeam(kept(200, false), kept(200)).length, 1, 'as the order is given with her already ahead');
  assert.equal(offBeam(kept(0, false), kept(200, false)).length, 0, 'only while he keeps her on the beam');
});
