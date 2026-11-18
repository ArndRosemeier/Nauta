/**
 * Slow check (docs/CHECKS.md, implementation plan N7.4): a novice plays the first match, doing only what the first
 * lieutenant asks, when he asks it, a few seconds late as a new player would be. A pure simulation: the session the
 * menu starts (`FIRST_MATCH`), its clock driven here, the lessons (app/lessons.ts) heard step by step as the page
 * hears them. The novice is played at three speeds of reaction, each in a process of its own, side by side.
 *
 * In the fight he does as the lieutenant taught: the word ("Fire!") once the whole side bears, as her deck comes up
 * level (within a new captain's eye, `LEVEL_BY_EYE`).
 *
 * Fails on what the lessons own (design thread, 2026-11-18): a lesson of the course that never came, one passed on
 * undone (its time ran out), an order a lesson asked for refused, the course not reaching the fight within
 * `FIGHT_WITHIN` minutes, the green captain never woken, the ships never within `FIGHTING_RANGE` or a ship that never
 * fired. The fight's result is printed and not judged; "the novice wins" becomes a failure (`MUST_WIN`) once the first
 * balance pass (N7.5a) is merged (until then nearly every duel is drawn, N7.1).
 *
 *   npm run check:first
 *   FIRST_TRACE=1 tsx tools/sim/first.ts --run 8     one novice (8 s), the ships every 30 s and his orders
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { angleDiff } from '@futuremagic/core';
import { waitingForWord } from '../../src/app/fanOrders.ts';
import { FIRST_MATCH, Lessons, type Guide, type Want } from '../../src/app/lessons.ts';
import { postOf, quarterdeck } from '../../src/app/officers.ts';
import { DuelSession } from '../../src/net/duel.ts';
import { sideReports } from '../../src/sim/captain/sight.ts';
import { winner } from '../../src/sim/end.ts';
import { noticed } from '../../src/sim/notices.ts';
import { WORD_READY } from '../../src/sim/rules/captain.ts';
import type { Spot } from '../../src/sim/ship/plan.ts';
import type { SimState } from '../../src/sim/state.ts';
import type { SimEvent } from '../../src/sim/step.ts';
import { apartOnWater, bearingTo, DEGREE, SECONDS_PER_MINUTE, STEPS_PER_SECOND } from '../../src/sim/units.ts';

/** The novice's reaction, s: how long after the lieutenant asks he does it (a quick one, a usual one, a slow one). */
const REACTIONS = [3, 8, 15];
/** The match is played this long at most, minutes: the balance sheet's longest duel and the lessons before it. */
const MOST_MINUTES = 30;
/** The course must reach the fight (his first word given) within this many minutes, even for the slow novice. */
const FIGHT_WITHIN = 12;
/** The ships must come within this of each other, m, to have fought (check:captains' measure). */
const FIGHTING_RANGE = 600;
/** Whether the novice must win: false until N7.5a is merged (design thread, 2026-11-18). */
const MUST_WIN = false;
/** The lessons the novice does himself, all of which must come. */
const DONE_BY_HIM = ['look', 'walk', 'glass', 'sail', 'by', 'tack', 'follow', 'quarters', 'hold', 'abeam', 'fire'];
/** Her deck level by a new captain's eye, rad: he gives the word within this of level. */
const LEVEL_BY_EYE = 2 * DEGREE;
const STEP = 1 / STEPS_PER_SECOND;
/** `FIRST_TRACE=1`: the ships every `TRACE_EVERY` seconds and his orders as they are taken or refused. */
const TRACE = !!process.env.FIRST_TRACE;
const TRACE_EVERY = 30;

/** What one novice's match came to. */
interface Run {
  readonly reaction: number;
  /** Each lesson or tip that held the marker, at its minute; those passed on undone; orders a lesson asked for that were refused. */
  readonly lessons: { id: string; minute: number }[];
  passed: readonly string[];
  readonly refused: string[];
  /** When she woke and when the course reached the fight, minutes (-1 never); the closest they came, m. */
  woke: number;
  fight: number;
  closest: number;
  minutes: number;
  lost: readonly (string | null)[];
  won: boolean;
  /** Guns fired by each ship, and hits each took. */
  readonly fired: [number, number];
  readonly hits: [number, number];
}

/** What he does when asked: a thing on the page (look, walk, glass), or an order (its kind given back). */
function doIt(want: Want, session: DuelSession, me: { looked: number; glass: boolean; at: Spot }): string | null {
  if (want === 'look') me.looked = Math.PI;
  else if (want === 'walk') me.at = postOf('master');
  else if (want === 'glass') me.glass = true;
  else { session.give({ ...want, ship: session.mine }); return want.kind; }
  return null;
}

/** As the lieutenant teaches it: the word once the whole side (as the master counts it) bears, her deck near level. */
function wordNow(state: SimState, ship: number): boolean {
  const me = state.ships[ship]!, her = state.ships[1 - ship]!;
  const off = angleDiff(me.sailing.heading, bearingTo(me.motion.pose, her.motion.pose));
  const side = sideReports(me, off, off)[off < 0 ? 0 : 1];
  return side.mounted > 0 && side.readyBearing >= Math.ceil(WORD_READY * side.mounted) && Math.abs(me.motion.pose.roll) < LEVEL_BY_EYE;
}

/** One novice plays the first match. */
function play(reaction: number): Run {
  let now = 0;
  const session = new DuelSession({ ...FIRST_MATCH, build: 'check', now: () => now });
  const lessons = new Lessons(), me = { looked: 0, glass: false, at: quarterdeck() };
  const run: Run = { reaction, lessons: [], passed: [], refused: [], woke: -1, fight: -1, closest: Infinity, minutes: 0, lost: [], won: false, fired: [0, 0], hits: [0, 0] };
  let last: SimState = session.state, guide: Guide | null = null, askedAt = -Infinity, first = true, wordAt = -Infinity;
  /** The order a lesson asked for that he gave last, until it is answered. */
  let asked: string | null = null;
  session.on('events', (events: readonly SimEvent[]) => {
    const state = session.state, t = state.tick / STEPS_PER_SECOND, minute = t / SECONDS_PER_MINUTE, ship = session.mine;
    const notices = noticed(last, state, ship, first);
    first = false;
    last = state;
    const a = state.ships[0]!, b = state.ships[1]!, apart = apartOnWater(a.motion.pose, b.motion.pose);
    run.closest = Math.min(run.closest, apart);
    for (const e of events) {
      if (e.kind === 'fired') run.fired[e.ship as 0 | 1]++;
      if (e.kind === 'hit') run.hits[e.ship as 0 | 1]++;
      if ((e.kind === 'taken' || e.kind === 'refused' || e.kind === 'answered') && e.order.ship === ship) {
        if (TRACE) console.log(`  ${minute.toFixed(2)} min: ${e.kind} ${e.order.kind}${e.kind === 'taken' ? '' : ` (${e.code})`}`);
        if (e.order.kind === asked) { if (e.kind === 'refused') run.refused.push(`${asked} at ${minute.toFixed(1)} min (${e.code})`); asked = null; }
      }
    }
    const g = lessons.guideFor({ state, ship, heard: [...events, ...notices], looked: me.looked, glass: me.glass, at: me.at });
    if (g.wake) { session.wakeFoe(); if (run.woke < 0) run.woke = minute; }
    if (g.now !== (guide?.now ?? '')) { askedAt = t; if (g.now) run.lessons.push({ id: g.now, minute }); }
    guide = g;
    if (TRACE && state.tick % (TRACE_EVERY * STEPS_PER_SECOND) === 0) {
      console.log(`  ${minute.toFixed(1)} min: ${apart.toFixed(0)} m apart, ${a.sailing.ahead.toFixed(1)} / ${b.sailing.ahead.toFixed(1)} m/s, ${a.told.keep?.kind ?? '-'} ${a.told.firing} / ${b.told.firing}, lesson ${g.now || '-'}`);
    }
    // He does what is asked once he has read it, and again each time it is asked again.
    if (g.asked) askedAt = t;
    if (g.wants && t - askedAt >= reaction) { asked = doIt(g.wants, session, me) ?? asked; askedAt = Infinity; }
    if (lessons.taught('fight') && run.fight < 0) run.fight = minute;
    // In the fight, as he was taught (not the instant it comes: he sees it, then gives it).
    if (lessons.taught('fight') && waitingForWord(state, ship) && wordNow(state, ship) && t - wordAt >= reaction) { session.give({ kind: 'fire', ship }); wordAt = t; }
  });
  const most = MOST_MINUTES * SECONDS_PER_MINUTE;
  while (!session.state.fight.end && now < most) { now += STEP; session.pump(); }
  const f = session.state.fight;
  run.passed = lessons.passed;
  run.minutes = session.state.tick / STEPS_PER_SECOND / SECONDS_PER_MINUTE;
  run.lost = f.end?.lost ?? [];
  run.won = winner(f) === session.mine;
  return run;
}

/** What went wrong in a run, in words (none: it holds). */
function problemsOf(r: Run): string[] {
  const out: string[] = [], who = `reaction ${r.reaction} s`;
  for (const id of DONE_BY_HIM) if (!r.lessons.some((l) => l.id === id)) out.push(`${who}: the lesson "${id}" never came`);
  for (const id of r.passed) out.push(`${who}: "${id}" was passed on undone`);
  for (const what of r.refused) out.push(`${who}: an order a lesson asked for was refused: ${what}`);
  if (r.woke < 0) out.push(`${who}: the green captain never woke`);
  if (r.fight < 0 || r.fight > FIGHT_WITHIN) out.push(`${who}: the course reached the fight at ${r.fight.toFixed(1)} min, not within ${FIGHT_WITHIN}`);
  if (r.closest > FIGHTING_RANGE) out.push(`${who}: the ships came no closer than ${r.closest.toFixed(0)} m`);
  if (r.fired.some((n) => n === 0)) out.push(`${who}: a ship never fired (${r.fired.join(' / ')})`);
  if (MUST_WIN && !r.won) out.push(`${who}: the novice did not win within ${MOST_MINUTES} minutes`);
  return out;
}

function report(runs: readonly Run[]): void {
  const problems: string[] = [];
  for (const r of runs) {
    console.log(`reaction ${r.reaction} s: ${r.won ? 'WON' : 'not won'} after ${r.minutes.toFixed(1)} min, lost ${JSON.stringify(r.lost)}; she woke at ${r.woke.toFixed(1)} min, the fight from ${r.fight.toFixed(1)} min, closest ${r.closest.toFixed(0)} m; guns fired ${r.fired.join(' / ')}, hits taken ${r.hits.join(' / ')}`);
    console.log(`  lessons: ${r.lessons.map((l) => `${l.id} ${l.minute.toFixed(1)}`).join(', ')}`);
    problems.push(...problemsOf(r));
  }
  console.log(`the novice won ${runs.filter((r) => r.won).length} of ${runs.length}${MUST_WIN ? '' : ' (printed, not judged until N7.5a)'}`);
  if (problems.length) {
    console.error(`check:first failed:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log('check:first: every lesson came and was done, nothing it asked for was refused, and the fight was fought');
}

/** Each novice in a process of its own; its run comes back as JSON on its last line. */
function inChild(reaction: number): Promise<Run> {
  return new Promise((done, failed) => {
    const child = spawn(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), '--run', String(reaction), '--json'], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    child.on('exit', (code) => {
      const line = out.trim().split('\n').pop() ?? '';
      if (code === 0 && line.startsWith('{')) done(JSON.parse(line) as Run);
      else failed(new Error(`the novice of ${reaction} s stopped (${code}): ${out.slice(-500)}`));
    });
  });
}

const at = process.argv.indexOf('--run');
if (at >= 0) {
  const run = play(Number(process.argv[at + 1]));
  if (process.argv.includes('--json')) console.log(JSON.stringify(run));
  else report([run]);
} else {
  report(await Promise.all(REACTIONS.map(inChild)));
}
