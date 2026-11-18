/**
 * The end played out (implementation plan N6.7, design decisions for N6): a struck ship stays afloat; one blown up or
 * burnt out goes down like a foundered one; the end card waits for it (`MOMENT`), the colours come down before it.
 * Each from a state built for the purpose (CHECKS.md).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { founderTonnes } from '../src/sim/damage/flood.ts';
import { AWASH_SECONDS } from '../src/sim/rules/damage.ts';
import { COLOURS, MOMENT } from '../src/sim/rules/end.ts';
import { shipPlan } from '../src/sim/ship/plan.ts';
import { startMatch, type SimState } from '../src/sim/state.ts';
import { STEPS_PER_SECOND } from '../src/sim/units.ts';
import { once, pair } from './support/ended.ts';

/** The heave at which a foundered brig's deck lies well under the calm sea, m (her sheer stands about 4 m over her waterline, the eye 2 m more). */
const DECK_UNDER = -10;
const space = (id: string) => shipPlan().spaces.findIndex((s) => s.id === id);

/** The match `s` run on `seconds`. */
function run(s: SimState, seconds: number): SimState {
  for (let k = 0; k < seconds * STEPS_PER_SECOND; k++) s = once(s).state;
  return s;
}
const water = (s: SimState) => s.ships[0]!.damage.flooded[0] + s.ships[0]!.damage.flooded[1];
/** What pours in over a lost ship's side in `seconds`, t: as much as founders her in `AWASH_SECONDS`. */
const pours = (seconds: number) => (founderTonnes() * seconds) / AWASH_SECONDS;

test('struck, a ship stays afloat with no more water than she had', () => {
  const begun = pair();
  const struck: SimState = { ...begun, ships: begun.ships.map((sh, i) => (i === 0 ? { ...sh, told: { ...sh.told, struck: true } } : sh)) };
  const after = run(struck, 5);
  assert.deepEqual(after.fight.end?.lost, ['struck', null]);
  assert.equal(water(after), 0);
});

test('blown up, the sea pours in at once, as over a foundered ship', () => {
  const w = water(run(pair({ blownUp: true }), 10));
  assert.ok(Math.abs(w - pours(10)) < pours(10) / 4, `${w.toFixed(0)} t in 10 s, about ${pours(10).toFixed(0)}`);
});

test('burnt out, the sea pours in from the end the same way', () => {
  const w = water(run(pair({ fires: [{ space: space('lightroom'), size: 1 }] }), 10));
  assert.ok(Math.abs(w - pours(10)) < pours(10) / 4, `${w.toFixed(0)} t in 10 s, about ${pours(10).toFixed(0)}`);
});

test('the end card waits for the ending to play out: a ship foundered is under the sea when it comes (N6.7)', () => {
  // One brig alone, her crew as the match starts (not mustered: she goes down the same, and the step costs less).
  const alone = startMatch({ seed: 9, windForce: 0, windFrom: 0, ships: [{ x: 0, z: 0, heading: Math.PI / 2, canvas: 'bare' }] });
  let at: SimState = { ...alone, ships: alone.ships.map((sh) => ({ ...sh, damage: { ...sh.damage, flooded: [founderTonnes() / 2, founderTonnes() / 2] } })) };
  for (let k = 0; k < MOMENT.sunk * STEPS_PER_SECOND; k++) at = once(at).state;
  assert.ok(at.ships[0]!.motion.pose.heave < DECK_UNDER, `heave ${at.ships[0]!.motion.pose.heave.toFixed(1)} m after ${MOMENT.sunk} s: well under`);
  assert.ok(MOMENT.burnt - MOMENT.sunk === AWASH_SECONDS && MOMENT['blew up'] === MOMENT.burnt, 'one burnt out or blown up goes down a minute later');
  assert.ok(MOMENT.struck >= COLOURS.after + COLOURS.down, 'the colours are down before the card');
});
