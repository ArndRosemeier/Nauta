/**
 * The simulation frame (implementation plan N3.1): one state, stepped 30 times a second, the same inputs giving the
 * same bits. The ten-minute run of the plan is a slow check (`npm run check:replay`, tools/sim/replay.ts): two runs of
 * two ships take longer than a test file may.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replay } from '../src/sim/replay.ts';
import { decodeState, encodeState, hashState, simTime, startMatch, type SimState } from '../src/sim/state.ts';
import { step, type SimEvent } from '../src/sim/step.ts';
import { STEPS_PER_SECOND } from '../src/sim/units.ts';
import { duel, duelSetup, orderScript } from './support/match.ts';
import { pace } from './support/pace.ts';

const SEED = 1805;
/** A moderate breeze, in which plain sail is more than battle sail (in the strongest wind both are close-reefed topsails). */
const MODERATE = 4;
const SECONDS = 20;
const TICKS = SECONDS * STEPS_PER_SECOND;
const script = orderScript(SEED, SECONDS);

/** The hash after every simulated second of the scripted duel from `start`. */
function hashes(start: SimState, log = script, until = TICKS): string[] {
  const out: string[] = [];
  replay(start, log, until, (s) => { if (s.tick % STEPS_PER_SECOND === 0) out.push(hashState(s)); });
  return out;
}

let first: string[] | null = null;
const firstRun = () => (first ??= hashes(duel(SEED)));

test('the same setup and orders give the same hash every second, and the ships do move', () => {
  assert.ok(script.length >= 2, 'the script gives orders');
  assert.deepEqual(hashes(duel(SEED)), firstRun());
  assert.equal(new Set(firstRun()).size, SECONDS, 'the state changes every second');
  const end = replay(duel(SEED), script, TICKS);
  const moved = end.ships.map((s, i) => Math.hypot(s.motion.pose.x - duelSetup(SEED).ships[i]!.x, s.motion.pose.z - duelSetup(SEED).ships[i]!.z));
  assert.ok(moved.some((d) => d > 1), `ships moved ${moved.map((d) => d.toFixed(1)).join(', ')} m`);
});

test('another order, another seed or another wind gives another state', () => {
  const end = firstRun().at(-1);
  const changed = script.map((e, i) => (i === 0 ? { ...e, orders: e.orders.map((o) => ({ kind: 'steer' as const, ship: o.ship, heading: 2 })) } : e));
  assert.notEqual(hashes(duel(SEED), changed).at(-1), end);
  assert.notEqual(hashes(duel(SEED + 1)).at(-1), end);
  assert.notEqual(hashes(duel(SEED, 3)).at(-1), end);
});

test('encode then decode gives the identical state, and stepping on from it ends where the run without a break did', () => {
  const mid = replay(duel(SEED), script, TICKS / 2);
  const bytes = encodeState(mid), back = decodeState(bytes);
  assert.deepEqual(back, mid);
  assert.deepEqual(encodeState(back), bytes);
  assert.equal(hashState(back), hashState(mid));
  // Nothing of the match hides outside the state: the decoded copy runs on to the same end.
  assert.equal(hashState(replay(back, script, TICKS)), firstRun().at(-1));
  // Small enough to send: well under the network's 16 KB a state.
  assert.ok(bytes.length < 8 * 1024, `${bytes.length} bytes`);
  assert.throws(() => decodeState(new Uint8Array([0, 1])), /not hold a simulation state/);
});

test('the clock is a count of steps, 30 a second', () => {
  let s = duel(SEED);
  assert.equal(s.tick, 0);
  for (let i = 0; i < STEPS_PER_SECOND; i++) s = step(s).state;
  assert.equal(s.tick, STEPS_PER_SECOND);
  assert.equal(simTime(s), 1);
  // A step changes nothing in the state it was given.
  const before = encodeState(s);
  step(s, [{ kind: 'steer', ship: 0, heading: 1 }]);
  assert.deepEqual(encodeState(s), before);
});

test('orders are answered in the step they are given in; one she cannot take is refused with its reason as an event', () => {
  const s = duel(SEED, MODERATE);
  const { state, events } = step(s, [
    { kind: 'steer', ship: 1, heading: 2 * Math.PI + 2.5 },
    { kind: 'steer', ship: 2, heading: 0 },
    { kind: 'steer', ship: 0, heading: Number.NaN },
    { kind: 'sail', ship: 0, canvas: 'plain' },
    { kind: 'sail', ship: 0, canvas: 'royals' as 'all' },
    { kind: 'back', ship: 1, mast: 'main' },
    { kind: 'back', ship: 1, mast: 'mizzen' as 'main' },
  ]);
  const one = state.ships[1]!.told, zero = state.ships[0]!.told;
  assert.ok(Math.abs(one.helm.heading - 2.5) < 1e-12 && one.helm.by === 0, 'the course wrapped');
  assert.deepEqual(one.backed, [false, true]);
  assert.equal(zero.canvas, 'plain');
  assert.deepEqual(zero.helm, s.ships[0]!.told.helm);
  const refused = events.filter((e: SimEvent) => e.kind === 'refused');
  assert.deepEqual(refused.map((e) => [e.tick, e.order.ship, e.order.kind]), [[0, 2, 'steer'], [0, 0, 'steer'], [0, 0, 'sail'], [0, 1, 'back']]);
  assert.match(refused[0]!.reason, /no ship 2/);
  assert.match(refused[1]!.reason, /not a number/);
  assert.match(refused[2]!.reason, /no "royals sail"/);
  assert.match(refused[3]!.reason, /no mast "mizzen"/);
  // Two orders for one ship in a step: the later one stands.
  const twice = step(s, [{ kind: 'steer', ship: 0, heading: 3.5 }, { kind: 'steer', ship: 0, heading: 4 }]).state;
  assert.equal(twice.ships[0]!.told.helm.heading, 4);
  assert.deepEqual(twice.ships[0]!.told.acts.map((a) => a.kind), ['helm']);
});

test('a match starts with the sea up under its wind and each ship still on her line', () => {
  const s = startMatch({ seed: 3, windForce: 4, windFrom: 0, ships: [{ x: 10, z: 20, heading: 1 }] });
  assert.equal(s.ships.length, 1);
  assert.deepEqual([s.ships[0]!.motion.pose.x, s.ships[0]!.motion.pose.z, s.ships[0]!.sailing.ahead, s.ships[0]!.sailing.heading], [10, 20, 0, 1]);
  assert.equal(s.sea.seaLayers.length, 1);
  assert.equal(s.wind.windForce, 4);
  assert.notEqual(s.sea.seaSeed, s.wind.windSeed);
});

/**
 * A step of two ships against the budget's 2 ms. The tablet's milliseconds come from `?bench`; here a step is held as
 * a share of sine and cosine pairs (docs/CHECKS.md): at about 25 ns a pair (the cloud machine, Node 24) 2 ms is
 * 80 000 pairs, and the frame of two floating ships may take no more than a quarter of that (it takes about 4 500),
 * leaving the rest of the step to the sailing, the crew and the guns.
 */
const BUDGET_PAIRS = 80_000;
const FRAME_SHARE = 0.25;
test('a step of two ships stays within a quarter of the 2 ms budget', () => {
  let s = replay(duel(SEED), [], STEPS_PER_SECOND);
  const ratio = pace(() => { s = step(s).state; }, BUDGET_PAIRS);
  assert.ok(ratio < FRAME_SHARE, `a step takes ${(ratio * 100).toFixed(1)} % of the budget`);
});
