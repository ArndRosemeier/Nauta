/**
 * What the violence setting shows (implementation plan N6.6, "Violence"): the same simulation at every level, only
 * what is drawn changes. Mild: men fall and are carried below, nothing more is shown. Plain (the default): the wounds
 * and the blood are seen, the killed lie where they fell. Unsparing: a gun deck in action as it was. Faces are not
 * touched: fear and pain are shown at every level (plan "Faces").
 *
 * One table (`SHOWN`) says what each level draws; the functions here turn it into what the view draws for a man hurt:
 * the blood about him (`bloodOf`), the stain on his shirt (`stained`), and whether the killed are still on deck
 * (`takenBelow`). Pure, seeded: the same fall looks the same on every machine at a level.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import type { Harm } from '../sim/rules/damage';
import type { Violence } from './settings';

/** What one level draws. */
export interface Shown {
  /** The killed lie where they fell for the rest of the fight (false: they are taken below a little after, `takenBelow`). */
  readonly bodies: boolean;
  /** The blood under a man killed or badly hurt where he lies: its radius when grown, m (0: none). */
  readonly pool: number;
  /** A man lightly wounded leaves drops where he was struck: their radius, m (0: none). */
  readonly drops: number;
  /** Spatter about a man struck down: how many splashes (0: none). */
  readonly spatter: number;
  /** The men carrying a wounded man below leave a trail of drops behind them. */
  readonly trail: boolean;
  /** How far his shirt is stained, 0..1, by how badly he is hurt: wounded, badly, killed. */
  readonly stain: readonly [wounded: number, badly: number, killed: number];
}

/** The levels' table. */
export const SHOWN: Readonly<Record<Violence, Shown>> = {
  mild: { bodies: false, pool: 0, drops: 0, spatter: 0, trail: false, stain: [0, 0, 0] },
  plain: { bodies: true, pool: 0.5, drops: 0.1, spatter: 0, trail: false, stain: [0.45, 0.75, 0.75] },
  unsparing: { bodies: true, pool: 0.95, drops: 0.22, spatter: 4, trail: true, stain: [0.8, 1, 1] },
};

/** At the mild level a man killed lies this long before his shipmates take him below, s (the time the badly wounded wait for their bearers). */
export const LAID_SECONDS = 6;
/** And is carried out of sight over this long, s (a fade: no man is gone in one frame). */
export const TAKEN_SECONDS = 2.5;

/** How much of a man drawn is gone from the deck, 0 (all of him) to 1 (taken below), `lying` seconds after he was killed. */
export function takenBelow(level: Violence, harm: Harm | null, lying: number): number {
  if (SHOWN[level].bodies || harm !== 'killed') return 0;
  return Math.min(1, Math.max(0, (lying - LAID_SECONDS) / TAKEN_SECONDS));
}

/** One splash of blood on the deck: where from the man's feet (ship space, m), how wide it grows, how stretched, and how long it takes. */
export interface Pool {
  readonly dx: number;
  readonly dz: number;
  /** Radius when grown, m. */
  readonly r: number;
  /** Its other axis against its radius (1: round). */
  readonly aspect: number;
  /** Turned about y, rad. */
  readonly yaw: number;
  /** Seconds it takes to grow, from the fall. */
  readonly grow: number;
}

/** A pool under a man killed grows over this long, s; a lightly wounded man's drops and spatter in a moment. */
const POOL_GROWS = 20;
const SPLASH_GROWS = 1.5;
/** A pool is this much wider or narrower than the level's radius, ±, and at most this stretched. */
const POOL_SPREAD = 0.2;
const POOL_STRETCH = 0.35;
/** Spatter lands this far from him, m, as wide as this, m. */
const SPATTER_NEAR = 0.4;
const SPATTER_FAR = 1.4;
const SPATTER_WIDTH = [0.05, 0.14] as const;
/** The seed of every fall's blood. */
const BLOOD_SEED = 1815;
const TURN = Math.PI * 2;

/**
 * The blood about a man struck down or wounded (`harm`, his own `seed`): under him where he lies if badly hurt or killed,
 * drops where a wounded man was struck, spatter round a fall at the levels that show it. None at the mild level.
 */
export function bloodOf(level: Violence, harm: Harm, seed: number): readonly Pool[] {
  const shown = SHOWN[level], rng = new Rng(deriveSeed(BLOOD_SEED, seed, harm));
  const out: Pool[] = [];
  if (harm === 'wounded') {
    if (shown.drops > 0) out.push({ dx: 0, dz: 0, r: shown.drops * rng.range(1 - POOL_SPREAD, 1 + POOL_SPREAD), aspect: 1, yaw: rng.range(0, TURN), grow: SPLASH_GROWS });
    return out;
  }
  if (shown.pool > 0) out.push({ dx: 0, dz: 0, r: shown.pool * rng.range(1 - POOL_SPREAD, 1 + POOL_SPREAD), aspect: rng.range(1 - POOL_STRETCH, 1), yaw: rng.range(0, TURN), grow: POOL_GROWS });
  for (let i = 0; i < shown.spatter; i++) {
    const a = rng.range(0, TURN), d = rng.range(SPATTER_NEAR, SPATTER_FAR);
    out.push({ dx: Math.cos(a) * d, dz: Math.sin(a) * d, r: rng.range(...SPATTER_WIDTH), aspect: rng.range(1 - POOL_STRETCH, 1), yaw: a, grow: SPLASH_GROWS });
  }
  return out;
}

/** A drop of the trail the bearers of a wounded man leave: its radius, m, and how far apart they fall along the way, m. */
export const TRAIL_DROP = 0.07;
export const TRAIL_EVERY = 1.1;

/** The colour of blood dried on cloth, sRGB. */
const BLOOD_CLOTH = [0x4a, 0x0c, 0x0a] as const;
const HEX = 16;
const BYTE = 255;
/** Bits a colour channel sits up in the number: green over blue, red over green. */
const GREEN_SHIFT = 8;
const RED_SHIFT = 16;

/** How far a man's shirt is stained at a level for how badly he is hurt (0: not at all). */
export function stainOf(level: Violence, harm: Harm | null): number {
  return harm === null ? 0 : SHOWN[level].stain[['wounded', 'badly', 'killed'].indexOf(harm)]!;
}

/** `colour` (sRGB hex) stained by `amount` (0..1) toward blood. */
export function stained(colour: string, amount: number): string {
  const n = parseInt(colour.slice(1), HEX), k = Math.min(1, Math.max(0, amount));
  const channel = (shift: number, blood: number) => Math.round(((n >> shift) & BYTE) * (1 - k) + blood * k);
  const [b, g, r] = [channel(0, BLOOD_CLOTH[2]), channel(GREEN_SHIFT, BLOOD_CLOTH[1]), channel(RED_SHIFT, BLOOD_CLOTH[0])];
  return `#${[r, g, b].map((c) => c.toString(HEX).padStart(2, '0')).join('')}`;
}
