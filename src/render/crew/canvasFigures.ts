/**
 * Pieces of sail canvas drawn for individual men (the shroud over the killed, shroud.ts; the hammock a man sleeps in,
 * hammocks.ts): one low lathe shape for each man, all sharing one geometry and the timber's kind (SHIP_WOOD: no shader
 * compiled for it), put in her crew's group by the men as they are placed.
 */
import { Matrix4, type Group, type Mesh } from 'three/webgpu';
import { SHIP_WOOD } from '../materials';
import { lathe } from '../ship/shapes';
import { Solid, type Finish } from '../ship/solid';
import { unshownMesh } from '../ship/waterInside';

/** A shape in a unit radius and height: [radius, height] from its rim to its crown. */
export type Profile = readonly (readonly [number, number])[];
/** Its sides round. */
const SIDES = 16;

/** One ship's canvas pieces of one shape. */
export class CanvasFigures {
  private readonly pieces = new Map<number, Mesh>();
  /** The piece every other is cloned from: always in the scene (so its material is compiled behind the loading screen), too small to see. */
  private readonly first: Mesh;

  constructor(private readonly group: Group, profile: Profile, finish: Finish, label: string, shape = new Matrix4()) {
    const s = new Solid();
    lathe(s, shape, profile, SIDES, finish);
    this.first = unshownMesh(s.geometry(), SHIP_WOOD, label);
    this.first.visible = true;
    this.first.scale.setScalar(0);
    group.add(this.first);
  }

  /** The man `man`'s piece at x, y, z (ship space), turned `yaw`, its unit sizes scaled by sx, sy, sz. */
  put(man: number, x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number): void {
    let m = this.pieces.get(man);
    if (!m) {
      m = this.first.clone();
      this.pieces.set(man, m);
      this.group.add(m);
    }
    m.position.set(x, y, z);
    m.rotation.y = yaw;
    m.scale.set(sx, sy, sz);
    m.visible = true;
  }

  /** Where the man's piece is drawn now (ship space) and its depth scale, or null when it is not drawn. */
  shownAt(man: number): { x: number; y: number; z: number; scale: number } | null {
    const m = this.pieces.get(man);
    return m?.visible ? { x: m.position.x, y: m.position.y, z: m.position.z, scale: m.scale.z } : null;
  }

  /** The man's piece is hidden. */
  clear(man: number): void {
    const m = this.pieces.get(man);
    if (m) m.visible = false;
  }
}
