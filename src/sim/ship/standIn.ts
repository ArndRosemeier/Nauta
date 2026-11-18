/**
 * A stand-in for her floating (pure) until N2.2 computes it from pressure on the hull: she follows the plane of the
 * water under her footprint, eased like a heavy body. It is enough to stand on a slice of her deck in the real sea
 * (N2.0) and see the horizon rise and fall as it should; it knows nothing of her weight, stability or roll period.
 */
import { surfaceAt, seaSample, type SeaState } from '../sea/sea';

/** How she lies on the water: heave (ship-space origin over the calm level, m), pitch (bow up, rad), roll (to starboard, rad), with their rates. */
export interface StandInPose {
  readonly heave: number;
  readonly pitch: number;
  readonly roll: number;
  readonly heaveRate: number;
  readonly pitchRate: number;
  readonly rollRate: number;
}

/** Her footprint on the water, m: the length and the breadth of the brig at her waterline (ship.md: 30.5 by 9.3). */
const FOOTPRINT_LENGTH = 28;
const FOOTPRINT_BREADTH = 8.9;
/** Water samples along and across the footprint. */
const SAMPLES_ALONG = 7;
const SAMPLES_ACROSS = 3;
/** How quickly she follows the water: the period of the easing, s, critically damped (a heavy hull lags the waves). */
const EASE_PERIOD = 2.4;

export const restingPose = (): StandInPose => ({ heave: 0, pitch: 0, roll: 0, heaveRate: 0, pitchRate: 0, rollRate: 0 });

const sample = seaSample();

/**
 * The plane of the water under her footprint at time t, her middle at (x, z) and her bow toward `heading` (a compass
 * bearing, rad): the mean height, and how it slopes along her and across her, by least squares.
 */
export function waterPlane(sea: SeaState, x: number, z: number, heading: number, t: number): { heave: number; pitch: number; roll: number } {
  // Her axes on the water: forward (bow) and starboard.
  const fx = Math.sin(heading), fz = -Math.cos(heading), sx = -fz, sz = fx;
  let sum = 0, along = 0, across = 0, along2 = 0, across2 = 0, n = 0;
  for (let i = 0; i < SAMPLES_ALONG; i++) {
    const a = FOOTPRINT_LENGTH * (i / (SAMPLES_ALONG - 1) - 1 / 2);
    for (let j = 0; j < SAMPLES_ACROSS; j++) {
      const b = FOOTPRINT_BREADTH * (j / (SAMPLES_ACROSS - 1) - 1 / 2);
      const h = surfaceAt(sea, x + fx * a + sx * b, z + fz * a + sz * b, t, sample).height;
      sum += h; along += h * a; across += h * b; along2 += a * a; across2 += b * b; n++;
    }
  }
  // Water higher forward lifts her bow; water higher to starboard heels her to port.
  return { heave: sum / n, pitch: Math.atan(along / along2), roll: -Math.atan(across / across2) };
}

/** One step of `dt` s toward the water's plane: each of heave, pitch and roll eased by a critically damped spring. */
export function followWater(pose: StandInPose, target: { heave: number; pitch: number; roll: number }, dt: number): StandInPose {
  const w = (2 * Math.PI) / EASE_PERIOD;
  const ease = (v: number, rate: number, to: number): [number, number] => {
    // Exact for a constant target over the step (the spring's closed form), so any frame rate gives the same path.
    const e = Math.exp(-w * dt), d = v - to, c = rate + w * d;
    return [to + (d + c * dt) * e, (rate - c * w * dt) * e];
  };
  const [heave, heaveRate] = ease(pose.heave, pose.heaveRate, target.heave);
  const [pitch, pitchRate] = ease(pose.pitch, pose.pitchRate, target.pitch);
  const [roll, rollRate] = ease(pose.roll, pose.rollRate, target.roll);
  return { heave, pitch, roll, heaveRate, pitchRate, rollRate };
}
