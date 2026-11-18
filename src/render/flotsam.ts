/**
 * What floats after a ship goes down (plan N6.5): once her deck amidships is well under the sea (she has foundered
 * and sinks, sim/end.ts), the loose wood of her comes up where she went down, a piece at a time over half a minute:
 * planks and splintered timber, hatch gratings, casks, broken spars, hammocks. Each floats on the sea's own surface
 * (sim/sea/sea.ts `surfaceAt`), tilted with it, and drifts slowly down the wind, turning; they stay.
 *
 * One mesh for both ships, her timber's kind (no shader compiled for it), its vertices written on the page each frame
 * a piece floats. Seeded per ship, so every machine sees the same wreckage.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import { Matrix4, Quaternion, Vector3, type BufferGeometry, type BufferAttribute, type Mesh } from 'three/webgpu';
import { surfaceAt, seaWind, type SeaState } from '../sim/sea/sea';
import { sheer } from '../sim/ship/hull';
import { shipY } from '../sim/ship/section';
import { toWorld, type ShipPose } from '../sim/ship/motion';
import { SHIP_WOOD } from './materials';
import { box, lathe, rod } from './ship/shapes';
import { Solid, type Finish } from './ship/solid';
import { unshownMesh } from './ship/waterInside';
import { BUFF, DECK, MAST, OAK } from './ship/looks';

/** The pieces that come up, by kind: how many, and how each is made round its own middle (y up as it floats). */
const KINDS: readonly { readonly count: number; readonly make: (s: Solid, f: Finish) => void; readonly finish: Finish }[] = [
  { count: 10, finish: OAK, make: (s, f) => box(s, new Matrix4(), [0.25, 0.07, 3], f, 0.01, 2) },
  { count: 4, finish: DECK, make: (s, f) => box(s, new Matrix4(), [1.1, 0.12, 1.4], f, 0.01, 2) },
  { count: 5, finish: OAK, make: (s, f) => lathe(s, new Matrix4().makeRotationZ(Math.PI / 2).setPosition(0.45, 0, 0), [[0, 0], [0.28, 0], [0.33, 0.45], [0.28, 0.9], [0, 0.9]], 10, f) },
  { count: 3, finish: MAST, make: (s, f) => rod(s, new Vector3(0, 0, -2.5), new Vector3(0, 0, 2.5), 0.11, 8, f) },
  { count: 4, finish: BUFF, make: (s, f) => box(s, new Matrix4(), [0.6, 0.12, 1.8], f, 0.04, 2) },
];
/** Her deck amidships this far under the sea, m, and she has gone down: the wreckage comes up. */
const UNDER_BY = 1;
/** The pieces come up over this long after, s, rising from this deep, m, over this long, s. */
const SURFACING = 30;
const RISE_FROM = 2;
const RISE_SECONDS = 1.5;
/** They come up within this far of her middle, m: along her, across her. */
const SPREAD = { along: 12, across: 4 } as const;
/** They drift with this share of the wind's speed, scattered by this much, m/s; and turn at most this fast, rad/s. */
const LEEWAY = 0.025;
const DRIFT_SCATTER = 0.08;
const MOST_TURN = 0.05;
/** They float this deep in the surface, m. */
const AWASH = 0.04;
/** Where a piece is put while it has not come up: out of sight below the sea, m. */
const HIDDEN_DEPTH = 1000;
/** Numbers per position. */
const XYZ = 3;

/** One piece: its vertices in the mesh, and how it comes up and drifts. */
interface Piece {
  readonly first: number;
  readonly count: number;
  readonly delay: number;
  readonly along: number;
  readonly across: number;
  readonly yaw: number;
  readonly turn: number;
  readonly drift: readonly [number, number];
}

/** Where and when a ship went down: her pose then, and the clock. */
interface Sank {
  readonly t: number;
  readonly pose: ShipPose;
}

/** Whether her deck amidships, on her middle line, is well under the sea: she has gone down. */
export function goneDown(pose: ShipPose, sea: SeaState, t: number): boolean {
  const deck = toWorld(pose, 0, shipY(sheer(0)), 0);
  return deck[1] < surfaceAt(sea, deck[0], deck[2], t).height - UNDER_BY;
}

/** Each ship's wreckage, near and far, from the moment she goes down. */
export class FlotsamView {
  readonly mesh: Mesh;
  private readonly pieces: Piece[][] = [];
  private readonly local: Float32Array;
  private readonly localNormals: Float32Array;
  private readonly sank: (Sank | null)[] = [];
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly spin = new Quaternion();
  private readonly v = new Vector3();
  private readonly n = new Vector3();
  private readonly at = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private readonly one = new Vector3(1, 1, 1);

  constructor(ships: number) {
    const s = new Solid();
    for (let ship = 0; ship < ships; ship++) {
      const rng = new Rng(deriveSeed(ship, 'flotsam')), list: Piece[] = [];
      for (const k of KINDS) {
        for (let i = 0; i < k.count; i++) {
          const first = s.vertices;
          k.make(s, { ...k.finish, seed: rng.float() });
          list.push({
            first, count: s.vertices - first, delay: rng.float() * SURFACING, along: rng.range(-SPREAD.along, SPREAD.along), across: rng.range(-SPREAD.across, SPREAD.across),
            yaw: rng.float() * 2 * Math.PI, turn: rng.range(-MOST_TURN, MOST_TURN), drift: [rng.range(-DRIFT_SCATTER, DRIFT_SCATTER), rng.range(-DRIFT_SCATTER, DRIFT_SCATTER)],
          });
        }
      }
      this.pieces.push(list);
      this.sank.push(null);
    }
    const g: BufferGeometry = s.geometry();
    this.local = (g.getAttribute('position').array as Float32Array).slice();
    this.localNormals = (g.getAttribute('normal').array as Float32Array).slice();
    this.mesh = unshownMesh(g, SHIP_WOOD, 'flotsam');
    this.hideAll();
  }

  /**
   * Once a frame: ship `ship` as she lies (`pose`) on `sea` at the clock's `t`, the sea's frame at `origin` (the mesh
   * is drawn from there). Her wreckage comes up once she has gone down, and floats from then on.
   */
  show(ship: number, pose: ShipPose, sea: SeaState, t: number, origin: Vector3): void {
    let sank = this.sank[ship];
    if (!sank) {
      if (!goneDown(pose, sea, t)) return;
      sank = this.sank[ship] = { t, pose: { ...pose } };
    }
    this.mesh.visible = true;
    this.mesh.position.copy(origin);
    const pos = this.mesh.geometry.getAttribute('position') as BufferAttribute, nor = this.mesh.geometry.getAttribute('normal') as BufferAttribute;
    const P = pos.array as Float32Array, N = nor.array as Float32Array, wind = seaWind(sea, t);
    const wx = Math.cos(wind.toward) * wind.speed * LEEWAY, wz = Math.sin(wind.toward) * wind.speed * LEEWAY;
    const where: [number, number, number] = [0, 0, 0];
    for (const p of this.pieces[ship]!) {
      const since = t - sank.t - p.delay;
      if (since < 0) { this.hide(p, P); continue; }
      toWorld(sank.pose, p.across, 0, -p.along, where);
      const x = where[0] + (wx + p.drift[0]) * since, z = where[2] + (wz + p.drift[1]) * since;
      const s = surfaceAt(sea, x, z, t), rise = Math.max(0, 1 - since / RISE_SECONDS) * RISE_FROM;
      this.at.set(x - origin.x, s.height - AWASH - rise - origin.y, z - origin.z);
      this.q.setFromUnitVectors(this.up, this.n.set(...s.normal)).multiply(this.spin.setFromAxisAngle(this.up, p.yaw + p.turn * since));
      this.m.compose(this.at, this.q, this.one);
      for (let i = p.first; i < p.first + p.count; i++) {
        this.v.fromArray(this.local, i * XYZ).applyMatrix4(this.m).toArray(P, i * XYZ);
        this.v.fromArray(this.localNormals, i * XYZ).applyQuaternion(this.q).toArray(N, i * XYZ);
      }
    }
    pos.needsUpdate = nor.needsUpdate = true;
  }

  /** Every piece out of sight. */
  private hideAll(): void {
    const P = this.mesh.geometry.getAttribute('position').array as Float32Array;
    for (const list of this.pieces) for (const p of list) this.hide(p, P);
  }

  /** A piece not yet come up: out of sight below the sea. */
  private hide(p: Piece, P: Float32Array): void {
    for (let i = p.first; i < p.first + p.count; i++) { P[i * XYZ] = 0; P[i * XYZ + 1] = -HIDDEN_DEPTH; P[i * XYZ + 2] = 0; }
  }
}
