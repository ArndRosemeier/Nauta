/**
 * Where her guns and port lids stand and how they move (plan N5.4a): what the ship's build in its worker
 * (ship.ts: the breechings and the lids' lanyards, carried by these frames on the GPU) and the guns' drawing
 * (gunsView.ts: the guns and lids themselves, instances in these frames) both need.
 *
 * - **Moving frames.** Each gun of the battery and each port's lid is a moving frame of the rope kind (swings.ts),
 *   after the rig's: a gun's breeching follows her carriage, a lid's lanyard its lid. A frame's matrix takes her ship
 *   space as built (every gun run out and square, every lid up) to where the piece is now.
 * - **The carronade** is drawn in two parts: her slide, which trains about its pivot at the port, and the gun on her
 *   carriage above it, which runs out and in along the slide. The fittings pack has her whole; she is cut where the
 *   slide's top ends (`splitCarronade`). **The long six** trains and runs whole on her trucks.
 * - **A lid** hangs on hinges at the top of its port outside, black outside and red inside, and is hauled up
 *   (`LID_OPEN`) by its lanyard.
 */
import { Matrix4, Vector3 } from 'three/webgpu';
import type { PropModel } from '@futuremagic/props';
import { weatherDeck } from '../../sim/ship/hull';
import type { GunPlace } from '../../sim/ship/plan';
import { shipY, shipZ } from '../../sim/ship/section';
import { battery } from '../../sim/guns/guns';
import { bulwarkInside, outsideX } from './hullSide';
import { RIG_FRAMES } from './swings';

/** The carronade's model in the fittings pack (AssetGenerator's spec). */
export const CARRONADE = 'prop_carronade_32';
/** Her two parts' names as models (`splitCarronade`). */
export const CARRONADE_PARTS = [`${CARRONADE}/slide`, `${CARRONADE}/gun`] as const;
/** A port lid: how far it is swung up from shut (rad), its thickness and how much bigger than the port it is, m. */
export const LID_OPEN = 1.35;
export const LID_THICK = 0.075;
export const LID_LAP = 0.05;
/** How far each kind runs in from run out, m (inboard along her slide or on her trucks): the muzzle comes in clear of the port to be sponged and loaded. */
export const RUN_BACK = { carronade: 0.95, long6: 1.2 } as const;
/** The carronade's parts above this height of the model (m, between the slide's top and the carriage's foot) ride the carriage. */
const CARRIAGE_FROM = 0.35;
/** A quarter turn, rad. */
const QUARTER = Math.PI / 2;
/** Numbers per position. */
const XYZ = 3;
/** Positions this close are one when the model's pieces are found, m. */
const SAME_POINT = 1e-4;

/** Her guns' rope frames, by battery place, then her lids', by the plan's gun ports (every port, chase ports too). */
export const gunFrame = (gun: number): number => RIG_FRAMES + gun;
export const lidFrame = (port: number): number => RIG_FRAMES + battery().length + port;

/** The carronade's model at her port, run out and square (model space to ship space): the slide's pivot, the model's middle, on the bulwark's inside at the sill. */
export function carronadeRest(along: number, sill: number, side: number): Matrix4 {
  const x = side * bulwarkInside(along, sill);
  return new Matrix4().makeRotationY(side * QUARTER).setPosition(x, shipY(weatherDeck(along, x)), shipZ(along));
}

/** Where a gun pivots as she trains (ship space): her model's origin at rest, `rest` her model-to-ship matrix. */
export const pivotOf = (rest: Matrix4): Vector3 => new Vector3().setFromMatrixPosition(rest);

/**
 * A gun's frame (ship space as built to where she is now): trained `train` rad toward the bow about her pivot, and
 * run in `back` m along her own axis (her side's outboard direction as trained). `slide`: the same without the run (a
 * carronade's slide). Written into `out`.
 */
export function gunMove(place: GunPlace, pivot: Vector3, train: number, back: number, out: Matrix4, slide?: Matrix4): Matrix4 {
  const turn = place.side * train;
  out.makeRotationY(turn);
  const c = Math.cos(turn), s = Math.sin(turn);
  // T(pivot) · R · T(−pivot): the rotation's translation part.
  const px = pivot.x, pz = pivot.z;
  const tx = px - (c * px + s * pz), tz = pz - (-s * px + c * pz);
  slide?.copy(out).setPosition(tx, 0, tz);
  // Run in: inboard along her axis as trained (R applied to (−side·back, 0, 0)).
  out.setPosition(tx - c * place.side * back, 0, tz + s * place.side * back);
  return out;
}

/** A lid's hinge (ship space): at the top of its port outside, a lap above. */
export function lidHinge(place: GunPlace): Vector3 {
  return new Vector3(place.side * (outsideX(place.along, place.top) + LID_THICK / 2), shipY(place.top + LID_LAP), shipZ(place.along));
}

/** A lid's height and width, m: its port's and a lap round. */
export const lidSize = (place: GunPlace): { h: number; w: number } => ({ h: place.top - place.sill + 2 * LID_LAP, w: place.width + 2 * LID_LAP });

/** A lid's frame (as built, up, to swung `angle` rad from shut), into `out`. */
export function lidMove(place: GunPlace, hinge: Vector3, angle: number, out: Matrix4): Matrix4 {
  const a = place.side * (angle - LID_OPEN), c = Math.cos(a), s = Math.sin(a);
  out.makeRotationZ(a);
  return out.setPosition(hinge.x - (c * hinge.x - s * hinge.y), hinge.y - (s * hinge.x + c * hinge.y), 0);
}

/** A lid as built (up): its unit model (1 m high and wide, hanging down from its hinge) to ship space. */
export function lidRest(place: GunPlace): Matrix4 {
  const { h, w } = lidSize(place);
  return new Matrix4().setPosition(lidHinge(place)).multiply(new Matrix4().makeRotationZ(place.side * LID_OPEN)).multiply(new Matrix4().makeScale(1, h, w));
}

/** Where a lid's lower edge's middle hangs when up, ship space (its lanyard runs from there). */
export function lidEdge(place: GunPlace): Vector3 {
  return new Vector3(0, -1, 0).applyMatrix4(lidRest(place));
}

/**
 * The carronade cut in two: her slide, and the gun on her carriage (every piece of the model reaching above
 * `CARRIAGE_FROM`). Pieces are found by joining triangles that share a point.
 */
export function splitCarronade(m: PropModel): { slide: PropModel; gun: PropModel } {
  const n = m.positions.length / XYZ, root = new Int32Array(n).map((_, i) => i);
  const find = (i: number): number => { while (root[i] !== i) i = root[i] = root[root[i]!]!; return i; };
  const join = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) root[ra] = rb; };
  // Points at one place are one (the pack splits them where normals or slots change).
  const at = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const key = [0, 1, 2].map((k) => Math.round(m.positions[i * XYZ + k]! / SAME_POINT)).join(',');
    const o = at.get(key);
    if (o === undefined) at.set(key, i); else join(i, o);
  }
  for (let t = 0; t < m.indices.length; t += XYZ) { join(m.indices[t]!, m.indices[t + 1]!); join(m.indices[t]!, m.indices[t + 2]!); }
  const high = new Set<number>();
  for (let i = 0; i < n; i++) if (m.positions[i * XYZ + 1]! > CARRIAGE_FROM) high.add(find(i));
  const part = (gun: boolean, name: string): PropModel => {
    const keep: number[] = [];
    for (let t = 0; t < m.indices.length; t += XYZ) if (high.has(find(m.indices[t]!)) === gun) keep.push(m.indices[t]!, m.indices[t + 1]!, m.indices[t + 2]!);
    return { ...m, name, indices: Uint32Array.from(keep) };
  };
  return { slide: part(false, CARRONADE_PARTS[0]), gun: part(true, CARRONADE_PARTS[1]) };
}

/** The ring on a carronade's cascabel her breeching is rove through (model space): her gun's rearmost iron. */
export function cascabelRing(gun: PropModel): Vector3 {
  const iron = gun.slotNames.indexOf('iron'), out = new Vector3(0, 0, Infinity), used = new Set(gun.indices);
  for (const i of used) {
    if (gun.slots[i] !== iron || gun.positions[i * XYZ + 2]! >= out.z) continue;
    out.fromArray(gun.positions, i * XYZ);
  }
  return out.setX(0);
}
