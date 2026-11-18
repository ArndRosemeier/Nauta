/**
 * The dead covered with canvas (implementation plan N6.6, "Violence", mild level): a man killed is covered by a sheet his
 * shipmates throw over him, and the sheet goes with him when he is carried below. One low hump of sail canvas for each,
 * all sharing one geometry and the timber's kind (SHIP_WOOD: no shader compiled for it), put in her crew's group by the
 * men as they are placed: `set` while a man is covered and drawn, `clear` when not.
 */
import { Matrix4, type Group, type Mesh } from 'three/webgpu';
import { SHIP_WOOD } from '../materials';
import { lathe } from '../ship/shapes';
import { Solid, type Finish } from '../ship/solid';
import { unshownMesh } from '../ship/waterInside';

/** Sail canvas, a little dirty (sRGB about 0.75, 0.70, 0.58): linear, painted. */
const CANVAS: Finish = { rgb: [0.52, 0.45, 0.3], paint: 1 };
/** A hump in a unit radius and height: [radius, height] from its hem up to its crown. */
const HUMP: readonly (readonly [number, number])[] = [[1, 0], [0.98, 0.15], [0.9, 0.45], [0.7, 0.75], [0.4, 0.93], [0, 1]];
const SIDES = 16;
/** A man under canvas lies this wide (across), this high and this long (along his facing), m. */
const ACROSS = 0.3;
const HIGH = 0.2;
const ALONG = 0.95;
/** The sheet is this much of its size when it is first thrown, before it settles over him. */
const START = 0.3;

/** One ship's shrouds. */
export class Shrouds {
  private readonly shrouds = new Map<number, Mesh>();
  /** The hump every shroud is cloned from: always in the scene (so its material is compiled behind the loading screen), too small to see. */
  private readonly first: Mesh;

  constructor(private readonly group: Group) {
    const s = new Solid();
    lathe(s, new Matrix4(), HUMP, SIDES, CANVAS);
    this.first = unshownMesh(s.geometry(), SHIP_WOOD, 'shroud');
    this.first.visible = true;
    this.first.scale.setScalar(0);
    group.add(this.first);
  }

  /** The man `man`, covered by `covered` (0..1), lies (or is carried) with his feet at x, y, z facing `yaw` (ship space). */
  set(man: number, x: number, y: number, z: number, yaw: number, covered: number): void {
    let m = this.shrouds.get(man);
    if (!m) {
      m = this.first.clone();
      this.shrouds.set(man, m);
      this.group.add(m);
    }
    const k = START + (1 - START) * covered;
    m.position.set(x, y, z);
    m.rotation.y = yaw;
    m.scale.set(ACROSS * k, HIGH * k, ALONG * k);
    m.visible = true;
  }

  /** Whether the man's shroud is drawn now, and where (ship space), for the checks. */
  shownAt(man: number): { x: number; y: number; z: number; scale: number } | null {
    const m = this.shrouds.get(man);
    return m?.visible ? { x: m.position.x, y: m.position.y, z: m.position.z, scale: m.scale.z } : null;
  }

  /** The man `man` is not under canvas (or not drawn): his shroud is hidden. */
  clear(man: number): void {
    const m = this.shrouds.get(man);
    if (m) m.visible = false;
  }
}
