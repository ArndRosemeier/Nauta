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

/** A bearing brought into 0..2pi, so it never grows without end. */
export function wrapBearing(bearing: number): number {
  const full = 2 * Math.PI;
  const b = bearing % full;
  return b < 0 ? b + full : b;
}
