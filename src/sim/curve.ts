/**
 * A smooth curve through readings that never overshoots them (pure): monotone cubic interpolation (Fritsch and
 * Carlson). Between two readings it stays between them, and where a reading is higher or lower than both its
 * neighbours the curve stands flat there, so lines taken off a draught come out fair without wiggles.
 */

/** A curve through (x, y) readings, x rising; held at its end values outside them. */
export interface Curve {
  (x: number): number;
}

/** Monotone cubic slopes at each reading. */
function slopes(xs: readonly number[], ys: readonly number[]): number[] {
  const n = xs.length, d: number[] = [], m: number[] = new Array(n).fill(0);
  if (n < 2) return m;
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1]! - ys[i]!) / (xs[i + 1]! - xs[i]!));
  m[0] = d[0]!;
  m[n - 1] = d[n - 2]!;
  for (let i = 1; i < n - 1; i++) {
    const a = d[i - 1]!, c = d[i]!;
    m[i] = a * c <= 0 ? 0 : (2 * a * c) / (a + c);
  }
  return m;
}

/** The monotone cubic through readings (`xs` strictly rising). */
export function monotoneCurve(xs: readonly number[], ys: readonly number[]): Curve {
  const m = slopes(xs, ys), n = xs.length;
  return (x: number): number => {
    if (x <= xs[0]!) return ys[0]!;
    if (x >= xs[n - 1]!) return ys[n - 1]!;
    // Bisect for the interval.
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid]! <= x) lo = mid; else hi = mid;
    }
    const x0 = xs[lo]!, step = xs[lo + 1]! - x0, t = (x - x0) / step, u = 1 - t;
    // Cubic Hermite: the second reading's weight t²(3 - 2t), the slopes' t(1-t)² and -t²(1-t).
    const w1 = t * t * (1 + 2 * u);
    return (1 - w1) * ys[lo]! + w1 * ys[lo + 1]! + step * t * u * (u * m[lo]! - t * m[lo + 1]!);
  };
}

/** A straight-line curve through readings (`xs` strictly rising); held at its end values outside them. */
export function linearCurve(xs: readonly number[], ys: readonly number[]): Curve {
  const n = xs.length;
  return (x: number): number => {
    if (x <= xs[0]!) return ys[0]!;
    if (x >= xs[n - 1]!) return ys[n - 1]!;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid]! <= x) lo = mid; else hi = mid;
    }
    const t = (x - xs[lo]!) / (xs[lo + 1]! - xs[lo]!);
    return ys[lo]! + (ys[lo + 1]! - ys[lo]!) * t;
  };
}
