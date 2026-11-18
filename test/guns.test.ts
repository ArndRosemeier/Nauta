/**
 * The guns (implementation plan N5.1): a full crew reloads in the table's time, short-handed slower by the rule; a gun
 * cannot fire unloaded or run in; a dismounted gun does nothing; laying stays within her arcs; the men at a gun are
 * read from the crew; the battery is plain data and small.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encode } from '../src/sim/codec.ts';
import { startCrew, type Crew } from '../src/sim/crew/crew.ts';
import { brigRoster } from '../src/sim/crew/roster.ts';
import {
  ANGLE_UNIT, battery, cannotFire, dismountGun, drillPace, drillSeconds, fireGun, gunAt, gunCount, handsAtGuns, handWork, laidAt,
  standingWants, startGuns, stepGuns, withinArcs, type Battery, type Gun, type GunWant,
} from '../src/sim/guns/guns.ts';
import { DRILL_SHARES, FEWEST_AT_GUN, GUNS, STRETCH } from '../src/sim/rules/guns.ts';
import { DEGREE, STEPS_PER_SECOND } from '../src/sim/units.ts';

const CARRONADE = battery().findIndex((g) => g.gun === 'carronade');
const LONG6 = battery().findIndex((g) => g.gun === 'long6');
const FULL = battery()[CARRONADE]!.crew.length;
const TICK = 1 / STEPS_PER_SECOND;
/** Ready to fire: loaded with round shot and run out, laid square. */
const FIGHT: GunWant = { load: 'round', runOut: true, train: 0, elevation: 0 };

/** Gun `i` of a battery stepped with `men` at her under `want` (the others as they stand) until `until` holds or `seconds` pass. */
function drive(guns: Battery, i: number, men: number, want: GunWant, until: (g: Gun) => boolean, seconds = 200): { guns: Battery; gun: Gun; seconds: number } {
  const hands = battery().map((_, k) => (k === i ? men : 0));
  for (let k = 0; k < seconds * STEPS_PER_SECOND; k++) {
    if (until(gunAt(guns, i))) return { guns, gun: gunAt(guns, i), seconds: k * TICK };
    const wants = standingWants(guns);
    wants[i] = want;
    guns = stepGuns(guns, hands, wants);
  }
  return { guns, gun: gunAt(guns, i), seconds: Infinity };
}

const ready = (g: Gun): boolean => g.drill === 'ready';

/** A battery with gun `i` made ready from housed, then fired. */
function fired(i: number): Battery {
  const made = drive(startGuns(), i, FULL, FIGHT, ready).guns;
  const shot = fireGun(made, i, FULL);
  assert.ok(shot.firing, shot.reason ?? '');
  return shot.guns;
}

test('the battery is the brig\'s 16 carronades and 2 long sixes, eight and one a side, each with five crew places', () => {
  const b = battery();
  assert.equal(b.filter((g) => g.gun === 'carronade').length, 16);
  assert.equal(b.filter((g) => g.gun === 'long6').length, 2);
  assert.equal(b.filter((g) => g.side > 0).length, 9);
  assert.ok(b.every((g) => !g.chase && g.crew.length === FULL));
  assert.equal(gunCount(startGuns()), b.length);
  assert.ok(Math.abs(Object.values(DRILL_SHARES).reduce((a, s) => a + s, 0) - 1) < 1e-9);
});

test('a full crew reloads in the table\'s time, from the shot to standing ready again', () => {
  for (const i of [CARRONADE, LONG6]) {
    const row = GUNS[battery()[i]!.gun];
    const { seconds } = drive(fired(i), i, FULL, FIGHT, ready);
    assert.ok(Math.abs(seconds - row.reload) <= TICK + 1e-9, `${row.what}: ${seconds} s, table ${row.reload} s`);
  }
});

test('short-handed, the reload\'s handwork stretches in proportion to the hands missing; under two men she stops', () => {
  const row = GUNS.carronade;
  for (const men of [4, 3, FEWEST_AT_GUN]) {
    const { seconds } = drive(fired(CARRONADE), CARRONADE, men, FIGHT, ready);
    const want = row.recoil + (row.reload - row.recoil) * (1 + (STRETCH * (FULL - men)) / FULL);
    assert.ok(Math.abs(seconds - want) <= 2 * TICK, `${men} men: ${seconds} s, rule ${want} s`);
  }
  // More men than her places do not hurry her.
  assert.equal(drillPace(FULL + 3, FULL), 1);
  // One man: the recoil ends, then nothing.
  const alone = drive(fired(CARRONADE), CARRONADE, 1, FIGHT, ready, 120);
  assert.equal(alone.seconds, Infinity);
  assert.equal(alone.gun.drill, 'sponging');
  assert.ok(Math.abs(drillSeconds(alone.gun) - handWork(row, 'sponging')) < 1e-9);
});

test('a gun cannot fire unloaded, loaded but run in, or with too few men; fired, she recoils and stands foul', () => {
  const housed = startGuns();
  assert.equal(fireGun(housed, CARRONADE, FULL).reason, 'she is not loaded');
  const loaded = drive(housed, CARRONADE, FULL, { ...FIGHT, runOut: false }, (g) => g.drill === 'loaded');
  assert.equal(loaded.gun.loadedWith, 'round');
  assert.equal(fireGun(loaded.guns, CARRONADE, FULL).reason, 'she is not run out');
  const out = drive(loaded.guns, CARRONADE, FULL, FIGHT, ready).guns;
  assert.equal(fireGun(out, CARRONADE, 1).reason, 'too few men at the gun');
  const shot = fireGun(out, CARRONADE, FULL);
  assert.deepEqual(shot.firing, { shot: 'round', trained: 0, elevated: 0 });
  const after = gunAt(shot.guns, CARRONADE);
  assert.equal(after.drill, 'recoil');
  assert.equal(after.loadedWith, null);
  assert.equal(fireGun(shot.guns, CARRONADE, FULL).reason, 'she is not loaded');
  // Only the gun fired changed.
  assert.deepEqual(shot.guns.filter((_, k) => Math.floor(k / (shot.guns.length / battery().length)) !== CARRONADE), out.filter((_, k) => Math.floor(k / (out.length / battery().length)) !== CARRONADE));
  // Run in again without firing, she keeps her load.
  const runIn = drive(out, CARRONADE, FULL, { ...FIGHT, runOut: false }, (g) => g.drill === 'loaded');
  assert.ok(Math.abs(runIn.seconds - GUNS.carronade.runIn) <= TICK);
  assert.equal(runIn.gun.loadedWith, 'round');
});

test('a gun told to load nothing stays housed, and after a shot is sponged and housed', () => {
  const hold: GunWant = { load: null, runOut: false, train: 0, elevation: 0 };
  const housed = startGuns();
  assert.equal(drive(housed, CARRONADE, FULL, hold, () => false, 5).guns, housed);
  const after = drive(fired(CARRONADE), CARRONADE, FULL, hold, (g) => g.drill === 'housed');
  assert.equal(after.gun.loadedWith, null);
  assert.ok(after.seconds < GUNS.carronade.reload);
});

test('a dismounted gun does nothing: no drill, no laying, no firing', () => {
  const out = drive(startGuns(), CARRONADE, FULL, FIGHT, ready).guns;
  const down = dismountGun(out, CARRONADE);
  assert.equal(gunAt(down, CARRONADE).dismounted, true);
  assert.equal(fireGun(down, CARRONADE, FULL).reason, 'the gun is dismounted');
  assert.equal(drive(down, CARRONADE, FULL, { ...FIGHT, runOut: false, train: GUNS.carronade.train }, () => false, 5).guns, down);
  const foul = dismountGun(fired(CARRONADE), CARRONADE);
  assert.equal(drive(foul, CARRONADE, FULL, FIGHT, () => false, 10).guns, foul);
});

test('laying goes at her rate within her arcs, slower short-handed, not while she recoils', () => {
  const row = GUNS.carronade, wild: GunWant = { load: null, runOut: false, train: 90 * DEGREE, elevation: -40 * DEGREE };
  const aim = withinArcs(row, wild.train, wild.elevation);
  assert.deepEqual(aim, { train: row.train, elevation: -row.depress });
  const at = (g: Gun) => laidAt(g);
  const laid = drive(startGuns(), CARRONADE, FULL, wild, (g) => Math.abs(at(g).train - aim.train) < ANGLE_UNIT && Math.abs(at(g).elevation - aim.elevation) < ANGLE_UNIT);
  assert.ok(Math.abs(laid.seconds - row.train / row.trainRate) <= 0.2, `${laid.seconds} s`);
  const short = drive(startGuns(), CARRONADE, 3, wild, (g) => Math.abs(at(g).train - aim.train) < ANGLE_UNIT);
  assert.ok(short.seconds > laid.seconds * 1.3);
  const recoiling = fired(CARRONADE);
  const hands = battery().map(() => FULL), wants = standingWants(recoiling);
  wants[CARRONADE] = wild;
  assert.equal(gunAt(stepGuns(recoiling, hands, wants), CARRONADE).trained, gunAt(recoiling, CARRONADE).trained);
});

test('the men at each gun are read from the crew: the quarter bill stands two or three at each gun', () => {
  const crew = startCrew(), men = handsAtGuns(crew);
  assert.equal(men.length, battery().length);
  assert.ok(men.every((n) => n >= 2 && n <= 3), men.join(' '));
  // A man sent away is no longer at his gun; one standing at a gun place that is not his post counts there.
  const roster = brigRoster(), i = roster.findIndex((m) => m.gun === battery()[CARRONADE]!.id);
  const g = battery()[CARRONADE]!, other = battery()[LONG6]!;
  const away: Crew = { ...crew, men: crew.men.map((h, k) => (k === i ? { ...h, stands: { space: 'deck', along: g.along, across: 0 } } : h)) };
  assert.equal(handsAtGuns(away)[CARRONADE], men[CARRONADE]! - 1);
  const moved: Crew = { ...crew, men: crew.men.map((h, k) => (k === i ? { ...h, stands: other.crew[0]! } : h)) };
  assert.equal(handsAtGuns(moved)[LONG6], men[LONG6]! + 1);
  assert.equal(cannotFire(gunAt(startGuns(), CARRONADE), FULL), 'she is not loaded');
});

test('a battery with no orders stands still; it is plain whole numbers, a few bytes a gun', () => {
  const guns = startGuns(), men = handsAtGuns(startCrew());
  assert.equal(stepGuns(guns, men, standingWants(guns)), guns);
  assert.ok(guns.every(Number.isInteger));
  assert.ok(encode(guns).length < 100, `${encode(guns).length} bytes housed`);
  let working = guns;
  const hands = battery().map(() => FULL);
  for (let k = 0; k < 4 * STEPS_PER_SECOND; k++) working = stepGuns(working, hands, battery().map(() => ({ ...FIGHT, train: 7 * DEGREE, elevation: 3 * DEGREE })));
  assert.ok(working.every(Number.isInteger));
  assert.ok(encode(working).length < 200, `${encode(working).length} bytes working`);
});
