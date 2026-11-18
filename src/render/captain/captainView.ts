/**
 * The captain's own body drawn (implementation plan N2.7): look down and you see your legs and feet on her deck, your
 * arms, and your hand on the rail in a heavy sea; on a ladder your hands on its rungs. His head is not drawn: the
 * view is his eyes.
 *
 * One Actors character in the crew's wardrobe (app/crewLooks.ts `captainLook`), at full detail, posed each frame from
 * his body (app/body.ts `BodyPose`) with @futuremagic/figure's `FigureRig`: leaned and turned as his body is, bent
 * forward when he stoops, his feet set on the soles his body plants and lifts, a hand closed on the hold he takes. On a
 * ladder the climb (`LadderClimb`, app/captain.ts) poses him, his hands and feet on its rungs. Then the whole figure is
 * shifted so its eyes are where the view is: whatever the calm view, the eye's clamp or the climb does, the camera
 * never looks out of his chest or from beside his shoulder.
 *
 * His figure rides her: its group follows her pose, and inside it the figure stands in ship space (x across, y up, z
 * aft). It casts no shadow: a body without a head would cast a headless one.
 */
import { Group, Matrix4, Mesh, Quaternion, Vector3, type Bone, type PerspectiveCamera, type WebGPURenderer } from 'three/webgpu';
import { Character } from '@actors/generator';
import { nodeMaterials } from '@actors/three/webgpu';
import HumanWorker from '@actors/human/worker?worker';
import { FigureRig, type LadderClimb, type LimbGoal, type LimbGoals } from '@futuremagic/figure';
import type { BodyPose, FootSide } from '../../app/body';
import { paceOf, type DeckWalker } from '../../sim/ship/deckWalk';
import { PACK, captainLook, packCatalog } from '../../app/crewLooks';
import { FULL } from '../../app/crewLevels';
import { BODY } from '../../sim/rules/ships';
import { EYE_BELOW_TOP } from '../../sim/rules/walking';
import { CADENCE, CADENCE_PER_PACE, HIP_SHARE, STANDING_PACE } from '../../sim/rules/body';

/** The clips under his pose: standing, and walking (its arms swing; his feet are set by his body). */
const STAND = 'idle';
const WALK = 'walk';
/** A clip change fades over this long, s. */
const CLIP_FADE = 0.25;
/** His eyes from the head bone (the top of his neck), in his body's frame: up and forward, m. */
const EYE_UP = 0.08;
const EYE_AHEAD = 0.12;
/** His head and hair drawn this small at the top of his neck: not there. */
const HIDDEN = 1e-3;
/** The most his figure is shifted to bring its eyes to the view, m: further, something else is wrong, and he is drawn as he stands. */
const MOST_SHIFT = 0.35;
/** The ankle over the sole, as a share of his height (the foot bone's joint over the floor). */
const ANKLE_SHARE = 0.045;
/** A sole this near the floor is planted: the foot is laid flat on her deck, m. */
const PLANTED = 1e-3;
/** A hand on a rail rests on top of it; under a beam it hangs from it: the wrist this far over or under the hold, m. */
const OVER_RAIL = 0.05;
const UNDER_BEAM = 0.09;
/** A closed hand's finger curl (rad a joint, as the figure's grips). */
const GRIP_CURL = 1.2;
/** Which way an elbow goes holding a rail (out, down, back) and a beam (out, down, a little forward): the rig's body frame for that side. */
const RAIL_POLE = [0.8, -1, -0.4] as const;
const BEAM_POLE = [0.9, -0.6, 0.2] as const;

const UP = new Vector3(0, 1, 0);

export class CaptainView {
  /** His figure rides in this group, which follows her pose; it goes in through `stage.add`. */
  readonly group = new Group();
  /** His body's own frame: the soles at its origin, +Z forward, in ship space. */
  private readonly body = new Group();
  private readonly rig: FigureRig;
  private readonly head: Bone;
  private readonly feet: Record<FootSide, Bone>;
  /** Each foot's turn in his body's frame standing (flat on the floor). */
  private readonly footRest: Record<FootSide, Quaternion>;
  private readonly goals: LimbGoals;
  private readonly scale: number;
  private clip = '';
  private started = false;
  /** How far ahead of his soles his eyes are, standing, m. */
  private ahead = 0;
  private readonly yawQ = new Quaternion();
  private readonly tiltQ = new Quaternion();
  private readonly q = new Quaternion();
  private readonly v = new Vector3();
  private readonly w = new Vector3();
  private readonly toShip = new Matrix4();
  /** The climb's flat-hand directions moved into the world, one for each limb. */
  private readonly flats = { L: new Vector3(), R: new Vector3(), footL: new Vector3(), footR: new Vector3() };

  private constructor(private readonly ch: Character, private readonly ship: Group) {
    this.group.name = 'the captain';
    this.group.matrixAutoUpdate = false;
    this.body.name = 'his body';
    this.group.add(this.body);
    // Actors lifts its object by the body's ground offset itself; the body group keeps the soles at its origin.
    this.body.add(ch.object);
    // His figure at his own height (ships.ts BODY), whatever Actors made of the look's sliders.
    this.scale = ch.height > 0 ? BODY.height / ch.height : 1;
    this.body.scale.setScalar(this.scale);
    this.body.updateMatrixWorld(true);
    this.rig = new FigureRig(this.body, ch.actor.bones);
    this.rig.fit(BODY.height);
    this.head = this.rig.bone('head');
    this.feet = { L: this.rig.bone('foot_l'), R: this.rig.bone('foot_r') };
    const inv = this.body.getWorldQuaternion(new Quaternion()).invert();
    this.footRest = { L: inv.clone().multiply(this.feet.L.getWorldQuaternion(new Quaternion())), R: inv.clone().multiply(this.feet.R.getWorldQuaternion(new Quaternion())) };
    const goal = (): LimbGoal => ({ p: new Vector3(), w: 0 });
    this.goals = { L: goal(), R: goal(), footL: goal(), footR: goal(), curl: { L: GRIP_CURL, R: GRIP_CURL }, curlW: 0 };
    ch.object.traverse((o) => { if ((o as Mesh).isMesh) { o.castShadow = false; o.frustumCulled = false; } });
  }

  /** Loads his figure (the pack the crew's is cut from), dressed, in the bind pose for the rig's measures, then standing. */
  static async load(renderer: WebGPURenderer, base: string, ship: Group): Promise<CaptainView> {
    const ch = await Character.load({ pack: `${base}${PACK}`, renderer, materials: nodeMaterials, worker: new HumanWorker(), catalog: packCatalog, clipLibraries: false });
    await ch.set({ ...captainLook(), animation: null });
    ch.actor.setLod(FULL);
    const view = new CaptainView(ch, ship);
    await view.play(STAND);
    return view;
  }

  /**
   * Once a frame, after her pose and the view (ShipView's update): his figure posed from his body, or from the climb
   * while he is on a ladder, and shifted so its eyes are at the camera.
   */
  draw(dt: number, body: BodyPose, walker: DeckWalker, climb: LadderClimb | null, camera: PerspectiveCamera): void {
    this.group.matrix.copy(this.ship.matrixWorld);
    this.group.matrixWorldNeedsUpdate = true;
    this.group.updateWorldMatrix(true, false);
    const rig = this.rig, b = this.body;
    // Last frame's turns undone before the clip plays this frame's.
    rig.relax();
    const pace = paceOf(walker), walking = climb ? climb.walking : pace > STANDING_PACE;
    void this.play(walking ? WALK : STAND);
    const action = this.ch.actor.currentAction;
    // The walk's arms swing at his feet's cadence (one clip is a stride of two steps).
    if (action && this.clip === WALK && !climb) action.timeScale = (action.getClip().duration * (CADENCE + CADENCE_PER_PACE * pace)) / 2;
    else if (action) action.timeScale = 1;

    if (climb) {
      b.position.copy(climb.pos);
      b.quaternion.setFromAxisAngle(UP, climb.yaw + Math.PI);
    } else {
      b.position.set(walker.x, walker.floor, walker.z);
      this.yawQ.setFromAxisAngle(UP, body.yaw + Math.PI);
      this.tiltQ.setFromUnitVectors(UP, this.v.set(body.lean[0], 1, body.lean[1]).normalize());
      b.quaternion.copy(this.tiltQ).multiply(this.yawQ);
    }
    b.updateMatrixWorld(true);
    this.ch.update(dt);

    if (climb) {
      if (climb.pose) rig.pose(climb.pose.fn, climb.pose.w);
    } else if (body.bend > 0) {
      // Bent forward at the spine as far as his eye comes forward stooping.
      const back = BODY.height * (1 - HIP_SHARE) - EYE_BELOW_TOP;
      const bend = Math.asin(Math.min(1, body.bend / back));
      rig.pose((p) => p.spine(-bend), 1);
    }

    // His eyes to the view: the whole figure shifted (in ship space) by where they are from the camera.
    this.head.getWorldPosition(this.v);
    this.w.set(0, EYE_UP * this.scale, EYE_AHEAD * this.scale).applyQuaternion(b.getWorldQuaternion(this.q));
    this.v.add(this.w);
    // How far ahead of his soles his eyes are, standing as the clip stands him (measured once): his feet stand that
    // far behind the eye his body puts over them.
    if (!this.started) this.ahead = this.body.worldToLocal(this.w.copy(this.v)).z * this.scale;
    camera.getWorldPosition(this.w).sub(this.v);
    this.toShip.copy(this.group.matrixWorld).invert();
    const shift = this.w.length();
    this.w.transformDirection(this.toShip).multiplyScalar(shift);
    if (shift < MOST_SHIFT || !this.started) b.position.add(this.w);
    this.started = true;
    b.updateMatrixWorld(true);

    rig.reachFor(climb?.limbs ? this.climbGoals(climb.limbs) : this.standGoals(body));
    if (!climb) this.layFeet(body, walker.floor);
    // No head: the view is his eyes.
    this.head.scale.setScalar(HIDDEN);
    this.head.updateMatrixWorld(true);
  }

  private async play(clip: string): Promise<void> {
    if (clip === this.clip) return;
    this.clip = clip;
    await this.ch.play(clip, this.started ? CLIP_FADE : 0);
  }

  /** Standing or walking: his feet on his body's soles, a hand on the hold. */
  private standGoals(body: BodyPose): LimbGoals {
    const g = this.goals, ankle = ANKLE_SHARE * BODY.height;
    const bx = Math.sin(body.yaw) * this.ahead, bz = Math.cos(body.yaw) * this.ahead;
    for (const s of ['L', 'R'] as const) {
      const f = g[s === 'L' ? 'footL' : 'footR']!, sole = body.feet[s];
      this.world(f.p.set(sole[0] + bx, sole[1] + ankle, sole[2] + bz));
      f.w = 1;
    }
    g.L!.w = 0; g.R!.w = 0; g.curlW = 0;
    const hold = body.hold;
    if (hold) {
      const hand = g[hold.side]!, [x, y, z] = hold.at.point, rail = hold.at.kind === 'rail';
      this.world(hand.p.set(x, y + (rail ? OVER_RAIL : -UNDER_BEAM), z));
      hand.w = hold.w;
      hand.pole = rail ? RAIL_POLE : BEAM_POLE;
      g.curlW = hold.w;
    }
    return g;
  }

  /** On a ladder: the climb's hands and feet (ship space) moved into the world. */
  private climbGoals(limbs: LimbGoals): LimbGoals {
    const g = this.goals;
    for (const k of ['L', 'R', 'footL', 'footR'] as const) {
      const from = limbs[k], to = g[k]!;
      to.w = from?.w ?? 0;
      if (!from || to.w <= 0) continue;
      this.world(to.p.copy(from.p));
      to.pole = from.pole;
      to.flat = from.flat ? this.flats[k].copy(from.flat).transformDirection(this.group.matrixWorld) : null;
    }
    g.curl = limbs.curl;
    g.curlW = limbs.curlW;
    return g;
  }

  /** A planted foot laid flat on her deck, turned the way he faces. */
  private layFeet(body: BodyPose, floor: number): void {
    this.yawQ.setFromAxisAngle(UP, body.yaw + Math.PI);
    for (const s of ['L', 'R'] as const) {
      if (body.feet[s][1] - floor > PLANTED) continue;
      const foot = this.feet[s];
      this.group.getWorldQuaternion(this.q).multiply(this.yawQ).multiply(this.footRest[s]);
      foot.quaternion.copy(foot.parent!.getWorldQuaternion(this.tiltQ).invert().multiply(this.q));
      foot.updateMatrixWorld(true);
    }
  }

  /** A point of ship space into the world, in place. */
  private world(p: Vector3): Vector3 {
    return p.applyMatrix4(this.group.matrixWorld);
  }
}
