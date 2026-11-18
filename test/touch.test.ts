/**
 * Ships touch (implementation plan N3.12): head on, a glancing blow and a slow drift alongside, each sailed through
 * whole steps (sea, sailing, floating, touching) until the two have lain clear of each other for a while, each well
 * inside a minute of simulated time. Nothing passes through, both states stay numbers, and the same state stepped on
 * after a trip through bytes gives the same bits.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeState, encodeState, hashState, startMatch, type ShipStart, type SimState } from '../src/sim/state.ts';
import { step, type SimEvent } from '../src/sim/step.ts';
import { shoved, shovedMasses } from '../src/sim/ship/sailing.ts';
import { hullGap, overlap, touch, type TouchEvent } from '../src/sim/ship/touch.ts';
import { DEGREE, STEPS_PER_SECOND } from '../src/sim/units.ts';
import { pace } from './support/pace.ts';

const SEED = 1805;
/** A moderate breeze from the east. */
const FORCE = 4;
const FROM = 90 * DEGREE;
/** The most a step may leave the hulls in each other, m: a few centimetres is the pushing's slack, a hand's breadth a hull passing in. */
const MOST_OVERLAP = 0.1;
/** Clear of each other by this much (m) for this long (s) is apart. */
const CLEAR = 1;
const CLEAR_FOR = 2;
/** Closer than this, m, two hulls lie together. */
const TOGETHER = 0.05;
/** No scenario may take longer, simulated s (docs/CHECKS.md: at most 60 a test). */
const MOST_SECONDS = 40;

interface Run {
  readonly end: SimState;
  readonly events: TouchEvent[];
  /** Seconds the hulls lay against each other, the deepest overlap after any step, and whether they ended apart. */
  readonly together: number;
  readonly deepest: number;
  readonly apart: boolean;
  /** The state the step before they first touched. */
  readonly before: SimState | null;
  /** The furthest each was turned off her first heading, rad (+ to starboard). */
  readonly turned: number[];
}

const isTouch = (e: SimEvent): e is TouchEvent => e.kind === 'struck' || e.kind === 'fouled';

/** Two ships from `ships` (the second's leeway set to `leeway`, m/s) stepped until they have been apart a while after touching. */
function sail(ships: readonly ShipStart[], leeway = 0): Run {
  let s = startMatch({ seed: SEED, windForce: FORCE, windFrom: FROM, ships });
  if (leeway !== 0) s = { ...s, ships: s.ships.map((x, i) => (i === 1 ? { ...x, sailing: shoved(x.sailing, 0, leeway * shovedMasses().sideways, 0) } : x)) };
  assert.equal(overlap(s.ships[0]!.motion.pose, s.ships[1]!.motion.pose), 0, 'they start clear of each other');
  const events: TouchEvent[] = [];
  let together = 0, deepest = 0, clear = 0, touched = false, before: SimState | null = null;
  const turned = [0, 0], headings = ships.map((x) => x.heading);
  for (let i = 0; i < MOST_SECONDS * STEPS_PER_SECOND && clear < CLEAR_FOR * STEPS_PER_SECOND; i++) {
    const was = s, r = step(s);
    s = r.state;
    events.push(...r.events.filter(isTouch));
    for (const ship of s.ships) {
      const { pose } = ship.motion, { sailing } = ship;
      const i0 = s.ships.indexOf(ship);
      const off = Math.asin(Math.sin(sailing.heading - headings[i0]!));
      if (Math.abs(off) > Math.abs(turned[i0]!)) turned[i0] = off;
      for (const v of [pose.x, pose.z, pose.heading, pose.roll, sailing.ahead, sailing.leeway, sailing.turnRate]) assert.ok(Number.isFinite(v), `a number at ${i / STEPS_PER_SECOND} s`);
    }
    const [a, b] = s.ships.map((x) => x.motion.pose) as [typeof s.ships[0]['motion']['pose'], typeof s.ships[0]['motion']['pose']];
    deepest = Math.max(deepest, overlap(a, b));
    const gap = hullGap(a, b);
    if (gap < TOGETHER) { together += 1 / STEPS_PER_SECOND; if (!touched) before = was; touched = true; }
    clear = touched && gap > CLEAR ? clear + 1 : 0;
  }
  return { end: s, events, together, deepest, apart: clear >= CLEAR_FOR * STEPS_PER_SECOND, before, turned };
}

/** A knock after a blow, as they part, is no harder than this share of it. */
const KNOCK = 0.2;
/** Turned off her heading by a blow: more than this, rad. */
const TURNED = 5 * DEGREE;
let headOnRun: Run | null = null;
/** Head on, a metre and a half off each other's line, each at 3 m/s (six knots closing): sailed once for the file. */
const headOn = () => (headOnRun ??= sail([{ x: 0, z: 25, heading: 0, speed: 3 }, { x: 1.5, z: -25, heading: Math.PI, speed: 3 }]));

const struck = (r: Run) => r.events.filter((e) => e.kind === 'struck');

test('head on: they strike, lose most of their way, are turned off each other and part', () => {
  const r = headOn();
  assert.ok(r.deepest < MOST_OVERLAP, `nothing passes through (deepest ${r.deepest.toFixed(3)} m)`);
  assert.ok(r.apart, 'they end apart');
  const hits = struck(r);
  assert.deepEqual(hits.map((e) => e.ship).sort(), [0, 1], 'one blow, heard on both');
  assert.ok(hits[0]!.speed > 5, `they closed at ${hits[0]!.speed.toFixed(2)} m/s`);
  assert.ok(hits.every((e) => e.along > 15), `each struck forward (${hits.map((e) => e.along.toFixed(1)).join(', ')} m)`);
  assert.ok(r.events.some((e) => e.kind === 'fouled' && e.spar === 'jib-boom'), 'the jib-booms foul');
  for (const ship of r.end.ships) assert.ok(ship.sailing.ahead < 1.5, `way lost (${ship.sailing.ahead.toFixed(2)} m/s of 3)`);
  assert.ok(r.turned.every((t) => Math.abs(t) > TURNED), `both turned off (${r.turned.map((t) => (t / DEGREE).toFixed(0)).join(', ')}°)`);
});

test('a glancing blow: her stem catches the other\'s quarter as she crosses ahead, the other is swung round and they part', () => {
  // Placed so her stem meets the other's quarter at the pace she gathers in a moderate breeze (rules/sailing.ts LIGHT_AIRS).
  const r = sail([{ x: 0, z: 44, heading: 0, speed: 3 }, { x: -8, z: 0, heading: 90 * DEGREE, speed: 3 }]);
  assert.ok(r.deepest < MOST_OVERLAP, `nothing passes through (deepest ${r.deepest.toFixed(3)} m)`);
  assert.ok(r.apart, 'they end apart');
  // One blow; with her quarter's rail raised (N2.12) she may knock against the stem once or twice more as they part, softly.
  const all = struck(r), hits = all.filter((e) => e.tick === all[0]!.tick);
  assert.equal(hits.length, 2, 'one blow');
  assert.ok(all.every((e) => e.tick === hits[0]!.tick || e.speed < hits[0]!.speed * KNOCK), 'any knock after it is soft');
  const [stem, quarter] = [hits.find((e) => e.ship === 0)!, hits.find((e) => e.ship === 1)!];
  assert.ok(stem.along > 15 && quarter.along < 0 && quarter.across > 0, `her stem (${stem.along.toFixed(1)} m) on the other's starboard quarter (${quarter.along.toFixed(1)}, ${quarter.across.toFixed(1)} m)`);
  // Her stern pushed to larboard swings the other's bow to starboard.
  assert.ok(r.turned[1]! > TURNED, `the other's bow swung to starboard (${(r.turned[1]! / DEGREE).toFixed(0)}°)`);
});

test('a slow drift alongside: they lie together and grind without a blow, and part as one sails past', () => {
  const r = sail([{ x: 0, z: 0, heading: 0, speed: 2.5 }, { x: 9.5, z: 0, heading: 0, speed: 0.5 }], -0.1);
  assert.ok(r.deepest < MOST_OVERLAP, `nothing passes through (deepest ${r.deepest.toFixed(3)} m)`);
  assert.ok(r.together > 2, `they lay together ${r.together.toFixed(1)} s`);
  assert.equal(struck(r).length, 0, 'no blow, only grinding');
  assert.ok(r.apart, 'they end apart');
});

test('the same on both machines: the state through bytes steps on to the same bits through the blow', () => {
  const r = headOn();
  assert.ok(r.before, 'they touched');
  let a = r.before!, b = decodeState(encodeState(r.before!));
  for (let i = 0; i < STEPS_PER_SECOND; i++) { a = step(a).state; b = step(b).state; }
  assert.equal(hashState(b), hashState(a));
});

test('yards and bowsprit over the other\'s deck foul once, when they first reach over', () => {
  const far = startMatch({ seed: SEED, windForce: FORCE, windFrom: FROM, ships: [{ x: 0, z: 0, heading: 0 }, { x: 60, z: 0, heading: 0 }] });
  const alongside = startMatch({ seed: SEED, windForce: FORCE, windFrom: FROM, ships: [{ x: 0, z: 0, heading: 0 }, { x: 9.6, z: 0, heading: 0 }] });
  const first = touch(far.ships, alongside.ships, 0).events;
  const spars = (ship: number) => first.filter((e) => e.kind === 'fouled' && e.ship === ship).map((e) => (e as { spar: string }).spar);
  for (const ship of [0, 1]) assert.ok(spars(ship).includes('main-yard') && spars(ship).includes('fore-yard'), `ship ${ship}'s lower yards foul (${spars(ship).join(', ')})`);
  assert.ok(!spars(0).includes('bowsprit'), 'the bowsprit reaches over nobody\'s deck lying alongside');
  assert.equal(touch(alongside.ships, alongside.ships, 1).events.length, 0, 'already foul: no new event');
});

/** Touching may cost no more than this share of a reference loop of 4000 sine and cosine pairs (pace.ts) with two ships alongside. */
const NEAR_PAIRS = 4000;
const NEAR_SHARE = 2;

test('touching two ships alongside costs less than a step', () => {
  const alongside = startMatch({ seed: SEED, windForce: FORCE, windFrom: FROM, ships: [{ x: 0, z: 0, heading: 0 }, { x: 9.6, z: 0, heading: 0 }] });
  const share = pace(() => touch(alongside.ships, alongside.ships, 0), NEAR_PAIRS);
  assert.ok(share < NEAR_SHARE, `touching costs ${share.toFixed(2)} of the reference`);
});
