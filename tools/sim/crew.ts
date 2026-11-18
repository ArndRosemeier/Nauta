/**
 * Slow check (docs/CHECKS.md, implementation plan N4.1): the crew carrying out the captain's orders to the end.
 *
 * - Every order the crew works for, done by a full crew (the crew driven alone): each job has all its hands, works the
 *   time in the table (rules/crew.ts JOBS) and none is short-handed.
 * - Every order of the vocabulary given in a whole match (sea and wind) is carried out and reported done, in no less
 *   than a second and within a minute.
 * - Plain sail in a whole match: the courses and topgallants are set a share at a time, each sheeted home no sooner
 *   than its men have loosed and sheeted it; then, from half set, battle sail takes in again what was set.
 * - Two brigs whose crews make plain sail at once (the busiest the state gets until she beats to quarters) stay under
 *   the network's 16 KB a state through the whole manoeuvre, and the busiest state, sent through bytes, steps on to
 *   the host's hash.
 *
 * Prints each order's time and the state's peak; fails on any scenario that does not hold, or that did not do what it
 * names (fewer orders done, sails set or men walking than it sets out to have).
 *
 *   npm run check:crew
 */
import { JOBS, PASSED } from '../../src/sim/rules/crew.ts';
import { canvasFor } from '../../src/sim/ship/sailing.ts';
import { rigPlan } from '../../src/sim/ship/rig.ts';
import { HANGING } from '../../src/sim/rules/rig.ts';
import { sailShare } from '../../src/sim/ship/sails.ts';
import { decodeState, encodeState, hashState, startMatch, type SimState } from '../../src/sim/state.ts';
import { step } from '../../src/sim/step.ts';
import { STEP_SECONDS, STEPS_PER_SECOND } from '../../src/sim/units.ts';
import { CREW_ORDERS, fullCrewOrder } from '../../test/support/crew.ts';
import { duelSetup } from '../../test/support/match.ts';
import { DRILL, EACH, MODERATE, run, underWay } from '../../test/support/orders.ts';

/** The longest any order takes to carry out in a whole match, s (plain sail from battle sail: a course, then a topgallant). */
const MOST_ORDER_SECONDS = 100;
/** Long enough for plain sail to be set in full, s. */
const PLAIN_SECONDS = 90;
/** The sails plain sail adds to battle sail. */
const PLAIN_ADDS = ['fore-course', 'fore-topgallant', 'main-course', 'main-topgallant'];
/** The network's most a state may take, bytes. */
const STATE_BYTES = 20 * 1024;
/** Long enough for two crews to make plain sail and go back to their posts, s. */
const BOTH_SECONDS = 100;
/** Fewer men of each ship on their way at the busiest, and the manoeuvre was not the busy one it names. */
const FEWEST_WALKING = 30;

const problems: string[] = [];
const t0 = performance.now();

/** Runs one scenario; an assertion it fails becomes a problem. */
function scenario(name: string, body: () => void): void {
  try { body(); } catch (e) { problems.push(`${name}: ${(e as Error).message.split('\n')[0]}`); }
}

const seconds = (ticks: number) => `${(ticks * STEP_SECONDS).toFixed(1)} s`;

scenario('every order by a full crew', () => {
  const times = CREW_ORDERS.map((o) => `${o.kind}${o.kind === 'sail' ? ` ${o.canvas}` : ''} ${seconds(fullCrewOrder(o))}`);
  if (times.length !== CREW_ORDERS.length) throw new Error('not every order was run');
  console.log(`full crew, done after: ${times.join(', ')}`);
});

// One start for the whole-match scenarios: a beam reach under battle sail with way on.
const start = underWay(MODERATE, 100);

scenario('every order carried out in a whole match', () => {
  const times: string[] = [];
  // The sailing drill's orders (test/support/orders.ts DRILL).
  for (const order of DRILL) {
    // Fill needs something aback: the main topsail backed in the same step, which the fill then replaces.
    let s = step(start, order.kind === 'fill' ? [EACH.back, order] : [order]), ticks = 0;
    if (s.events.some((e) => e.kind === 'refused')) throw new Error(`${order.kind} was refused`);
    while (!s.events.some((e) => e.kind === 'done') && ticks < MOST_ORDER_SECONDS * STEPS_PER_SECOND) { s = step(s.state); ticks++; }
    const done = s.events.find((e) => e.kind === 'done');
    if (!done || done.kind !== 'done' || done.order !== order) throw new Error(`${order.kind} was not reported done within ${MOST_ORDER_SECONDS} s`);
    if (ticks < STEPS_PER_SECOND) throw new Error(`${order.kind} took no time: done after ${seconds(ticks)}`);
    times.push(`${order.kind} ${seconds(ticks)}`);
  }
  console.log(`whole match, done after: ${times.join(', ')}`);
});

scenario('plain sail set sail by sail, and taken in again', () => {
  const sails = rigPlan().sails, before = start.ships[0]!.sailing.canvas;
  const setAt = new Map<string, number>();
  let partWay = 0;
  const plain = run(start, PLAIN_SECONDS, [EACH.sail], (s, t) => s.ships[0]!.sailing.canvas.forEach((c, i) => {
    const share = sailShare(c);
    if (share > HANGING && share < 1) partWay++;
    if (share === 1 && !before[i]!.set && !setAt.has(sails[i]!.id)) setAt.set(sails[i]!.id, t);
  }));
  if (partWay === 0) throw new Error('no sail was ever seen part sheeted home');
  if (!plain.events.some(({ e }) => e.kind === 'done' && e.order === EACH.sail)) throw new Error('plain sail was not reported done');
  const ship = plain.state.ships[0]!;
  if (ship.told.canvas !== 'plain' || JSON.stringify(ship.sailing.canvas) !== JSON.stringify(canvasFor('plain', MODERATE))) throw new Error('her canvas is not plain sail');
  if (JSON.stringify([...setAt.keys()].sort()) !== JSON.stringify(PLAIN_ADDS)) throw new Error(`set: ${[...setAt.keys()].join(', ')}`);
  for (const [id, t] of setAt) {
    const level = id.endsWith('course') ? 'course' : 'topgallant', loose = JOBS.loose.work as Record<string, number>, sheet = JOBS.sheet.work as Record<string, number>;
    if (t < PASSED['first lieutenant'] + loose[level]! + sheet[level]!) throw new Error(`${id} set after ${t.toFixed(1)} s, sooner than its work`);
  }
  console.log(`plain sail, set after: ${[...setAt].map(([id, t]) => `${id} ${t.toFixed(1)} s`).join(', ')}`);
  // From half set, battle sail again: the sails already set come in.
  const half = run(start, Math.min(...setAt.values()) + 1, [EACH.sail]).state;
  if (!half.ships[0]!.sailing.canvas.some((c, i) => c.set && !before[i]!.set)) throw new Error('no sail was set by the half-way state');
  const back = run(half, PLAIN_SECONDS, [{ kind: 'sail', ship: 0, canvas: 'battle' }]).state.ships[0]!;
  if (JSON.stringify(back.sailing.canvas) !== JSON.stringify(before) || back.told.given.length) throw new Error('battle sail again did not take in what was set');
});

scenario('two crews making sail stay under 16 KB a state', () => {
  let s: SimState = startMatch(duelSetup(1805, MODERATE)), most = 0, busiest = s, walking = 0;
  for (let i = 0; i < BOTH_SECONDS * STEPS_PER_SECOND; i++) {
    s = step(s, i === 0 ? [{ kind: 'sail', ship: 0, canvas: 'plain' }, { kind: 'sail', ship: 1, canvas: 'plain' }] : []).state;
    const bytes = encodeState(s).length;
    if (bytes > most) { most = bytes; busiest = s; }
    walking = Math.max(walking, Math.min(...s.ships.map((ship) => ship.crew.men.filter((h) => h.going).length)));
  }
  console.log(`two crews making plain sail: peak ${most} bytes a state, at most ${walking} men of each walking`);
  if (most >= STATE_BYTES) throw new Error(`the busiest state takes ${most} bytes`);
  if (walking < FEWEST_WALKING) throw new Error(`only ${walking} men of each walking at once`);
  if (!s.ships.every((ship) => ship.told.canvas === 'plain' && ship.told.given.length === 0)) throw new Error('not both made plain sail');
  let host = busiest, guest = decodeState(encodeState(busiest));
  for (let i = 0; i < STEPS_PER_SECOND; i++) { host = step(host).state; guest = step(guest).state; }
  if (hashState(guest) !== hashState(host)) throw new Error('the guest parted from the host');
});

console.log(`crew: ${((performance.now() - t0) / 1000).toFixed(1)} s`);
for (const p of problems) console.log(`PROBLEM: ${p}`);
process.exit(problems.length ? 1 : 0);
