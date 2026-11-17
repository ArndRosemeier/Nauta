/**
 * The swell from elsewhere (implementation plan N1.10): a few long, low waves that a storm far away raised, not the
 * local wind. Every sea carries one, the same whatever the wind's force, from a seeded direction well off the wind,
 * so a calm still breathes and in a breeze the wind sea crosses an older one. Pure.
 */
import { Rng } from '@futuremagic/core';
import {
  SWELL_COMPONENTS, SWELL_FOLD_LIMIT, SWELL_HEIGHT, SWELL_OFF_WIND, SWELL_PERIOD_LONGEST, SWELL_PERIOD_SHORTEST, SWELL_SPREAD,
} from '../rules/sea';
import { waveSet, type WaveSet } from './waves';

/**
 * The swell for a sea whose wind first blows toward `windToward` (rad, 0 = +x, π/2 = +z), drawn with `seed`. Its
 * direction is far enough off the wind's that each of its waves, running within SWELL_SPREAD of it, is at least
 * SWELL_OFF_WIND off the wind (the side and the rest of the angle are the seed's). The periods are spread over
 * SWELL_PERIOD_SHORTEST to SWELL_PERIOD_LONGEST, the phases are free, and its significant height is SWELL_HEIGHT.
 */
export function makeSwell(seed: number, windToward: number): WaveSet {
  const rng = new Rng(seed);
  const n = SWELL_COMPONENTS;
  const toward = windToward + rng.fork('side').sign() * rng.fork('off').range(SWELL_OFF_WIND + SWELL_SPREAD, Math.PI);
  const periods = rng.fork('period');
  const band = SWELL_PERIOD_LONGEST - SWELL_PERIOD_SHORTEST;
  const omega = Array.from({ length: n }, (_, i) => (2 * Math.PI) / (SWELL_PERIOD_SHORTEST + (band * (i + periods.float())) / n));
  const spread = rng.fork('direction');
  const dirs = omega.map(() => toward + spread.range(-SWELL_SPREAD, SWELL_SPREAD));
  const phases = rng.fork('phase');
  const phase = omega.map(() => phases.range(0, 2 * Math.PI));
  return waveSet(omega, dirs, phase, SWELL_HEIGHT, (SWELL_PERIOD_SHORTEST + SWELL_PERIOD_LONGEST) / 2, SWELL_FOLD_LIMIT);
}
