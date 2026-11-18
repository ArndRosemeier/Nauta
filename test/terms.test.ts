/**
 * The match terms the menu sets (plan N7.2, docs/design/menu.md): defaults for one-tap starts, kept terms read back
 * safely, the hour drawn from the seed, the length for the simulation, and the end card's numbers.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TERMS, HOUR_AT, hourOf, matchMinutes, newSeed, NO_LIMIT, readSeed, readTerms } from '../src/app/terms.ts';
import { endCard, quietMoment, Tally } from '../src/app/tally.ts';
import type { LostHow } from '../src/sim/end.ts';
import { MOMENT } from '../src/sim/rules/end.ts';
import { duelStart } from '../src/sim/start.ts';
import { startMatch, type SimState } from '../src/sim/state.ts';
import type { SimEvent } from '../src/sim/step.ts';

test('terms read back from nothing or junk are the defaults; a seed only as a whole 32-bit number', () => {
  assert.deepEqual(readTerms(null), DEFAULT_TERMS);
  assert.deepEqual(readTerms({ navy: 'dutch', foe: 'admiral', wind: 'gale', hour: 'noon', meet: 'ahead', minutes: 33, seed: -4 }), DEFAULT_TERMS);
  assert.deepEqual(readTerms({ navy: 'french', foe: 'master', wind: 'strong', hour: 'dusk', meet: 'lee', minutes: NO_LIMIT, seed: 77 }),
    { navy: 'french', foe: 'master', wind: 'strong', hour: 'dusk', meet: 'lee', minutes: NO_LIMIT, seed: 77 });
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

test('the quiet moment before the end card is the ending played out: the longest of the ships lost, or the parting', () => {
  const at = (lost: readonly (LostHow | null)[], apart = false) => quietMoment({ tick: 0, lost, apart });
  assert.equal(at([null, 'struck']), MOMENT.struck);
  assert.equal(at(['sunk', null]), MOMENT.sunk);
  assert.equal(at(['sunk', 'burnt']), MOMENT.burnt, 'both lost: the slower ending');
  assert.equal(at([null, null]), MOMENT.drawn);
  assert.equal(at([null, null], true), MOMENT.drawn);
  assert.equal(at(['broke off', null], true), MOMENT['broke off']);
  assert.ok(at([null, 'blew up']) > at([null, 'sunk']) && at([null, 'sunk']) > at([null, 'struck']));
});
