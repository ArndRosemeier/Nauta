/** Units of time and angle, named once (docs/ARCHITECTURE.md: a number in the code has a name). Pure. */
export const HOURS_PER_DAY = 24;
export const MINUTES_PER_HOUR = 60;
export const SECONDS_PER_MINUTE = 60;
export const MS_PER_SECOND = 1000;
/** Radians in one degree. */
export const DEGREE = Math.PI / 180;

/**
 * Compass bearings on the water, rad: 0 is north, growing clockwise, so east is a quarter turn. North is -z and east
 * is +x (the look's heading 0 looks along -z). The unit direction (x, z) toward a bearing.
 */
export function bearingDir(bearing: number): [number, number] {
  return [Math.sin(bearing), -Math.cos(bearing)];
}

/** How far apart two points are on the water (in plan: x and z, the height left out), m. */
export function apartOnWater(a: { readonly x: number; readonly z: number }, b: { readonly x: number; readonly z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** The compass bearing of `b` seen from `a` on the water, rad (-pi..pi: wrap it for 0..2pi). */
export function bearingTo(a: { readonly x: number; readonly z: number }, b: { readonly x: number; readonly z: number }): number {
  return Math.atan2(b.x - a.x, -(b.z - a.z));
}

/** A bearing brought into 0..2pi, so it never grows without end. */
export function wrapBearing(bearing: number): number {
  const full = 2 * Math.PI;
  const b = bearing % full;
  return b < 0 ? b + full : b;
}

/** Acceleration of gravity at the sea's surface, m/s². */
export const GRAVITY = 9.81;

/** The simulation's fixed step (implementation plan, budgets: 30 steps a second), and its length, s. */
export const STEPS_PER_SECOND = 30;
export const STEP_SECONDS = 1 / STEPS_PER_SECOND;

/** A knot (one nautical mile, 1852 m, an hour) in m/s. */
export const KNOT = 1852 / (MINUTES_PER_HOUR * SECONDS_PER_MINUTE);
