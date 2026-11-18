/**
 * A part of the game's sound at its own level (plan N7.3: the sea and wind, the ship, the crew, guns and battle, each
 * set by the player): what each part's player plays goes through its channel, which scales every sound it starts
 * and every bed it sets by the part's level. The engine's buses stay as they are (world, body, ui: where a sound is
 * heard), so a part is not a bus; the whole's level is the engine's master volume. Beds are set every frame, so a
 * change is heard at once; a one-shot already playing keeps the level it started at.
 */
import type { AudioEngine, BedOptions, PlayOptions } from '@futuremagic/audio/web';

/** What a part's player asks of the engine. */
export interface Speaker {
  readonly open: boolean;
  preload(ids: readonly string[]): void;
  play(id: string, o?: PlayOptions): boolean;
  bed(id: string, level: number, o?: BedOptions, key?: string): void;
  echo(t60: number, wet: number): void;
}

export class Channel implements Speaker {
  /** The part's level, 0..1 (the player's setting). */
  level = 1;

  constructor(private readonly engine: AudioEngine) {}

  get open(): boolean {
    return this.engine.open;
  }

  preload(ids: readonly string[]): void {
    this.engine.preload(ids);
  }

  play(id: string, o: PlayOptions = {}): boolean {
    if (this.level <= 0) return false;
    return this.engine.play(id, { ...o, gain: (o.gain ?? 1) * this.level });
  }

  bed(id: string, level: number, o?: BedOptions, key?: string): void {
    this.engine.bed(id, level * this.level, o, key);
  }

  echo(t60: number, wet: number): void {
    this.engine.echo(t60, wet);
  }
}
