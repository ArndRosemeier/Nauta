/**
 * The crew at work heard (implementation plan N4.6): each order has its own boatswain's call, piped from where the
 * boatswain stands as the order is taken, one call after another; what follows is piped (Haul Away as she comes
 * round, the Still when she misses stays, Carry On when the hands' work is done); bare feet are heard where the men
 * run, the rhythm of hauling at the pins being worked, the bell every five minutes, the drum while she beats to quarters;
 * across a deck everything comes muffled. Every call's take exists, and nothing heard was made to speak.
 * The crew is driven alone (orders.ts and crew.ts, her sailing standing still), as in crew.test.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bellStrikes, CrewWatch, pullLoudness, type CrewHeard, type CrewShot } from '../src/audio/crewHearing.ts';
import {
  LIFE_CALLS, BELL, BELL_EVERY, BELLS_A_WATCH, CALL_GAP, CARRY_ON, DRUM, HAUL_CALL, HAUL_PERIOD, HAUL_PULL, HAUL_SPREAD, ORDER_CALLS,
  RUN_STEP, STILL_CALL, SWING_PULLS, THROUGH_DECK,
} from '../src/audio/crewTuning.ts';
import { openShip } from '../src/sim/crew/closures.ts';
import { startCrew, stepCrew } from '../src/sim/crew/crew.ts';
import { carryOut, giveOrder, startOrders, VOCABULARY, type Order } from '../src/sim/orders.ts';
import { startSailing } from '../src/sim/ship/sailing.ts';
import { toWorld } from '../src/sim/ship/motion.ts';
import { placeSpot } from '../src/sim/crew/roster.ts';
import { startMatch, type SimShip } from '../src/sim/state.ts';
import type { SimEvent } from '../src/sim/step.ts';
import { DEGREE, MINUTES_PER_HOUR, SECONDS_PER_MINUTE, STEP_SECONDS, STEPS_PER_SECOND } from '../src/sim/units.ts';
import { BELL_MINUTES, DAY_PACE } from '../src/sim/rules/day.ts';
import { steadyWind } from './support/sail.ts';
import './support/warm.ts';

const FORCE = 4;
const WIND = steadyWind(FORCE, 0);
const HEADING = 100 * DEGREE;
const SEED = 7;
/** A ship of a match, her pose and her other parts for the crew's to be laid over. */
const BASE: SimShip = startMatch({ seed: SEED, windForce: FORCE, windFrom: 0, ships: [{ x: 0, z: 0, heading: HEADING }] }).ships[0]!;
/** The ear on her quarterdeck, at a man's eye (ship space), and below on her berth deck amidships. */
const QUARTERDECK: readonly [number, number, number] = [0, 4.5, 3.8];
const BERTH: readonly [number, number, number] = [0, 1.6, -4];

interface Heard extends CrewShot { readonly t: number }

/**
 * The crew given `orders` (each at its tick) and stepped for `seconds`, heard from `ear` each step with the ship's
 * match's clock starting at `from` s; every shot heard, with its time, and the beds at each step.
 */
function listen(orders: readonly { tick: number; order: Order }[], seconds: number, o: { ear?: readonly [number, number, number]; below?: number; from?: number; drum?: boolean; day?: (t: number) => number; extra?: (tick: number) => SimEvent[] } = {}) {
  const sailing = startSailing({ heading: HEADING, speed: 3 }, WIND, FORCE);
  let told = startOrders(HEADING, 'battle'), crew = startCrew();
  const watch = new CrewWatch(SEED), shots: Heard[] = [], beds: CrewHeard['beds'][] = [], out: CrewHeard = { shots: [], beds: [] };
  for (let tick = 0; tick < seconds * STEPS_PER_SECOND; tick++) {
    const events: SimEvent[] = [];
    for (const g of orders) if (g.tick === tick) {
      const a = giveOrder(told, sailing, g.order, { tick, wind: WIND, force: FORCE });
      assert.equal(a.reason, '', `${g.order.kind} is taken`);
      told = a.told;
    }
    const r = stepCrew(crew, told, { tick, heel: 0, closures: openShip(), captain: null, canvas: sailing.canvas });
    const c = carryOut(told, sailing, r.done, WIND);
    for (const order of c.done) events.push({ kind: 'done', tick, ship: 0, order });
    events.push(...(o.extra?.(tick) ?? []));
    told = c.told; crew = r.crew;
    const t = (o.from ?? 0) + tick * STEP_SECONDS;
    watch.note(events);
    watch.listen({ ship: { ...BASE, told, crew }, t, pose: BASE.motion.pose, ear: o.ear ?? QUARTERDECK, below: o.below ?? 0, drum: o.drum ?? false, day: o.day?.(t) ?? null }, out);
    for (const s of out.shots) shots.push({ ...s, t });
    beds.push([...out.beds]);
  }
  return { shots, beds };
}

/** Shots grouped by a key, in order. */
function groupBy(shots: readonly Heard[], key: (s: Heard) => string): Map<string, Heard[]> {
  const m = new Map<string, Heard[]>();
  for (const s of shots) { const k = key(s); m.set(k, [...(m.get(k) ?? []), s]); }
  return m;
}

const calls = (shots: readonly Heard[]) => shots.filter((s) => s.id.startsWith('pipe/'));
const index = JSON.parse(readFileSync(new URL('../public/sound/index.json', import.meta.url), 'utf8')) as { sounds: Record<string, { files: string[]; seconds: number[] }> };

test('every order has its call, the hands\' orders each their own, and every call is a take of the game as long as the tuning says', () => {
  // The gunnery orders take no sailing hands and are not piped (the drum beats to quarters); the first lieutenant's parties for her life have their own calls (LIFE_CALLS, N6.8), the carpenter's orders and striking none; the master's standing orders are piped by the helm orders he gives for them.
  const sailing = VOCABULARY.flatMap((w) => (Object.hasOwn(ORDER_CALLS, w.kind) ? [w.kind as keyof typeof ORDER_CALLS] : []));
  assert.deepEqual(VOCABULARY.filter((w) => !sailing.includes(w.kind as keyof typeof ORDER_CALLS)).map((w) => w.kind), ['follow', 'abeam', 'quarters', 'stand', 'shot', 'aim', 'bear', 'hold', 'fire', 'cease', 'pumps', 'fires', 'wreckage', 'strike', 'plug', 'pumping', 'sound'], 'every sailing order has a call');
  const hands = sailing.filter((k) => VOCABULARY.find((w) => w.kind === k)!.to === 'first lieutenant' || ['tack', 'wear', 'heave'].includes(k));
  assert.equal(new Set(hands.map((k) => ORDER_CALLS[k].id)).size, hands.length, 'no two orders of the hands share a call');
  const piped = [...hands.map((k) => ORDER_CALLS[k].id), ...Object.values(LIFE_CALLS).map((c) => c.id)];
  assert.equal(new Set(piped).size, piped.length, 'the parties for her life each their own call too');
  for (const c of [...Object.values(ORDER_CALLS), ...Object.values(LIFE_CALLS), HAUL_CALL, STILL_CALL, CARRY_ON]) {
    const entry = index.sounds[c.id];
    assert.ok(entry, `${c.id} is made`);
    assert.ok(Math.abs(entry.seconds[0]! - c.seconds) < 0.15, `${c.id}: ${entry.seconds[0]} s made, ${c.seconds} s in the tuning`);
  }
  for (const k of [RUN_STEP, HAUL_PULL, BELL, DRUM]) assert.ok(index.sounds[k.id], `${k.id} is made`);
});

test('nothing the crew makes was asked to speak: every made take says no voices, the calls are synthesised', () => {
  const spec = JSON.parse(readFileSync(new URL('../tools/sound/sounds.json', import.meta.url), 'utf8')) as { sounds: { id: string; prompt?: string; from?: string[] }[] };
  const crew = spec.sounds.filter((s) => /^(pipe|haul|bell|drum)\//.test(s.id) || s.id === 'step/run' || s.id.startsWith('bed/crew-'));
  for (const s of crew) {
    if (s.id.startsWith('pipe/')) { assert.ok(s.from?.[0]?.endsWith('.wav'), `${s.id} is synthesised`); continue; }
    assert.ok(s.prompt?.startsWith('The sound of') && s.prompt.includes('no voices'), `${s.id}: a sound, no voices`);
  }
});

/** How far from the capstan the boatswain may be piping, m: the length of his walk and a little more. */
const QUARTERDECK_REACH = 4;

test('an order is piped from the boatswain as it is taken; two orders one after the other; what was given before is not piped', () => {
  const { shots } = listen([{ tick: 0, order: { kind: 'tack', ship: 0 } }, { tick: 30, order: { kind: 'tack', ship: 0 } }], 0.5);
  assert.deepEqual(calls(shots), [], 'orders already given when hearing began are not piped');
  const r = listen([{ tick: 3, order: { kind: 'sail', ship: 0, canvas: 'plain' } }, { tick: 4, order: { kind: 'back', ship: 0, mast: 'fore' } }], 6);
  const piped = calls(r.shots);
  assert.equal(piped[0]!.id, ORDER_CALLS.sail.id);
  assert.ok(Math.abs(piped[0]!.t - 3 * STEP_SECONDS) < 1e-9, 'piped in the frame the order is taken');
  assert.equal(piped[1]!.id, ORDER_CALLS.back.id);
  const after = ORDER_CALLS.sail.seconds + CALL_GAP;
  assert.ok(piped[1]!.t >= piped[0]!.t + after - 1e-9 && piped[1]!.t < piped[0]!.t + after + 2 * STEP_SECONDS, 'the second call when the first has ended');
  // From the quarterdeck by the capstan, where the boatswain walks his lane beside the first lieutenant's: a few metres from the capstan.
  const station = placeSpot('station-quarterdeck'), there = toWorld(BASE.motion.pose, station.across, 0, -station.along), at = piped[0]!.at;
  assert.ok(Math.hypot(at[0] - there[0], at[2] - there[2]) < QUARTERDECK_REACH, `piped by the capstan (${at.map((v) => v.toFixed(1))})`);
  assert.equal(piped[0]!.bus, 'body', 'on deck, heard close');
});

test("the first lieutenant's parties for her life are piped as they are ordered; the carpenter's orders are not", () => {
  const r = calls(listen([{ tick: 3, order: { kind: 'pumps', ship: 0 } }, { tick: 4, order: { kind: 'plug', ship: 0 } }, { tick: 5, order: { kind: 'fires', ship: 0 } }], 5).shots);
  assert.deepEqual(r.map((s) => s.id), [LIFE_CALLS.pumps.id, LIFE_CALLS.fires.id]);
  assert.ok(Math.abs(r[0]!.t - 3 * STEP_SECONDS) < 1e-9, 'piped in the frame it is ordered');
  assert.deepEqual(calls(listen([{ tick: 0, order: { kind: 'wreckage', ship: 0 } }], 1).shots), [], 'ordered before hearing began: not piped');
});

test('what follows is piped: Carry On when the hands are done, Haul Away, the braces and Carry On as she comes round, the Still when she misses stays', () => {
  const sail = calls(listen([{ tick: 1, order: { kind: 'sail', ship: 0, canvas: 'plain' } }], 110).shots).map((s) => s.id);
  assert.deepEqual(sail, [ORDER_CALLS.sail.id, CARRY_ON.id], 'made sail, then Carry On');
  const steer = calls(listen([{ tick: 1, order: { kind: 'steer', ship: 0, heading: 120 * DEGREE } }], 5).shots).map((s) => s.id);
  assert.deepEqual(steer, [ORDER_CALLS.steer.id], 'a course ends without a call');
  const round = listen([], 6, { extra: (tick) => (tick === 15 ? [{ kind: 'tacked', tick, ship: 0 }] : tick === 120 ? [{ kind: 'missed stays', tick, ship: 1 }] : []) });
  assert.deepEqual(calls(round.shots).map((s) => s.id), [HAUL_CALL.id, CARRY_ON.id], 'Haul Away, Carry On; another ship\'s event is not hers');
  const tack = calls(listen([{ tick: 1, order: { kind: 'tack', ship: 0 } }], 10).shots).map((s) => s.id);
  assert.deepEqual(tack, [ORDER_CALLS.tack.id], 'the helm over is no end of a tack: she is not round yet');
  assert.equal(round.shots.filter((s) => s.id === HAUL_PULL.id).length, SWING_PULLS, 'the braces swung');
  const missed = calls(listen([], 2, { extra: (tick) => (tick === 15 ? [{ kind: 'missed stays', tick, ship: 0 }] : []) }).shots);
  assert.deepEqual(missed.map((s) => s.id), [STILL_CALL.id]);
});

test('making sail: feet run on her deck, the nearest one by one and the rest as a crowd, and the gangs haul in their rhythm at the pins', () => {
  const { shots, beds } = listen([{ tick: 1, order: { kind: 'sail', ship: 0, canvas: 'plain' } }], 100);
  const feet = shots.filter((s) => s.id === RUN_STEP.id);
  assert.ok(feet.length > 20, `feet heard (${feet.length})`);
  const most = Math.max(...[...groupBy(feet, (s) => String(s.t)).values()].map((g) => g.length));
  assert.ok(most <= 4, 'only the nearest few one foot at a time');
  assert.ok(beds.some((b) => b.some((x) => x.id.startsWith('bed/crew-run') && x.level > 0)), 'a crowd of feet');
  const pulls = shots.filter((s) => s.id === HAUL_PULL.id);
  assert.ok(pulls.length > 10, `hauling heard (${pulls.length})`);
  // Each pin's pulls come in its rhythm.
  for (const group of groupBy(pulls, (s) => s.at.map((v) => v.toFixed(2)).join()).values()) {
    for (let k = 1; k < group.length; k++) {
      const gap = group[k]!.t - group[k - 1]!.t;
      if (gap > 2 * HAUL_PERIOD) continue;
      assert.ok(gap >= HAUL_PERIOD * (1 - HAUL_SPREAD) - STEP_SECONDS && gap <= HAUL_PERIOD * (1 + HAUL_SPREAD) + STEP_SECONDS, `a pull every ${gap.toFixed(2)} s`);
    }
  }
  assert.ok(pullLoudness(1) > pullLoudness(1 / 2) && pullLoudness(0) > 0, 'a gang short of hands pulls quieter');
});

test('below deck the crew on deck is heard through her planking: muffled and quieter', () => {
  const above = listen([{ tick: 1, order: { kind: 'sail', ship: 0, canvas: 'plain' } }], 3);
  const below = listen([{ tick: 1, order: { kind: 'sail', ship: 0, canvas: 'plain' } }], 3, { ear: BERTH, below: 1 });
  const a = calls(above.shots)[0]!, b = calls(below.shots)[0]!;
  assert.equal(b.bus, 'world');
  assert.ok(Math.abs(b.gain - a.gain * THROUGH_DECK) < 1e-9);
});

test('the ship\'s bell: struck every five minutes of the match, one bell more each time up to eight and from one again, in pairs', () => {
  const at = (n: number) => bellStrikes(n * BELL_EVERY - STEP_SECONDS, n * BELL_EVERY);
  assert.deepEqual(bellStrikes(0, STEP_SECONDS), [], 'nothing at the start');
  assert.equal(at(1).length, 1);
  assert.equal(at(4).length, 4);
  assert.equal(at(BELLS_A_WATCH).length, BELLS_A_WATCH, 'eight bells');
  assert.equal(at(BELLS_A_WATCH + 1).length, 1, 'then one again');
  assert.deepEqual(bellStrikes(BELL_EVERY + 1, BELL_EVERY + 2), [], 'only as the time passes');
  const seven = at(7);
  assert.ok(seven[1]! - seven[0]! < seven[2]! - seven[1]!, 'struck in pairs');
  // Heard where it hangs, once, as the match's clock passes the time.
  const heard = listen([], 1, { from: 3 * BELL_EVERY - 1 / 2 }).shots.filter((s) => s.id === BELL.id);
  assert.equal(heard.length, 3);
  const alone = new CrewWatch(SEED), out: CrewHeard = { shots: [], beds: [] };
  alone.bellAlone({ t: BELL_EVERY - STEP_SECONDS, pose: BASE.motion.pose, below: 0, day: null }, out);
  assert.equal(alone.bellAlone({ t: BELL_EVERY, pose: BASE.motion.pose, below: 0, day: null }, out).shots.length, 1, 'with no match, by the page\'s clock');
});

test('in the sandbox the bell strikes the day\'s watches by the day clock, and the five-minute bell is silent', () => {
  // Started at 8:29 (a minute before two bells of the forenoon... one bell at 8:30) the day passes 8:30 half a real minute in.
  const start = 8 * MINUTES_PER_HOUR + BELL_MINUTES - 1, heardBells = (from: number, seconds: number) => listen([], seconds, { from, day: (t) => start + (t / SECONDS_PER_MINUTE) * DAY_PACE }).shots.filter((s) => s.id === BELL.id).length;
  assert.equal(heardBells(0, SECONDS_PER_MINUTE), 1, 'one bell at half past eight');
  assert.equal(heardBells(BELL_EVERY - 1, 2), 0, 'not the five-minute bell: the day clock rules');
});

test('the drum is heard where the drummer stands while she beats to quarters, and not otherwise', () => {
  assert.ok(listen([], 0.2, { drum: true }).beds.every((b) => b.some((x) => x.id === DRUM.id && x.level > 0)));
  assert.ok(listen([], 0.2).beds.every((b) => !b.some((x) => x.id === DRUM.id)));
});
