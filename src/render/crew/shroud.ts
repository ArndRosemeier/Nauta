/**
 * The dead covered with canvas (implementation plan N6.6, "Violence", mild level): a man killed is covered by a sheet his
 * shipmates throw over him, and the sheet goes with him when he is carried below. One low hump of sail canvas for each
 * (canvasFigures.ts): `set` while a man is covered and drawn, `clear` when not.
 */
import type { Group } from 'three/webgpu';
import type { Finish } from '../ship/solid';
import { CanvasFigures, type Profile } from './canvasFigures';

/** Sail canvas, a little dirty (sRGB about 0.75, 0.70, 0.58): linear, painted. */
const CANVAS: Finish = { rgb: [0.52, 0.45, 0.3], paint: 1 };
/** A hump in a unit radius and height: [radius, height] from its hem up to its crown. */
const HUMP: Profile = [[1, 0], [0.98, 0.15], [0.9, 0.45], [0.7, 0.75], [0.4, 0.93], [0, 1]];
/** A man under canvas lies this wide (across), this high and this long (along his facing), m. */
const ACROSS = 0.3;
const HIGH = 0.2;
const ALONG = 0.95;
/** The sheet is this much of its size when it is first thrown, before it settles over him. */
const START = 0.3;

/** One ship's shrouds. */
export class Shrouds {
  private readonly shrouds: CanvasFigures;

  constructor(group: Group) {
    this.shrouds = new CanvasFigures(group, HUMP, CANVAS, 'shroud');
  }

  /** The man `man`, covered by `covered` (0..1), lies (or is carried) with his feet at x, y, z facing `yaw` (ship space). */
  set(man: number, x: number, y: number, z: number, yaw: number, covered: number): void {
    const k = START + (1 - START) * covered;
    this.shrouds.put(man, x, y, z, yaw, ACROSS * k, HIGH * k, ALONG * k);
  }

  /** Whether the man's shroud is drawn now, and where (ship space), for the checks. */
  shownAt(man: number): { x: number; y: number; z: number; scale: number } | null {
    return this.shrouds.shownAt(man);
  }

  /** The man `man` is not under canvas (or not drawn): his shroud is hidden. */
  clear(man: number): void {
    this.shrouds.clear(man);
  }
}
