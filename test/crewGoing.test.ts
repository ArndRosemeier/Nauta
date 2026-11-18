import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decode, encode } from '../src/sim/codec.ts';
import { closeWay, openShip, openWay, type Closures } from '../src/sim/crew/closures.ts';
import { goingAt, startGoing, stepGoings, type Going, type Surroundings } from '../src/sim/crew/going.ts';
import { standable, routeNetwork } from '../src/sim/crew/network.ts';
import { routeTime } from '../src/sim/crew/route.ts';
import { WAY_GAP } from '../src/sim/rules/routes.ts';
import { QUARTERDECK } from '../src/sim/rules/ships.ts';
import { shipPlan, type Spot } from '../src/sim/ship/plan.ts';
import { rigPlan } from '../src/sim/ship/rig.ts';
import { STEP_SECONDS, STEPS_PER_SECOND } from '../src/sim/units.ts';
import { pace } from './support/pace.ts';

const plan = shipPlan();
const rig = rigPlan(plan);
const net = routeNetwork();
const calm: Surroundings = { heel: 0, closures: openShip(), captain: null, standing: [] };
const station = (id: string): Spot => [...plan.stations, ...rig.stations].find((s) => s.id === id)!;
const messdeck: Spot = { space: 'messdeck', along: 6, across: 1.5 };
/** Simulated seconds a test lets men go before it gives up. */
const LONGEST = 300;

/** Steps the men until all are there (or LONGEST), calling `each` after every step; returns the seconds each took. */
function run(goings: (Going | null)[], s: Surroundings | ((t: number) => Surroundings), each?: (g: (Going | null)[], t: number) => void): number[] {
  const took = goings.map(() => NaN);
  let t = 0;
  while (goings.some((g) => g) && t < LONGEST) {
    const r = stepGoings(goings, typeof s === 'function' ? s(t) : s);
    t += STEP_SECONDS;
    for (const i of r.arrived) took[i] = t;
    goings = r.goings;
    each?.(goings, t);
  }
  return took;
}

test('a man alone takes his route\'s time, at a walk and smartly', () => {
  for (const haste of ['walk', 'smart'] as const) {
    const g = startGoing(station('wheel'), station('main-top'), haste, 0, calm.closures)!;
    const [took] = run([g], calm);
    assert.ok(Math.abs(took! - routeTime(g.route, 0, haste)) <= STEP_SECONDS, `${took} s against ${routeTime(g.route, 0, haste)} s`);
  }
});

test('going is plain data: through bytes and back halfway, the men go on the same; the list\'s order changes nothing', () => {
  const a = startGoing(station('waist'), station('fore-top'), 'smart', 0, calm.closures)!;
  const b = startGoing(station('pumps'), station('fore-top'), 'smart', 0, calm.closures)!;
  let ab: (Going | null)[] = [a, b], ba: (Going | null)[] = [b, a];
  for (let i = 0; i < STEPS_PER_SECOND * 10; i++) {
    ab = stepGoings(ab, calm).goings;
    ba = stepGoings(ba, calm).goings;
  }
  assert.deepEqual(ab, [ba[1], ba[0]]);
  assert.deepEqual(decode(encode(ab)), ab);
});

test('men queue at a ladder, one at a time and a gap apart, and a crowd takes longer than a man alone', () => {
  const one = startGoing(messdeck, station('waist'), 'smart', 0, calm.closures)!;
  const [alone] = run([one], calm);
  const crowd = Array.from({ length: 12 }, (_, i) => startGoing({ space: 'messdeck', along: messdeck.along + 1 + (i % 4) * 0.5, across: messdeck.across + Math.floor(i / 4) * 0.5 }, station('waist'), 'smart', 0, calm.closures));
  const took = run(crowd, calm, (gs) => {
    // Never two on the fore ladder going up closer than WAY_GAP.
    const on = gs.flatMap((g) => { const l = g?.route.legs[g.leg]; return g && l?.way === 'fore-ladder' ? [g.share * l.length] : []; }).sort((x, y) => x - y);
    for (let i = 1; i < on.length; i++) assert.ok(on[i]! - on[i - 1]! >= WAY_GAP - 1e-9, `${on[i]! - on[i - 1]!} m apart`);
  });
  assert.ok(took.every(Number.isFinite), 'all got there');
  assert.ok(Math.max(...took) > alone! * 2, `the last of twelve took ${Math.max(...took).toFixed(1)} s, one alone ${alone!.toFixed(1)} s`);
});

test('the heel slows a man down', () => {
  const g = startGoing(station('wheel'), station('surgeon'), 'walk', 0, calm.closures)!;
  const [upright] = run([g], calm);
  const [heeled] = run([g], { ...calm, heel: 0.3 });
  assert.ok(heeled! > upright! * 1.2, `${heeled} s heeled, ${upright} s upright`);
});

test('a man walking toward the captain stands aside, and goes on once he has passed', () => {
  const wheel = station('wheel'), capstan = station(QUARTERDECK);
  const g = startGoing(capstan, wheel, 'walk', 0, calm.closures)!;
  // The captain stands on the man's line two metres along, then walks off to the side after five seconds.
  const line = g.route.legs[0]!.line, toward = { along: line[2]! - line[0]!, across: line[3]! - line[1]! }, len = Math.hypot(toward.along, toward.across);
  const captainAt: Spot = { space: 'deck', along: capstan.along + toward.along / len * 2, across: capstan.across + toward.across / len * 2 };
  const gone: Spot = { space: 'deck', along: captainAt.along, across: captainAt.across - 3 };
  let asideSeen = false;
  const took = run([g], (t) => ({ ...calm, captain: t < 5 ? captainAt : gone }), (gs, t) => {
    const m = gs[0];
    if (m && t < 5 && m.aside) {
      asideSeen = true;
      const at = goingAt(m, net);
      assert.ok(Math.hypot(at.along - captainAt.along, at.across - captainAt.across) > 0.4, 'not where the captain stands');
      assert.ok(standable(net, at, []), 'aside where a body fits');
    }
  });
  assert.ok(asideSeen, 'he stood aside');
  assert.ok(took[0]! > 5 && took[0]! < 5 + routeTime(g.route, 0, 'walk'), `${took[0]} s`);
});

test('a ladder shut ahead of a man sends him round; one shut under him he climbs to its end; a shut door leaves him waiting until it opens', () => {
  let closures: Closures = openShip();
  const g = startGoing(messdeck, station('waist'), 'walk', 0, closures)!;
  assert.ok(g.route.legs.some((l) => l.way === 'fore-ladder'));
  const ways = new Set<string>();
  const took = run([g], (t) => { if (t > 1 && !closures.waysClosed.length) closures = closeWay(closures, 'fore-ladder'); return { ...calm, closures }; }, (gs) => {
    const l = gs[0]?.route.legs[gs[0].leg];
    if (l?.way) ways.add(l.way);
  });
  assert.ok(Number.isFinite(took[0]) && !ways.has('fore-ladder') && ways.has('after-ladder'), [...ways].join(' '));
  // Already on the fore ladder when it is shut: he goes on up.
  let onIt: Closures = openShip();
  const up = startGoing({ space: 'messdeck', along: 10, across: 0.5 }, station('waist'), 'walk', 0, onIt)!;
  const seen = new Set<string>();
  run([up], () => ({ ...calm, closures: onIt }), (gs) => {
    const l = gs[0]?.route.legs[gs[0].leg];
    if (l?.way === 'fore-ladder' && !onIt.waysClosed.length) onIt = closeWay(onIt, 'fore-ladder');
    if (l?.way) seen.add(l.way);
  });
  assert.deepEqual([...seen], ['fore-ladder']);
  // The cockpit's door shut while he is on his way there: he waits, and goes in when it opens.
  let door: Closures = openShip();
  const toSurgeon = startGoing(station('waist'), station('surgeon'), 'walk', 0, door)!;
  let stuckSeen = false;
  const there = run([toSurgeon], (t) => {
    if (t > 1 && t < 20 && !door.waysClosed.length) door = closeWay(door, 'cockpit-door');
    if (t >= 20 && door.waysClosed.length) door = openWay(door, 'cockpit-door');
    return { ...calm, closures: door };
  }, (gs) => { if (gs[0]?.stuck) stuckSeen = true; });
  assert.ok(stuckSeen && there[0]! > 20, `${there[0]} s`);
});

test('a whole crew of 121 going about at once: every man gets there, each step costs little', () => {
  const places = [...plan.places, ...rig.places];
  const crew = Array.from({ length: 121 }, (_, i) => startGoing(places[(i * 7) % places.length]!, places[(i * 13 + 5) % places.length]!, 'smart', 0.1, calm.closures));
  const heeled = { ...calm, heel: 0.1 };
  let mid = crew;
  for (let i = 0; i < STEPS_PER_SECOND * 5; i++) mid = stepGoings(mid, heeled).goings;
  // About 0.07 ms a step on the cloud machine, as long as some 2,500 sine and cosine pairs.
  const share = pace(() => stepGoings(mid, heeled), STEP_PAIRS);
  assert.ok(share < 1, `${share.toFixed(2)} of ${STEP_PAIRS} pairs`);
  const took = run(mid, heeled);
  assert.ok(took.every((t, i) => Number.isFinite(t) || !mid[i]), 'all got there');
});
/** The sine and cosine pairs one step of a whole crew on its way may take. */
const STEP_PAIRS = 20_000;
