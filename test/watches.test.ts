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
import { DAY_JOBS, DECK_WATCH, type Watch } from '../src/sim/rules/day.ts';
import { nodeAt } from '../src/sim/ship/walk.ts';
import { watchClip } from '../src/app/standBy.ts';
import { startMatch } from '../src/sim/state.ts';
import { step, type SimEvent } from '../src/sim/step.ts';
import { MINUTES_PER_HOUR, STEPS_PER_SECOND } from '../src/sim/units.ts';
import { startSail, startTold } from './support/crew.ts';
import { duelSetup } from './support/match.ts';
import './support/warm.ts';

/** Long enough for the relieved to go below and the relief to come up, s. */
const CHANGE_SECONDS = 90;

const ROSTER = brigRoster().filter((m) => m.watch !== null);
const posted = (w: Watch) => ROSTER.flatMap((m, i) => (m.watch === w && m.watchPost ? [i] : []));

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
