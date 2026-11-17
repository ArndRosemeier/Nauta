/**
 * The workload the probe's compute pass runs (plan N0.5): a fixed set of waves summed at every texel of a grid, and
 * the same sum on the CPU to check the GPU's answer. Pure. Not the game's sea (that is N1.1, `src/sim/sea/`): only a
 * job of the right shape to time, deterministic so every device runs the same one.
 */

/** Floats per wave in the table the GPU reads: direction x and z, wavenumber, amplitude, phase, angular speed, two pads (32 bytes, WGSL's struct alignment). */
export const WAVE_FLOATS = 8;
/** Standard gravity, m/s²: deep-water waves run at ω = √(g·k). */
const GRAVITY = 9.81;
/** Wavenumber of the longest wave, rad/m (about a 300 m swell). */
const K_FIRST = 0.02;
/** Each wave is this much shorter than the one before (16 waves reach about 5 m). */
const K_RATIO = 1.45;
/** Amplitude of the longest wave, metres; wave i has this over (1 + i). */
const AMP_FIRST = 1.2;
/** The golden angle, radians: spreads the directions without a pattern. */
const GOLDEN_ANGLE = 2.399963;
/** Phase step from one wave to the next, radians. */
const PHASE_STEP = 0.9;

/** `count` waves as a table of WAVE_FLOATS floats each, ready to upload. */
export function probeWaves(count: number): Float32Array {
  const table = new Float32Array(count * WAVE_FLOATS);
  for (let i = 0; i < count; i++) {
    const k = K_FIRST * K_RATIO ** i, dir = i * GOLDEN_ANGLE, o = i * WAVE_FLOATS;
    table.set([Math.cos(dir), Math.sin(dir), k, AMP_FIRST / (1 + i), i * PHASE_STEP, Math.sqrt(GRAVITY * k)], o);
  }
  return table;
}

/** The height of the waves in `table` at (x, z) metres and time t seconds: what the GPU must write there. */
export function waveHeight(table: Float32Array, x: number, z: number, t: number): number {
  let h = 0;
  for (let o = 0; o < table.length; o += WAVE_FLOATS) {
    const [dx, dz, k, amp, phase, speed] = table.subarray(o, o + WAVE_FLOATS);
    h += amp * Math.sin(k * (dx * x + dz * z) + phase + speed * t);
  }
  return h;
}
