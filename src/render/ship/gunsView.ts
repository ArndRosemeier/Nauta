/**
 * Her guns and port lids drawn moving (plan N5.4a): the carronades' slides training about their pivots and the guns
 * on their carriages running out and in along them, leaping back when fired; the long sixes trained and run on their
 * trucks; each port's lid swinging up on its hinges before her gun is run out and down when she is housed. Instances
 * of the fittings pack's models (`@futuremagic/instances`, as her other fittings: furnishings.ts), each in a moving
 * frame of her (gunPlaces.ts) moved every frame; the same frames carry her breechings and lanyards on the GPU
 * (shipMaterials.ts `setShipFrame`). One set of draws a ship, drawn whenever her outside or her far level is.
 *
 * What each gun does comes from the match (app/gunsSeen.ts); without a match (`?ship`, `?walk`) her guns stand run out
 * and her lids up, as she was drawn before.
 */
import { Matrix4, Vector3, type Camera, type Object3D, type WebGPURenderer } from 'three/webgpu';
import { createInstanceDraws, DITHER, FRAME, KIND, RECORD, type DrawKind, type InstanceDraws } from '@futuremagic/instances';
import { hash2f } from '@futuremagic/core';
import { battery } from '../../sim/guns/guns';
import { shipPlan, type GunPlace } from '../../sim/ship/plan';
import type { Furnishing } from '../../sim/ship/furnish';
import { MODEL } from '../../sim/rules/fittings';
import type { GunSeen } from '../../app/gunsSeen';
import { FITTED_WOOD } from '../materials';
import { drawKind } from './furnishings';
import type { Fittings } from './fittings';
import { box } from './shapes';
import { Solid } from './solid';
import { BLACK, RED } from './looks';
import { SMALL_BEVEL } from './hullSide';
import { setShipFrame } from './shipMaterials';
import {
  CARRONADE, CARRONADE_PARTS, LID_OPEN, LID_THICK, RUN_BACK, carronadeRest, gunFrame, gunMove, lidFrame, lidHinge, lidMove, lidRest, pivotOf, splitCarronade,
} from './gunPlaces';

/** How fast a lid is hauled up or let down, rad/s (its tackle: about a second). */
const LID_RATE = 1.4;
/**
 * The lids are drawn out to this distance, m (her ports seen open across the water, through the glass too); the
 * carronades (7000 triangles each, no coarser level) to this one: the fight is decided inside 200 m, and beyond the
 * guns' reach a gun in her port is a few pixels even through the glass.
 */
const GUNS_FAR = 700;
const CARRONADES_FAR = 400;
/** How far their shadows reach at a low sun, m. */
const SHADOW_REACH = 6;
/** Seed of the fade's dither. */
const DITHER_SEED = 1805;
/** The kinds, in the order of the draws' list. */
const SLIDE = 0, GUN = 1, LONG = 2, LID = 3;
/** Half a turn, rad. */
const HALF_TURN = Math.PI;

/** A lid: its unit model hanging from its hinge, 1 m high and wide, two layers: black outside (+x), red inside. */
function lidKind(casts: boolean): DrawKind {
  const s = new Solid(), layer = LID_THICK / 2;
  for (const [face, look] of [[1, BLACK], [-1, RED]] as const) {
    box(s, new Matrix4().makeTranslation((face * layer) / 2, -1 / 2, 0), [layer, 1, 1], look, SMALL_BEVEL, 1);
  }
  return { lods: [{ far: GUNS_FAR, parts: [{ geometry: s.geometry(), material: FITTED_WOOD.make(), castShadow: casts, receiveShadow: true, name: 'port lid' }] }] };
}

/** One gun's places: her rest (model to ship), her pivot, and her frames' slots in the draws' list. */
interface GunRest {
  readonly place: GunPlace;
  readonly rest: Matrix4;
  readonly pivot: Vector3;
}

export class GunsView {
  readonly draws: InstanceDraws;
  /** Her frame (ship to world), then each gun's slide and carriage, then each lid's (ship to world, read by the draws). */
  private readonly frames: Matrix4[];
  private readonly fromWorld = new Matrix4();
  private readonly rests: readonly GunRest[];
  private readonly ports: readonly GunPlace[];
  private readonly hinges: readonly Vector3[];
  /** Each lid's angle now, rad from shut; and the clock it was eased to, s (NaN: not yet, the first sets them). */
  private readonly lids: number[];
  private easedTo = Number.NaN;
  private readonly slide = new Matrix4();
  private readonly carriage = new Matrix4();
  private readonly lid = new Matrix4();
  private readonly sunDir = new Vector3(0, -1, 0);

  /**
   * Ship `index`'s guns (0 hers, 1 the other captain's; the other's cast no shadow), from the fittings pack and her
   * fittings' list (where her long sixes stand).
   */
  constructor(renderer: WebGPURenderer, fittings: Fittings, list: readonly Furnishing[], readonly index = 0) {
    const casts = index === 0, carronade = splitCarronade(fittings.get(CARRONADE)!);
    const models = new Map(fittings).set(CARRONADE_PARTS[0], carronade.slide).set(CARRONADE_PARTS[1], carronade.gun);
    const kinds = [drawKind(models, CARRONADE_PARTS[0], casts, CARRONADES_FAR), drawKind(models, CARRONADE_PARTS[1], casts, CARRONADES_FAR), drawKind(models, MODEL.long6, casts, GUNS_FAR), lidKind(casts)];
    const longs = list.filter((f) => f.model === MODEL.long6);
    this.rests = battery().map((place) => {
      const rest = place.gun === 'carronade' ? carronadeRest(place.along, place.sill, place.side) : longRest(longs, place);
      return { place, rest, pivot: pivotOf(rest) };
    });
    this.ports = shipPlan().guns;
    this.hinges = this.ports.map(lidHinge);
    this.lids = this.ports.map(() => LID_OPEN);
    const n = this.rests.length;
    this.frames = Array.from({ length: 1 + 2 * n + this.ports.length }, () => new Matrix4());
    this.draws = createInstanceDraws(renderer, kinds, { frames: this.frames, shadow: { dir: this.sunDir, reach: SHADOW_REACH }, capacity: 2 * n + this.ports.length });
    this.draws.group.name = index === 0 ? 'guns' : 'her guns';
    const records: [kind: number, m: Matrix4, frame: number][] = [];
    this.rests.forEach((g, i) => {
      if (g.place.gun === 'carronade') records.push([SLIDE, g.rest, 1 + i], [GUN, g.rest, 1 + n + i]);
      else records.push([LONG, g.rest, 1 + n + i]);
    });
    this.ports.forEach((p, j) => records.push([LID, lidRest(p).multiply(p.side < 0 ? new Matrix4().makeRotationY(HALF_TURN) : new Matrix4()), 1 + 2 * n + j]));
    const data = new Float32Array(records.length * RECORD);
    records.forEach(([kind, m, frame], r) => {
      const o = r * RECORD;
      m.toArray(data, o);
      data[o + KIND] = kind;
      data[o + DITHER] = hash2f(DITHER_SEED, r, kind);
      // FRAME k is frames[k - 1]: frame 0 of the list is her own.
      data[o + FRAME] = frame + 1;
    });
    this.draws.set(data, records.length);
  }

  /** Builds the draws' compute shaders (behind the loading screen). */
  async ready(): Promise<void> {
    await this.draws.ready();
  }

  /**
   * Once a frame after her group is posed: each gun and lid as `seen` says (null: run out and up), lids eased to the
   * clock `t` (s; a jump of the clock sets them where they are wanted), their frames written for the draws and for her
   * ropes' shaders; then the draws' lists.
   */
  moveGuns(ship: Object3D, camera: Camera, seen: readonly GunSeen[] | null, t: number, sunDir?: Vector3): void {
    const [her] = this.frames, n = this.rests.length;
    her!.copy(ship.matrixWorld);
    this.fromWorld.copy(her!).invert();
    if (sunDir) this.sunDir.copy(sunDir).negate();
    const wanted = this.ports.map(() => (seen ? 0 : LID_OPEN));
    this.rests.forEach((g, i) => {
      const s = seen?.[i], out = s ? s.out : 1;
      gunMove(g.place, g.pivot, s?.train ?? 0, (1 - out) * RUN_BACK[g.place.gun], this.carriage, this.slide, s?.lift ?? 0);
      this.frames[1 + i]!.multiplyMatrices(her!, this.slide);
      this.frames[1 + n + i]!.multiplyMatrices(her!, this.carriage);
      setShipFrame(gunFrame(i), this.carriage, this.index);
      // Her lid is wanted up while she is worked, and must be up before she is run out.
      wanted[this.ports.indexOf(g.place)] = !s || s.lid || out > 0 ? LID_OPEN : 0;
    });
    const step = seen && Number.isFinite(this.easedTo) ? LID_RATE * Math.max(0, t - this.easedTo) : Infinity;
    this.easedTo = t;
    this.ports.forEach((p, j) => {
      const goal = wanted[j]!, a = this.lids[j]!;
      this.lids[j] = Math.abs(goal - a) <= step ? goal : a + Math.sign(goal - a) * step;
      lidMove(p, this.hinges[j]!, this.lids[j]!, this.lid);
      this.frames[1 + 2 * n + j]!.multiplyMatrices(her!, this.lid);
      setShipFrame(lidFrame(j), this.lid, this.index);
    });
    this.draws.update(camera);
    this.draws.group.traverse((o) => { o.userData.fromWorld = this.fromWorld; o.userData.ship = this.index; });
  }
}

/** A long six at rest (model to ship) from her fittings' list: the long gun behind her port. */
function longRest(longs: readonly Furnishing[], place: GunPlace): Matrix4 {
  const f = longs.find((l) => Math.sign(l.x) === place.side && Math.abs(-l.z - place.along) < place.width);
  if (!f) throw new Error(`no long six stands behind port ${place.id}`);
  return new Matrix4().makeRotationY(f.turn).setPosition(f.x, f.y, f.z);
}
