/**
 * Which of her zones can be seen (plan N2.4, ship.md "Rooms and openings"): from the zone the eye is in, through the
 * portals that are open (every hole in a deck; a door only while it is open) and on screen, each zone seen through
 * a portal narrows what can be seen beyond it to the portal's rectangle on screen. So from the deck only what is seen
 * through an opening is drawn below, and from below the same, and the rooms behind shut doors are not drawn at all.
 */
import { Matrix4, Vector4 } from 'three/webgpu';
import { shipY, shipZ } from '../../sim/ship/section';
import type { Portal } from './zones';

/** A rectangle on screen in normalised device coordinates: [left, bottom, right, top]. */
type Rect = [number, number, number, number];
const FULL: Rect = [-1, -1, 1, 1];
/** Points this close to the eye's plane or behind it are behind the eye (clip w). */
const NEAR_W = 1e-3;
/** The most portals passed through one after another before the search stops. */
const MOST_STEPS = 400;

export class Visibility {
  private readonly corners: Vector4[][];
  private readonly byZone = new Map<string, number[]>();
  private readonly v = new Vector4();

  constructor(private readonly portals: readonly Portal[]) {
    this.corners = portals.map((p) => p.corners.map(([along, across, h]) => new Vector4(across, shipY(h), shipZ(along), 1)));
    portals.forEach((p, i) => {
      for (const z of [p.a, p.b]) {
        const list = this.byZone.get(z) ?? [];
        list.push(i);
        this.byZone.set(z, list);
      }
    });
  }

  /** The portal's rectangle on screen through `toClip` (ship space to clip space), or null where it is wholly behind the eye. */
  private rect(i: number, toClip: Matrix4): Rect | null {
    let l = Infinity, b = Infinity, r = -Infinity, t = -Infinity, behind = 0;
    const cs = this.corners[i]!;
    for (const c of cs) {
      this.v.copy(c).applyMatrix4(toClip);
      if (this.v.w <= NEAR_W) { behind++; continue; }
      const x = this.v.x / this.v.w, y = this.v.y / this.v.w;
      l = Math.min(l, x); r = Math.max(r, x); b = Math.min(b, y); t = Math.max(t, y);
    }
    if (behind === cs.length) return null;
    // A portal the eye stands in or beside may be seen anywhere on screen.
    return behind > 0 ? FULL : [l, b, r, t];
  }

  /**
   * The zones seen from `eyeZone` (null: the eye is in none of them, and every zone counts as seen), looking through
   * `toClip` (ship space to clip space), with `open(door)` saying which doors stand open.
   */
  seen(eyeZone: string | null, toClip: Matrix4, open: (door: string) => boolean): Set<string> | null {
    if (eyeZone === null) return null;
    const seen = new Map<string, Rect>([[eyeZone, FULL]]);
    const queue: [string, Rect][] = [[eyeZone, FULL]];
    for (let step = 0; step < MOST_STEPS && queue.length; step++) {
      const [zone, view] = queue.shift()!;
      for (const i of this.byZone.get(zone) ?? []) {
        const p = this.portals[i]!;
        if (p.door !== null && !open(p.door)) continue;
        const r = this.rect(i, toClip);
        if (!r) continue;
        const cut: Rect = [Math.max(r[0], view[0]), Math.max(r[1], view[1]), Math.min(r[2], view[2]), Math.min(r[3], view[3])];
        if (cut[0] >= cut[2] || cut[1] >= cut[3]) continue;
        const other = p.a === zone ? p.b : p.a, had = seen.get(other);
        if (had && had[0] <= cut[0] && had[1] <= cut[1] && had[2] >= cut[2] && had[3] >= cut[3]) continue;
        const grown: Rect = had ? [Math.min(had[0], cut[0]), Math.min(had[1], cut[1]), Math.max(had[2], cut[2]), Math.max(had[3], cut[3])] : cut;
        seen.set(other, grown);
        queue.push([other, grown]);
      }
    }
    return new Set(seen.keys());
  }
}
