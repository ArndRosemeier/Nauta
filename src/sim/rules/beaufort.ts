/**
 * The Beaufort scale: each force's mean wind speed 10 m above the sea, m/s (WMO, 1970). One table for the wind and the
 * sea. Pure.
 */

/** One force of the scale. */
export interface BeaufortForce {
  /** Its number on the scale. */
  readonly force: number;
  readonly name: string;
  /** Least mean wind speed of this force, m/s. */
  readonly lo: number;
  /** Most mean wind speed of this force, m/s. */
  readonly hi: number;
}

/**
 * The scale, indexed by force. Force 12 has no upper bound on the scale; its `hi` is taken where the extended scale's
 * force 13 begins (37 m/s), so its middle is a speed and not infinity.
 */
export const BEAUFORT: readonly BeaufortForce[] = [
  { force: 0, name: 'calm', lo: 0, hi: 0.2 },
  { force: 1, name: 'light air', lo: 0.3, hi: 1.5 },
  { force: 2, name: 'light breeze', lo: 1.6, hi: 3.3 },
  { force: 3, name: 'gentle breeze', lo: 3.4, hi: 5.4 },
  { force: 4, name: 'moderate breeze', lo: 5.5, hi: 7.9 },
  { force: 5, name: 'fresh breeze', lo: 8, hi: 10.7 },
  { force: 6, name: 'strong breeze', lo: 10.8, hi: 13.8 },
  { force: 7, name: 'near gale', lo: 13.9, hi: 17.1 },
  { force: 8, name: 'gale', lo: 17.2, hi: 20.7 },
  { force: 9, name: 'strong gale', lo: 20.8, hi: 24.4 },
  { force: 10, name: 'storm', lo: 24.5, hi: 28.4 },
  { force: 11, name: 'violent storm', lo: 28.5, hi: 32.6 },
  { force: 12, name: 'hurricane', lo: 32.7, hi: 36.9 },
];

/** The mean wind speed of a force, m/s: the middle of its range on the scale. */
export function beaufortSpeed(force: number): number {
  const row = BEAUFORT[force];
  if (!row) throw new RangeError(`no force ${force} on the Beaufort scale (0 to ${BEAUFORT.length - 1})`);
  return (row.lo + row.hi) / 2;
}
