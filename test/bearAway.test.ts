/**
 * The helmsman under a steer order (design decision 2026-11-18): when a shift of the wind heads her and a sail goes
 * aback he bears away by himself, a point at a time at most, holds the new heading, and the master says so; never
 * through the wind, and not under full and by, in a tack or hove to.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { angleDiff } from '@futuremagic/core';
import { BEAR_AWAY } from '../src/sim/rules/orders.ts';
import { sailAback } from '../src/sim/ship/sailing.ts';
import { meanWind } from '../src/sim/wind.ts';
import { simTime, type SimState } from '../src/sim/state.ts';
import { step } from '../src/sim/step.ts';
import { DEGREE, STEPS_PER_SECOND } from '../src/sim/units.ts';
import { parseOrder, type Order } from '../src/sim/orders.ts';
import { MODERATE, underWay } from './support/orders.ts';
import './support/warm.ts';

/** The steer order's time to be taken and carried out, s. */
const ORDER_SECONDS = 5;
const order = (words: string): Order => { const o = parseOrder(words, 0); assert.ok(typeof o !== 'string', `${words}: ${String(o)}`); return o as Order; };
const aback = (s: SimState): boolean => sailAback(s.ships[0]!.sailing, meanWind(s.wind, simTime(s)));
/** Her heading off the mean wind, rad (+ with the wind on her larboard side: she heads to the east of where it blows from). */
const offWind = (s: SimState): number => angleDiff(meanWind(s.wind, simTime(s)).from, s.ships[0]!.sailing.heading);

/** On the beam, then the wind veers by `header` rad toward her bow: the match run on `seconds`, with its sailing events. */
function headed(header: number, seconds: number, first: readonly Order[] = []): { state: SimState; bore: number; away: number[]; kinds: string[] } {
  let s = underWay(MODERATE, 90, 20, 'plain', 8);
  // The captain's steer order for the course she is on: from then on the helmsman is under it.
  for (let k = 0; k < ORDER_SECONDS * STEPS_PER_SECOND; k++) s = step(s, k === 0 ? [order('steer 090')] : []).state;
  s = { ...s, wind: { ...s.wind, windFrom: s.wind.windFrom + header } };
  const away: number[] = [], kinds: string[] = [];
  let bore = 0, last = offWind(s);
  for (let k = 0; k < seconds * STEPS_PER_SECOND; k++) {
    const r = step(s, k === 0 ? first : []);
    s = r.state;
    for (const e of r.events) {
      if (e.kind === 'bore away' || e.kind === 'tacked' || e.kind === 'wore' || e.kind === 'missed stays') kinds.push(e.kind);
      if (e.kind === 'bore away') { bore++; const now = offWind(s); away.push(Math.abs(now) - Math.abs(last)); }
    }
    last = offWind(s);
  }
  return { state: s, bore, away, kinds };
}

test('a header at 75° off the wind ends with her filled and no sail aback, by bearing away a point or less at a time', () => {
  const r = headed(15 * DEGREE, 30);
  assert.ok(r.bore >= 1, 'the helmsman bore away');
  assert.ok(!aback(r.state), 'no sail aback at the end');
  assert.ok(r.away.every((a) => a <= BEAR_AWAY.most * 1.5), `each time a point or less: ${r.away.map((a) => (a / DEGREE).toFixed(1)).join(', ')}`);
  assert.ok(Math.abs(offWind(r.state)) > 75 * DEGREE - 1 * DEGREE, 'she is no nearer the wind than the header left her');
  assert.ok(r.kinds.every((k) => k === 'bore away'), `never through the wind: ${r.kinds.join(', ')}`);
});

test('a wind that does not head her leaves the helm alone', () => {
  assert.equal(headed(0, 15).bore, 0, 'on the beam nothing is aback');
});

test('under full and by the helmsman follows the wind himself and is not told to bear away', () => {
  assert.equal(headed(15 * DEGREE, 15, [order('full and by')]).bore, 0);
});

test('hove to, the yards are aback on purpose and the helmsman leaves them', () => {
  assert.equal(headed(15 * DEGREE, 15, [order('heave to')]).bore, 0);
});
