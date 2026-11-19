/**
 * Slow check (docs/CHECKS.md, implementation plan N7.1, N7.5a): computer captains fight whole duels against each other.
 * Each duel starts as a duel does (sim/start.ts `duelStart` from its seed: three minutes of closing apart, the wind
 * across, force 2 to 6),
 * both ships commanded by `captainOrders` at a pair of skills, stepped until the fight is over: a ship lost, or drawn at
 * nightfall. The duels run side by side, one process each, as many at once as the machine has cores.
 *
 * Fails on what the captain owns (design thread, 2026-11-18): a duel not over by nightfall; a ship that never came
 * within fighting range of the other or never fired; a beaten ship that did not strike; any order of his refused; a
 * pose or state that stopped being a number. And on the balance sheet (implementation plan, N7.5a): each duel's line
 * (how it ended and when, who won by skill, the state's peak size) and the sheet's measures over the set, failing
 * outside the sheet's ranges (`SHEET`). The measures that need many duels to say anything (the weather position, burnt
 * and blown up seen) are judged only in a run of at least `MANY` duels, the hand run of 100. The better captain one level
 * up is printed and not failed on until it is met (design thread, 2026-11-18); beside it, how often the ship that took
 * more hits was the one lost (how little luck decides), and how many of the hits that raked (the other lying within
`RAKING.within` of her bow or stern line) the loser took (position pays).
 *
 *   npm run check:captains             the check
 *   npm run check:captains -- 24       that many duels instead (more than CI's set: by hand)
 *   tsx tools/sim/captains.ts --duel <seed> <skill> <skill>   one duel, its record as JSON (what the check spawns)
 */
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { captainOrders, crewedBy } from '../../src/sim/captain/captain.ts';
import { angleDiff } from '@futuremagic/core';
import { outOf, standingNow } from '../../src/sim/damage.ts';
import { RAKING } from '../../src/sim/rules/damage.ts';
import { winner } from '../../src/sim/end.ts';
import { warmGunnery } from '../../src/sim/guns/gunnery.ts';
import { SKILL, SKILLS, WINDWARD_OF, type Skill } from '../../src/sim/rules/captain.ts';
import { bearingDir, bearingTo } from '../../src/sim/units.ts';
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
/** A beaten ship strikes within this many seconds past her captain's `strikeAfter` (he looks round every 8 s at worst, then asks twice). */
const STRIKES_WITHIN = 20;
/** The state is sized every this many steps (a second): what the host would send. */
const SIZE_EVERY = STEPS_PER_SECOND;
/** The network's limit on a whole state, bytes (the budget of 2026-11-18: a whole state under 64 KB every 5 s and on join). */
const STATE_LIMIT = 64 * 1024;
/**
 * The balance sheet (implementation plan, N7.5a), minutes and shares: the first broadside about 3 min from the start
 * (the middle of the set within `first`); from it to the end `fightMost` of the set within `fight` (design thread, 2026-11-19: manoeuvring lengthens fights), at most `least.share` of the set under
 * `least.under` and none under `least.never` (design thread, 2026-11-18: the tail moves between 1 and 2 in 100 with every crew change); the whole match most within `match`; drawn by the clock fewer than `draws`; struck most often, no other
 * ending more than `other` of the ships lost (burnt or blown up seen over many duels); a ship that cannot sail beaten within `helpless`; the weather
 * position won more than `weather` between equals.
 */
const SHEET = {
  first: [2, 4], fight: [6, 16], fightMost: 4 / 5, least: { under: 4, share: 2 / 100, never: 2.5 }, match: [10, 20], most: 1 / 2, draws: 1 / 20, other: 1 / 4, helpless: 3, weather: 0.55,
} as const;
/** The sheet's measures over many duels are judged only in a run of at least this many (the hand run). */
const MANY = 50;
/**
 * How ships are lost; between computer captains the sheet wants fire's endings (burnt, blown up) seen now and then over
 * many duels, and struck nearly always (sunk is a player's ending, judged in play). Blown up alone is rarer than 1 in
 * 100 duels (the magazine lies deep in the hold, joined only to the light room), so the two are judged together.
 */
const ENDINGS: readonly string[] = ['struck', 'sunk', 'burnt', 'blew up', 'broke off'];
const BY_FIRE: readonly string[] = ['burnt', 'blew up'];

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
  /** Each ship: the hits she took while the other lay in her rake (within `RAKING.within` of her bow or stern line). */
  readonly raked: readonly number[];
  readonly out: readonly number[];
  readonly water: readonly number[];
  readonly fallen: readonly number[];
  /** The first broadside (the first gun fired by either), minutes (-1 none), and which ship held the weather position longer from it to the end (-1: neither held it). */
  readonly firstFire: number;
  readonly weather: number;
  /** The closest the ships came, m, and when they first came within fighting range (minutes, -1 never). */
  readonly closest: number;
  readonly engaged: number;
  /** Each ship: the minute she was first beaten (-1 never), and whether she then struck in time. */
  readonly beaten: readonly number[];
  /** Each ship: the minute she first could not sail (no sail drawing; -1 never). */
  readonly helpless: readonly number[];
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

/** The ship lying more than WINDWARD_OF to windward of the other (the weather position), or -1 when neither does (abreast across the wind). */
function windwardOf(s: SimState): number {
  const [wx, wz] = bearingDir(meanWind(s.wind, s.tick / STEPS_PER_SECOND).from), [a, b] = s.ships.map((x) => x.motion.pose);
  const ahead = (a!.x - b!.x) * wx + (a!.z - b!.z) * wz;
  return ahead > WINDWARD_OF ? 0 : ahead < -WINDWARD_OF ? 1 : -1;
}

/** Whether ship `j` lies in the rake of ship `i`: within `RAKING.within` of her bow or stern line. */
function inRake(s: SimState, i: number, j: number): boolean {
  const her = s.ships[i]!.motion.pose, off = Math.abs(angleDiff(bearingTo(her, s.ships[j]!.motion.pose), her.heading));
  return off < RAKING.within || off > Math.PI - RAKING.within;
}

/** One duel between captains of `skills`, from the duel's start of `seed`, to its end. */
function duel(seed: number, skills: readonly [Skill, Skill]): Record {
  const t0 = performance.now();
  let s: SimState = startMatch(crewedBy(crewedBy(duelStart(seed), 0, skills[0]), 1, skills[1]));
  const fired = [0, 0], hits = [0, 0], raked = [0, 0], windward = [0, 0], beaten = [-1, -1], helpless = [-1, -1], refused: string[] = [];
  let closest = Infinity, engaged = -1, orders = 0, peak = 0, nan = false, firstFire = -1;
  while (!s.fight.end) {
    const given = [...captainOrders(s, 0, skills[0]), ...captainOrders(s, 1, skills[1])];
    orders += given.length;
    const r = step(s, given);
    s = r.state;
    for (const e of r.events) {
      if (e.kind === 'fired') {
        fired[e.ship]!++;
        if (firstFire < 0) firstFire = e.tick;
      }
      else if (e.kind === 'hit') {
        hits[e.ship]!++;
        if (inRake(s, e.ship, 1 - e.ship)) raked[e.ship]!++;
      }
      else if (e.kind === 'refused') refused.push(`${e.order.kind}: ${e.reason}`);
      else if (e.kind === 'beaten' && beaten[e.ship]! < 0) beaten[e.ship] = e.tick;
    }
    s.ships.forEach((x, i) => { if (helpless[i]! < 0 && x.damage.fallen.length > 0 && standingNow(x.damage).draws.every((d) => d === 0)) helpless[i] = s.tick; });
    const [a, b] = s.ships.map((x) => x.motion.pose);
    const apart = apartOnWater(a!, b!);
    if (!Number.isFinite(apart) || !Number.isFinite(a!.roll) || !Number.isFinite(b!.roll)) { nan = true; break; }
    closest = Math.min(closest, apart);
    if (firstFire >= 0) { const w = windwardOf(s); if (w >= 0) windward[w]!++; }
    if (engaged < 0 && apart < FIGHTING_RANGE) engaged = s.tick;
    if (s.tick % SIZE_EVERY === 0) peak = Math.max(peak, encodeState(s).length);
  }
  const end = s.fight.end, lost = end ? end.lost : [null, null];
  const weather = windward[0] === windward[1] ? -1 : windward[0]! > windward[1]! ? 0 : 1;
  // Beaten, she strikes (or the fight ends otherwise) within the time it takes him to look round and ask twice.
  const struckInTime = beaten.map((tick, i) => tick < 0 || (end !== null && end.tick - tick <= (STRIKES_WITHIN + SKILL[skills[i]!].strikeAfter) * STEPS_PER_SECOND));
  const seconds = (performance.now() - t0) / 1000;
  return {
    firstFire: firstFire < 0 ? -1 : minutesOf(firstFire), weather,
    seed, skills, force: s.wind.windForce, minutes: minutesOf(end ? end.tick : s.tick), lost, winner: winner(s.fight),
    fired, hits, raked, out: s.ships.map((x) => outOf(x.damage).size), water: s.ships.map((x) => x.damage.flooded[0] + x.damage.flooded[1]),
    fallen: s.ships.map((x) => x.damage.fallen.length), closest, engaged: engaged < 0 ? -1 : minutesOf(engaged),
    beaten: beaten.map((t) => (t < 0 ? -1 : minutesOf(t))), helpless: helpless.map((t) => (t < 0 ? -1 : minutesOf(t))), struckInTime, orders, refused, peak, nan, seconds, msPerStep: (seconds * 1000) / s.tick,
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
  r.struckInTime.forEach((ok, i) => { if (!ok) p.push(`${at}: ship ${i} was beaten at ${r.beaten[i]!.toFixed(1)} min and did not strike within ${STRIKES_WITHIN + SKILL[r.skills[i]!].strikeAfter} s`); });
  for (const reason of new Set(r.refused)) p.push(`${at}: an order refused: ${reason}`);
  return p;
}

/** The middle of a list of numbers (the mean of the two middle ones for an even count). */
function middle(xs: readonly number[]): number {
  const v = [...xs].sort((a, b) => a - b), k = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[k]! : (v[k - 1]! + v[k]!) / 2;
}
const share = (n: number, of: number): string => `${n} of ${of}`;
const within = (x: number, [lo, hi]: readonly [number, number]): boolean => x >= lo && x <= hi;

/** The balance sheet: each duel's line, then the sheet's measures over the set, as lines; what lies outside the sheet's ranges as problems. */
function sheet(records: readonly Record[]): string[] {
  console.log('seed  skills              force  min   how                  won  closest  engaged  fired    hits      out    water    fallen  peak B  ms/step');
  for (const r of records) {
    const how = r.lost.every((l) => l === null) ? 'drawn' : r.lost.map((l) => l ?? '-').join('/');
    console.log(`${pad(r.seed, 4)}  ${r.skills.join(' v ').padEnd(18)}  ${pad(r.force, 5)}  ${pad(r.minutes.toFixed(1), 4)}  ${how.padEnd(19)}  ${pad(r.winner === null ? '-' : r.skills[r.winner]!, 4).slice(0, 4)}  ${pad(r.closest.toFixed(0), 7)}  ${pad(r.engaged < 0 ? 'never' : r.engaged.toFixed(1), 7)}  ${two(r.fired).padEnd(7)}  ${two(r.hits).padEnd(8)}  ${two(r.out).padEnd(5)}  ${two(r.water, 1).padEnd(7)}  ${two(r.fallen).padEnd(6)}  ${pad(r.peak, 6)}  ${r.msPerStep.toFixed(2)}`);
  }
  const p: string[] = [], n = records.length, many = n >= MANY, list = (xs: readonly number[]) => xs.map((x) => x.toFixed(1)).join(', ');
  const fought = records.filter((r) => r.firstFire >= 0), firsts = fought.map((r) => r.firstFire);
  const decided = records.filter((r) => r.winner !== null), fights = decided.map((r) => r.minutes - r.firstFire);
  console.log(`\nbalance sheet over all ${n} duels${many ? '' : ` (the weather position and a ship burnt or blown up seen are judged in runs of ${MANY} or more)`}:`);

  const firstMiddle = firsts.length > 0 ? middle(firsts) : -1;
  console.log(`  start to the first broadside (about 3 min): middle ${firstMiddle.toFixed(1)} min; ${list(firsts)}`);
  if (!within(firstMiddle, SHEET.first)) p.push(`the first broadside: middle ${firstMiddle.toFixed(1)} min, the sheet wants ${SHEET.first[0]} to ${SHEET.first[1]}`);

  const fightIn = fights.filter((m) => within(m, SHEET.fight)).length, short = fights.filter((m) => m < SHEET.least.under), shortest = Math.min(...fights);
  console.log(`  first broadside to the end (${SHEET.fightMost * 10} in 10 within ${SHEET.fight[0]} to ${SHEET.fight[1]}, at most ${SHEET.least.share * 100} % under ${SHEET.least.under}, none under ${SHEET.least.never}): ${share(fightIn, decided.length)} within; ${list([...fights].sort((a, b) => a - b))} min`);
  if (fightIn < SHEET.fightMost * decided.length) p.push(`first broadside to the end: ${share(fightIn, decided.length)} within ${SHEET.fight[0]} to ${SHEET.fight[1]} min`);
  if (short.length > SHEET.least.share * n || shortest < SHEET.least.never) p.push(`first broadside to the end: ${short.length} under ${SHEET.least.under} min (${list(short)}), the sheet allows ${Math.floor(SHEET.least.share * n)} and none under ${SHEET.least.never}`);

  const matchIn = decided.filter((r) => within(r.minutes, SHEET.match)).length, drawn = n - decided.length;
  console.log(`  the whole match (most ${SHEET.match[0]} to ${SHEET.match[1]}): ${share(matchIn, n)} within; drawn by the clock (fewer than 1 in 20): ${drawn}`);
  if (matchIn < SHEET.most * n) p.push(`the whole match: ${share(matchIn, n)} within ${SHEET.match[0]} to ${SHEET.match[1]} min`);
  if (drawn >= Math.max(1, SHEET.draws * n)) p.push(`${drawn} of ${n} drawn by the clock`);

  const endings = new Map<string, number>(ENDINGS.map((e) => [e, 0]));
  for (const r of records) for (const l of r.lost) if (l) endings.set(l, (endings.get(l) ?? 0) + 1);
  const lost = [...endings.values()].reduce((a, b) => a + b, 0), struck = endings.get('struck') ?? 0;
  console.log(`  how ships were lost (struck nearly always; burnt or blown up seen now and then, none over a quarter): ${[...endings].map(([k, c]) => `${c} ${k}`).join(', ')}`);
  for (const [k, c] of endings) {
    if (k === 'struck') continue;
    if (k === 'broke off' && c > 0) p.push(`${c} ships broke off the action (a computer captain never runs, menu.md)`);
    if (c > struck) p.push(`more ships ${k} (${c}) than struck (${struck})`);
    if (c > SHEET.other * lost) p.push(`${c} of ${lost} ships lost ${k}, more than a quarter`);
  }
  if (many && BY_FIRE.every((k) => endings.get(k) === 0)) p.push(`no ship burnt or blown up in ${n} duels`);

  const late = records.flatMap((r) => r.helpless.flatMap((h, i) => (h >= 0 && (r.beaten[i]! < 0 || r.beaten[i]! - h > SHEET.helpless) && r.lost[i] === null ? [`duel ${r.seed} ship ${i}`] : [])));
  const stopped = records.reduce((c, r) => c + r.helpless.filter((h) => h >= 0).length, 0);
  console.log(`  a ship that could not sail beaten within ${SHEET.helpless} min: ${share(stopped - late.length, stopped)}`);
  for (const l of late) p.push(`${l} could not sail and was not beaten within ${SHEET.helpless} min`);

  const rank = (k: Skill) => (SKILLS as readonly Skill[]).indexOf(k);
  const upOne = decided.filter((r) => Math.abs(rank(r.skills[0]) - rank(r.skills[1])) === 1);
  const betterWon = upOne.filter((r) => rank(r.skills[r.winner!]) > rank(r.skills[1 - r.winner!])).length;
  // Printed, not failed on, until it is met (design thread, 2026-11-18: skill pays through decisions, N7.5).
  console.log(`  the better captain, one level up (about 3 in 4; not failed on yet): won ${share(betterWon, upOne.length)} decided`);

  // How much luck decides: the ship that took more of the other's fire should be the one lost.
  const tookMore = decided.filter((r) => r.hits[1 - r.winner!]! > r.hits[r.winner!]!).length;
  console.log(`  the ship that took more hits was the one lost: ${share(tookMore, decided.length)}`);
  const rakedLost = decided.reduce((n, r) => n + r.raked[1 - r.winner!]!, 0), rakedAll = decided.reduce((n, r) => n + r.raked[0]! + r.raked[1]!, 0);
  console.log(`  of the hits that raked, the loser took: ${share(rakedLost, rakedAll)}`);

  const equal = decided.filter((r) => r.skills[0] === r.skills[1] && r.weather >= 0), weatherWon = equal.filter((r) => r.winner === r.weather).length;
  console.log(`  the weather position between equals (clearly more than half): won ${share(weatherWon, equal.length)} decided`);
  if (many && !(weatherWon > SHEET.weather * equal.length)) p.push(`the weather position won ${share(weatherWon, equal.length)}, the sheet wants clearly more than half`);

  const peak = Math.max(...records.map((r) => r.peak));
  console.log(`  the state's peak ${peak} bytes of ${STATE_LIMIT}${peak > STATE_LIMIT ? ' (OVER the network budget)' : ''}`);
  return p;
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
  const problems = [...records.flatMap(problemsOf), ...sheet(records)];
  console.log(`\n${list.length} duels in ${((performance.now() - t0) / 1000).toFixed(0)} s`);
  if (problems.length > 0) {
    for (const p of problems) console.error(`FAIL ${p}`);
    process.exit(1);
  }
  console.log('every duel ended, both ships closed and fired, every beaten ship struck, no order refused, the balance sheet met');
}
