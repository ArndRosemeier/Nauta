/**
 * The spars of her rig that turn (plan N3.6): the six yards brace round about their slings, the main boom and gaff
 * swing about their jaws, and a topsail or topgallant yard is lowered down its mast. Each is a moving frame: its
 * timber is drawn in a group of its own turned by the frame's matrix (shipView.ts), and every rope made fast to it
 * follows the same matrix on the GPU (rope.ts `RopeFollow`, frame 0 being her hull). The angles themselves belong to
 * the simulation (N3.3); the drawing only applies them.
 */
import { Matrix4, Vector3 } from 'three/webgpu';
import { sparOf, type RigPlan } from '../../sim/ship/rig';
import type { RigPoint, Spar } from '../../sim/ship/spars';
import { shipY, shipZ } from '../../sim/ship/section';

/** How many moving frames her rig takes: her hull, every spar that turns, and every point of a sail a line is made fast to (sailForm.ts `sailPoints`). */
export const RIG_FRAMES = 64;
/** How many her guns and port lids take after the rig's (gunPlaces.ts: a gun's breeching, a lid's lanyard). */
export const GUN_FRAMES = 64;
/** How many moving frames her ropes can follow (the rope kind's frames texture, shipMaterials.ts). */
export const MOST_FRAMES = RIG_FRAMES + GUN_FRAMES;

/** A spar that turns: its moving frame's number, the point it turns about and the axis (ship space), and how far a lowered yard drops. */
export interface Swing {
  readonly id: string;
  readonly frame: number;
  readonly kind: 'yard' | 'boom';
  readonly pivot: Vector3;
  readonly axis: Vector3;
  /** From hoisted to lowered (ship space, m; none for the lower yards, the boom and the gaff). */
  readonly drop: Vector3;
  /** The most it turns either way, rad. */
  readonly limit: number;
}

/** A point of the rig in ship space. */
export const shipPoint = (p: RigPoint): Vector3 => new Vector3(p.across, shipY(p.height), shipZ(p.along));

/** Her turning spars, numbered from frame 1 in the rig plan's order. */
export function swingsOf(rig: RigPlan): Swing[] {
  const out: Swing[] = [];
  for (const s of rig.spars) {
    if (!s.yard && s.swing === null) continue;
    const mast = sparOf(rig, `${s.mast}-mast`);
    const axis = shipPoint(mast.head).sub(shipPoint(mast.heel)).normalize();
    if (s.yard) {
      const pivot = shipPoint(s.heel).lerp(shipPoint(s.head), 1 / 2);
      const drop = axis.clone().multiplyScalar((s.yard.lowered - s.yard.hoisted) / axis.y);
      out.push({ id: s.id, frame: out.length + 1, kind: 'yard', pivot, axis, drop, limit: s.yard.brace });
    } else {
      out.push({ id: s.id, frame: out.length + 1, kind: 'boom', pivot: shipPoint(s.heel), axis, drop: new Vector3(), limit: s.swing! });
    }
  }
  return out;
}

/**
 * Every spar's moving frame by its id (plan N6.5): a turning spar's own (`swingsOf`), and each spar that stands (the
 * masts, the bowsprit, the jib-boom, the dolphin striker) one of the last of the rig's frames, after the sails' points:
 * still (her hull's) until it falls, then carrying what is made fast to it over the side.
 */
export function sparFramesOf(rig: RigPlan): ReadonlyMap<string, number> {
  const swings = swingsOf(rig), standing = rig.spars.filter((s) => !swings.some((w) => w.id === s.id));
  return new Map([
    ...swings.map((w) => [w.id, w.frame] as const),
    ...standing.map((s, k) => [s.id, RIG_FRAMES - standing.length + k] as const),
  ]);
}

/** The turning spar a spar is, or null. */
export const swingOf = (swings: readonly Swing[], spar: Spar | string): Swing | null => swings.find((w) => w.id === (typeof spar === 'string' ? spar : spar.id)) ?? null;

const turn = new Matrix4(), shift = new Matrix4(), back = new Matrix4();
/**
 * A turning spar's frame (ship space to ship space): a yard braced `angle` rad (+: its starboard yardarm aft) and
 * hoisted `hoist` (1 hoisted, 0 lowered onto the cap); the boom or gaff swung `angle` rad (+: its end to starboard).
 * The angle is held to the spar's limit.
 */
export function swingMatrix(w: Swing, angle: number, hoist: number, out = new Matrix4()): Matrix4 {
  const a = Math.max(-w.limit, Math.min(w.limit, angle));
  turn.makeRotationAxis(w.axis, w.kind === 'yard' ? -a : a);
  shift.makeTranslation(w.pivot.x, w.pivot.y, w.pivot.z);
  back.makeTranslation(-w.pivot.x, -w.pivot.y, -w.pivot.z);
  out.multiplyMatrices(shift, turn).multiply(back);
  const d = w.drop.clone().multiplyScalar(1 - Math.max(0, Math.min(1, hoist)));
  return out.premultiply(shift.makeTranslation(d.x, d.y, d.z));
}
