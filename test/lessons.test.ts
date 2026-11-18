/**
 * The first match (implementation plan N7.4): the lessons run in order, each waiting until it is done, remind while
 * not done, mark the man and the fan's orders, name "tap" or "click" as he plays, wake the waiting captain when the
 * course reaches the quarters, and fall silent when skipped; the session's computer captain waits hove to until woken.
 * States are the first match's start with its clock moved on (no stepping), and the session is stepped a few times
 * only (CHECKS.md). Whole matches are check:first's.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIRST_MATCH, heardKeys, Lessons, REMIND_SECONDS, type Guide, type Seen } from '../src/app/lessons.ts';
import { postOf, quarterdeck } from '../src/app/officers.ts';
import { phraseWords, PHRASES, type Line } from '../src/app/speech/phrases.ts';
import { readSeconds } from '../src/app/speech/bubbles.ts';
import { DuelSession } from '../src/net/duel.ts';
import type { SimState } from '../src/sim/state.ts';
import type { SimEvent } from '../src/sim/step.ts';
import { STEPS_PER_SECOND } from '../src/sim/units.ts';

/** The first match at its start, built once (a session stepped no further). */
const START: SimState = new DuelSession({ ...FIRST_MATCH, build: 'test', now: () => 0 }).state;

/** The start at `seconds`, with what she was told changed by `told`. */
function at(seconds: number, told: Partial<SimState['ships'][number]['told']> = {}): SimState {
  const ships = START.ships.map((s, i) => (i === 0 ? { ...s, told: { ...s.told, ...told } } : s));
  return { ...START, tick: Math.round(seconds * STEPS_PER_SECOND), ships };
}

/** A captain who looks about, walks and raises the glass as the seen says. */
const seen = (state: SimState, more: Partial<Seen> = {}): Seen => ({ state, ship: 0, heard: [], looked: 0, glass: false, at: quarterdeck(), ...more });

/** The lessons stepped from `from` to `to` seconds (a step a second), each step's guide handed to `each`. */
function run(l: Lessons, from: number, to: number, make: (t: number) => Seen, each: (g: Guide, t: number) => void = () => {}): Guide {
  let g: Guide | null = null;
  for (let t = from; t <= to; t++) { g = l.guideFor(make(t)); each(g, t); }
  return g!;
}

const lines = (g: Guide): Line[] => g.says.map((s) => s.line);

test('the course runs in order: welcome, look, walk to the master, the glass, make sail, each waiting until done', () => {
  const l = new Lessons();
  const first = l.guideFor(seen(at(0)));
  assert.deepEqual(lines(first), ['lesson.welcome', 'lesson.orders']);
  assert.ok(first.says.every((s) => s.voice === 'first lieutenant' && s.kind === 'lesson'));
  // The look is asked for after the welcome, and waits while he does not look.
  let g = run(l, 1, 30, (t) => seen(at(t)));
  assert.equal(g.now, 'look');
  assert.equal(g.wants, 'look');
  g = run(l, 31, 32, (t) => seen(at(t), { looked: Math.PI }));
  assert.equal(g.now, 'walk', 'looked about: on to walking');
  assert.equal(g.tap, 'master', 'the master is marked');
  g = l.guideFor(seen(at(33), { looked: Math.PI, at: postOf('master') }));
  assert.ok(lines(g).includes('lesson.walk.well'));
  assert.equal(g.now, 'glass');
  assert.equal(g.tap, 'glass');
  assert.equal(g.says.find((s) => s.line === 'lesson.glass')?.terms?.where !== undefined, true, 'the glass names where she lies');
  g = l.guideFor(seen(at(34), { looked: Math.PI, at: postOf('master'), glass: true }));
  assert.equal(g.now, 'sail');
  assert.equal(g.tap, 'first lieutenant');
  assert.deepEqual(g.items, ['sail', 'sail-plain'], 'Make sail, then Plain sail are lit');
  assert.deepEqual(g.wants, { kind: 'sail', ship: 0, canvas: 'plain' });
  g = l.guideFor(seen(at(35, { canvas: 'plain' }), { looked: Math.PI, at: postOf('master'), glass: true }));
  assert.ok(lines(g).includes('lesson.sail.well'));
  assert.equal(g.now, 'by');
  assert.equal(l.woken, false, 'she still waits while he learns to sail');
});

test('a lesson not done is said again every REMIND_SECONDS, and a lesson the page alone sees passes on in time', () => {
  const l = new Lessons();
  const again: number[] = [];
  run(l, 0, 12 + 3 * REMIND_SECONDS, (t) => seen(at(t)), (g, t) => { if (lines(g).includes('lesson.look.again')) again.push(t); });
  assert.equal(again.length, 2);
  assert.equal(again[1]! - again[0]!, REMIND_SECONDS);
  const g = run(l, 13 + 3 * REMIND_SECONDS, 13 + 4 * REMIND_SECONDS, (t) => seen(at(t)));
  assert.equal(g.now, 'walk', 'the look never holds the match up');
  assert.deepEqual(l.passed, ['look']);
});

test('with a mouse the lieutenant says click and names the mouse; by finger he says tap', () => {
  const touch = new Lessons().guideFor(seen(at(0))), mouse = new Lessons().guideFor(seen(at(0), { hands: 'mouse' }));
  const words = (g: Guide) => phraseWords(g.says[1]!.line, 'en', 'british', 0, g.says[1]!.terms);
  assert.match(words(touch), /Tap one of us/);
  assert.match(words(mouse), /Click one of us/);
  assert.equal(phraseWords('lesson.orders', 'de', 'british', 0, mouse.says[1]!.terms).startsWith('Sie selbst'), true);
  const said: Line[] = [];
  run(new Lessons(), 0, 14, (t) => seen(at(t), { hands: 'mouse' }), (g) => said.push(...lines(g)));
  assert.ok(said.includes('lesson.look.mouse'), 'the look by mouse');
  for (const key of Object.keys(PHRASES).filter((k) => k.endsWith('.mouse'))) assert.ok(key.replace(/\.mouse$/, '') in PHRASES, `${key} has its touch line`);
});

test('the waiting captain wakes when the ships come close, once; skipped, nothing more is said and he wakes', () => {
  const near = { ...START, ships: START.ships.map((s, i) => (i === 1 ? { ...s, motion: { ...s.motion, pose: { ...s.motion.pose, x: START.ships[0]!.motion.pose.x + 500, z: START.ships[0]!.motion.pose.z } } } : s)) };
  const l = new Lessons();
  const g = l.guideFor(seen(near));
  assert.equal(g.wake, true);
  assert.equal(l.guideFor(seen({ ...near, tick: 1 })).wake, false, 'woken once');
  const k = new Lessons();
  k.guideFor(seen(at(0)));
  k.silence();
  const quiet = k.guideFor(seen(at(1)));
  assert.deepEqual(quiet.says, []);
  assert.equal(quiet.wake, true, 'skipped: he fights now');
  assert.equal(quiet.tap, null);
  assert.equal(k.guideFor(seen(at(2))).wake, false);
});

test('what of hers is heard is keyed by kind and order; another ship\'s is not hers', () => {
  const events: SimEvent[] = [
    { kind: 'taken', tick: 1, ship: 0, order: { kind: 'tack', ship: 0 } },
    { kind: 'taken', tick: 1, ship: 1, order: { kind: 'tack', ship: 1 } },
    { kind: 'done', tick: 1, ship: 0, order: { kind: 'by', ship: 0 } },
    { kind: 'taken', tick: 1, ship: 0, order: { kind: 'fire', ship: 0 } },
  ];
  assert.deepEqual(heardKeys(events, 0), ['taken:tack', 'done:by', 'taken:fire', 'fired word']);
});

test('a lesson is read longer than a report, never longer than its most', () => {
  const long = 'word '.repeat(40);
  assert.ok(readSeconds(long, false, true) > readSeconds(long, false));
});

test('the first match\'s computer captain lies hove to and gives no order until woken, then fills and commands her', () => {
  let now = 0;
  const s = new DuelSession({ ...FIRST_MATCH, build: 'test', now: () => now });
  const theirs: string[] = [];
  s.on('events', (ev) => { for (const e of ev) if (e.kind === 'taken' && e.ship === 1) theirs.push(e.order.kind); });
  const steps = (n: number) => { for (let i = 0; i < n; i++) { now += 1 / STEPS_PER_SECOND; s.pump(); } };
  steps(2);
  assert.deepEqual(theirs, ['heave']);
  assert.equal(s.foeWaiting, true);
  s.wakeFoe();
  steps(2);
  assert.deepEqual(theirs, ['heave', 'fill']);
  assert.equal(s.foeWaiting, false);
});

test('in the first match the first lieutenant sends the pumps and the carpenter himself, once, and says so, with the lessons skipped too', () => {
  const water = { kind: 'water', tick: 1, ship: 0, mark: 1 } as const;
  for (const skip of [false, true]) {
    const l = new Lessons();
    l.guideFor(seen(at(0)));
    if (skip) l.silence();
    const g = l.guideFor(seen(at(1), { heard: [water] }));
    assert.deepEqual(g.gives, [{ kind: 'pumps', ship: 0 }, { kind: 'plug', ship: 0 }]);
    assert.ok(lines(g).includes('lesson.plug'));
    assert.ok(lines(g).includes('lesson.pumps'));
    assert.deepEqual(l.guideFor(seen(at(2), { heard: [water] })).gives, [], 'once');
  }
});
