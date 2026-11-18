/**
 * The crew's climbing figure (Arnd 2026-11-18: "sailors have a running animation when climbing into the sails"): one
 * Actors character that is never drawn, posed each time as a man climbs a ladder or the shrouds hand over hand, or leans over a yard out on its footrope, by the
 * same @futuremagic/figure `LadderClimb` and `FigureRig` the captain climbs with (render/captain/captainView.ts), then
 * its bones lent to the man who climbs: a crowd figure takes its pose (`CrowdFigures.pose`), a pool character the
 * bones of his body (`lendTo`). There is no climbing clip for the rigging in the motion library (mocap-climbing
 * memory), so the climb is made, not played.
 *
 * It lives in ship space: its body group has no parent, so its world is her frame and the climb's holds (ship space)
 * are its goals as they are. Gravity's up is her own up: a man aloft is not swayed by her heel here.
 */
import { Group, Vector3 } from 'three/webgpu';
import { Character, type CharacterCatalog } from '@actors/generator';
import { nodeMaterials } from '@actors/three/webgpu';
import type { ThreeActor } from '@actors/three';
import type { WebGPURenderer } from 'three/webgpu';
import { FigureRig, LadderClimb, type OnLadder, type Yard } from '@futuremagic/figure';
import HumanWorker from '@actors/human/worker?worker';
import { CLIMBER } from '../../app/aloftClimb';
import { packCatalog } from '../../app/crewLooks';
import { BODY } from '../../sim/rules/ships';

const UP = new Vector3(0, 1, 0);
/** The levels of detail the donor keeps: one, the lowest (it is never seen). */
const DONOR_LEVEL = 2;
/** The bones a climber's pose lends a pool character: the body's, not the face's. */
const BODY_BONES = /^(pelvis|spine_|neck_|head$|clavicle_|upperarm_|lowerarm_|hand_|thumb_|index_|middle_|ring_|pinky_|thigh_|calf_|foot_|ball_)/;

/** Where a climbing man's soles are and how he faces, in ship space (the climb's `pos` and body yaw). */
export interface ClimberAt {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Rad about +y, as a crowd figure or a pool character is turned (0 faces aft, toward +z... as `ManDrawn.yaw`). */
  readonly yaw: number;
}

export class ClimbRig {
  private readonly body = new Group();
  private readonly rig: FigureRig;
  private readonly climb = new LadderClimb();
  private readonly at: { x: number; y: number; z: number; yaw: number } = { x: 0, y: 0, z: 0, yaw: 0 };

  private constructor(private readonly ch: Character) {
    this.body.name = 'the climbing figure';
    this.body.add(ch.object);
    this.body.scale.setScalar(ch.height > 0 ? BODY.height / ch.height : 1);
    this.body.updateMatrixWorld(true);
    this.rig = new FigureRig(this.body, ch.actor.bones);
    this.rig.fit(BODY.height);
  }

  /** The donor, made in the bind pose from the crew's pack (`shareWith` the workbench: no second copy of the body). */
  static async make(renderer: WebGPURenderer, pack: string, workbench: Character, catalog: (c: CharacterCatalog) => CharacterCatalog = packCatalog): Promise<ClimbRig> {
    const ch = await Character.load({ pack, renderer, materials: nodeMaterials, shareWith: workbench, worker: new HumanWorker(), catalog, levels: [DONOR_LEVEL], clipLibraries: false });
    await ch.set({ animation: null });
    ch.object.visible = false;
    return new ClimbRig(ch);
  }

  /**
   * The figure posed on `on` (up or down it): hands and feet on the holds. Returns where his soles are and how he
   * faces; his pose is then in `actor` for `CrowdFigures.pose`, or `lendTo`.
   */
  cling(on: OnLadder, up: boolean): ClimberAt {
    this.rig.relax();
    this.climb.up.copy(UP);
    this.climb.cling(on.ladder, on.h, up, CLIMBER, 0);
    return this.settle();
  }

  /**
   * The figure posed out on `yard`'s footrope, `s` metres out along it: leaning over the yard, hands on the jackstay,
   * the feet sliding along the rope. His stance depends on `s` alone, so each frame stands on its own.
   */
  sidle(yard: Yard, s: number): ClimberAt {
    this.rig.relax();
    this.climb.up.copy(UP);
    this.climb.sidle(yard, s, CLIMBER, 0);
    return this.settle();
  }

  /** The climb's pose and holds put on the body, and where his soles are. */
  private settle(): ClimberAt {
    const c = this.climb;
    this.body.position.copy(c.pos);
    this.body.quaternion.setFromAxisAngle(UP, c.yaw + Math.PI);
    this.body.updateMatrixWorld(true);
    if (c.pose) this.rig.pose(c.pose.fn, c.pose.w);
    if (c.limbs) this.rig.reachFor(c.limbs);
    const a = this.at;
    a.x = c.pos.x; a.y = c.pos.y; a.z = c.pos.z; a.yaw = c.yaw + Math.PI;
    return a;
  }

  /** The donor's skeleton as it is now, for a crowd figure to take (`CrowdFigures.pose`). */
  get actor(): ThreeActor {
    return this.ch.actor;
  }

  /** The body's bones lent to `target` (a pool character's actor, after its clip played): he climbs as the donor does. */
  lendTo(target: ThreeActor): void {
    const from = this.ch.actor.bones, to = target.bones;
    for (let i = 0; i < from.length; i++) {
      if (!BODY_BONES.test(from[i]!.name)) continue;
      to[i]!.position.copy(from[i]!.position);
      to[i]!.quaternion.copy(from[i]!.quaternion);
    }
  }
}

