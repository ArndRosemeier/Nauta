/**
 * Quality levels (plan N1.8): the one place for every knob that trades looks for frame time, and the choice of a
 * level from measured frame time in the first seconds. Pure: the page feeds it frame times and applies the knobs.
 *
 * A package that costs frame time adds its knob to `QualityKnobs` and a value to every level here; it never checks
 * for "tablet" itself. Nothing here tells tablet from desktop by the browser's name either (Safari on the iPad
 * says it is a Mac): every device starts at the top and steps down while it misses frames, so the iPad's
 * 2048 × 2732 screen lands where its pixels can be drawn in time. Resolution comes first, as pixels are the main
 * cost there; the other knobs give way only on the lower levels.
 *
 * Only knobs that can change without compiling a shader belong here (docs/SHADERS.md): the level changes while
 * the game runs.
 */
import { MS_PER_SECOND } from '../sim/units';

/** What a quality level sets. */
export interface QualityKnobs {
  /** Share of the device's pixels drawn along each side (1: every pixel, up to the Stage's cap of 2 per CSS pixel). */
  readonly renderScale: number;
  /** Cells along a sea tile's side (render/seaGrid.ts): 16 the densest, 8 a quarter of the vertices. */
  readonly seaCells: number;
  /** The fine sea's bands and their size in texels a side (N1.2, decided: two to four bands of 128² to 512²). */
  readonly fineSeaBands: number;
  readonly fineSeaSize: number;
  /** Her ropes cast into the sun's shadow map (N3.6): every line of the rig drawn a second time; off, the rig still throws no light leak, only its thin shadows go. */
  readonly ropeShadows: boolean;
  /** How far off a ship is first drawn as her far version, m (N2.4 crossfades over the next third of that): nearer, fewer triangles for a ship further off. */
  readonly shipFarFrom: number;
  /** A ship's wake map (render/wakeMap.ts, N2.5): 2 fills the near level and the far one (the long wake out to 256 m), 1 the near only (128 m). */
  readonly wakeLevels: number;
  /** Her sails' grids near (N3.10): 'fine' (64 × 40 cells a square sail) or 'coarse' (a quarter of the vertices); the far ship's are always coarse. */
  readonly sailGrid: 'fine' | 'coarse';
  /** Her sails cast into the sun's shadow map: their shade on her deck and on each other. */
  readonly sailShadows: boolean;
  /** The crew drawn: the near pool, the crowd's detail by distance, the animation rates (plan N4.3, src/app/crewDrawn.ts). */
  readonly crew: CrewKnobs;
  /** The share of the puffs, splinters and splash drops gunfire throws that are drawn (N5.4a, render/gunfire.ts): fewer and bigger on the lower levels. */
  readonly gunfireShare: number;
}

/**
 * What a quality level sets for the crew (plan N4.3, "How 240 men are drawn"): the near pool of full characters, the
 * crowd figures' detail by distance and every man's animation rate. Arnd's iPad numbers (the `?crew` trial) decide
 * these values; nothing else in the code does.
 */
export interface CrewKnobs {
  /** Full characters near the captain at most (the near pool, each with a living face); the rest are crowd figures. */
  readonly pool: number;
  /** Of the pool, how many keep Actors' Full level as well as Medium (a man at Full holds several times the memory). Both are set when the page loads. */
  readonly poolFull: number;
  /**
   * Seconds at least between two men dressed for the pool: dressing one (fitting his clothes to his build) is main-thread
   * work of several ms, so a crowd coming near is taken in one by one, not all in one frame.
   */
  readonly dressEvery: number;
  /** Out to here from the eye a man of her crew may be drawn as a full character, m; beyond, his crowd figure. */
  readonly poolTo: number;
  /** Out to here a full character is drawn at Actors' Full level (fingers and all), m; beyond, Medium. 0: never. */
  readonly fullTo: number;
  /** Out to each distance a man in view is animated (placed and his clip chosen) every `steps[i]`-th frame, m; beyond the last, every `steps[last]`-th. */
  readonly stepsTo: readonly number[];
  readonly steps: readonly number[];
  /** Men not seen (out of view, or in a room of hers not drawn) every this many frames. */
  readonly hiddenStep: number;
  /** Out to here from the eye men cast the sun's shadow, m: a full character by his own distance, a ship's crowd figures by her nearest man. */
  readonly shadowTo: number;
  /** Out to here a crowd figure wears his hat and hair, m; beyond, only his body and dress (no hair cards to skin). */
  readonly dressTo: number;
  /** Out to here a ship's crowd figures are drawn at all, m (the glass brings them nearer by its magnification). */
  readonly crowdTo: number;
}

export interface QualityLevel extends QualityKnobs {
  /** The level's name, as `?quality=` and the HUD give it. */
  readonly name: string;
}

/**
 * The levels, best first. Each gives up less than the next: the drawn pixels first (a 0.8 scale draws 64 % of
 * them, 0.5 a quarter, the iPad's screen at one pixel per CSS pixel), then the sea's grid and the fine sea, the
 * rig's rope shadows, her sails' grids and shadows, and how near another ship turns to her far version.
 */
export const QUALITY_LEVELS: readonly QualityLevel[] = [
  { name: 'high', renderScale: 1, seaCells: 16, fineSeaBands: 3, fineSeaSize: 256, ropeShadows: true, shipFarFrom: 130, wakeLevels: 2, sailGrid: 'fine', sailShadows: true, crew: { pool: 12, poolFull: 2, dressEvery: 0.2, poolTo: 8, fullTo: 4, stepsTo: [12, 40], steps: [1, 2, 4], hiddenStep: 8, shadowTo: 40, dressTo: 120, crowdTo: 700 }, gunfireShare: 1 },
  { name: 'medium', renderScale: 0.8, seaCells: 16, fineSeaBands: 3, fineSeaSize: 256, ropeShadows: true, shipFarFrom: 130, wakeLevels: 2, sailGrid: 'fine', sailShadows: true, crew: { pool: 10, poolFull: 1, dressEvery: 0.25, poolTo: 7, fullTo: 3, stepsTo: [10, 35], steps: [1, 2, 4], hiddenStep: 8, shadowTo: 30, dressTo: 100, crowdTo: 600 }, gunfireShare: 1 },
  { name: 'low', renderScale: 0.65, seaCells: 8, fineSeaBands: 2, fineSeaSize: 256, ropeShadows: false, shipFarFrom: 100, wakeLevels: 2, sailGrid: 'coarse', sailShadows: true, crew: { pool: 8, poolFull: 0, dressEvery: 0.35, poolTo: 6, fullTo: 0, stepsTo: [8, 30], steps: [1, 3, 6], hiddenStep: 12, shadowTo: 20, dressTo: 80, crowdTo: 500 }, gunfireShare: 0.6 },
  { name: 'lowest', renderScale: 0.5, seaCells: 8, fineSeaBands: 2, fineSeaSize: 128, ropeShadows: false, shipFarFrom: 80, wakeLevels: 1, sailGrid: 'coarse', sailShadows: false, crew: { pool: 6, poolFull: 0, dressEvery: 0.5, poolTo: 5, fullTo: 0, stepsTo: [6, 25], steps: [2, 4, 8], hiddenStep: 16, shadowTo: 12, dressTo: 60, crowdTo: 400 }, gunfireShare: 0.4 },
];

/** The frame rate a level must hold. */
export const TARGET_FPS = 60;
/** A frame that takes longer than one and a half frames at the target missed its turn (a display's vsync shows it twice), ms. */
export const LATE_FRAME_MS = (MS_PER_SECOND / TARGET_FPS) * 1.5;
/** A level holds while no more than this share of its frames are late (a dropped frame every second or so). */
export const LATE_SHARE_HELD = 0.05;
/** How long a level is measured, ms of frames: about 90 frames at the target. */
export const MEASURE_MS = 1500;
/** Frames after the start, and after each change of level, that are not measured, ms: the first frames of a level are not its own. */
export const SETTLE_MS = 500;
/** The first frames of the game, before measuring starts, ms: the loading screen fading and the first textures up. */
export const START_SETTLE_MS = 1000;
/** Percent in a share. */
const PERCENT = 100;

/** The level `name` names, as an index into QUALITY_LEVELS, or -1. */
export function levelNamed(name: string | null): number {
  return QUALITY_LEVELS.findIndex((l) => l.name === name);
}

/**
 * Chooses the level: from the top it measures one level after another and steps down while too many frames are
 * late, until one holds or the lowest is reached. `?quality=<name>` fixes a level and measures nothing.
 */
export class QualityChooser {
  /** The level now, an index into QUALITY_LEVELS. */
  level = 0;
  /** Whether the choice is made. */
  chosen = false;
  /** Why the level is what it is, for the HUD. */
  reason = 'measuring';
  private settle = START_SETTLE_MS;
  private measured = 0;
  private frames = 0;
  private late = 0;
  private readonly steps: string[] = [];

  /** `asked`: the level the address names (`?quality=`), or null to choose by measuring. */
  constructor(asked: string | null) {
    const i = levelNamed(asked);
    if (i >= 0) {
      this.level = i;
      this.chosen = true;
      this.reason = `asked for by ?quality=${asked}`;
    }
  }

  /**
   * The player's choice in the settings (plan N7.3), mid-match: a level by name fixes it, `auto` (or a name not known)
   * measures again from the top. Returns true when the level changed, so its knobs must be applied.
   */
  choose(name: string): boolean {
    const was = this.level, i = levelNamed(name);
    this.measured = 0; this.frames = 0; this.late = 0; this.steps.length = 0;
    if (i >= 0) {
      this.level = i;
      this.chosen = true;
      this.reason = `chosen in the settings`;
    } else {
      this.level = 0;
      this.chosen = false;
      this.settle = SETTLE_MS;
      this.reason = 'measuring';
    }
    return this.level !== was;
  }

  /** The knobs of the level now. */
  get knobs(): QualityLevel {
    return QUALITY_LEVELS[this.level]!;
  }

  /** One frame was drawn `ms` after the one before. Returns true when the level changed, so its knobs must be applied. */
  frame(ms: number): boolean {
    if (this.chosen || !(ms >= 0)) return false;
    if (this.settle > 0) { this.settle -= ms; return false; }
    this.measured += ms;
    this.frames++;
    if (ms > LATE_FRAME_MS) this.late++;
    if (this.measured < MEASURE_MS) return false;
    const share = this.late / this.frames, name = this.knobs.name, pct = Math.round(share * PERCENT);
    this.measured = 0; this.frames = 0; this.late = 0;
    if (share <= LATE_SHARE_HELD) return this.finish(`${name} holds ${TARGET_FPS} fps (${pct}% of frames late)`);
    this.steps.push(`${name} missed ${pct}% of frames`);
    if (this.level === QUALITY_LEVELS.length - 1) return this.finish('the lowest level, still short of the target');
    this.level++;
    this.settle = SETTLE_MS;
    this.reason = `${this.steps.join(', ')}; measuring ${this.knobs.name}`;
    return true;
  }

  /** The page was hidden (no frames are drawn then): what was measured of this level is dropped, and it settles again. */
  interrupt(): void {
    if (this.chosen) return;
    this.measured = 0; this.frames = 0; this.late = 0;
    this.settle = Math.max(this.settle, SETTLE_MS);
  }

  private finish(why: string): false {
    this.chosen = true;
    this.reason = [...this.steps, why].join(', ');
    return false;
  }
}
