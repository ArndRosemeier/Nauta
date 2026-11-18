import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodePack } from '@futuremagic/props';
import {
  DECK_AT_SIDE, DECK_CAMBER, KEEL_HALF_SIDING, LOAD_WATERLINE, MIDSHIP_SECTION, PLANKING,
} from '../src/sim/rules/ships.ts';
import { deckY, halfBreadth, sectionOutline, shipY, shipZ } from '../src/sim/ship/section.ts';
import { STANDPOINTS, standpoint } from '../src/app/standpoints.ts';
import { Euler, Matrix4, PerspectiveCamera, Quaternion } from 'three/webgpu';
import { buildShip, type ZoneBuild } from '../src/render/ship/ship.ts';
import { packedTriangles, type Packed } from '../src/render/ship/gathered.ts';
import { OUTSIDE, portals, zoneAt, zoneNames, zoneOfSpaces } from '../src/render/ship/zones.ts';
import { Visibility } from '../src/render/ship/visibility.ts';
import { DAMAGE_MAP_SIZE, DAMAGE_REGIONS, damageTexel } from '../src/render/ship/damageMap.ts';
import { shipPlan } from '../src/sim/ship/plan.ts';
import { hullHalfBreadth, sideTop } from '../src/sim/ship/hull.ts';
import { outsideX } from '../src/render/ship/hullSide.ts';
import { Vector3 } from 'three/webgpu';

/** How close a curve through the readings must come to them, m. */
const ON_READING = 1e-9;
/** A girth step for the outline, m. */
const GIRTH = 0.07;

test('the half-breadth passes through every reading taken off the draught, and between them never overshoots', () => {
  for (const [h, b] of MIDSHIP_SECTION) assert.ok(Math.abs(halfBreadth(h) - b) < ON_READING, `at ${h} m`);
  for (let i = 1; i < MIDSHIP_SECTION.length; i++) {
    const [h0, b0] = MIDSHIP_SECTION[i - 1]!, [h1, b1] = MIDSHIP_SECTION[i]!;
    for (let k = 1; k < 10; k++) {
      const b = halfBreadth(h0 + ((h1 - h0) * k) / 10);
      assert.ok(b >= Math.min(b0, b1) - ON_READING && b <= Math.max(b0, b1) + ON_READING, `between ${h0} and ${h1} m`);
    }
  }
});

test("the section's outline runs from the keel up to the height asked, evenly by girth", () => {
  const out = sectionOutline(DECK_AT_SIDE, GIRTH);
  assert.ok(Math.abs(out[0]!.x - Math.max(KEEL_HALF_SIDING, halfBreadth(MIDSHIP_SECTION[0]![0]))) < ON_READING);
  assert.ok(Math.abs(out[out.length - 1]!.y - shipY(DECK_AT_SIDE)) < 1e-6);
  for (let i = 1; i < out.length; i++) {
    const step = out[i]!.girth - out[i - 1]!.girth;
    assert.ok(Math.abs(step - GIRTH) < GIRTH / 2, `step ${step}`);
    assert.ok(out[i]!.y > out[i - 1]!.y, 'it climbs');
  }
  // Pushed out by the planking, every point lies that far outside the moulded line.
  const planked = sectionOutline(DECK_AT_SIDE, GIRTH, PLANKING.side);
  for (let i = 0; i < out.length; i++) assert.ok(Math.abs(Math.hypot(planked[i]!.x - out[i]!.x, planked[i]!.y - out[i]!.y) - PLANKING.side) < 1e-6);
});

test('ship space: the load waterline is y 0, the deck is cambered, forward is -z', () => {
  assert.equal(shipY(LOAD_WATERLINE), 0);
  assert.equal(shipZ(2), -2);
  assert.ok(Math.abs(deckY(0) - shipY(DECK_AT_SIDE + DECK_CAMBER)) < 1e-12);
  assert.ok(Math.abs(deckY(halfBreadth(DECK_AT_SIDE)) - shipY(DECK_AT_SIDE)) < 1e-12);
});

/** The whole ship, built once for this file from the fittings pack (as the worker builds it at load). */
const SHIP = buildShip(decodePack(new Uint8Array(readFileSync('public/ship/fittings.fmpk'))));
const PLAN = shipPlan(), ZONES = zoneOfSpaces(PLAN);
const KINDS = ['wood', 'iron', 'copper', 'glow', 'ropes'] as const;
const zoneTris = (z: ZoneBuild) => KINDS.reduce((n, k) => n + packedTriangles(z[k]), 0);
const attr = (p: Packed, name: string) => p.attributes.find((a) => a.name === name)!;

/** The zone an eye in ship space stands in. */
const eyeZone = (eye: readonly number[]) => zoneAt(PLAN, ZONES, -eye[2]!, eye[0]!, eye[1]! + LOAD_WATERLINE);

/** Ship space to clip space for an eye at `eye` looking `yaw`, `pitch` (yaw 0 forward, growing to port). */
function toClip(eye: readonly number[], yaw: number, pitch: number): Matrix4 {
  const cam = new PerspectiveCamera(60, 1180 / 820, 0.05, 2000);
  cam.position.set(eye[0]!, eye[1]!, eye[2]!);
  cam.quaternion.copy(new Quaternion().setFromEuler(new Euler(pitch, yaw, 0, 'YXZ')));
  cam.updateMatrixWorld();
  return new Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorld.clone().invert());
}

test('the whole ship builds: every zone, her far outside, doors, lanterns and openings, within her budget', () => {
  const names = new Set(SHIP.zones.map((z) => z.name));
  for (const z of zoneNames(PLAN)) assert.ok(names.has(z), `zone ${z}`);
  assert.ok(names.has(OUTSIDE));
  const near = SHIP.zones.reduce((n, z) => n + zoneTris(z), 0), far = zoneTris(SHIP.far);
  // One ship near and the other far must leave room in the 1.5M both may have for her fittings (N2.6) and rigging (N3.6).
  assert.ok(near > 300000 && near < 700000, `${near} triangles near`);
  assert.ok(far < 60000, `${far} triangles far`);
  assert.ok(SHIP.doors.length > 0 && SHIP.lamps.length > 0 && SHIP.skies.length > 0 && SHIP.portals.length > 0);
  for (const l of SHIP.lamps) assert.ok(names.has(l.zone) && l.zone !== OUTSIDE, `lamp in ${l.zone}`);
});

test('nothing loose: every position finite, every normal of unit length, all of her between keel and mastheads', () => {
  for (const z of [...SHIP.zones, SHIP.far]) {
    for (const k of KINDS) {
      const p = attr(z[k], 'position').data, n = attr(z[k], 'normal')?.data;
      for (let i = 0; i < p.length; i += 3) {
        assert.ok(Number.isFinite(p[i]!) && Number.isFinite(p[i + 1]!) && Number.isFinite(p[i + 2]!), `${z.name} ${k}`);
        assert.ok(p[i + 1]! > shipY(0) - 1 && p[i + 1]! < shipY(0) + 40, `${z.name} ${k} at ${p[i + 1]}`);
      }
      if (k === 'ropes' || !n) continue;
      for (let i = 0; i < n.length; i += 3) assert.ok(Math.abs(Math.hypot(n[i]!, n[i + 1]!, n[i + 2]!) - 1) < 1e-3, `${z.name} ${k}`);
    }
  }
});

test('the damage map: its regions do not overlap, and every vertex laid out for it lies inside its region', () => {
  for (let i = 1; i < DAMAGE_REGIONS.length; i++) assert.ok(DAMAGE_REGIONS[i]!.y > DAMAGE_REGIONS[i - 1]!.y);
  assert.ok(DAMAGE_MAP_SIZE.width * DAMAGE_MAP_SIZE.height < 4096 * 4096);
  let laid = 0;
  for (const z of SHIP.zones) {
    const shade = attr(z.wood, 'shade').data, grain = attr(z.wood, 'grain').data;
    const gs = grain.length / (shade.length / 3);
    for (let v = 0; v < shade.length / 3; v++) {
      const region = shade[v * 3 + 2]!;
      if (!region) continue;
      laid++;
      assert.ok(damageTexel(region, grain[v * gs]!, grain[v * gs + 1]!), `${z.name}: region ${region} at ${grain[v * gs]}, ${grain[v * gs + 1]}`);
    }
  }
  assert.ok(laid > 1000, `${laid} vertices laid out`);
});

test('every standpoint: on deck in the open, below deck in a room under the beams, off her well clear', () => {
  for (const s of STANDPOINTS) {
    const zone = eyeZone(s.eye);
    if (s.off) { assert.ok(Math.hypot(s.eye[0], s.eye[2]) > 40, s.name); continue; }
    if (['Berth deck', 'Cabin', 'Hold'].includes(s.name)) {
      assert.ok(zone !== null && zone !== OUTSIDE, `${s.name} in ${zone}`);
      const h = s.eye[1] + LOAD_WATERLINE;
      assert.ok(Math.abs(s.eye[0]) < hullHalfBreadth(-s.eye[2], h), s.name);
    } else if (s.name !== 'Alongside') {
      assert.ok(zone === null || zone === OUTSIDE, `${s.name} in ${zone}`);
    }
  }
  assert.equal(standpoint('nonsense'), STANDPOINTS[0]);
  assert.equal(standpoint('TOP').name, 'Top');
  assert.equal(standpoint('berth-deck').name, 'Berth deck');
  assert.equal(standpoint('500m off').name, '500 m off');
});

test('from the deck a room below is drawn only through an opening; from below, rooms behind shut doors are not', () => {
  const vis = new Visibility(portals(PLAN));
  const shut = () => false, open = () => true;
  // Looking down into the main hatch from the waist: the room under it is seen; looking up at the sky, none below.
  const waist = standpoint('waist').eye;
  const down = vis.seen(OUTSIDE, toClip(waist, Math.PI, -1.2), shut)!;
  assert.ok(down.size > 1, `from the waist, looking down: ${[...down]}`);
  const up = vis.seen(OUTSIDE, toClip(waist, 0, 1.4), shut)!;
  assert.deepEqual([...up], [OUTSIDE]);
  // In the cabin with its door shut, the passage beyond is not drawn; opened, it is.
  // Aft in the cabin, away from the companion over its fore end.
  const cabin = [standpoint('cabin').eye[0], standpoint('cabin').eye[1], shipZ(-7.6)], cz = eyeZone(cabin)!;
  const ahead = toClip(cabin, 0, 0);
  const closed = vis.seen(cz, ahead, shut)!, opened = vis.seen(cz, ahead, open)!;
  assert.ok(!closed.has("passage") && opened.has("passage"), `shut ${[...closed]}, open ${[...opened]}`);
  // Off her side, low on the water, her rail hides every opening in her deck: nothing below is drawn.
  const railed = new Visibility(portals(PLAN), (along) => ({ half: outsideX(along, sideTop(along)), top: shipY(sideTop(along)) }));
  const off = standpoint('50 m off');
  const offSeen = railed.seen(OUTSIDE, toClip(off.eye, off.look.yaw, off.look.pitch), open, new Vector3(...off.eye))!;
  assert.deepEqual([...offSeen], [OUTSIDE]);
  // From the main top she is seen from above: her hatches show what is under them.
  const top = standpoint('top');
  assert.ok(railed.seen(OUTSIDE, toClip(top.eye, 0, -1.4), open, new Vector3(...top.eye))!.size > 1);
  // An eye in none of her zones sees everything.
  assert.equal(vis.seen(null, ahead, shut), null);
});
