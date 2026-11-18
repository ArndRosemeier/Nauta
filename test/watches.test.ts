/**
 * The sandbox's watches (design ruling 2026-11-18): the men who sleep below stand them, and while their watch has the
 * deck a few of them stand at their posts (lookouts, men at the pin rails) and the rest sleep on; when the watch
 * changes the others come up and these go below. Each from the sleepers alone (CHECKS.md: far cheaper than the crew).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openShip } from '../src/sim/crew/closures.ts';
import { sameSpot, startCrew, stepCrew, type Crew } from '../src/sim/crew/crew.ts';
import { routeNetwork } from '../src/sim/crew/network.ts';
import { brigRoster, placeSpot } from '../src/sim/crew/roster.ts';
import { DAY_JOBS, DECK_WATCH, TURN_OUT_SECONDS, type Watch } from '../src/sim/rules/day.ts';
import { carryOut } from '../src/sim/orders.ts';
import { steadyWind } from './support/sail.ts';
import { nodeAt } from '../src/sim/ship/walk.ts';
import { watchClip } from '../src/app/standBy.ts';
import { startMatch } from '../src/sim/state.ts';
import { step, type SimEvent } from '../src/sim/step.ts';
import { MINUTES_PER_HOUR, STEPS_PER_SECOND } from '../src/sim/units.ts';
import { give, startSail, startTold } from './support/crew.ts';
import { duelSetup } from './support/match.ts';
import './support/warm.ts';

/** Long enough for the relieved to go below and the relief to come up, s. */
const CHANGE_SECONDS = 90;

/** A steady breeze to carry the order out in. */
const WIND_STEADY = steadyWind(4, 0);

const ROSTER = brigRoster().filter((m) => m.watch !== null || m.hours !== null);
const posted = (w: Watch) => ROSTER.flatMap((m, i) => (m.watch === w && m.watchPost && m.watchSlot !== null ? [i] : []));
const named = (rank: string) => ROSTER.flatMap((m, i) => (m.rank === rank ? [i] : []));

/** The sleepers' crew stepped for `seconds` with watch `onDeck` on deck, from `from`. */
function keep(onDeck: Watch, seconds: number, from: Crew = startCrew(ROSTER), minute?: number): Crew {
  let crew = from;
  for (let tick = 0; tick < seconds * STEPS_PER_SECOND; tick++) {
    crew = stepCrew(crew, startTold(), { tick, heel: 0, closures: openShip(), captain: null, canvas: startSail().canvas, watch: onDeck, ...(minute === undefined ? {} : { minute }) }, ROSTER).crew;
  }
  return crew;
}

const at = (crew: Crew, i: number, place: string): boolean => crew.men[i]!.going === null && sameSpot(crew.men[i]!.stands ?? placeSpot(ROSTER[i]!.home), placeSpot(place));

test('the men who sleep below are shared between the two watches, each with the same posts to stand on deck, every one a clear place', () => {
  assert.ok(ROSTER.length >= 40);
  for (const w of [0, 1] as const) {
    assert.deepEqual(posted(w).map((i) => ROSTER[i]!.watchPost).sort(), DECK_WATCH.map((j) => j.place).sort(), `watch ${w} posts`);
    assert.ok(ROSTER.filter((m) => m.watch === w).length >= ROSTER.length / 2 - 4, `watch ${w} has about half`);
  }
  const graph = routeNetwork().graph;
  for (const j of DECK_WATCH) assert.ok(nodeAt(graph, placeSpot(j.place)) >= 0, `${j.place} is a clear place`);
  for (const job of DAY_JOBS) for (const place of job.places) assert.ok(nodeAt(graph, placeSpot(place)) >= 0, `${job.what}: ${place} is a clear place`);
});

test('the watch on deck stands at its posts and the other sleeps; when they change, the relieved go below and the relief comes up', () => {
  const first = keep(0, CHANGE_SECONDS);
  for (const i of posted(0)) assert.ok(at(first, i, ROSTER[i]!.watchPost!), `${ROSTER[i]!.rank} ${i} is at ${ROSTER[i]!.watchPost}`);
  for (const i of posted(1)) assert.ok(at(first, i, ROSTER[i]!.home), `${ROSTER[i]!.rank} ${i} sleeps`);
  const changed = keep(1, CHANGE_SECONDS, first);
  for (const i of posted(1)) assert.ok(at(changed, i, ROSTER[i]!.watchPost!), `${ROSTER[i]!.rank} ${i} has relieved`);
  for (const i of posted(0)) assert.ok(at(changed, i, ROSTER[i]!.home), `${ROSTER[i]!.rank} ${i} has gone below`);
});

/** A seed for the test matches, and the steps to pass a minute of game time with margin. */
const SEED = 9;
const RUN_STEPS = 3 * STEPS_PER_SECOND;

test('the match announces the change of watch once, as the day passes four o\'clock, and a fight (no day) never does', () => {
  const watches = (dayStart: number | undefined): SimEvent[] => {
    let state = startMatch({ ...duelSetup(SEED), ...(dayStart === undefined ? {} : { dayStart }) });
    const out: SimEvent[] = [];
    for (let k = 0; k < RUN_STEPS; k++) { const r = step(state); state = r.state; out.push(...r.events.filter((e) => e.kind === 'watch')); }
    return out;
  };
  // Two seconds before four in the morning: the morning watch (the second of the day, the starboard's) takes the deck from the middle.
  const events = watches(4 * MINUTES_PER_HOUR - 1);
  assert.equal(events.length, 2, 'once for each of her two ships');
  assert.deepEqual(events.map((e) => e.kind === 'watch' && [e.ship, e.index, e.onDeck]), [[0, 1, 1], [1, 1, 1]]);
  assert.deepEqual(watches(undefined), []);
});

/** Noon, and one o'clock, in game minutes. */
const NOON = 12 * MINUTES_PER_HOUR;
const ONE = NOON + MINUTES_PER_HOUR;

test('the day\'s jobs: at noon the watch on deck comes to the scuttlebutt for its grog, each to a place of his own, and goes back to its posts after', () => {
  const grog = DAY_JOBS.find((j) => j.what === 'grog')!, onDeck = posted(0);
  const noon = keep(0, CHANGE_SECONDS, startCrew(ROSTER), NOON);
  const places = onDeck.map((i) => grog.places[ROSTER[i]!.watchSlot! % grog.places.length]!);
  assert.equal(new Set(places).size, onDeck.length, 'each at a place of his own');
  onDeck.forEach((i, k) => assert.ok(at(noon, i, places[k]!), `${ROSTER[i]!.rank} ${i} is at his grog`));
  for (const i of posted(1)) assert.ok(at(noon, i, ROSTER[i]!.home), 'the watch below sleeps through it');
  const after = keep(0, CHANGE_SECONDS, noon, ONE);
  for (const i of onDeck) assert.ok(at(after, i, ROSTER[i]!.watchPost!), `${ROSTER[i]!.rank} ${i} is back at his post`);
});

test('a hand of the watch on deck plays the clip of the place he stands at: lookout, coiling, grog; one at neither plays none of these', () => {
  const clips = (post: string) => posted(0).map((i) => ROSTER[i]!).filter((m) => m.watchPost!.startsWith(post)).map((m) => watchClip(m, placeSpot(m.watchPost!)));
  assert.deepEqual(new Set(clips('top-')), new Set(['lean on rail']));
  assert.deepEqual(new Set(clips('pin-')), new Set(['cmu 62_21']));
  const grog = DAY_JOBS.find((j) => j.what === 'grog')!, man = ROSTER[posted(0)[0]!]!;
  assert.equal(watchClip(man, placeSpot(grog.places[man.watchSlot! % grog.places.length]!)), 'eat or drink');
  assert.equal(watchClip(man, placeSpot(man.home)), null);
});

test('the officers and the helm keep watches too: the officer of the watch paces and the helmsmen of the watch hold the wheel; the others lie in their hammocks', () => {
  const lieutenants = [named('first lieutenant')[0]!, named('second lieutenant')[0]!], bosuns = [named('boatswain')[0]!, named("boatswain's mate")[0]!];
  const wheel = named('quartermaster');
  assert.equal(wheel.length, 4);
  assert.deepEqual(wheel.map((i) => ROSTER[i]!.watch), [0, 1, 0, 1]);
  for (const man of [lieutenants[1]!, bosuns[1]!, ...wheel]) assert.ok(ROSTER[man]!.bunk !== null || ROSTER[man]!.berth !== null, `${ROSTER[man]!.rank} has a hammock to lie in`);
  const first = keep(0, CHANGE_SECONDS);
  const paces = (i: number) => (ROSTER[i]!.paces ?? ROSTER[i]!.watchPaces)!.some((p) => first.men[i]!.going !== null || at(first, i, p));
  assert.ok(paces(lieutenants[0]!) && paces(bosuns[0]!), 'the first lieutenant and the boatswain pace in the larboard watch');
  const berth = (i: number) => ROSTER[i]!.berth?.station ?? ROSTER[i]!.home;
  for (const i of [lieutenants[1]!, bosuns[1]!, wheel[1]!, wheel[3]!]) assert.ok(at(first, i, berth(i)), `${ROSTER[i]!.rank} ${i} lies in his hammock`);
  for (const i of [wheel[0]!, wheel[2]!]) assert.ok(at(first, i, 'station-wheel'), `${ROSTER[i]!.rank} ${i} holds the wheel`);
  const changed = keep(1, CHANGE_SECONDS, first);
  for (const i of [lieutenants[0]!, bosuns[0]!, wheel[0]!, wheel[2]!]) assert.ok(at(changed, i, berth(i)), `${ROSTER[i]!.rank} ${i} has gone below`);
  for (const i of [wheel[1]!, wheel[3]!]) assert.ok(at(changed, i, 'station-wheel'), `${ROSTER[i]!.rank} ${i} has the wheel`);
});

test('the cook keeps his galley from half past five to seven in the evening and lies in his hammock the rest of the day', () => {
  const [cook] = named('cook');
  const night = keep(0, CHANGE_SECONDS, startCrew(ROSTER), 2 * MINUTES_PER_HOUR);
  assert.ok(at(night, cook!, ROSTER[cook!]!.berth!.station), 'asleep at two in the morning');
  const day = keep(0, CHANGE_SECONDS, night, 8 * MINUTES_PER_HOUR);
  assert.ok(at(day, cook!, ROSTER[cook!]!.home), 'at his stove by eight');
  const evening = keep(0, CHANGE_SECONDS, day, 20 * MINUTES_PER_HOUR);
  assert.ok(at(evening, cook!, ROSTER[cook!]!.berth!.station), 'in his hammock again by eight in the evening');
});

test('an order calls the watch on deck first; a man of the watch below is turned out by the pipe and starts for his place only some seconds after the men are told off', () => {
  const settled = keep(0, CHANGE_SECONDS);
  let crew = settled, told = give(startTold(), startSail(), { kind: 'sail', ship: 0, canvas: 'plain' });
  const sailing = startSail(), start = 0, begun = new Map<number, number>();
  for (let tick = start; tick < 20 * STEPS_PER_SECOND; tick++) {
    const r = stepCrew(crew, told, { tick, heel: 0, closures: openShip(), captain: null, canvas: sailing.canvas, watch: 0 }, ROSTER);
    crew = r.crew;
    told = carryOut(told, sailing, r.done, WIND_STEADY).told;
    for (const t of crew.tasks) for (const i of t.hands) if (ROSTER[i]!.watch === 1 && !begun.has(i) && crew.men[i]!.going) begun.set(i, tick - t.piped);
  }
  const hands = crew.tasks.flatMap((t) => t.hands);
  assert.ok(hands.some((i) => ROSTER[i]!.watch === 0), 'the watch on deck is called');
  assert.ok(begun.size > 0, 'some of the watch below is called too');
  for (const [i, after] of begun) assert.ok(after >= TURN_OUT_SECONDS * STEPS_PER_SECOND, `man ${i} of the watch below started ${after} steps after he was told off`);
});
