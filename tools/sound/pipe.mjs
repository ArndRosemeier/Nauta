#!/usr/bin/env node
/**
 * The boatswain's calls synthesised (plan N4.6): reads the calls' patterns from `pipe-calls.json` (two notes, glides,
 * plain, warbled and trilled tones) and writes each as a WAV into the raw folder (`<raw>/pipe/<name>.wav`), where
 * sounds.json takes it with `from`, so the shared make script levels and encodes it like every other take. A real call
 * is a near pure whistle of a small metal pipe: a strong fundamental, faint overtones, breath in the tone and a chiff
 * at each note's start, a little unsteady in the hand. Seeded, so the same patterns give the same files.
 *
 *   node tools/sound/pipe.mjs --raw /mnt/project-files/nauta/audio/raw
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RATE, rng, wav } from './wav.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const RAW = resolve(opt('--raw') ?? '.sound-raw');
const spec = JSON.parse(readFileSync(join(here, 'pipe-calls.json'), 'utf8'));

/** The warble: the pitch undulates this many times a second, by this share, and the loudness a little with it. */
const WARBLE_HZ = 13, WARBLE_DEPTH = 0.05, WARBLE_LOUD = 0.15;
/** The trill: the tongue breaks the sound this many times a second. */
const TRILL_HZ = 26, TRILL_LEAST = 0.3;
/** A note from silence: it speaks in this long (s), scooping up from this share under its pitch, with a chiff of breath. */
const ATTACK = 0.012, SCOOP = 0.06, SCOOP_TIME = 0.018, CHIFF = 0.22, CHIFF_TIME = 0.02;
/** A note into silence stops in this long, s: the pipe is cut off sharply. */
const RELEASE = 0.014;
/** Glides between the notes are eased and the pitch follows them with this lag, s. */
const PITCH_LAG = 0.006;
/** The hand's unsteadiness: a slow wander of the pitch by this share. */
const WANDER = 0.004;
/** Overtones (2nd, 3rd) and breath in the tone (noise round the pitch) and outside it (a faint hiss). */
const OVERTONES = [0.1, 0.025], BREATH = 0.09, BREATH_Q = 9, HISS = 0.012;
/** Two early reflections from the deck and the bulwark nearby, s and gain. */
const REFLECTIONS = [[0.007, 0.16], [0.019, 0.09]];
/** The take's peak, dBFS (the make script levels it again). */
const PEAK_DB = -1;

const ease = (u) => u * u * (3 - 2 * u);

/** Per sample: the pitch between low (0) and high (1), the tone and whether the pipe sounds; and each note's onset. */
function score(segments) {
  const n = Math.round(segments.reduce((s, g) => s + (g.rest ?? g.s), 0) * RATE);
  const u = new Float32Array(n), tone = new Array(n).fill('rest'), onset = new Float32Array(n), offset = new Float32Array(n).fill(-1);
  let i = 0;
  segments.forEach((g, k) => {
    const len = Math.round((g.rest ?? g.s) * RATE);
    const intoRest = k === segments.length - 1 || segments[k + 1].rest !== undefined;
    for (let j = 0; j < len && i < n; j++, i++) {
      if (g.rest !== undefined) continue;
      u[i] = g.note[0] + (g.note[1] - g.note[0]) * ease(j / len);
      tone[i] = g.tone;
      if (intoRest) offset[i] = (len - j) / RATE;
    }
  });
  // A note's onset counts from its first segment after a rest, through the segments that follow without one.
  let since = -1;
  for (let j = 0; j < n; j++) {
    if (tone[j] === 'rest') { since = -1; continue; }
    if (since < 0) since = 0;
    onset[j] = since;
    since += 1 / RATE;
  }
  return { n, u, tone, onset, offset };
}

function synth(call, seed) {
  const { n, u, tone, onset, offset } = score(call.segments);
  const rand = rng(seed), out = new Float32Array(n + Math.round(0.05 * RATE));
  const ratio = spec.high / spec.low;
  let phase = 0, lu = u[0], wander = 0, wanderV = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    lu += (u[i] - lu) * (1 - Math.exp(-1 / (RATE * PITCH_LAG)));
    wanderV += (rand() - 0.5) * 0.002; wanderV *= 0.999; wander = Math.max(-1, Math.min(1, wander + wanderV / RATE * 50));
    if (tone[i] === 'rest') { phase = 0; continue; }
    const on = onset[i], off = offset[i];
    let f = spec.low * Math.pow(ratio, lu) * (1 + WANDER * wander) * (1 - SCOOP * Math.exp(-on / SCOOP_TIME));
    let amp = Math.min(1, on / ATTACK) * (off >= 0 ? Math.min(1, off / RELEASE) : 1);
    if (tone[i] === 'warble') { const w = Math.sin(2 * Math.PI * WARBLE_HZ * t); f *= 1 + WARBLE_DEPTH * w; amp *= 1 - WARBLE_LOUD * (1 - w) / 2; }
    if (tone[i] === 'trill') amp *= TRILL_LEAST + (1 - TRILL_LEAST) * Math.pow(0.5 + 0.5 * Math.sin(2 * Math.PI * TRILL_HZ * t), 0.6);
    phase += (2 * Math.PI * f) / RATE;
    let s = Math.sin(phase) + OVERTONES[0] * Math.sin(2 * phase) + OVERTONES[1] * Math.sin(3 * phase);
    // Breath round the pitch: white noise through a two-pole resonator tuned to it.
    const w0 = (2 * Math.PI * f) / RATE, r = 1 - w0 / (2 * BREATH_Q), noise = rand() * 2 - 1;
    const b = noise * (1 - r) + 2 * r * Math.cos(w0) * b1 - r * r * b2;
    b2 = b1; b1 = b;
    s += BREATH * b * 6 + HISS * noise + CHIFF * noise * Math.exp(-on / CHIFF_TIME);
    out[i] += amp * s;
  }
  // The deck and the bulwark close by.
  const dry = out.slice();
  for (const [d, g] of REFLECTIONS) { const k = Math.round(d * RATE); for (let i = 0; i < dry.length - k; i++) out[i + k] += g * dry[i]; }
  const peak = out.reduce((m, v) => Math.max(m, Math.abs(v)), 0), gain = Math.pow(10, PEAK_DB / 20) / Math.max(peak, 1e-9);
  return out.map((v) => v * gain);
}

mkdirSync(join(RAW, 'pipe'), { recursive: true });
spec.calls.forEach((call, k) => {
  const file = join(RAW, `${call.id}.wav`);
  writeFileSync(file, wav(synth(call, 0x5eed + k)));
  console.log(`${call.id}: ${(call.segments.reduce((s, g) => s + (g.rest ?? g.s), 0)).toFixed(2)} s -> ${file}`);
});
