/**
 * The match terms the menu sets (plan N7.2, docs/design/menu.md): defaults for one-tap starts, kept terms read back
 * safely, the hour drawn from the seed, the length for the simulation, and the end card's numbers.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TERMS, HOUR_AT, hourOf, matchMinutes, newSeed, NO_LIMIT, readSeed, readTerms } from '../src/app/terms.ts';
import { navyOfShip, PRESETS } from '../src/sim/scenario.ts';
import { endCard, Tally } from '../src/app/tally.ts';
import { duelStart } from '../src/sim/start.ts';
import { startMatch, type SimState } from '../src/sim/state.ts';
import type { SimEvent } from '../src/sim/step.ts';

test('terms read back from nothing or junk are the defaults; a seed only as a whole 32-bit number', () => {
  assert.deepEqual(readTerms(null), DEFAULT_TERMS);
  assert.deepEqual(readTerms({ scenario: 7, wind: 'gale', hour: 'noon', meet: 'ahead', minutes: 33, seed: -4 }), DEFAULT_TERMS);
  const kept = { scenario: PRESETS.watch, wind: 'strong', hour: 'dusk', meet: 'lee', minutes: NO_LIMIT, seed: 77 };
  assert.deepEqual(readTerms(JSON.parse(JSON.stringify(kept))), kept);
  // Terms kept before the scenario existed: you in the navy chosen against a captain of the skill chosen.
  const old = readTerms({ navy: 'french', foe: 'master', wind: 'light' }).scenario;
  assert.equal(navyOfShip(old, 0), 'french');
  assert.equal(navyOfShip(old, 1), 'british');
  assert.deepEqual(old.ships.map((s) => s.command), [{ kind: 'you' }, { kind: 'computer', skill: 'master' }]);
  assert.deepEqual(readTerms({ navy: 'dutch', foe: 'admiral' }).scenario, DEFAULT_TERMS.scenario);
  assert.equal(readSeed(' 1234 '), 1234);
  for (const v of ['', 'abc', '1.5', '-1', String(2 ** 32), null]) assert.equal(readSeed(v), null, String(v));
});

test('the hour is the one named, or drawn from the seed among the named hours, mostly by day', () => {
  assert.equal(hourOf('dusk', 3), HOUR_AT.dusk);
  const drawn = Array.from({ length: 400 }, (_, seed) => hourOf('drawn', seed));
  assert.ok(drawn.every((h) => Object.values(HOUR_AT).includes(h)));
  assert.equal(new Set(drawn).size, Object.keys(HOUR_AT).length);
  assert.ok(drawn.filter((h) => h === HOUR_AT.day).length > drawn.length / 3);
  assert.equal(hourOf('drawn', 11), hourOf('drawn', 11));
});

test('no limit is a day for the simulation; new seeds differ from match to match', () => {
  assert.equal(matchMinutes({ ...DEFAULT_TERMS, minutes: 20 }), 20);
  assert.ok(matchMinutes({ ...DEFAULT_TERMS, minutes: NO_LIMIT }) >= 600);
  assert.notEqual(newSeed(1000, 0), newSeed(1000, 1));
  assert.ok(Number.isInteger(newSeed(Date.UTC(2026, 10, 18), 0)) && newSeed(0, 0) >= 0);
});

test('the end card: guns fired and balls that struck counted once each, how it ended seen from my ship', () => {
  const tally = new Tally();
  const fired = (ship: number, gun: number): SimEvent => ({ kind: 'fired', tick: 1, ship, gun, fired: { shot: 'round', span: 0, balls: [] } });
  const hit = (ship: number, by: number, gun: number, what: 'hole' | 'man'): SimEvent => ({ kind: 'hit', tick: 5, ship, by, gun, what, at: { along: 0, across: 0, up: 0 }, id: 0 } as unknown as SimEvent);
  tally.count([fired(0, 1), fired(0, 2), fired(1, 1), hit(1, 0, 1, 'hole'), hit(1, 0, 1, 'man'), hit(1, 0, 2, 'hole')]);
  assert.deepEqual(tally.of(0), { fired: 2, struck: 2 });
  assert.deepEqual(tally.of(1), { fired: 1, struck: 0 });
  const state = startMatch(duelStart(5));
  assert.equal(endCard(state, 0, tally), null, 'no card while the fight goes on');
  const ended = (lost: readonly (string | null)[], apart = false): SimState => ({ ...state, fight: { ...state.fight, end: { tick: 1800, lost, apart } } } as SimState);
  assert.deepEqual(endCard(ended([null, 'struck']), 0, tally)?.ending, { who: 'she', how: 'struck' });
  assert.deepEqual(endCard(ended([null, 'struck']), 1, tally)?.ending, { who: 'me', how: 'struck' });
  assert.deepEqual(endCard(ended([null, null]), 0, tally)?.ending, { who: 'none', apart: false }, 'parted at nightfall');
  // Sailing out of the fight: the ship that ran broke off the action; both sailing apart is drawn.
  assert.deepEqual(endCard(ended(['broke off', null], true), 1, tally)?.ending, { who: 'she', how: 'broke off' });
  assert.deepEqual(endCard(ended([null, null], true), 0, tally)?.ending, { who: 'none', apart: true }, 'sailed apart');
  const card = endCard(ended(['sunk', null]), 1, tally)!;
  assert.equal(card.seconds, 60);
  assert.deepEqual(card.ships.map((s) => s.fired), [1, 2], 'mine first');
  tally.reset();
  assert.deepEqual(tally.of(0), { fired: 0, struck: 0 });
});
