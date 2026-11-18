/**
 * Blood on her decks (implementation plan N6.6, "Violence"): pools under the killed and badly hurt, drops where a man
 * was struck, spatter round a fall and a trail behind the bearers, as the violence setting shows them (app/violence.ts).
 * Each is a thin dish of dark red paint lying on the deck in her space, one mesh per ship, her timber's kind (SHIP_WOOD:
 * no shader compiled for it), its vertices written on the page while a pool grows. Falls are kept as they happened, so
 * changing the setting mid-match shows or hides them all at once.
 */
import { Matrix4, Vector3, type BufferAttribute, type Group, type Mesh } from 'three/webgpu';
import type { Harm } from '../../sim/rules/damage';
import { SHIP_WOOD } from '../materials';
import { lathe } from '../ship/shapes';
import { Solid, type Finish } from '../ship/solid';
import { unshownMesh } from '../ship/waterInside';
import { SHOWN, TRAIL_DROP, bloodOf, type Pool } from '../../app/violence';
import type { Violence } from '../../app/settings';

/** Blood on the planking, wet and dark (sRGB about 0.29, 0.03, 0.02): linear, painted. */
const BLOOD: Finish = { rgb: [0.07, 0.0006, 0.0005], paint: 1 };
/** A pool's dish in a unit radius: [radius, height] from its rim in to its middle (a lathe's profile runs bottom to top, so its faces look up), m: thin at the rim, thick in the middle. */
const DISH: readonly (readonly [number, number])[] = [[1, 0.005], [0.85, 0.01], [0.55, 0.014], [0, 0.016]];
const SIDES = 12;
/** Pools a ship keeps at most; the oldest is written over by the next. */
const SLOTS = 160;
/** Where a pool not in use is put: out of sight below her keel, m. */
const HIDDEN_DEPTH = 1000;
const XYZ = 3;
/** A pool is this much of its size the moment it is laid, and grows to the rest. */
const FIRST_SPREAD = 0.4;

/** A fall as it happened: where (her space), when (page seconds), how badly, and the man's seed. */
interface Fall {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly born: number;
  readonly harm: Harm;
  readonly seed: number;
}
/** A drop of the trail: where and when. */
interface Drip { readonly x: number; readonly y: number; readonly z: number; readonly born: number }

/** One pool in the mesh: the vertices of its slot and where it lies. */
interface Slot { first: number; used: boolean; x: number; y: number; z: number; pool: Pool; born: number }

/** One ship's blood. */
export class Blood {
  readonly mesh: Mesh;
  private readonly slots: Slot[] = [];
  private readonly local: Float32Array;
  private readonly localNormals: Float32Array;
  private readonly falls: Fall[] = [];
  private readonly drips: Drip[] = [];
  private level: Violence | null = null;
  private next = 0;
  private growing = false;
  private readonly m = new Matrix4();
  private readonly turn = new Matrix4();
  private readonly size = new Matrix4();
  private readonly v = new Vector3();

  constructor() {
    const s = new Solid();
    const unit = new Matrix4();
    for (let i = 0; i < SLOTS; i++) {
      const first = s.vertices;
      lathe(s, unit, DISH, SIDES, BLOOD);
      this.slots.push({ first, used: false, x: 0, y: 0, z: 0, pool: { dx: 0, dz: 0, r: 0, aspect: 1, yaw: 0, grow: 1 }, born: 0 });
    }
    const g = s.geometry();
    this.local = (g.getAttribute('position').array as Float32Array).slice();
    this.localNormals = (g.getAttribute('normal').array as Float32Array).slice();
    this.mesh = unshownMesh(g, SHIP_WOOD, 'blood');
    this.mesh.visible = true;
    for (const slot of this.slots) this.unlay(slot);
  }

  /** Puts the mesh in her crew's group, which follows her pose (ship space). */
  attach(group: Group): void {
    group.add(this.mesh);
  }

  /** A man was struck down or wounded where he stands (ship space) at page second `now`. */
  fell(x: number, y: number, z: number, harm: Harm, seed: number, now: number): void {
    const fall = { x, y, z, born: now, harm, seed };
    this.falls.push(fall);
    if (this.level) this.lay(bloodOf(this.level, harm, seed), fall);
  }

  /** The bearers of a wounded man pass here. */
  drip(x: number, y: number, z: number, now: number): void {
    this.drips.push({ x, y, z, born: now });
    if (this.level && SHOWN[this.level].trail) this.lay([{ dx: 0, dz: 0, r: TRAIL_DROP, aspect: 1, yaw: 0, grow: 1 }], { x, y, z, born: now });
  }

  /** What `level` shows of every fall so far; called when the setting changes (and once at the start). */
  showLevel(level: Violence, now: number): void {
    if (level === this.level) return;
    this.level = level;
    for (const slot of this.slots) { slot.used = false; this.unlay(slot); }
    this.next = 0;
    for (const fall of this.falls) this.lay(bloodOf(level, fall.harm, fall.seed), fall);
    if (SHOWN[level].trail) for (const d of this.drips) this.lay([{ dx: 0, dz: 0, r: TRAIL_DROP, aspect: 1, yaw: 0, grow: 1 }], d);
    this.growPools(now);
  }

  /** Once a frame: the pools still growing are written larger. */
  growPools(now: number): void {
    if (!this.growing) return;
    let any = false;
    for (const slot of this.slots) {
      if (!slot.used) continue;
      const k = Math.min(1, (now - slot.born) / slot.pool.grow);
      this.write(slot, FIRST_SPREAD + (1 - FIRST_SPREAD) * k);
      if (k < 1) any = true;
    }
    this.growing = any;
    (this.mesh.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
  }

  /** Lays pools about a fall (the oldest slot is taken when all are in use). */
  private lay(pools: readonly Pool[], at: { x: number; y: number; z: number; born: number }): void {
    for (const pool of pools) {
      const slot = this.slots[this.next]!;
      this.next = (this.next + 1) % SLOTS;
      Object.assign(slot, { used: true, x: at.x + pool.dx, y: at.y, z: at.z + pool.dz, pool, born: at.born });
      this.growing = true;
    }
  }

  /** The slot's vertices as the pool is grown by `k` (0..1): a dish of its radius at its place, turned by its yaw. */
  private write(slot: Slot, k: number): void {
    const pos = this.mesh.geometry.getAttribute('position') as BufferAttribute, nor = this.mesh.geometry.getAttribute('normal') as BufferAttribute;
    const P = pos.array as Float32Array, N = nor.array as Float32Array, r = slot.pool.r * k;
    // To its place, turned, then stretched along its own axis: one matrix.
    this.m.makeTranslation(slot.x, slot.y, slot.z).multiply(this.turn.makeRotationY(slot.pool.yaw)).multiply(this.size.makeScale(r, 1, r * slot.pool.aspect));
    const count = DISH.length * (SIDES + 1);
    for (let i = slot.first; i < slot.first + count; i++) {
      this.v.fromArray(this.local, i * XYZ).applyMatrix4(this.m).toArray(P, i * XYZ);
      this.v.fromArray(this.localNormals, i * XYZ).toArray(N, i * XYZ);
    }
  }

  private unlay(slot: Slot): void {
    const P = this.mesh.geometry.getAttribute('position').array as Float32Array, count = DISH.length * (SIDES + 1);
    for (let i = slot.first; i < slot.first + count; i++) { P[i * XYZ] = 0; P[i * XYZ + 1] = -HIDDEN_DEPTH; P[i * XYZ + 2] = 0; }
    (this.mesh.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
  }
}
