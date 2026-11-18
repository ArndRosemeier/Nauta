/**
 * The title's look as data and the little arithmetic it needs (plan N7.7): the colours of sky, sea and ship at each
 * height of the sun, where things stand on a screen of any shape, where a finger puts the sun, and the seeded exchange
 * of fire a tap on the brig starts. Pure: no canvas, no DOM, so it is tested and shared by the worker that draws the
 * title and the page that listens to the finger.
 *
 * Restyling the title (N7.0's ui-style.md) means editing `SKY_KEYS` and `TITLE_LAYOUT` here, and the type in index.html.
 */
import { hash2f } from '@futuremagic/core';

/** A colour as red, green, blue, each 0..255 (sRGB, as a canvas takes it). */
export type Rgb = [number, number, number];

/** The colours of the scene at one height of the sun. */
export interface Palette {
  /** The sky at the top of the screen, a third of the way down and just over the horizon, and the horizon itself. */
  top: Rgb; mid: Rgb; low: Rgb; horizon: Rgb;
  /** The sun's disc and the glow round it (the glow also warms backlit sails and smoke). */
  sun: Rgb; glow: Rgb;
  /** The sea near the eye and far off under the horizon. */
  sea: Rgb; seaFar: Rgb;
  /** The ships, the birds: dark against the light. */
  hull: Rgb;
  /** A cloud's shaded body and its lit underside. */
  cloud: Rgb; cloudLit: Rgb;
  /** How strongly the stars show, 0..1. */
  stars: number;
}

/** A palette as written: hex colours, and the sun's height (over the horizon, as a share of the screen's height) it is for. */
interface PaletteKey {
  at: number;
  top: string; mid: string; low: string; horizon: string; sun: string; glow: string;
  sea: string; seaFar: string; hull: string; cloud: string; cloudLit: string; stars: number;
}

/**
 * The scene's colours by the sun's height: after sunset, at sunset, the golden hour and an afternoon. Between two keys
 * the colours blend; past the ends the end key holds.
 */
export const SKY_KEYS: readonly PaletteKey[] = [
  { at: -0.06, top: '#05091a', mid: '#151a38', low: '#3a2a4c', horizon: '#86423a', sun: '#ff6a2a', glow: '#d8482a', sea: '#04070e', seaFar: '#221f36', hull: '#05060b', cloud: '#231e33', cloudLit: '#a4463a', stars: 1 },
  { at: 0, top: '#0c1736', mid: '#363266', low: '#b4566a', horizon: '#ffa24c', sun: '#fff0c4', glow: '#ff8a3c', sea: '#09101f', seaFar: '#6a4a5c', hull: '#08090f', cloud: '#43355a', cloudLit: '#ff9a5c', stars: 0.4 },
  { at: 0.1, top: '#1b3a6c', mid: '#5b75a6', low: '#d89e7a', horizon: '#ffd69c', sun: '#fffbe8', glow: '#ffc072', sea: '#0e2236', seaFar: '#8c879a', hull: '#0b0f18', cloud: '#787d96', cloudLit: '#ffd2a2', stars: 0 },
  { at: 0.3, top: '#22528a', mid: '#5c8cbe', low: '#a8c4da', horizon: '#dde7ee', sun: '#ffffff', glow: '#fff1d6', sea: '#132f48', seaFar: '#7c9cb3', hull: '#101722', cloud: '#c6d0dc', cloudLit: '#ffffff', stars: 0 },
];

/** Where things stand, as shares of the screen (heights unless said), and how they move. */
export const TITLE_LAYOUT = {
  /** The horizon, down from the top. */
  horizon: 0.6,
  /** The sun at the start: across, and its height over the horizon. */
  sunX: 0.7, sunHeight: 0.035,
  /** How high and low a finger can put the sun (over the horizon), and how far in from the sides. */
  sunHighest: 0.3, sunLowest: -0.05, sunMargin: 0.06,
  /** How quickly the sun follows the finger: the time it takes to go most of the way, s. */
  sunFollow: 0.6,
  /** Left alone, the sun sinks toward the horizon this fast (share of the height per s). */
  sunSink: 0.0004,
  /** The brig: across, her waterline under the horizon, her hull's length (a share of the height, at most a share of the width). */
  shipX: 0.4, shipWater: 0.13, shipLength: 0.42, shipLengthMost: 0.34,
  /** The other brig, hull down on the horizon: across, and her length. */
  foeX: 0.83, foeLength: 0.055, foeWater: 0.004,
  /** The brig's pitch (rad) and heave (a share of the height) on the swell, and their periods, s. */
  pitch: 0.022, pitchPeriod: 7.3, heave: 0.004, heavePeriod: 5.2,
} as const;

/**
 * The brig drawn in her own units: her hull 1 long from the stem (−0.5) to the stern (0.5), y up from the waterline,
 * her bow to the left. Points are [x, y].
 */
export const BRIG = {
  /** The hull's outline: stern, counter, keel line at the water, stem, sheer back aft. */
  hull: [[0.5, 0.115], [0.53, 0.075], [0.47, 0], [-0.44, 0], [-0.5, 0.05], [-0.535, 0.105], [-0.3, 0.085], [0, 0.078], [0.3, 0.088]],
  /** The chequer band along her side and her gun ports in it (x of each port's middle). */
  bandLow: 0.045, bandHigh: 0.066, bandFrom: -0.4, bandTo: 0.42, portHalf: 0.009,
  ports: [-0.33, -0.24, -0.15, -0.06, 0.03, 0.12, 0.21, 0.3],
  /** Fore and main masts: x at the deck, the rake aft (x per unit up), and their heads: lower mast, topmast, topgallant. */
  masts: [
    { x: -0.21, rake: 0.02, heads: [0.45, 0.72, 0.92] },
    { x: 0.09, rake: 0.035, heads: [0.48, 0.78, 1.0] },
  ],
  /** The square sails of each mast, top to bottom: the yard's height and half width, the foot's height and half width. */
  sails: [
    [{ yard: 0.86, half: 0.1, foot: 0.68, footHalf: 0.13 }, { yard: 0.66, half: 0.16, foot: 0.43, footHalf: 0.2 }, { yard: 0.4, half: 0.22, foot: 0.16, footHalf: 0.24 }],
    [{ yard: 0.92, half: 0.11, foot: 0.74, footHalf: 0.14 }, { yard: 0.71, half: 0.17, foot: 0.47, footHalf: 0.21 }, { yard: 0.43, half: 0.235, foot: 0.17, footHalf: 0.25 }],
  ],
  /** How far a square sail bellies out to leeward (forward, the wind from astern), and its foot's curve up. */
  belly: 0.035, roach: 0.02,
  /** The bowsprit and jib-boom: from the stem to their ends. */
  spar: [[-0.49, 0.1], [-0.8, 0.17], [-1.0, 0.205]],
  /** The head sails: [tack (on the spar), head (on the fore mast, by its height), clew]: the jib, the fore topmast staysail. */
  jibs: [[[-0.93, 0.195], 0.74, [-0.5, 0.27]], [[-0.76, 0.165], 0.6, [-0.4, 0.22]]],
  /** The spanker: its gaff from the main mast at `throat` out to `peak`, its boom from `tack` to `clew`. */
  spanker: { throat: 0.5, peak: [0.4, 0.62], tack: 0.16, clew: [0.6, 0.15] },
  /** The pennant at the main truck: its length and how far it flutters. */
  pennant: 0.24, flutter: 0.012,
  /** Where her shrouds come down to her side: [x, y] of the channels, either side of each mast. */
  chains: 0.09, chainSpread: 0.06,
} as const;

/** The middle of the brig's hit box, in her units, and its half sizes: a tap within it fires a gun. */
const BRIG_BOX = { x: -0.15, y: 0.5, halfX: 0.75, halfY: 0.55 } as const;

/** The exchange of fire after each tap on the brig: when her gun fires, when the other brig answers, where the balls fall. */
export const EXCHANGE = {
  /** The other brig's answer, s after the shot: at least, and up to this much more. */
  answer: 2.6, answerSpread: 2,
  /** A ball's flight before it falls, s. */
  flight: 1.4,
  /** Where her ball falls: across (a share of the width) and down from the horizon (a share of the height), each from..to. */
  fallX: [0.62, 0.95], fallY: [0.005, 0.03],
  /** Where the other's ball falls short of the brig: across her (shares of the width either side) and down. */
  shortX: 0.12, shortY: [0.06, 0.12],
} as const;

/** The seeded numbers an exchange of fire draws, one for each of these. */
const DRAWN = { port: 0, fallX: 1, fallY: 2, answer: 3, answerX: 4, answerY: 5 } as const;

/** What one tap on the brig sets going. Times in s from the tap. */
export interface Exchange {
  /** Which of her ports fires. */
  port: number;
  /** Where her ball falls, as shares of the screen (x across, y down). */
  fall: [number, number];
  /** When the other brig fires back, and where her ball falls. */
  answer: number;
  answerFall: [number, number];
}

/** A seed of the title's own, so the stars, clouds and glints are the same on every load. */
export const TITLE_SEED = 0x7171e;

/** A colour's byte and the bits of one, in a hex colour. */
/** A colour written `#rrggbb`: base sixteen, a byte to each channel. */
const HEX = 16, BYTE = 0xff, BITS = 8;
const hex = (s: string): Rgb => { const n = Number.parseInt(s.slice(1), HEX); return [(n >> (BITS * 2)) & BYTE, (n >> BITS) & BYTE, n & BYTE]; };
const PALETTES = SKY_KEYS.map((k) => ({ at: k.at, top: hex(k.top), mid: hex(k.mid), low: hex(k.low), horizon: hex(k.horizon), sun: hex(k.sun), glow: hex(k.glow), sea: hex(k.sea), seaFar: hex(k.seaFar), hull: hex(k.hull), cloud: hex(k.cloud), cloudLit: hex(k.cloudLit), stars: k.stars }));
const COLOURS = ['top', 'mid', 'low', 'horizon', 'sun', 'glow', 'sea', 'seaFar', 'hull', 'cloud', 'cloudLit'] as const;

/** `a` blended toward `b` by `t` (0..1). */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return a.map((v, i) => v + (b[i] - v) * t) as Rgb;
}

/** A colour as the canvas takes it, with an opacity. */
export function css(c: Rgb, alpha = 1): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alpha})`;
}

/** The scene's colours with the sun at `height` over the horizon (a share of the screen's height). */
export function paletteAt(height: number): Palette {
  const last = PALETTES.length - 1;
  let i = 0;
  while (i < last - 1 && height > PALETTES[i + 1].at) i++;
  const a = PALETTES[i], b = PALETTES[i + 1];
  const t = Math.min(1, Math.max(0, (height - a.at) / (b.at - a.at)));
  const out = { stars: a.stars + (b.stars - a.stars) * t } as Palette;
  for (const k of COLOURS) out[k] = mix(a[k], b[k], t);
  return out;
}

/** Where the brig stands on a screen `w` × `h` px: her waterline's middle and her hull's length, px. */
export function brigPlace(w: number, h: number): { x: number; y: number; length: number } {
  const L = TITLE_LAYOUT;
  return { x: w * L.shipX, y: h * (L.horizon + L.shipWater), length: Math.min(h * L.shipLength, w * L.shipLengthMost) };
}

/** Where a finger at `x`, `y` (px on a screen `w` × `h`) puts the sun: across (px) and its height over the horizon (share of `h`). */
export function sunFromFinger(x: number, y: number, w: number, h: number): { x: number; height: number } {
  const L = TITLE_LAYOUT;
  const across = Math.min(w * (1 - L.sunMargin), Math.max(w * L.sunMargin, x));
  // Top of the screen: the sun at its highest; at the bottom, below the horizon.
  const down = Math.min(1, Math.max(0, y / h));
  return { x: across, height: L.sunHighest + (L.sunLowest - L.sunHighest) * down };
}

/** Whether a finger at `x`, `y` (px) is on the brig (her sails and hull), on a screen `w` × `h`. */
export function onBrig(x: number, y: number, w: number, h: number): boolean {
  const p = brigPlace(w, h);
  const u = (x - p.x) / p.length, v = (p.y - y) / p.length;
  return Math.abs(u - BRIG_BOX.x) <= BRIG_BOX.halfX && Math.abs(v - BRIG_BOX.y) <= BRIG_BOX.halfY;
}

/** The `n`th exchange of fire (the `n`th tap on the brig): her port, where the balls fall, when the other answers. */
export function exchange(n: number): Exchange {
  const E = EXCHANGE, D = DRAWN, r = (k: number) => hash2f(TITLE_SEED, n, k);
  const inSpan = (span: readonly number[], k: number) => span[0] + (span[1] - span[0]) * r(k);
  const ports = BRIG.ports.length, L = TITLE_LAYOUT;
  return {
    port: Math.floor(r(D.port) * ports) % ports,
    fall: [inSpan(E.fallX, D.fallX), L.horizon + inSpan(E.fallY, D.fallY)],
    answer: E.answer + E.answerSpread * r(D.answer),
    answerFall: [L.shipX + E.shortX * (r(D.answerX) * 2 - 1), L.horizon + inSpan(E.shortY, D.answerY)],
  };
}
