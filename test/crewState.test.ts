/**
 * The crew's state is small enough to send (implementation plan N3.7, N4.1): two brigs whose whole crews make plain
 * sail at once, the busiest the state gets until she beats to quarters, stay under the network's 16 KB a state while
 * their men go to their places (the busiest stretch), and the busiest state comes back from its bytes the same, so the guest steps on bit for bit as the host.
 * Each man's route is kept as what it is built from (crew/route.ts `Path`) and each job as its name and what it is done
 * on (crew/drill.ts `jobWork`), and found again where needed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeState, encodeState, hashState, startMatch, type SimState } from '../src/sim/state.ts';
import { step } from '../src/sim/step.ts';
import { STEPS_PER_SECOND } from '../src/sim/units.ts';
import { duelSetup } from './support/match.ts';

const SEED = 1805;
const MODERATE = 4;
/** The network's most a state may take, bytes. */
const STATE_BYTES = 16 * 1024;
/** Long enough for the men sent first to reach their places (the most are on their way about 3 s in), s. */
const SECONDS = 12;
/** Steps the host and the guest run on from the busiest state. */
const ON = 30;

test('two crews making sail at once stay under 16 KB a state, and the busiest state comes back from its bytes the same', () => {
  let s = startMatch(duelSetup(SEED, MODERATE));
  let most = 0, busiest: SimState = s, at = 0;
  for (let i = 0; i < SECONDS * STEPS_PER_SECOND; i++) {
    s = step(s, i === 0 ? [{ kind: 'sail', ship: 0, canvas: 'plain' }, { kind: 'sail', ship: 1, canvas: 'plain' }] : []).state;
    const bytes = encodeState(s).length;
    if (bytes > most) { most = bytes; busiest = s; at = i; }
  }
  assert.ok(most < STATE_BYTES, `the busiest state takes ${most} bytes`);
  assert.ok(busiest.ships.every((ship) => ship.crew.men.some((h) => h.going)), 'both crews were on their way at the busiest');
  assert.ok(at < (SECONDS - 1) * STEPS_PER_SECOND, `the state shrinks again as the men reach their places (busiest at ${(at / STEPS_PER_SECOND).toFixed(1)} s)`);
  // The guest takes the bytes and steps on as the host does.
  let host = busiest, guest = decodeState(encodeState(busiest));
  for (let i = 0; i < ON; i++) { host = step(host).state; guest = step(guest).state; }
  assert.equal(hashState(guest), hashState(host));
});
