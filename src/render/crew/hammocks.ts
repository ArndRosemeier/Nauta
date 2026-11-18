/**
 * The hammocks the off-watch men sleep in (Arnd, 2026-11-18: men of no use right now stay below): one slung cradle of
 * sail canvas under each sleeper (canvasFigures.ts): `set` while a man sleeps in it and is drawn, `clear` when not (an
 * empty hammock is not drawn: they are stowed in the waist's nettings when she is at quarters, furnishings.ts).
 */
import { Matrix4, type Group } from 'three/webgpu';
import type { Finish } from '../ship/solid';
import { CanvasFigures, type Profile } from './canvasFigures';

/** Hammock canvas, a little dirty and grey (sRGB about 0.72, 0.68, 0.58): linear, painted. */
const CANVAS: Finish = { rgb: [0.48, 0.42, 0.3], paint: 1 };
/** A cradle in a unit radius and depth, from its rim down to its bottom: [radius, depth below the rim]. */
const CRADLE: Profile = [[1, 0], [0.97, 0.25], [0.86, 0.55], [0.62, 0.82], [0.3, 0.96], [0, 1]];
/** A hammock is this long (athwart her), this wide (along her) and this deep, m. */
const LONG = 1.9;
const WIDE = 0.46;
const DEEP = 0.28;

/** One ship's hammocks. */
export class Hammocks {
  private readonly hammocks: CanvasFigures;

  constructor(group: Group) {
    // Hollow side up: the cradle's depth runs down from the rim, so it is turned over.
    this.hammocks = new CanvasFigures(group, CRADLE, CANVAS, 'hammock', new Matrix4().makeScale(1, -1, 1));
  }

  /** The man `man` lies in his hammock, the cloth under his back at x, y, z (ship space), its length along `yaw`. */
  set(man: number, x: number, y: number, z: number, yaw: number): void {
    this.hammocks.put(man, x, y, z, yaw, WIDE / 2, DEEP, LONG / 2);
  }

  /** The man `man` is not in a hammock (or not drawn): his is hidden. */
  clear(man: number): void {
    this.hammocks.clear(man);
  }
}
