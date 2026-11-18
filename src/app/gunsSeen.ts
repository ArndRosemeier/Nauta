/**
 * How a ship's guns stand in a match's state, for the drawing (plan N5.4a, render/ship/gunsView.ts): each gun how far
 * run out on her slide or truck, how she is trained, and whether her port's lid is wanted up. The drill decides it all
 * (sim/guns/guns.ts); this only reads it out. Pure.
 *
 * - **Run out** (1) and **run in** (0): she stands run in while housed, loading, ramming, loaded and being sponged;
 *   running out and running in she moves by the share of the work done; ready she stands run out.
 * - **Fired**, she leaps back on her breeching (`recoilOut`): most of the way in the first fifth of her recoil, then
 *   brought up by the breeching with a little rebound, and at rest run in. Drawn by the frame's clock from the instant
 *   she fired where the drawing knows it, else by her drill's work left (a step's resolution).
 * - **The lid** is up while she is at quarters or her gun is anything but housed (cast loose, she is worked through
 *   the port); the chase ports' lids stay down, no gun being shifted there yet (N5.3b).
 */
import type { DrillStep } from '../sim/rules/guns';
import type { GunKind } from '../sim/rules/ships';
import { battery, drillSeconds, gunAt, gunRow, handWork, laidAt, type Gun } from '../sim/guns/guns';
import type { SimShip } from '../sim/state';

/** One gun as drawn: run out (0 run in .. 1 run out), trained (rad, + toward the bow), and her lid wanted up. */
export interface GunSeen {
  readonly out: number;
  readonly train: number;
  readonly lid: boolean;
}

/** The share of her recoil she takes to fly back, and the breeching's rebound: how far back out (a share of the run) and over what share of the recoil after. */
const LEAP_SHARE = 0.2;
const REBOUND = 0.06;
const REBOUND_SHARE = 0.3;
/** The leap's ease: she leaves fast and is brought up by the breeching (an ease-out of this power). */
const LEAP_EASE = 3;

/**
 * How far run out a gun stands `u` of the way through her recoil (0 the instant she fired, 1 at rest): flying back
 * most of the way in the first `LEAP_SHARE`, then a small rebound off the breeching, then at rest run in.
 */
export function recoilOut(u: number): number {
  if (u <= 0) return 1;
  if (u < LEAP_SHARE) return (1 - u / LEAP_SHARE) ** LEAP_EASE;
  const r = (u - LEAP_SHARE) / REBOUND_SHARE;
  return r < 1 ? REBOUND * Math.sin(Math.PI * r) : 0;
}

/** The steps she stands run in during. */
const RUN_IN: ReadonlySet<DrillStep> = new Set(['housed', 'loading', 'ramming', 'loaded', 'sponging']);

/** How far run out a gun is (`firedFor`: seconds since she fired, if the drawing knows, NaN if not). */
function runOutShare(g: Gun, kind: GunKind, firedFor: number): number {
  const row = gunRow(kind);
  if (RUN_IN.has(g.drill)) return 0;
  switch (g.drill) {
    case 'ready': return 1;
    case 'running-out': return 1 - drillSeconds(g) / handWork(row, 'running-out');
    case 'running-in': return drillSeconds(g) / row.runIn;
    default: return recoilOut(Number.isFinite(firedFor) ? firedFor / row.recoil : 1 - drillSeconds(g) / row.recoil);
  }
}

/** Every gun of `ship` as drawn now, in battery order; `firedFor(i)`: seconds since gun `i` fired, NaN when not known. */
export function gunsSeen(ship: SimShip, firedFor: (gun: number) => number): GunSeen[] {
  return battery().map((place, i) => {
    const g = gunAt(ship.guns, i);
    return { out: Math.max(0, Math.min(1, runOutShare(g, place.gun, firedFor(i)))), train: laidAt(g).train, lid: !g.dismounted && (ship.told.quarters || g.drill !== 'housed') };
  });
}
