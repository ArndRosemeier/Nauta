/**
 * Slow check (scenarios stage 7, docs/design/scenarios.md): fleets of computer captains, four and eight ships on two
 * sides (the setup's placement, masters against seasoned captains), stepped until the fight is over or `MINUTES` of the
 * match have passed. Fails on what a fleet must hold: a pose or state that stopped being a number, an order of a captain
 * refused, a ship that never fired, a side that never closed, a state that sent deflated comes near GameHub's 64 KB, and
 * (four ships, to the end) a fight not over by nightfall. Prints each fleet's line.
 *
 *   npm run check:fleets             the check
 */
import { deflateSync } from 'fflate';
import { captainOrders, crewedBy } from '../../src/sim/captain/captain.ts';
import { warmGunnery } from '../../src/sim/guns/gunnery.ts';
import type { Skill } from '../../src/sim/rules/captain.ts';
import { fleetStart, withSides } from '../../src/sim/start.ts';
import { encodeState, startMatch, type SimState } from '../../src/sim/state.ts';
import { step } from '../../src/sim/step.ts';
import { apartOnWater, SECONDS_PER_MINUTE, STEPS_PER_SECOND } from '../../src/sim/units.ts';

/** The fleets fought: ships, and the minutes of the match the eight are stepped (the four are fought to the end). */
const FLEETS = [{ ships: 4, minutes: Infinity }, { ships: 8, minutes: 8 }] as const;
const SEED = 3;
/** GameHub's largest message, bytes, and how much of it a state may take (docs/design/scenarios.md). */
const MOST_SENT = 64 * 1024, STATE_SHARE = 1 / 3;
/** The state is measured this often, steps. */
const SIZE_EVERY = 20 * STEPS_PER_SECOND;
/** A side's skill: masters against seasoned captains, ship by ship in turn. */
const SKILLS: readonly Skill[] = ['master', 'seasoned'];

function fleet(ships: number, minutes: number): { line: string; problems: string[] } {
  const t0 = performance.now(), sides = Array.from({ length: ships }, (_, i) => i % 2), skillOf = (i: number) => SKILLS[i % 2]!;
  let setup = withSides(fleetStart(SEED, sides), sides);
  for (let i = 0; i < ships; i++) setup = crewedBy(setup, i, skillOf(i));
  let s: SimState = startMatch(setup);
  const fired = new Array<number>(ships).fill(0), refused = new Set<string>();
  let nan = false, peak = 0, closest = Infinity;
  while (!s.fight.end && s.tick < minutes * SECONDS_PER_MINUTE * STEPS_PER_SECOND) {
    const given = s.ships.flatMap((_, i) => captainOrders(s, i, skillOf(i)));
    const r = step(s, given);
    s = r.state;
    for (const e of r.events) {
      if (e.kind === 'fired') fired[e.ship]!++;
      else if (e.kind === 'refused') refused.add(`${e.order.kind}: ${e.reason}`);
    }
    const poses = s.ships.map((x) => x.motion.pose);
    if (poses.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.z) || !Number.isFinite(p.roll))) { nan = true; break; }
    for (const [i, a] of poses.entries()) for (const b of poses.slice(i + 1)) if (sides[poses.indexOf(a)] !== sides[poses.indexOf(b)]) closest = Math.min(closest, apartOnWater(a, b));
    if (s.tick % SIZE_EVERY === 0) peak = Math.max(peak, deflateSync(encodeState(s)).length);
  }
  const at = `${ships} ships`, p: string[] = [];
  if (nan) p.push(`${at}: a pose stopped being a number`);
  for (const reason of refused) p.push(`${at}: an order refused: ${reason}`);
  fired.forEach((f, i) => { if (f === 0) p.push(`${at}: ship ${i} never fired`); });
  if (peak > MOST_SENT * STATE_SHARE) p.push(`${at}: the state sent is ${peak} B, over a third of GameHub's 64 KB`);
  if (minutes === Infinity && !s.fight.end) p.push(`${at}: the fight was not over by nightfall`);
  const lost = s.fight.end?.lost.filter((l) => l !== null).length ?? 0, seconds = (performance.now() - t0) / 1000;
  return { line: `${at}: ${(s.tick / STEPS_PER_SECOND / SECONDS_PER_MINUTE).toFixed(1)} min${s.fight.end ? ' to the end' : ''}, ${lost} lost, fired ${fired.join('/')}, closest ${closest.toFixed(0)} m, state ${peak} B, ${seconds.toFixed(0)} s`, problems: p };
}

warmGunnery();
const problems: string[] = [];
for (const f of FLEETS) {
  const r = fleet(f.ships, f.minutes);
  console.log(r.line);
  problems.push(...r.problems);
}
if (problems.length > 0) { console.error(problems.join('\n')); process.exit(1); }
console.log('fleets ok');
