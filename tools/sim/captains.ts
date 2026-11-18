/**
 * Slow check (docs/CHECKS.md, implementation plan N7.1): computer captains fight whole duels against each other. Each
 * duel starts as a duel does (sim/start.ts `duelStart` from its seed: 1,500 m apart, the wind across, force 2 to 6),
 * both ships commanded by `captainOrders` at a pair of skills, stepped until the fight is over: a ship lost, or drawn at
 * nightfall. The duels run side by side, one process each, as many at once as the machine has cores.
 *
 * Fails on what the captain owns (design thread, 2026-11-18): a duel not over by nightfall; a ship that never came
 * within fighting range of the other or never fired; a beaten ship that did not strike; any order of his refused; a
 * pose or state that stopped being a number. Prints the balance sheet beside it (how each duel ended and when, how
 * long they lasted, who won by skill, the state's peak size): the design's "most between 10 and 20 minutes, none drawn"
 * is N7.5's to meet, measured here.
 *
 *   npm run check:captains             the check
 *   npm run check:captains -- 24       that many duels instead (more than CI's set: by hand)
 *   tsx tools/sim/captains.ts --duel <seed> <skill> <skill>   one duel, its record as JSON (what the check spawns)
 */
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { captainOrders } from '../../src/sim/captain/captain.ts';
import { outOf } from '../../src/sim/damage.ts';
import { winner } from '../../src/sim/end.ts';
import { warmGunnery } from '../../src/sim/guns/gunnery.ts';
import { SKILLS, type Skill } from '../../src/sim/rules/captain.ts';
import { bearingDir } from '../../src/sim/units.ts';
import { meanWind } from '../../src/sim/wind.ts';
import { duelStart } from '../../src/sim/start.ts';
import { encodeState, startMatch, type SimState } from '../../src/sim/state.ts';
import { step } from '../../src/sim/step.ts';
import { apartOnWater, SECONDS_PER_MINUTE, STEPS_PER_SECOND } from '../../src/sim/units.ts';

/**
 * The pairings fought, in turn, a seed each from FIRST_SEED on: every pairing of the three skills, with equal captains of
 * middle skill (what the balance sheet is measured over) three times in eight, and one level up twice.
 */
const PAIRINGS: readonly (readonly [Skill, Skill])[] = [
  ['seasoned', 'seasoned'], ['seasoned', 'master'], ['green', 'seasoned'], ['seasoned', 'seasoned'],
  ['master', 'master'], ['green', 'master'], ['green', 'green'], ['seasoned', 'seasoned'],
];
/** CI fights the first this many of those (a duel to nightfall costs about 40 s of a core; CI has four cores and 2 minutes before its warning). */
const CI_DUELS = 8;
const FIRST_SEED = 1;
/** A ship must come within this of the other, m, to have fought (the long sixes' reach: design decisions for N5). */
const FIGHTING_RANGE = 600;
/** A beaten ship strikes within this many seconds (her captain looks round every 8 s at worst, then asks twice). */
const STRIKES_WITHIN = 20;
/** The state is sized every this many steps (a second): what the host would send. */
const SIZE_EVERY = STEPS_PER_SECOND;
/** The network's limit on a state, bytes (implementation plan, budgets). */
const STATE_LIMIT = 16 * 1024;
/** The design's span for a duel's length, minutes (N7; met by N7.5). */
const DESIGN_MINUTES = [10, 20] as const;

/** What one duel came to. */
interface Record {
  readonly seed: number;
  readonly skills: readonly [Skill, Skill];
  readonly force: number;
  /** When it ended, minutes; how each ship was lost (null: not lost); the winner (null: drawn). */
  readonly minutes: number;
  readonly lost: readonly (string | null)[];
  readonly winner: number | null;
  /** Each ship: guns fired, hits she took, men out at the end, water in her (t), parts of spars fallen. */
  readonly fired: readonly number[];
  readonly hits: readonly number[];
  readonly out: readonly number[];
  readonly water: readonly number[];
  readonly fallen: readonly number[];
  /** The first broadside (the first gun fired by either), minutes (-1 none), and which ship then lay to windward (the weather position). */
  readonly firstFire: number;
  readonly weather: number;
  /** The closest the ships came, m, and when they first came within fighting range (minutes, -1 never). */
  readonly closest: number;
  readonly engaged: number;
  /** Each ship: the minute she was first beaten (-1 never), and whether she then struck in time. */
  readonly beaten: readonly number[];
  readonly struckInTime: readonly boolean[];
  /** Orders the captains gave, and those refused (with their reasons). */
  readonly orders: number;
  readonly refused: readonly string[];
  /** The state's largest size, bytes, and whether a pose stopped being a number. */
  readonly peak: number;
  readonly nan: boolean;
  /** The duel's own time, s, and per step, ms. */
  readonly seconds: number;
  readonly msPerStep: number;
}

const minutesOf = (tick: number): number => tick / STEPS_PER_SECOND / SECONDS_PER_MINUTE;

/** The ship lying to windward of the other (the weather position). */
function windwardOf(s: SimState): number {
  const [wx, wz] = bearingDir(meanWind(s.wind, s.tick / STEPS_PER_SECOND).from), [a, b] = s.ships.map((x) => x.motion.pose);
  return (a!.x - b!.x) * wx + (a!.z - b!.z) * wz > 0 ? 0 : 1;
}

/** One duel between captains of `skills`, from the duel's start of `seed`, to its end. */
function duel(seed: number, skills: readonly [Skill, Skill]): Record {
  const t0 = performance.now();
  let s: SimState = startMatch(duelStart(seed));
  const fired = [0, 0], hits = [0, 0], beaten = [-1, -1], refused: string[] = [];
  let closest = Infinity, engaged = -1, orders = 0, peak = 0, nan = false, firstFire = -1, weather = -1;
  while (!s.fight.end) {
    const given = [...captainOrders(s, 0, skills[0]), ...captainOrders(s, 1, skills[1])];
    orders += given.length;
    const r = step(s, given);
    s = r.state;
    for (const e of r.events) {
      if (e.kind === 'fired') {
        fired[e.ship]!++;
        if (firstFire < 0) { firstFire = e.tick; weather = windwardOf(s); }
      }
      else if (e.kind === 'hit') hits[e.ship]!++;
      else if (e.kind === 'refused') refused.push(`${e.order.kind}: ${e.reason}`);
      else if (e.kind === 'beaten' && beaten[e.ship]! < 0) beaten[e.ship] = e.tick;
    }
    const [a, b] = s.ships.map((x) => x.motion.pose);
    const apart = apartOnWater(a!, b!);
    if (!Number.isFinite(apart) || !Number.isFinite(a!.roll) || !Number.isFinite(b!.roll)) { nan = true; break; }
    closest = Math.min(closest, apart);
    if (engaged < 0 && apart < FIGHTING_RANGE) engaged = s.tick;
    if (s.tick % SIZE_EVERY === 0) peak = Math.max(peak, encodeState(s).length);
  }
  const end = s.fight.end, lost = end ? end.lost : [null, null];
  // Beaten, she strikes (or the fight ends otherwise) within the time it takes him to look round and ask twice.
  const struckInTime = beaten.map((tick) => tick < 0 || (end !== null && end.tick - tick <= STRIKES_WITHIN * STEPS_PER_SECOND));
  const seconds = (performance.now() - t0) / 1000;
  return {
    firstFire: firstFire < 0 ? -1 : minutesOf(firstFire), weather,
    seed, skills, force: s.wind.windForce, minutes: minutesOf(end ? end.tick : s.tick), lost, winner: winner(s.fight),
    fired, hits, out: s.ships.map((x) => outOf(x.damage).size), water: s.ships.map((x) => x.damage.flooded[0] + x.damage.flooded[1]),
    fallen: s.ships.map((x) => x.damage.fallen.length), closest, engaged: engaged < 0 ? -1 : minutesOf(engaged),
    beaten: beaten.map((t) => (t < 0 ? -1 : minutesOf(t))), struckInTime, orders, refused, peak, nan, seconds, msPerStep: (seconds * 1000) / s.tick,
  };
}

/** One duel in a process of its own, its record read back from its output. */
function duelElsewhere(seed: number, skills: readonly [Skill, Skill]): Promise<Record> {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url), '--duel', String(seed), ...skills], { stdio: ['ignore', 'pipe', 'inherit'] });
    let text = '';
    child.stdout.on('data', (d) => { text += d; });
    child.on('close', (code) => (code === 0 ? done(JSON.parse(text) as Record) : fail(new Error(`duel ${seed} exited with ${code}`))));
  });
}

/** Every duel, as many at once as there are cores, in the order listed. */
async function fightAll(list: readonly { seed: number; skills: readonly [Skill, Skill] }[]): Promise<Record[]> {
  const out: Record[] = new Array(list.length);
  let next = 0;
  const worker = async () => { while (next < list.length) { const k = next++; out[k] = await duelElsewhere(list[k]!.seed, list[k]!.skills); } };
  await Promise.all(Array.from({ length: Math.min(availableParallelism(), list.length) }, worker));
  return out;
}

/** The duels to fight: CI's set, or `count` of them by hand (the pairings in turn, a seed each). */
function duels(count: number): { seed: number; skills: readonly [Skill, Skill] }[] {
  return Array.from({ length: count }, (_, k) => ({ seed: FIRST_SEED + k, skills: PAIRINGS[k % PAIRINGS.length]! }));
}

const pad = (v: string | number, n: number) => String(v).padStart(n);
const two = (xs: readonly number[], digits = 0) => xs.map((x) => x.toFixed(digits)).join('/');

/** What the captain owns that went wrong in a duel (design thread, 2026-11-18), as lines. */
function problemsOf(r: Record): string[] {
  const p: string[] = [], at = `duel ${r.seed} (${r.skills.join(' v ')})`;
  if (r.nan) p.push(`${at}: a pose stopped being a number`);
  if (r.lost.length !== 2) p.push(`${at}: not over by nightfall`);
  if (r.engaged < 0) p.push(`${at}: the ships never came within ${FIGHTING_RANGE} m (closest ${r.closest.toFixed(0)} m)`);
  r.fired.forEach((f, i) => { if (f === 0) p.push(`${at}: ship ${i} never fired`); });
  r.struckInTime.forEach((ok, i) => { if (!ok) p.push(`${at}: ship ${i} was beaten at ${r.beaten[i]!.toFixed(1)} min and did not strike within ${STRIKES_WITHIN} s`); });
  for (const reason of new Set(r.refused)) p.push(`${at}: an order refused: ${reason}`);
  return p;
}

/** The balance sheet: each duel, and the whole set against the design's pace. */
function sheet(records: readonly Record[]): void {
  console.log('seed  skills              force  min   how                  won  closest  engaged  fired    hits      out    water    fallen  peak B  ms/step');
  for (const r of records) {
    const how = r.lost.every((l) => l === null) ? 'drawn' : r.lost.map((l) => l ?? '-').join('/');
    console.log(`${pad(r.seed, 4)}  ${r.skills.join(' v ').padEnd(18)}  ${pad(r.force, 5)}  ${pad(r.minutes.toFixed(1), 4)}  ${how.padEnd(19)}  ${pad(r.winner === null ? '-' : r.skills[r.winner]!, 4).slice(0, 4)}  ${pad(r.closest.toFixed(0), 7)}  ${pad(r.engaged < 0 ? 'never' : r.engaged.toFixed(1), 7)}  ${two(r.fired).padEnd(7)}  ${two(r.hits).padEnd(8)}  ${two(r.out).padEnd(5)}  ${two(r.water, 1).padEnd(7)}  ${two(r.fallen).padEnd(6)}  ${pad(r.peak, 6)}  ${r.msPerStep.toFixed(2)}`);
  }
  const drawn = records.filter((r) => r.winner === null).length;
  const inSpan = records.filter((r) => r.winner !== null && r.minutes >= DESIGN_MINUTES[0] && r.minutes <= DESIGN_MINUTES[1]).length;
  const endings = new Map<string, number>();
  for (const r of records) for (const l of r.lost) if (l) endings.set(l, (endings.get(l) ?? 0) + 1);
  const rank = (k: Skill) => SKILLS.indexOf(k);
  const upOne = records.filter((r) => Math.abs(rank(r.skills[0]) - rank(r.skills[1])) === 1 && r.winner !== null);
  const betterWon = upOne.filter((r) => rank(r.skills[r.winner!]) > rank(r.skills[1 - r.winner!])).length;
  const equal = records.filter((r) => r.skills[0] === r.skills[1] && r.winner !== null && r.weather >= 0);
  const weatherWon = equal.filter((r) => r.winner === r.weather).length;
  const fought = records.filter((r) => r.firstFire >= 0);
  const list = (xs: readonly number[]) => xs.map((x) => x.toFixed(1)).join(', ');
  const peak = Math.max(...records.map((r) => r.peak));
  console.log(`\nbalance sheet (N7.5a meets it; printed, not failed here), over all ${records.length} duels:`);
  console.log(`  start to the first broadside (about 3 min): ${list(fought.map((r) => r.firstFire))} min`);
  console.log(`  first broadside to the end (most 6 to 14, none under 4): ${list(fought.map((r) => r.minutes - r.firstFire))} min`);
  console.log(`  the whole match (most 10 to 20): ${inSpan} of ${records.length} won within ${DESIGN_MINUTES[0]} to ${DESIGN_MINUTES[1]} min; drawn by the clock (fewer than 1 in 20): ${drawn}`);
  console.log(`  how ships were lost (struck most often): ${[...endings].map(([k, n]) => `${n} ${k}`).join(', ') || 'none'}`);
  console.log(`  the better captain, one level up (about 3 in 4): won ${betterWon} of ${upOne.length} decided`);
  console.log(`  the weather position between equals (clearly more than half): won ${weatherWon} of ${equal.length} decided`);
  console.log(`  the state's peak ${peak} bytes of ${STATE_LIMIT}${peak > STATE_LIMIT ? ' (OVER the network budget)' : ''}`);
}

if (process.argv.includes('--duel')) {
  const [seed, a, b] = process.argv.slice(process.argv.indexOf('--duel') + 1);
  warmGunnery();
  process.stdout.write(JSON.stringify(duel(Number(seed), [a as Skill, b as Skill])));
} else {
  const t0 = performance.now();
  const asked = Number(process.argv[2]);
  const list = duels(Number.isInteger(asked) && asked > 0 ? asked : CI_DUELS);
  console.log(`${list.length} duels between computer captains, ${Math.min(availableParallelism(), list.length)} at a time`);
  const records = await fightAll(list);
  sheet(records);
  const problems = records.flatMap(problemsOf);
  console.log(`\n${list.length} duels in ${((performance.now() - t0) / 1000).toFixed(0)} s`);
  if (problems.length > 0) {
    for (const p of problems) console.error(`FAIL ${p}`);
    process.exit(1);
  }
  console.log('every duel ended, both ships closed and fired, every beaten ship struck, no order refused');
}
