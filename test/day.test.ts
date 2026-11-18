/**
 * The sandbox's day clock (implementation plan, design ruling 2026-11-18): the time of day is a function of the tick,
 * found only in a match that has a `dayStart`, and a fight has none.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bellsPassed, dayMinutes, dayMinutesAt, watchAt } from '../src/sim/day.ts';
import { DAY_MINUTES, DAY_PACE } from '../src/sim/rules/day.ts';
import { startMatch } from '../src/sim/state.ts';
import { MINUTES_PER_HOUR, SECONDS_PER_MINUTE, STEPS_PER_SECOND } from '../src/sim/units.ts';
import { duelSetup } from './support/match.ts';

/** A seed for the test matches. */
const SEED = 5;
/** A morning the test day starts at, hour. */
const TEN = 10;
/** A real minute, in steps. */
const MINUTE_STEPS = SECONDS_PER_MINUTE * STEPS_PER_SECOND;

test('the day clock runs DAY_PACE game minutes to a real minute and wraps at midnight', () => {
  const start = TEN * MINUTES_PER_HOUR;
  assert.equal(dayMinutesAt(start, 0), start);
  assert.equal(dayMinutesAt(start, MINUTE_STEPS), start + DAY_PACE);
  assert.equal(dayMinutesAt(start, 2 * MINUTE_STEPS), start + 2 * DAY_PACE);
  // 14 hours on from ten is midnight, at 28 real minutes.
  const midnight = (DAY_MINUTES - start) / DAY_PACE * MINUTE_STEPS;
  assert.equal(dayMinutesAt(start, midnight), 0);
  assert.equal(dayMinutesAt(start, midnight + MINUTE_STEPS), DAY_PACE);
});

test('a match has a day only when its setup gives one; a fight has none', () => {
  const duel = startMatch(duelSetup(SEED));
  assert.equal(duel.dayStart, null);
  assert.equal(dayMinutes(duel), null);
  const sandbox = startMatch({ ...duelSetup(SEED), dayStart: 8 * MINUTES_PER_HOUR });
  assert.equal(dayMinutes(sandbox), 8 * MINUTES_PER_HOUR);
  assert.equal(dayMinutes({ ...sandbox, tick: MINUTE_STEPS }), 8 * MINUTES_PER_HOUR + DAY_PACE);
});

/** The bells struck at each half hour of a day, as a clock walked a minute at a time gives them. */
function dayOfBells(): Map<number, number> {
  const out = new Map<number, number>();
  for (let m = 0; m < DAY_MINUTES; m++) {
    const n = bellsPassed(m, m + 1);
    if (n > 0) out.set(m + 1, n);
  }
  // Midnight: from the last minute of the day round to the first of the next.
  const wrap = bellsPassed(DAY_MINUTES - 1, 0);
  if (wrap > 0) out.set(DAY_MINUTES, wrap);
  return out;
}

test('the bell is struck every half hour, one more each time, eight at the end of every watch but the first dog\'s four', () => {
  const day = dayOfBells(), at = (hour: number, minute = 0) => day.get(hour * MINUTES_PER_HOUR + minute);
  assert.equal(day.size, 48, 'forty-eight half hours a day');
  // The forenoon: 8:30 one, 9:00 two, ... 12:00 eight.
  assert.deepEqual([8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12].map((h) => at(Math.floor(h), (h % 1) * 60)), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(at(24), 8, 'eight bells at midnight');
  assert.equal(at(4), 8);
  // The dog watches: 16:30 one, 17:00 two, 17:30 three, 18:00 four; 18:30 one, 19:00 two, 19:30 three, 20:00 eight.
  assert.deepEqual([[16, 30], [17, 0], [17, 30], [18, 0], [18, 30], [19, 0], [19, 30], [20, 0]].map(([h, m]) => at(h!, m)), [1, 2, 3, 4, 1, 2, 3, 8]);
  assert.equal(bellsPassed(null, 5), 0);
  assert.equal(bellsPassed(5, 6), 0, 'no half hour passed');
});

test('the watches turn about: seven a day, the one on deck alternating, so a watch has the deck at a different hour each day', () => {
  const on = (hour: number) => watchAt(hour * MINUTES_PER_HOUR).onDeck;
  assert.deepEqual([0, 4, 8, 12, 16, 18, 20].map(on), [0, 1, 0, 1, 0, 1, 0]);
  assert.equal(on(23.9), 0);
  assert.equal(on(24), 1, 'the middle watch next night is the other watch\'s');
  assert.equal(on(24 + 20), 1, 'and the second day\'s first watch is the starboard\'s: only after two days do they match again');
  assert.equal(on(48 + 20), 0);
  assert.equal(watchAt(9 * MINUTES_PER_HOUR).index, 2);
});
