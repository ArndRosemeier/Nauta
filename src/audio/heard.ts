/**
 * Sounds decided by a pure watch (the crew at work, N4.6; the sound under sail, N3.9) and played through the engine:
 * the shots to start this frame and the beds to hold, each with its place in the world (or none: all round the ear)
 * and its bus. One shape, played in one place (`playHeard`).
 */
import type { AudioEngine } from '@futuremagic/audio/web';

type Vec3 = readonly [number, number, number];

/** A sound to start: its id, where in the world, how loud, its bus and delay, s. */
export interface PlacedShot {
  readonly id: string;
  readonly at: Vec3;
  readonly ref: number;
  readonly gain: number;
  readonly bus: 'body' | 'world';
  readonly delay: number;
  /** Playback rate on top of the take's own (1 when left out). */
  readonly pitch?: number;
}

/** A bed to hold this frame, set each frame it is heard as the engine's beds are; with no place it is all round the ear. */
export interface PlacedBed {
  readonly id: string;
  readonly key: string;
  readonly level: number;
  readonly at?: Vec3;
  readonly ref?: number;
  readonly glide: number;
  readonly bus: 'body' | 'world';
}

/** What a frame gives: the sounds to start (in `shots`) and the beds to hold (in `beds`). */
export interface Heard {
  readonly shots: PlacedShot[];
  readonly beds: PlacedBed[];
}

/** Empties a frame's lists, to be filled again. */
export function clearHeard(out: Heard): void {
  out.shots.length = 0;
  out.beds.length = 0;
}

/** Plays a frame's sounds (nothing until sound has opened). */
export function playHeard(e: AudioEngine, heard: Heard): void {
  if (!e.open) return;
  for (const s of heard.shots) e.play(s.id, { at: s.at, ref: s.ref, gain: s.gain, bus: s.bus, delay: s.delay, pitch: s.pitch ?? 1 });
  for (const b of heard.beds) e.bed(b.id, b.level, { glide: b.glide, bus: b.bus, ...(b.at ? { at: b.at, ref: b.ref } : {}) }, b.key);
}
