/**
 * The scenario's placement map (docs/design/scenarios.md): ships put by hand keep their place against the wind in any
 * seed, the start's own places for the map, and the chart's geometry.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addShip, DEFAULT_SCENARIO, isPlaced, limitOf, PRESETS, readScenario, removeShip, resetPlaces, setCommand, setPlace, setSide, LEAST_APART } from '../src/sim/scenario.ts';
import { defaultPlaces, duelStart, fleetStart, previewForce, startApart, type Placed } from '../src/sim/start.ts';
import { CHART, frameOf, fromChart, gridOf, headingTo, roomFor, snapped, SNAP_M, toChart } from '../src/app/placement.ts';
import { readTerms, startTerms } from '../src/app/terms.ts';
import { DEGREE, wrapBearing } from '../src/sim/units.ts';
import { DuelSession } from '../src/net/duel.ts';
import { BUILD } from './support/duelRoom.ts';

/** A world position and heading turned back into the wind's frame. */
function inWindFrame(x: number, z: number, heading: number, windFrom: number): Placed {
  const c = Math.cos(-windFrom), s = Math.sin(-windFrom);
  return { x: x * c - z * s, z: z * c + x * s, heading: wrapBearing(heading - windFrom) };
}

test('ships put by hand keep their place against the wind whatever the seed turns it to', () => {
  const by: Placed[] = [{ x: 300, z: -100, heading: 90 * DEGREE }, { x: -250, z: 400, heading: 200 * DEGREE }];
  for (let seed = 0; seed < 30; seed++) {
    for (const meet of ['even', 'weather', 'lee'] as const) {
      const setup = duelStart(seed, { meet, placed: by });
      setup.ships.forEach((s, i) => {
        const back = inWindFrame(s.x, s.z, s.heading, setup.windFrom);
        assert.ok(Math.abs(back.x - by[i]!.x) < 1e-6 && Math.abs(back.z - by[i]!.z) < 1e-6, `seed ${seed} ${meet}`);
        assert.ok(Math.abs(wrapBearing(back.heading - by[i]!.heading + Math.PI) - Math.PI) < 1e-9);
      });
    }
  }
});

test('a ship not put by hand is where the start puts her, the others where they were put', () => {
  const plain = fleetStart(5, [0, 1, 0]), mixed = fleetStart(5, [0, 1, 0], { placed: [null, { x: 0, z: 0, heading: 0 }, null] });
  assert.deepEqual(mixed.ships[0], plain.ships[0]);
  assert.deepEqual(mixed.ships[2], plain.ships[2]);
  assert.notDeepEqual(mixed.ships[1], plain.ships[1]);
  assert.deepEqual(duelStart(5, { placed: [null, null] }), duelStart(5), 'none put by hand is the plain duel');
  assert.deepEqual(duelStart(5, { placed: [] }), duelStart(5));
});

test('the map\'s own places are the duel in the wind\'s frame: the wind from the north, abeam, each heading at the other', () => {
  for (const wind of ['drawn', 'light', 'fresh', 'strong'] as const) {
    const [a, b] = defaultPlaces([0, 1], { wind });
    assert.ok(Math.abs(Math.hypot(a.x - b.x, a.z - b.z) - startApart(previewForce(wind))) < 1e-6);
    assert.ok(Math.abs(a.z) < 1e-6 && Math.abs(b.z) < 1e-6, 'on a line across the wind');
    assert.ok(a.x > 0 && b.x < 0, 'the first ship on the east, heading west');
    assert.ok(Math.abs(a.heading - 270 * DEGREE) < 1e-9 && Math.abs(b.heading - 90 * DEGREE) < 1e-9);
  }
  // The weather position turns the line against the wind.
  const [a] = defaultPlaces([0, 1], { meet: 'weather' });
  assert.ok(Math.abs(Math.abs(a.z) / Math.hypot(a.x, a.z) - Math.sin(20 * DEGREE)) < 1e-9);
  assert.equal(defaultPlaces([0, 0, 1, 1], {}).length, 4);
});

test('defaults of the map, fed back as the places, give the start the same fleet at that force', () => {
  // The preview force is the range's middle; a seed whose force is that gets exactly the picture the map showed.
  const sides = [0, 0, 1, 1], terms = { wind: 'fresh' } as const;
  const places = defaultPlaces(sides, terms), setup = fleetStart(3, sides, { ...terms, placed: places });
  const plain = fleetStart(3, sides, terms);
  assert.equal(setup.windForce, 4);
  setup.ships.forEach((s, i) => { assert.ok(Math.abs(s.x - plain.ships[i]!.x) < 1e-6 && Math.abs(s.z - plain.ships[i]!.z) < 1e-6); });
});

test('putting a ship freezes the others, resetting brings the start back, and a change to the ships clears them', () => {
  const defaults = defaultPlaces([0, 1], {}), to = { x: 100, z: 100, heading: 0 };
  let sc = setPlace(DEFAULT_SCENARIO, 0, to, defaults);
  assert.deepEqual(sc.ships[0]!.at, to);
  assert.deepEqual(sc.ships[1]!.at, { x: Math.round(defaults[1]!.x), z: Math.round(defaults[1]!.z), heading: defaults[1]!.heading }, 'to the metre');
  assert.ok(isPlaced(sc));
  assert.equal(isPlaced(resetPlaces(sc)), false);
  assert.equal(resetPlaces(DEFAULT_SCENARIO), DEFAULT_SCENARIO);
  assert.ok(isPlaced(setCommand(sc, 1, { kind: 'player' })), 'a captain changed leaves the places');
  for (const changed of [addShip(sc), removeShip(addShip(sc), 2), setSide(addShip(sc), 0, 2)]) assert.equal(isPlaced(changed), false);
  assert.deepEqual(readScenario(JSON.parse(JSON.stringify(sc))), sc);
  // Places kept for some ships only are read back as none.
  const half = JSON.parse(JSON.stringify(sc));
  half.ships[1].at = null;
  assert.equal(isPlaced(readScenario(half)), false);
  assert.equal(readScenario({ ...JSON.parse(JSON.stringify(sc)), ships: JSON.parse(JSON.stringify(sc.ships)).map((s: { at: unknown }) => ({ ...s, at: { x: 1e9, z: 0, heading: 0 } })) }).ships.some((s) => s.at), false, 'off the map');
});

test('ships put closer than a hull and a bit are refused at the start', () => {
  const sc = setPlace(setPlace(DEFAULT_SCENARIO, 0, { x: 0, z: 0, heading: 0 }, defaultPlaces([0, 1], {})), 1, { x: LEAST_APART - 1, z: 0, heading: 0 }, []);
  assert.equal(limitOf(sc), 'too close');
  assert.equal(limitOf(PRESETS.alone), null);
  assert.deepEqual(startTerms({ ...(readTerms(null)), scenario: sc }).placed?.length, 2);
});

test('the chart frames every ship inside its margin and metres and chart units go back and forth', () => {
  for (const places of [[{ x: 650, z: 0, heading: 0 }, { x: -650, z: 0, heading: 0 }], [{ x: 3000, z: -2500, heading: 0 }, { x: -2000, z: 1500, heading: 0 }, { x: 10, z: 10, heading: 0 }], [{ x: 5, z: 5, heading: 0 }, { x: 70, z: 5, heading: 0 }], []]) {
    const f = frameOf(places);
    for (const p of places) {
      const [px, py] = toChart(f, p.x, p.z);
      assert.ok(px >= CHART.margin - 1e-6 && px <= CHART.width - CHART.margin + 1e-6 && py >= CHART.margin - 1e-6 && py <= CHART.height - CHART.margin + 1e-6, `${JSON.stringify(p)} at ${px},${py}`);
      const [x, z] = fromChart(f, px, py);
      assert.ok(Math.abs(x - p.x) < 1e-6 && Math.abs(z - p.z) < 1e-6);
    }
    const g = gridOf(f);
    assert.ok(g.step * f.scale >= 70 || g.step === 2000);
    assert.ok(g.xs.length > 0 && g.zs.length > 0);
  }
});

test('a ship snaps to the grid and stays inside the map; a heading snaps to five degrees; hulls keep their distance', () => {
  assert.deepEqual(snapped(13, 62), [25, 50]);
  assert.ok(Math.hypot(...snapped(9000, 9000)) <= 4000 + SNAP_M);
  assert.ok(Math.abs(headingTo(0, 0, 100, 1) - 90 * DEGREE) < 1e-9);
  assert.ok(Math.abs(headingTo(0, 0, 0, -100)) < 1e-9, 'north is up');
  assert.ok(Math.abs(headingTo(0, 0, -100, 0) - 270 * DEGREE) < 1e-9);
  const here = [{ x: 0, z: 0, heading: 0 }, { x: 500, z: 0, heading: 0 }];
  assert.equal(roomFor(here, 0, 480, 0), false);
  assert.equal(roomFor(here, 0, 400, 0), true);
  assert.equal(roomFor(here, 0, 0, 0), true, 'a ship does not keep clear of herself');
});

test('a match played alone starts the ships where the dialog put them, and the plain terms start the plain duel', () => {
  const sc = setPlace(DEFAULT_SCENARIO, 0, { x: 200, z: 300, heading: 0 }, defaultPlaces([0, 1], {}));
  const placed = new DuelSession({ build: BUILD, now: () => 0, seed: 9, terms: startTerms({ ...readTerms(null), scenario: sc }) }).state;
  const plain = new DuelSession({ build: BUILD, now: () => 0, seed: 9, terms: startTerms(readTerms(null)) }).state;
  assert.equal(placed.ships[0]!.motion.pose.x !== plain.ships[0]!.motion.pose.x, true);
  assert.deepEqual(plain, new DuelSession({ build: BUILD, now: () => 0, seed: 9 }).state, 'no places is the plain duel, bit for bit');
});
