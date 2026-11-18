/**
 * The geometry of the placement map (scenarioDialog's chart): how the chart is framed round the ships, metres to
 * pixels and back, and the snapping and limits of a ship moved or turned by hand. Pure; placementMap.ts draws it.
 */
import { LEAST_APART, MOST_FAR } from '../sim/scenario';
import type { Placed } from '../sim/start';
import { apartOnWater, DEGREE, wrapBearing } from '../sim/units';

/** The chart's size in its own units (an SVG viewBox), and how much of it the ships may not use (the glyphs, the handle, the labels). */
export const CHART = { width: 640, height: 400, margin: 56 } as const;
/** The least the chart shows round its middle, m, half its height: a close duel still gets a room to be moved in. */
const LEAST_REACH = 900;
/** Where a ship snaps to, m, and where her heading does, rad. */
export const SNAP_M = 25;
export const SNAP_HEADING = 5 * DEGREE;
/** The gridlines' steps, m, from which the finest that does not crowd the chart is taken. */
export const GRID_STEPS = [100, 250, 500, 1000, 2000];
/** The least gap between gridlines on the chart, in its units. */
const GRID_LEAST = 70;

/** How metres land on the chart: its middle in metres and the scale in chart units a metre. */
export interface Frame {
  readonly cx: number;
  readonly cz: number;
  readonly scale: number;
}

/** A chart framed round `places`, all inside the margin, the middle where the ships' bounding box has it; never closer in than `LEAST_REACH`. */
export function frameOf(places: readonly Placed[]): Frame {
  if (places.length === 0) return { cx: 0, cz: 0, scale: (CHART.height - 2 * CHART.margin) / (2 * LEAST_REACH) };
  const xs = places.map((p) => p.x), zs = places.map((p) => p.z);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const reachX = Math.max(LEAST_REACH * (CHART.width / CHART.height), (x1 - x0) / 2), reachZ = Math.max(LEAST_REACH, (z1 - z0) / 2);
  const scale = Math.min((CHART.width / 2 - CHART.margin) / reachX, (CHART.height / 2 - CHART.margin) / reachZ);
  return { cx, cz, scale };
}

export const toChart = (f: Frame, x: number, z: number): [number, number] => [CHART.width / 2 + (x - f.cx) * f.scale, CHART.height / 2 + (z - f.cz) * f.scale];
export const fromChart = (f: Frame, px: number, py: number): [number, number] => [f.cx + (px - CHART.width / 2) / f.scale, f.cz + (py - CHART.height / 2) / f.scale];

/** The gridlines of a frame: the step in metres and the metres at which lines fall across the chart (x of the vertical ones, z of the horizontal). */
export function gridOf(f: Frame): { step: number; xs: number[]; zs: number[] } {
  const step = GRID_STEPS.find((s) => s * f.scale >= GRID_LEAST) ?? GRID_STEPS[GRID_STEPS.length - 1]!;
  const lines = (c: number, half: number) => {
    const out: number[] = [];
    for (let m = Math.ceil((c - half) / step) * step; m <= c + half; m += step) out.push(m);
    return out;
  };
  return { step, xs: lines(f.cx, CHART.width / 2 / f.scale), zs: lines(f.cz, CHART.height / 2 / f.scale) };
}

/** A position snapped to the grid of `SNAP_M`, brought inside the map's edge (`MOST_FAR` from the middle). */
export function snapped(x: number, z: number): [number, number] {
  const sx = Math.round(x / SNAP_M) * SNAP_M, sz = Math.round(z / SNAP_M) * SNAP_M, d = apartOnWater({ x: sx, z: sz }, { x: 0, z: 0 });
  return d <= MOST_FAR ? [sx, sz] : [Math.round(((sx * MOST_FAR) / d) / SNAP_M) * SNAP_M, Math.round(((sz * MOST_FAR) / d) / SNAP_M) * SNAP_M];
}

/** A heading snapped to `SNAP_HEADING`: the bearing from a ship at (x, z) to the point (px, pz). */
export function headingTo(x: number, z: number, px: number, pz: number): number {
  return wrapBearing(Math.round(Math.atan2(px - x, -(pz - z)) / SNAP_HEADING) * SNAP_HEADING);
}

/** Whether ship `i` may be at (x, z): no other ship nearer than `LEAST_APART`. */
export function roomFor(places: readonly Placed[], i: number, x: number, z: number): boolean {
  return places.every((p, k) => k === i || apartOnWater(p, { x, z }) >= LEAST_APART);
}
