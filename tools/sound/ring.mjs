#!/usr/bin/env node
/**
 * The ringing in the ears after a broadside fired close by (plan N5.6), synthesised: a thin high whine (two tones a
 * few hertz apart, so it beats and wavers), a faint hiss round it, rising in a moment and dying away over about six
 * seconds. Written as a WAV into the raw folder (`<raw>/gun/ring.wav`), where sounds.json takes it with `from`.
 * Seeded, so the same numbers give the same file.
 *
 *   node tools/sound/ring.mjs --raw /mnt/project-files/nauta/audio/raw
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { RATE, rng, wav } from './wav.mjs';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const RAW = resolve(opt('--raw') ?? '.sound-raw');

/** The take's length, s. */
const SECONDS = 6.5;
/** The whine: its pitch, Hz, the second tone this far above it (the beat, Hz) at this share, and a slow waver of the pitch. */
const PITCH = 4100, BEAT = 3.2, SECOND = 0.6, WAVER_HZ = 0.35, WAVER = 0.006;
/** It rises in this long, s, and dies away with this time constant, s (the last of it faded out over FADE s). */
const RISE = 0.12, DECAY = 2.0, FADE = 0.8;
/** The hiss round it: noise this loud against the whine, through a resonance at this share of the pitch, with this Q. */
const HISS = 0.25, HISS_AT = 1.4, HISS_Q = 3;
/** The take's peak, dBFS (the make script levels it again). */
const PEAK_DB = -1;

function synth(seed) {
  const n = Math.round(SECONDS * RATE), out = new Float32Array(n), r = rng(seed);
  // The hiss: white noise through a two-pole resonator.
  const w = (2 * Math.PI * PITCH * HISS_AT) / RATE, a = Math.sin(w) / (2 * HISS_Q);
  const b0 = a / (1 + a), a1 = (-2 * Math.cos(w)) / (1 + a), a2 = (1 - a) / (1 + a);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, p1 = 0, p2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const env = Math.min(1, t / RISE) * Math.exp(-Math.max(0, t - RISE) / DECAY) * Math.min(1, (SECONDS - t) / FADE);
    const f = PITCH * (1 + WAVER * Math.sin(2 * Math.PI * WAVER_HZ * t));
    p1 += (2 * Math.PI * f) / RATE; p2 += (2 * Math.PI * (f + BEAT)) / RATE;
    const x = r() * 2 - 1, y = b0 * x - b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    out[i] = env * (Math.sin(p1) + SECOND * Math.sin(p2) + HISS * y * 4);
  }
  const peak = out.reduce((m, v) => Math.max(m, Math.abs(v)), 0), gain = Math.pow(10, PEAK_DB / 20) / Math.max(peak, 1e-9);
  return out.map((v) => v * gain);
}

mkdirSync(join(RAW, 'gun'), { recursive: true });
const file = join(RAW, 'gun', 'ring.wav');
writeFileSync(file, wav(synth(0x5eed)));
console.log(`gun/ring: ${SECONDS} s -> ${file}`);
