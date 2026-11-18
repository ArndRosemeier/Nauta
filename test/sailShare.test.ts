/**
 * How far a sail is set is one share the crew moves (design ruling N3, 2026-11-18): from furled (0) through hanging in
 * its gear (rules/rig.ts `HANGING`) to sheeted home (1), held in her sailing state only while it is part way; the wind
 * drives her by it (a square sail only once sheeting starts); the drill takes a sail on from where it stands; the men
 * set and take in a sail a share at a time, and a sail left part way by a later order is taken on from there. The
 * crew is driven alone (test/support/crew.ts).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drill, jobLeft } from '../src/sim/crew/drill.ts';
import type { Order, SailAct } from '../src/sim/orders.ts';
import { HANGING } from '../src/sim/rules/rig.ts';
import { rigPlan } from '../src/sim/ship/rig.ts';
import { sailsStanding, setShares } from '../src/sim/ship/sailing.ts';
import { drawShare, sailArea, sailShare } from '../src/sim/ship/sails.ts';
import { drive, startSail, WIND } from './support/crew.ts';

const COURSE = 3, TOPSAIL = 4, BOOM = 6;
const TINY = 1e-9;
const HALF = 0.5;

const sails = rigPlan().sails;
const plain: Order = { kind: 'sail', ship: 0, canvas: 'plain' };
const jobsOf = (act: SailAct, share: number, reefs = 0) => drill(act, 'sail', startSail().canvas.map((c, i) => (i === act.sail ? (share <= 0 ? { set: false, reefs: 0 } : share >= 1 ? { set: true, reefs } : { set: true, reefs, share }) : c))).map((j) => j.job);
const sailAct = (sail: number, set: boolean, reefs = 0): SailAct => ({ kind: 'sail', id: 1, of: 0, sail, set, reefs });

/** The ticks a sail's share rose (or fell) through, checked to move one way only. */
function oneWay(shares: readonly number[], up: boolean): void {
  for (let k = 1; k < shares.length; k++) assert.ok(up ? shares[k]! >= shares[k - 1]! - TINY : shares[k]! <= shares[k - 1]! + TINY, `share went ${up ? 'down' : 'up'} at tick ${k}`);
}

test('how far a sail is set is one share, kept in the state only while it is part way', () => {
  const s = startSail();
  const part = setShares(s, [{ sail: COURSE, share: HALF, reefs: 0 }]).canvas[COURSE]!;
  assert.deepEqual(part, { set: true, reefs: 0, share: HALF });
  const full = setShares(s, [{ sail: COURSE, share: 1, reefs: 1 }]).canvas[COURSE]!;
  assert.deepEqual(full, { set: true, reefs: 1 });
  assert.ok(!Object.hasOwn(full, 'share'), 'a sail as set carries no share');
  assert.deepEqual(setShares(s, [{ sail: COURSE, share: 0, reefs: 1 }]).canvas[COURSE], { set: false, reefs: 0 });
  assert.deepEqual([sailShare(full), sailShare(part), sailShare({ set: false, reefs: 0 })], [1, HALF, 0]);
  // A square sail draws only past hanging in its gear; a fore-and-aft sail as it is hoisted.
  const square = sails[COURSE]!, boom = sails[BOOM]!;
  assert.equal(drawShare(square, { set: true, reefs: 0, share: HANGING }), 0);
  assert.ok(Math.abs(drawShare(square, { set: true, reefs: 0, share: (1 + HANGING) / 2 }) - HALF) < TINY);
  assert.equal(drawShare(square, { set: true, reefs: 0 }), 1);
  assert.equal(drawShare(boom, { set: true, reefs: 0, share: HALF }), HALF);
});

test('the wind drives her by how far each sail is set', () => {
  const s = startSail(), area = (share: number) => sailsStanding(setShares(s, [{ sail: TOPSAIL, share, reefs: 0 }]), WIND)[TOPSAIL]!;
  const full = area(1), half = area((1 + HANGING) / 2), hanging = area(HANGING);
  assert.ok(Math.abs(full.area - sailArea(sails[TOPSAIL]!, s.canvas[TOPSAIL])) < TINY);
  assert.ok(Math.abs(half.area - full.area / 2) < TINY, 'half sheeted home, half its area draws');
  assert.ok(half.pressure > 0 && Math.abs(half.pressure - full.pressure) < TINY, 'on the same wind');
  assert.deepEqual([hanging.area, hanging.pressure, hanging.aback], [0, 0, false], 'hanging in its gear it does not draw');
});

test('the drill takes a sail on from where it stands, never doing again what it has passed', () => {
  // Setting a course: loosed and sheeted from furled or part loosed, sheeted only once it hangs.
  assert.deepEqual([0, HANGING / 2, HANGING, (1 + HANGING) / 2].map((sh) => jobsOf(sailAct(COURSE, true), sh)), [['loose', 'sheet'], ['loose', 'sheet'], ['sheet'], ['sheet']]);
  // Taking it in: clewed up and furled, or furled only once it hangs.
  assert.deepEqual([1, (1 + HANGING) / 2, HANGING / 2].map((sh) => jobsOf(sailAct(COURSE, false), sh)), [['clew', 'furl'], ['clew', 'furl'], ['furl']]);
  // A reef: clewed up, reefed on the yard, sheeted home; a boom sail doused and hoisted again.
  assert.deepEqual(jobsOf(sailAct(TOPSAIL, true, 1), 1), ['clew', 'reef', 'sheet']);
  assert.deepEqual(jobsOf(sailAct(BOOM, true, 1), 1), ['douse', 'hoist']);
  // The first job's work is what is left of its stretch.
  assert.ok(Math.abs(jobLeft('clew', (1 + HANGING) / 2) - HALF) < TINY);
  assert.deepEqual([jobLeft('loose', 0), jobLeft('sheet', 0), jobLeft('reef', HANGING)], [1, 1, 1]);
});

test('the men set a sail a share at a time: let fall to hanging, then sheeted home as the order is done', () => {
  const r = drive([plain]), course = r.shares.map((s) => s[COURSE]!);
  oneWay(course, true);
  const loose = [...r.tasks.values()].find((t) => t.task.job === 'loose' && t.task.on === COURSE)!;
  const sheet = [...r.tasks.values()].find((t) => t.task.job === 'sheet' && t.task.on === COURSE)!;
  assert.equal(course[loose.began! - 1], 0, 'furled until the men lay out');
  assert.ok(Math.abs(course[loose.ended!]! - HANGING) < TINY, 'hanging in its gear once loosed');
  assert.ok(course.slice(loose.began!, sheet.ended!).some((sh) => sh > HANGING && sh < 1), 'part sheeted home on the way');
  assert.equal(course[sheet.ended!], 1);
  assert.ok(r.doneAt.get('sail')! >= sheet.ended!, 'the order done once its last sail is home');
  assert.ok(r.shares.at(-1)!.every((sh) => sh === 0 || sh === 1), 'every sail stands as set at the end');
});

test('taken in, a sail stops drawing when clewed up and is furled after; one left part way is taken on from there', () => {
  const r = drive([{ kind: 'shorten', ship: 0 }]), top = r.shares.map((s) => s[TOPSAIL]!);
  oneWay(top, false);
  const clew = [...r.tasks.values()].find((t) => t.task.job === 'clew' && t.task.on === TOPSAIL)!;
  assert.ok(Math.abs(top[clew.ended!]! - HANGING) < TINY, 'hanging, drawing nothing, once clewed up');
  assert.equal(top.at(-1), 0, 'furled at the end');
  // Plain sail stopped while the course is being loosed: it is furled again from where it hung, and nothing else is done.
  const first = drive([plain]).shares.findIndex((s) => s[COURSE]! > HANGING / 2);
  const back = drive([plain], undefined, undefined, [{ tick: first, order: { kind: 'sail', ship: 0, canvas: 'battle' } }]);
  const jobs = [...back.tasks.values()].filter((t) => t.task.on === COURSE && t.began !== null && t.began > first).map((t) => t.task.job);
  assert.deepEqual(jobs, ['furl'], 'only furled again');
  assert.equal(back.shares.at(-1)![COURSE], 0);
  assert.deepEqual([back.told.given, back.told.acts], [[], []]);
});
