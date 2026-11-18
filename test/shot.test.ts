/**
 * Shot in flight (implementation plan N5.2): ranges match the table; firing on the up-roll goes high, on the down-roll
 * low; the same seed gives the same fall of shot; grape scatters, chain sweeps; the gun captain's laying reaches the
 * point he lays for; a gun bears as her roll brings her through it; a shot is plain data an event can carry. The hit
 * shares against a brig at 100, 200 and 400 m are the slow check's (`npm run check:gunnery`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encode } from '../src/sim/codec.ts';
import { battery } from '../src/sim/guns/guns.ts';
import { bears, boreElevation, elevationFor, fireShot, fly, layOn, muzzleAt, type Fire, type Flight } from '../src/sim/guns/shot.ts';
import { MUZZLE_SPEED, POINT_BLANK, RANGE_TABLE, RANGE_TOLERANCE, SHOT } from '../src/sim/rules/guns.ts';
import { startMotion, toWorld, type ShipPose } from '../src/sim/ship/motion.ts';
import { DEGREE } from '../src/sim/units.ts';

/** The muzzle's height over the water in the range table, m. */
const PORT_HEIGHT = 2.2;
const STARBOARD = battery().findIndex((g) => g.side > 0 && g.gun === 'carronade');
const LARBOARD = battery().findIndex((g) => g.side < 0 && g.gun === 'carronade');
/** She lies level, heading north, still. */
const LEVEL: ShipPose = { ...startMotion(0, 0, 0).pose, pitch: 0, roll: 0, heave: 0 };

/** A first graze's distance from where the ball left, m. */
const graze = (f: Flight, from: readonly number[]): number => Math.hypot(f.touches[0]![0] - from[0]!, f.touches[0]![2] - from[2]!);

/** A fire from battery place `gun` laid square at `elevated`, on the captain's word (no timing error), in a calm. */
function fire(gun: number, pose: ShipPose, elevated = 0, tick = 0, shot: 'round' | 'chain' | 'grape' = 'round'): Fire {
  return {
    seed: 1805, ship: 0, gun, tick, place: battery()[gun]!, firing: { shot, trained: 0, elevated }, pose,
    going: { ahead: 0, leeway: 0 }, men: 5, asTheyBear: false, sea: null, t: 0,
  };
}

test('ranges match the table: round shot to its first graze at point blank and at 5°', () => {
  for (const gun of ['carronade', 'long6'] as const) {
    for (const [elevation, want] of [[POINT_BLANK, RANGE_TABLE[gun].pointBlank], [5 * DEGREE, RANGE_TABLE[gun].five]] as const) {
      const v = MUZZLE_SPEED[gun], from = [0, PORT_HEIGHT, 0] as const;
      const got = graze(fly('round', gun, from, [v * Math.cos(elevation), v * Math.sin(elevation), 0], null, 0), from);
      assert.ok(Math.abs(got / want - 1) <= RANGE_TOLERANCE, `${gun} at ${(elevation / DEGREE).toFixed(0)}°: ${got.toFixed(0)} m, table ${want} m`);
    }
  }
  // Chain carries much less far than round; the carronade's reach is a fraction of the long six's.
  const level = (kind: 'round' | 'chain', gun: 'carronade' | 'long6') => graze(fly(kind, gun, [0, PORT_HEIGHT, 0], [MUZZLE_SPEED[gun] * SHOT[kind].speed, 0, 0], null, 0), [0, PORT_HEIGHT, 0]);
  assert.ok(level('chain', 'carronade') < level('round', 'carronade'));
  assert.ok(RANGE_TABLE.carronade.five < RANGE_TABLE.long6.five);
});

test('fired on the up-roll the shot goes high and far, on the down-roll low and short, on either side', () => {
  const roll = 3 * DEGREE;
  for (const gun of [STARBOARD, LARBOARD]) {
    const side = battery()[gun]!.side;
    // Her firing side up: rolled away from it.
    const up = fireShot(fire(gun, { ...LEVEL, roll: -side * roll }, POINT_BLANK));
    const level = fireShot(fire(gun, LEVEL, POINT_BLANK));
    const down = fireShot(fire(gun, { ...LEVEL, roll: side * roll }, POINT_BLANK));
    const reach = (s: typeof up) => Math.hypot(s.balls[0]!.touches[0]![0], s.balls[0]!.touches[0]![2]);
    assert.ok(reach(up) > reach(level) && reach(level) > reach(down), `side ${side}: ${reach(up).toFixed(0)} > ${reach(level).toFixed(0)} > ${reach(down).toFixed(0)}`);
    // Out of her own side.
    assert.equal(Math.sign(level.balls[0]!.touches[0]![0]), side);
  }
});

test('the same seed gives the same fall of shot; another tick or seed another', () => {
  const shot = (tick: number, seed = 1805) => fireShot({ ...fire(STARBOARD, LEVEL, 2 * DEGREE, tick), seed, asTheyBear: true });
  assert.deepEqual(shot(30), shot(30));
  assert.notDeepEqual(shot(30).balls[0]!.touches, shot(31).balls[0]!.touches);
  assert.notDeepEqual(shot(30).balls[0]!.touches, shot(30, 1806).balls[0]!.touches);
});

test('grape leaves as nine balls in a cone, chain as one that sweeps its span; a shot is plain data', () => {
  const grape = fireShot(fire(STARBOARD, LEVEL, 0, 0, 'grape'));
  assert.equal(grape.balls.length, SHOT.grape.balls);
  const firsts = grape.balls.map((b) => b.path[1]!), mid = muzzleAt(battery()[STARBOARD]!);
  const from = toWorld(LEVEL, mid[0], mid[1], mid[2]);
  const angles = firsts.map((p) => Math.atan2(p[2] - from[2], p[0] - from[0]));
  assert.ok(Math.max(...angles) - Math.min(...angles) > SHOT.grape.spread / 2, 'the balls spread');
  const chain = fireShot(fire(STARBOARD, LEVEL, 0, 0, 'chain'));
  assert.equal(chain.balls.length, 1);
  assert.equal(chain.span, SHOT.chain.span);
  assert.ok(encode(grape).length > 0);
  // Every path point is a number and the flight ends where it last touched the water.
  for (const b of grape.balls) {
    assert.ok(b.path.every((p) => p.every(Number.isFinite)));
    assert.deepEqual(b.path[b.path.length - 1], b.touches[b.touches.length - 1]);
  }
});

test('round shot skips off the water at a shallow angle and plunges at a steep one', () => {
  const v = MUZZLE_SPEED.carronade;
  const flat = fly('round', 'carronade', [0, PORT_HEIGHT, 0], [v, 0, 0], null, 0);
  const steep = fly('round', 'carronade', [0, PORT_HEIGHT, 0], [v * Math.cos(-5 * DEGREE) , v * Math.sin(-5 * DEGREE) * 4, 0], null, 0);
  assert.ok(flat.splashes.length > 1, 'skipped');
  assert.equal(steep.splashes.length, 1, 'plunged');
  assert.equal(fly('chain', 'carronade', [0, PORT_HEIGHT, 0], [v, 0, 0], null, 0).splashes.length, 1, 'chain does not skip');
});

test('the laying table puts the shot through the point laid for, and the gun captain lays her on it', () => {
  for (const gun of ['carronade', 'long6'] as const) {
    for (const [range, rise] of [[100, 0], [300, -1], [500, 2]] as const) {
      const e = elevationFor('round', gun, range, rise), v = MUZZLE_SPEED[gun];
      const path = fly('round', gun, [0, 50, 0], [v * Math.cos(e), v * Math.sin(e), 0], null, 0).path;
      const k = path.findIndex((p) => p[0] >= range), a = path[k - 1]!, b = path[k]!;
      const height = a[1] + ((b[1] - a[1]) * (range - a[0])) / (b[0] - a[0]) - 50;
      assert.ok(Math.abs(height - rise) < 0.1, `${gun} ${range} m: passes ${height.toFixed(2)} m, laid for ${rise} m`);
    }
  }
  // Laying on a point abeam to starboard: square, a little up; ahead of the beam, trained forward.
  const place = battery()[STARBOARD]!, mid = muzzleAt(place), from = toWorld(LEVEL, mid[0], mid[1], mid[2]);
  const abeam = layOn({ seed: 1, ship: 0, gun: STARBOARD, tick: 0, place, pose: LEVEL, shot: 'round', heel: 0 }, [from[0] + 200, 1, from[2]]);
  assert.ok(Math.abs(abeam.train) < 1e-9 && abeam.elevation > 0);
  const forward = layOn({ seed: 1, ship: 0, gun: STARBOARD, tick: 0, place, pose: LEVEL, shot: 'round', heel: 0 }, [from[0] + 200, 1, from[2] - 50]);
  assert.ok(forward.train > 10 * DEGREE);
  // Heeled to starboard, she is laid higher on deck to reach the same elevation.
  const heeled = layOn({ seed: 1, ship: 0, gun: STARBOARD, tick: 0, place, pose: LEVEL, shot: 'round', heel: 2 * DEGREE }, [from[0] + 200, 1, from[2]]);
  assert.ok(Math.abs(heeled.laid - abeam.laid - 2 * DEGREE) < 1e-9);
});

test('a gun bears when her roll brings her bore through the elevation laid for', () => {
  const place = battery()[STARBOARD]!, rate = 2 * DEGREE;
  // Rolling to larboard (her starboard guns rising) through level.
  const rolling = (roll: number): ShipPose => ({ ...LEVEL, roll, rollRate: -rate });
  const want = boreElevation(place, 0, 0, rolling(0)).now;
  assert.ok(boreElevation(place, 0, 0, rolling(0)).rate > 0, 'the bore rises as she rolls to larboard');
  assert.equal(bears(place, 0, 0, rolling(0.01 * DEGREE), want), true);
  assert.equal(bears(place, 0, 0, rolling(1 * DEGREE), want), false);
  assert.equal(bears(place, 0, 0, rolling(-1 * DEGREE), want), false);
});
