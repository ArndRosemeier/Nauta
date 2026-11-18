/**
 * Gunfire heard (implementation plan N5.6): her own gun close by is the near report on her own bus with a jolt under
 * the captain; heard from below deck it comes through her timbers; the enemy's guns arrive after their flash by the
 * speed of sound and far off sound far; a ball passing near the ear is heard as it passes, a ball falling near the ear
 * as it falls; a broadside round the ear deafens (the world dull and quieter, the ears ringing once) and the ears
 * recover; a report too late is left out. Every take exists.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deafened, farShare, GunWatch, nearestPass, type GunHeard, type GunScene, type GunShot } from '../src/audio/gunHearing.ts';
import { DEAF, GUN_FAR, GUN_NEAR, GUN_THROUGH, LATE, NEAR_TO_FAR, PASS_LEAD, RING, SHOT_PASS, SHOT_SPLASH } from '../src/audio/gunTuning.ts';
import { OPEN_AIR } from '../src/audio/acoustics.ts';
import { battery } from '../src/sim/guns/guns.ts';
import { fireShot, type GunFired, type Shot, type Vec } from '../src/sim/guns/shot.ts';
import { SPEED_OF_SOUND } from '../src/sim/rules/guns.ts';
import { startMotion, toWorld, type ShipPose } from '../src/sim/ship/motion.ts';
import { STEP_SECONDS } from '../src/sim/units.ts';

/** The page's frames, s. */
const FRAME = 1 / 60;
/** She lies level at the origin heading north; the enemy the same, `apart` m to the east. */
const LEVEL: ShipPose = { ...startMotion(0, 0, 0).pose, pitch: 0, roll: 0, heave: 0 };
const at = (x: number): ShipPose => ({ ...LEVEL, x });
/** The ear on her quarterdeck amidships at a man's eye, and below on her berth deck (ship space). */
const QUARTERDECK: Vec = [0, 4.5, 3.8];
const BERTH: Vec = [0, 1.6, -4];
const STARBOARD = battery().map((g, i) => ({ g, i })).filter(({ g }) => g.side > 0 && g.gun === 'carronade').map(({ i }) => i);

/** A gun of ship `ship` lying at `pose` fired at `tick`, round shot laid level on the captain's word. */
function fired(ship: number, gun: number, pose: ShipPose, tick: number): GunFired {
  const shot = fireShot({
    seed: 1805, ship, gun, tick, place: battery()[gun]!, firing: { shot: 'round', trained: 0, elevated: 0 }, pose,
    going: { ahead: 0, leeway: 0 }, men: 5, asTheyBear: false, sea: null, t: tick * STEP_SECONDS,
  });
  return { kind: 'fired', tick, ship, gun, fired: shot };
}

interface Got extends GunShot { readonly t: number }

/** Runs the watch frame by frame from `from` for `seconds`, the ear at `earShip` aboard ship 0 at LEVEL; every sound with when it is heard. */
function listen(w: GunWatch, earShip: Vec, from: number, seconds: number, below = 0, each?: (h: GunHeard, t: number) => void): Got[] {
  const ear = toWorld(LEVEL, earShip[0], earShip[1], earShip[2]);
  const out: GunHeard = { shots: [], beds: [], jolts: [], deaf: 0, ring: 0 }, got: Got[] = [];
  for (let t = from; t < from + seconds; t += FRAME) {
    const scene: GunScene = { t, ear, earShip, aboard: 0, below };
    const h = w.heardAt(scene, out);
    for (const s of h.shots) got.push({ ...s, t: t + s.delay });
    each?.(h, t);
  }
  return got;
}

test('her own gun close by: the near report on her own bus at once, and a jolt away from the gun', () => {
  const w = new GunWatch(), gun = STARBOARD[3]!;
  w.keepFired([fired(0, gun, LEVEL, 30)]);
  const jolts: GunHeard['jolts'][number][] = [];
  const got = listen(w, QUARTERDECK, 1, 2, 0, (h) => jolts.push(...h.jolts));
  assert.equal(got.length, 1, got.map((g) => g.id).join());
  const [report] = got;
  assert.equal(report!.id, GUN_NEAR.id);
  assert.equal(report!.bus, 'body');
  assert.ok(Math.abs(report!.t - 1) < 0.05, `heard at ${report!.t.toFixed(3)} s`);
  assert.equal(jolts.length, 1);
  // The starboard gun pushes him to larboard (-x).
  assert.ok(jolts[0]!.x < 0 && jolts[0]!.strength > 0, JSON.stringify(jolts[0]));
});

test('heard from below deck her own gun comes through her timbers', () => {
  const w = new GunWatch();
  w.keepFired([fired(0, STARBOARD[2]!, LEVEL, 30)]);
  const got = listen(w, BERTH, 1, 1, 1).filter((g) => g.id.startsWith('gun/'));
  assert.deepEqual(got.map((g) => g.id), [GUN_THROUGH.id]);
  assert.equal(got[0]!.bus, 'body');
});

test("the enemy's gun arrives after its flash by the speed of sound, and far off it sounds far", () => {
  for (const apart of [60, 340]) {
    const w = new GunWatch(), enemy = at(apart);
    // Her larboard gun, toward us.
    const gun = battery().findIndex((g) => g.side < 0 && g.gun === 'carronade');
    const e = fired(1, gun, enemy, 30);
    w.keepFired([e]);
    const got = listen(w, QUARTERDECK, 1, 2).filter((g) => g.id === GUN_NEAR.id || g.id === GUN_FAR.id);
    const ear = toWorld(LEVEL, QUARTERDECK[0], QUARTERDECK[1], QUARTERDECK[2]), muzzle = e.fired.balls[0]!.path[0]!;
    const want = 1 + Math.hypot(muzzle[0] - ear[0], muzzle[1] - ear[1], muzzle[2] - ear[2]) / SPEED_OF_SOUND;
    assert.ok(got.length >= 1);
    for (const g of got) {
      assert.ok(Math.abs(g.t - want) < 0.03, `${apart} m: heard at ${g.t.toFixed(3)} s, sound takes it to ${want.toFixed(3)} s`);
      assert.equal(g.bus, 'world');
    }
    const loudest = got.reduce((a, b) => (b.gain > a.gain ? b : a));
    assert.equal(loudest.id, apart > NEAR_TO_FAR[1] ? GUN_FAR.id : GUN_NEAR.id, `${apart} m`);
  }
  assert.equal(farShare(NEAR_TO_FAR[0]), 0);
  assert.equal(farShare(NEAR_TO_FAR[1]), 1);
});

test('a ball passing near the ear is heard as it passes; one falling near is heard as it falls', () => {
  // A ball flying east past the ear 5 m over it at 200 m/s, then into the sea 40 m beyond.
  const ear: Vec = [0, 3, 0], step = 0.05, speed = 200;
  const path: Vec[] = [];
  for (let k = 0; k <= 30; k++) path.push([-100 + speed * step * k, 8, 0]);
  const p = nearestPass(path, ear);
  assert.ok(p && Math.abs(p.t - 0.5) < 1e-9 && Math.abs(p.d - 5) < 1e-9 && Math.abs(p.speed - speed) < 1e-6, JSON.stringify(p));
  const shot: Shot = { shot: 'round', span: 0, balls: [{ path, splashes: [1.5], touches: [[50, 0, 0]], ends: 1.5 }] };
  // Fired 2 s into the match and heard from then on (the ear at the world's origin: the scene's ear is LEVEL's).
  const w = new GunWatch(), firedAt = 2, ticks = Math.round(firedAt / STEP_SECONDS);
  w.keepFired([{ kind: 'fired', tick: ticks, ship: 1, gun: 0, fired: shot }]);
  const got = listen(w, ear, firedAt, 3);
  const pass = got.find((g) => g.id === SHOT_PASS.id), splash = got.find((g) => g.id === SHOT_SPLASH.id);
  // Its rush peaks as it passes, or starts with the shot when that is sooner than the take's lead.
  assert.ok(pass && Math.abs(pass.t - (firedAt + Math.max(0.5 + 5 / SPEED_OF_SOUND - PASS_LEAD, 0))) < 0.02, `pass at ${pass?.t}`);
  assert.ok(splash && Math.abs(splash.t - (firedAt + 1.5 + Math.hypot(50, 3) / SPEED_OF_SOUND)) < 0.02, `splash at ${splash?.t}`);
  // From 300 m off, the rush starts before the ball passes and peaks as it does.
  const far: Vec[] = [];
  for (let k = 0; k <= 60; k++) far.push([-300 + speed * step * k, 8, 0]);
  const w2 = new GunWatch();
  w2.keepFired([{ kind: 'fired', tick: ticks, ship: 1, gun: 0, fired: { ...shot, balls: [{ path: far, splashes: [], touches: [], ends: 1.5 }] } }]);
  const passFar = listen(w2, ear, firedAt, 3).find((g) => g.id === SHOT_PASS.id);
  const nearest = nearestPass(far, ear)!;
  assert.ok(passFar && Math.abs(passFar.t - (firedAt + nearest.t + nearest.d / SPEED_OF_SOUND - PASS_LEAD)) < 0.02, `far pass at ${passFar?.t}`);
});

test('a broadside round the ear deafens: the world dull and quieter, the ears ringing once, then they recover', () => {
  const w = new GunWatch();
  // Her starboard carronades, three a step (rules/guns.ts RIPPLE).
  STARBOARD.forEach((gun, k) => w.keepFired([fired(0, gun, LEVEL, 30 + Math.floor(k / 3))]));
  let deafest = 0, rings = 0, last = 1;
  listen(w, QUARTERDECK, 1, 20, 0, (h) => { deafest = Math.max(deafest, h.deaf); if (h.ring > 0) rings++; last = h.deaf; });
  assert.ok(deafest > 0.9, `deafened to ${deafest.toFixed(2)}`);
  assert.equal(rings, 1);
  assert.ok(last < 0.01, `still ${last.toFixed(3)} after 20 s`);
  const room = deafened(OPEN_AIR, deafest);
  assert.ok(room.muffle !== null && room.muffle < 1000 && room.through < 0.5, JSON.stringify(room));
  assert.equal(deafened(OPEN_AIR, 0), OPEN_AIR);
  // One gun at the far end of her deck deafens only a little.
  const one = new GunWatch();
  one.keepFired([fired(0, STARBOARD[0]!, LEVEL, 30)]);
  let most = 0;
  listen(one, [0, 4.5, -10], 1, 2, 0, (h) => { most = Math.max(most, h.deaf); });
  assert.ok(most < DEAF.dose && most > 0, `one gun: ${most.toFixed(2)}`);
});

test('a report heard too late (a tab that slept) is left out', () => {
  const w = new GunWatch();
  w.keepFired([fired(0, STARBOARD[0]!, LEVEL, 30)]);
  assert.equal(listen(w, QUARTERDECK, 1 + LATE + 0.1, 1).filter((g) => g.id === GUN_NEAR.id || g.id === GUN_FAR.id).length, 0);
});

test('every take of gunfire exists', () => {
  const index = JSON.parse(readFileSync(new URL('../public/sound/index.json', import.meta.url), 'utf8')) as { sounds: Record<string, { files: string[] }> };
  for (const k of [GUN_NEAR, GUN_FAR, GUN_THROUGH, SHOT_PASS, SHOT_SPLASH, RING]) assert.ok(index.sounds[k.id]?.files.length, k.id);
});
