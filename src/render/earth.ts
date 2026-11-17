/**
 * The earth's curve as the eye sees it: the sea falls away from the viewer, so it ends in a true horizon a few
 * kilometres off, and a far ship sinks hull-down behind it (plan N3.8). The simulation's sea is flat; only drawing
 * bends it, around the camera. Pure.
 */

/** The earth's mean radius, m. */
export const EARTH_RADIUS = 6371000;

/** How far below the viewer's flat sea level a point `distance` m away (measured along the water) lies, m. */
export function earthDrop(distance: number): number {
  return (distance * distance) / (2 * EARTH_RADIUS);
}

/** How far the horizon lies from an eye `height` m above the sea, m (the tangent from the eye to the earth). */
export function horizonDistance(height: number): number {
  return Math.sqrt(2 * EARTH_RADIUS * Math.max(0, height));
}
