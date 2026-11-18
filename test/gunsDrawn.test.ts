/**
 * The guns and the shot drawn (implementation plan N5.4a), the parts that are worked out before anything is drawn:
 * how a gun stands from her drill (run in, running out, leaping back), her lid wanted up; her moving frames (trained
 * about her pivot, run in along her axis, the lid swung on its hinge); the carronade cut into slide and gun; and what
 * is seen of a shot from its event and the shots in flight (the flash, the ball along its path, its splashes, a ball
 * stopped in a ship drawn no further); and how much powder smoke a gun pours at each quality level.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Matrix4, Vector3 } from 'three/webgpu';
import { decodePack } from '@futuremagic/props';
import { battery, startGuns, stepGuns, gunAt, type Battery } from '../src/sim/guns/guns.ts';
import { startMatch, type SimShip, type SimState } from '../src/sim/state.ts';
import { GONE } from '../src/sim/damage.ts';
import { STEPS_PER_SECOND, STEP_SECONDS } from '../src/sim/units.ts';
import type { GunFired, Vec } from '../src/sim/guns/shot.ts';
import { gunsSeen, recoilOut } from '../src/app/gunsSeen.ts';
import { ShotsSeen, STALE } from '../src/app/shotsSeen.ts';
import {
  CARRONADE, LID_OPEN, TIPS_ABOUT, carronadeRest, cascabelRing, gunMove, lidEdge, lidHinge, lidMove, lidSize, splitCarronade,
} from '../src/render/ship/gunPlaces.ts';
import { shipPlan } from '../src/sim/ship/plan.ts';
import { puffsPoured } from '../src/render/smoke.ts';
import { SEED } from './support/orders.ts';

const PACK = decodePack(new Uint8Array(readFileSync('public/ship/fittings.fmpk')));
/** One match, made once: the ships as they start. */
const MATCH: SimState = startMatch({ seed: SEED, windForce: 3, windFrom: 0, ships: [{ x: 0, z: 0, heading: 0 }, { x: 200, z: 0, heading: 0 }] });
const SHIP: SimShip = MATCH.ships[0]!;
/** A full crew a gun, and the steps a reload takes them at most. */
const FULL = 5;
const RELOAD_STEPS = 40 * STEPS_PER_SECOND;
const NONE = () => Number.NaN;
const NEAR = 1e-9;

test('a gun stands run in while housed and loading, runs out by the work done, and leaps back when fired; her lid is up while she is worked', () => {
  const housed = gunsSeen(SHIP, NONE);
  assert.ok(housed.every((g) => g.out === 0 && !g.lid), 'housed and not at quarters: run in, lids down');
  assert.ok(gunsSeen({ ...SHIP, told: { ...SHIP.told, quarters: true } }, NONE).every((g) => g.lid), 'at quarters every lid is up');
  // Loaded and running out: part way out, then out.
  const men = battery().map(() => FULL), wants = battery().map(() => ({ load: 'round' as const, runOut: true, train: 0, elevation: 0 }));
  let guns: Battery = startGuns(), seenRunning = false;
  for (let k = 0; k < RELOAD_STEPS; k++) {
    guns = stepGuns(guns, men, wants);
    const g = gunsSeen({ ...SHIP, guns }, NONE)[0]!;
    if (gunAt(guns, 0).drill === 'running-out') { seenRunning ||= g.out > 0 && g.out < 1; assert.ok(g.lid); }
  }
  assert.ok(seenRunning, 'she was seen part way out');
  assert.equal(gunsSeen({ ...SHIP, guns }, NONE)[0]!.out, 1);
  // Her recoil: out at the instant of firing, most of the way back in the first fifth, at rest run in.
  assert.equal(recoilOut(0), 1);
  assert.ok(recoilOut(0.1) < 0.2 && recoilOut(0.2) < NEAR + 0.1 && recoilOut(1) === 0);
  for (let u = 0; u <= 1; u += 0.05) assert.ok(recoilOut(u) >= 0 && recoilOut(u) <= 1);
});

test('a gun trains about her pivot and runs in along her axis; a lid swings on its hinge, its lower edge hanging over the port when shut', () => {
  const place = battery().find((g) => g.side > 0 && g.gun === 'carronade')!, rest = carronadeRest(place.along, place.sill, place.side);
  const pivot = new Vector3().setFromMatrixPosition(rest), m = new Matrix4(), slide = new Matrix4();
  assert.ok(pivot.clone().applyMatrix4(gunMove(place, pivot, 0.3, 0, m, slide)).distanceTo(pivot) < NEAR, 'the pivot stays put as she trains');
  const run = pivot.clone().applyMatrix4(gunMove(place, pivot, 0, 0.9, m));
  assert.ok(Math.abs(run.x - (pivot.x - 0.9)) < NEAR && Math.abs(run.z - pivot.z) < NEAR, 'run in inboard (starboard: toward -x)');
  const muzzle = new Vector3(pivot.x + 1, pivot.y, pivot.z).applyMatrix4(gunMove(place, pivot, 0.3, 0, m));
  assert.ok(muzzle.z < pivot.z, 'trained toward the bow (-z)');
  // Elevated, she tips about a point inboard of her pivot: the muzzle rises, her breech sinks, the point stays.
  const lifted = (at: Vector3) => at.clone().applyMatrix4(gunMove(place, pivot, 0, 0, m, undefined, 0.1));
  const abaft = (inboard: number) => new Vector3(pivot.x - inboard, pivot.y, pivot.z);
  assert.ok(lifted(abaft(-1)).y > pivot.y && lifted(abaft(1.5)).y < pivot.y, 'muzzle up, breech down');
  assert.ok(lifted(abaft(TIPS_ABOUT.carronade)).distanceTo(abaft(TIPS_ABOUT.carronade)) < NEAR, 'the tipping point stays');
  const port = shipPlan().guns[0]!, hinge = lidHinge(port);
  assert.ok(lidEdge(port).distanceTo(lidEdge(port).applyMatrix4(lidMove(port, hinge, LID_OPEN, m))) < NEAR, 'up is as built');
  const shut = lidEdge(port).applyMatrix4(lidMove(port, hinge, 0, m));
  assert.ok(Math.abs(shut.y - (hinge.y - lidSize(port).h)) < 1e-6 && Math.abs(shut.x - hinge.x) < 1e-6, 'shut, it hangs straight down over the port');
});

test('the carronade is cut into her slide and the gun on her carriage, and her breeching is rove through the ring on her cascabel', () => {
  const whole = PACK.get(CARRONADE)!, { slide, gun } = splitCarronade(whole);
  assert.equal(slide.indices.length + gun.indices.length, whole.indices.length);
  assert.ok(gun.indices.length > 0 && slide.indices.length > 0);
  const ring = cascabelRing(gun);
  assert.ok(ring.y > 0.5 && ring.y < 0.9 && ring.z < 0, 'the ring stands at the gun\'s breech, behind her trunnions');
  assert.ok(ring.z > -0.5, 'on the gun, not at the slide\'s end');
});

/** A shot of one ball flying straight out along +x at 100 m/s from (0, 2, 0), touching the sea at 1 s and plunging at 2 s. */
function shotFired(tick: number): GunFired {
  const path: Vec[] = Array.from({ length: 41 }, (_, i) => [i * 5, 2, 0]);
  return { kind: 'fired', tick, ship: 0, gun: 0, fired: { shot: 'round', span: 0, balls: [{ path, splashes: [1, 2], touches: [[100, 0, 0], [200, 0, 0]], ends: 2 }] } };
}

test('a shot is seen as its flash at the muzzle, its ball along its path, a splash at each touch, and not after a ship stopped it', () => {
  const seen = new ShotsSeen(), tick = 30, t0 = tick * STEP_SECONDS;
  seen.take([shotFired(tick)]);
  assert.equal(seen.sightsAt(t0 - STEP_SECONDS).flashes.length, 0, 'nothing before she fires');
  const at = seen.sightsAt(t0 + 0.5);
  assert.equal(at.flashes.length, 1);
  assert.deepEqual(at.flashes[0]!.dir, [1, 0, 0]);
  assert.ok(Math.abs(at.flashes[0]!.speed - 100) < NEAR, 'the shot left at the speed of its first stretch');
  assert.ok(Math.abs(at.balls[0]!.to[0] - 50) < NEAR, 'the ball is half a second along its path');
  assert.ok(Number.isNaN(seen.firedFor(0, 1, t0)) && Math.abs(seen.firedFor(0, 0, t0 + 1) - 1) < NEAR);
  const later = seen.sightsAt(t0 + 1.2);
  assert.equal(later.splashes.length, 1);
  assert.ok(later.splashes[0]!.skip && Math.abs(later.splashes[0]!.speed - 100) < 1);
  assert.equal(seen.sightsAt(t0 + 1.3).splashes.length, 0, 'each touch is handed over once');
  // A second shot stopped in a ship at 0.5 s: drawn no further, and no splash.
  const stopped = new ShotsSeen();
  stopped.take([shotFired(tick)]);
  const flying = (spent: number) => ({ ...MATCH, tick: tick + STEPS_PER_SECOND / 2, flying: [{ by: 0, gun: 0, tick, spent: [spent] }] });
  stopped.watch(flying(0));
  stopped.watch(flying(GONE));
  assert.equal(stopped.sightsAt(t0 + 0.8).balls.length, 0);
  assert.equal(stopped.sightsAt(t0 + 1.5).splashes.length, 0);
  // Long past (a jump): nothing stale is handed over.
  const jumped = new ShotsSeen();
  jumped.take([shotFired(tick)]);
  const past = jumped.sightsAt(t0 + 2 + STALE);
  assert.equal(past.flashes.length + past.splashes.length + past.balls.length, 0);
});

test('a lower quality pours fewer puffs of smoke, each denser, so the smoke seen through hides as much', () => {
  const seenThrough = (p: { puffs: number; density: number }) => (1 - p.density) ** p.puffs;
  const full = puffsPoured(1);
  for (const plenty of [1, 0.6, 0.4, 0.05]) {
    const p = puffsPoured(plenty);
    assert.ok(p.puffs >= 1 && p.puffs <= full.puffs && p.density <= 1);
    assert.ok(Math.abs(seenThrough(p) - seenThrough(full)) < 1e-9, `plenty ${plenty}`);
  }
  assert.ok(puffsPoured(0.4).puffs < full.puffs);
});
