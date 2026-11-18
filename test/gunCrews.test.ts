/**
 * The gun crews at quarters (orders.md: one crew serves a pair of guns): each pair's crew has a place at the gun of its
 * pair on either side; the side that bears on the enemy is the side they fight; at quarters they cross the deck to it
 * on the walk graph, smartly, and stay while nothing bears; a pair split between both its guns works each at a little
 * over half pace, a whole crew at one gun at full pace.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openShip } from '../src/sim/crew/closures.ts';
import { startCrew, stepCrew, type Crew, type Engaged } from '../src/sim/crew/crew.ts';
import { brigRoster, pairOf, placeSpot, quartersPlace } from '../src/sim/crew/roster.ts';
import { engagedSide, pairHands } from '../src/sim/guns/gunnery.ts';
import { battery, handsAtGuns, startGuns, stepGuns, gunAt } from '../src/sim/guns/guns.ts';
import { SPLIT_SHARE } from '../src/sim/rules/guns.ts';
import { startMotion, toWorld } from '../src/sim/ship/motion.ts';
import { STEPS_PER_SECOND } from '../src/sim/units.ts';
import { startTold } from './support/crew.ts';

const ROSTER = brigRoster();
const STARBOARD = 1, LARBOARD = -1;
/** The roster's men at the battery's guns (not at the chase ports' pair). */
const GUN_MEN = ROSTER.flatMap((m, i) => (m.gun !== null && quartersPlace(i, STARBOARD) !== null ? [i] : []));
/** How far off her beam the enemy lies, m. */
const RANGE = 150;
/** Longest the crews take to cross the deck, s: the brig is about 9 m wide, and men go one at a time through the crowd. */
const CROSSING = 20;
/** Longer than a split crew takes to load a carronade, s. */
const LOADING = 40;
/** How near the split pace comes out to the rule, a share. */
const PACE_SLACK = 0.02;

/** A crew stepped at quarters on `side` from `crew` until every gun's man stands at his place on that side, or `seconds` pass; the seconds it took. */
function cross(crew: Crew, side: Engaged, seconds = CROSSING): { crew: Crew; seconds: number; smart: boolean } {
  const told = startTold();
  let smart = true;
  for (let tick = 0; tick < seconds * STEPS_PER_SECOND; tick++) {
    if (typeof side === 'number' && GUN_MEN.every((i) => crew.men[i]!.going === null && sameAt(crew, i, quartersPlace(i, side)!))) return { crew, seconds: tick / STEPS_PER_SECOND, smart };
    crew = stepCrew(crew, told, { tick, heel: 0, closures: openShip(), captain: null, canvas: [], quarters: side }).crew;
    for (const i of GUN_MEN) if (crew.men[i]!.going && crew.men[i]!.going!.haste !== 'smart') smart = false;
  }
  return { crew, seconds: Infinity, smart };
}

/** Whether man `i` stands at crew place `place`. */
function sameAt(crew: Crew, i: number, place: string): boolean {
  const at = crew.men[i]!.stands ?? placeSpot(ROSTER[i]!.post), p = placeSpot(place);
  return at.space === p.space && at.along === p.along && at.across === p.across;
}

/** Crossed once for the file: every gun's man at the starboard guns. */
const AT_STARBOARD = (() => {
  const r = cross(startCrew(), STARBOARD);
  assert.ok(Number.isFinite(r.seconds), 'the crews went to the starboard guns');
  return r;
})();

test('every pair\'s crew has a place at its gun on either side, and fills every place of it', () => {
  for (const side of [STARBOARD, LARBOARD]) {
    for (const g of battery().filter((p) => p.side === side)) {
      const men = GUN_MEN.filter((i) => pairOf(ROSTER[i]!.gun!) === pairOf(g.id));
      const places = new Set(men.map((i) => quartersPlace(i, side)));
      assert.equal(places.size, g.crew.length, `${g.id}: ${men.length} men fill its ${g.crew.length} places`);
      for (const p of places) assert.ok(p!.startsWith(`gun-${g.id}-`));
    }
  }
  assert.ok(ROSTER.every((m, i) => m.gun !== null || quartersPlace(i, STARBOARD) === null));
});

test('the engaged side is the side whose guns bear on her: either beam, both, or none dead ahead', () => {
  const pose = startMotion(0, 0, 0).pose, off = (across: number, ahead: number) => {
    const at = toWorld(pose, across, 0, ahead);
    return startMotion(at[0], at[2], 0).pose;
  };
  assert.equal(engagedSide(pose, [off(RANGE, 0)], 'hull'), STARBOARD);
  assert.equal(engagedSide(pose, [off(-RANGE, 0)], 'hull'), LARBOARD);
  assert.equal(engagedSide(pose, [off(RANGE, 0), off(-RANGE, 0)], 'hull'), 'both');
  assert.equal(engagedSide(pose, [off(0, RANGE)], 'hull'), 'none');
  assert.equal(engagedSide(pose, [], 'hull'), 'none');
});

test('at quarters the crews go smartly to the guns of the side engaged, so its guns have their whole crews', () => {
  assert.ok(AT_STARBOARD.smart, 'they went smartly');
  const men = handsAtGuns(AT_STARBOARD.crew);
  battery().forEach((g, i) => {
    if (g.side === STARBOARD) assert.ok(men[i]! >= g.crew.length, `${g.id}: ${men[i]} men`);
    else assert.equal(men[i], 0, `${g.id} is left`);
  });
});

test('when the other side comes to bear they cross the deck, taking their seconds; while neither bears they stay', () => {
  const stayed = cross(AT_STARBOARD.crew, 'none', 1).crew;
  assert.deepEqual(handsAtGuns(stayed), handsAtGuns(AT_STARBOARD.crew), 'nobody moves while nothing bears');
  const r = cross(AT_STARBOARD.crew, LARBOARD);
  assert.ok(r.seconds > 2 && r.seconds < CROSSING, `crossed in ${r.seconds} s`);
});

test('a pair split between its guns works each at a little over half pace; one gun with the whole crew at full pace', () => {
  const split = pairHands(handsAtGuns(startCrew()));
  battery().forEach((_, i) => assert.equal(split.shares[i], SPLIT_SHARE));
  const one = pairHands(handsAtGuns(AT_STARBOARD.crew));
  assert.ok(one.shares.every((s) => s === 1));
  // Housed to loaded (sponged, loaded, rammed: 45 % of the handwork), split and with the whole crew at one gun.
  const i = battery().findIndex((g) => g.side === STARBOARD && g.gun === 'carronade');
  const wants = battery().map(() => ({ load: 'round' as const, runOut: false, train: 0, elevation: 0 }));
  const loading = (shares: readonly number[]) => {
    let guns = startGuns();
    for (let k = 1; k < LOADING * STEPS_PER_SECOND; k++) {
      guns = stepGuns(guns, one.men, wants, shares);
      if (gunAt(guns, i).drill === 'loaded') return k / STEPS_PER_SECOND;
    }
    return Infinity;
  };
  const full = loading(one.shares), slow = loading(one.men.map(() => SPLIT_SHARE));
  assert.ok(Math.abs(full / slow - SPLIT_SHARE) < PACE_SLACK, `loaded in ${full} s at one gun, ${slow} s split`);
});
