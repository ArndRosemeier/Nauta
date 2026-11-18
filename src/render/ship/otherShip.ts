/**
 * The other captain's ship, as the page draws her until N3.8 draws her properly (plan N3.7: "PC and iPad in one room
 * see the same sea and each other"): her coarse outside (the far ship of N2.4, built once in the worker with her own),
 * posed each frame from the match. At the start she is 1,500 m off, where the far ship is all that is drawn of a brig
 * anyway; alongside she is coarse, which N3.8 replaces with the whole ship and a crossfade.
 */
import { Euler, Group, Mesh } from 'three/webgpu';
import { shipOrigin, type ShipPose } from '../../sim/ship/motion';
import { SHIP_COPPER, SHIP_GLOW, SHIP_IRON, SHIP_ROPE, SHIP_WOOD } from '../materials';
import { geometryOf } from './gathered';
import type { ShipBuild } from './ship';

/** The far ship's kinds, plain (she is never crossfaded here). */
const KINDS = [['wood', SHIP_WOOD], ['iron', SHIP_IRON], ['copper', SHIP_COPPER], ['glow', SHIP_GLOW], ['ropes', SHIP_ROPE]] as const;

/** A ship's group put where her pose says: her centre on the sea, turned to her heading, pitched and rolled. */
export function placeShip(group: Group, pose: ShipPose, origin: [number, number, number] = [0, 0, 0], euler = new Euler()): void {
  group.position.set(...shipOrigin(pose, origin));
  // Pitch: bow up turns her about +x the other way (bow is -z); roll to starboard turns her about -z the other way.
  euler.set(pose.pitch, -pose.heading, -pose.roll, 'YXZ');
  group.quaternion.setFromEuler(euler);
  group.updateMatrixWorld(true);
}

export class OtherShipView {
  /** Her meshes in ship space; it goes in through `stage.add`. */
  readonly group = new Group();
  private readonly origin: [number, number, number] = [0, 0, 0];
  private readonly euler = new Euler();

  constructor(build: ShipBuild) {
    this.group.name = 'other ship';
    for (const [name, kind] of KINDS) {
      const packed = build.far[name];
      if (!packed.index.length) continue;
      const m = new Mesh(geometryOf(packed), kind.make());
      m.name = kind.name;
      m.castShadow = false;
      m.receiveShadow = kind.shadow.receive;
      this.group.add(m);
    }
  }

  /** Drawn as she lies now, or hidden (no other ship in the match). */
  show(pose: ShipPose | null): void {
    this.group.visible = pose !== null;
    if (pose) placeShip(this.group, pose, this.origin, this.euler);
  }
}
