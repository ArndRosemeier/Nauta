/**
 * Water in her (pure, implementation plan N6.2): how fast the sea comes in at her shot holes, what the pumps take out,
 * how the water inside lies as she heels, and what it weighs where (for floating, motion.ts). damage.ts keeps the water
 * (`Damage.flooded`) and calls these; nothing here changes anything.
 *
 * Her inside is measured once from the plan (`insideBreadth`, from her bottom up to her weather deck): how much water
 * stands to a height, and where its middle is. The water is kept as two halves, larboard and starboard of her middle
 * line: the sea at a hole comes into its side's half, and the halves run toward the level as she heels (rules/damage.ts
 * `CROSS_SECONDS`), so a hole on one side lists her that way, and water left in her runs to the low side as she rolls.
 * Places are the plan's (along, across, height above her base, m).
 */
import { AT_WATERLINE, CROSS_SECONDS, DISCHARGE, PUMPING, RAGGED } from '../rules/damage';
import { SHOT, type ShotKind } from '../rules/guns';
import { LOAD_WATERLINE, SEA_WATER, type GunKind } from '../rules/ships';
import { designWaterline, displacedVolume, HULL_AFT, HULL_FORE, hullBottom, sheer } from '../ship/hull';
import { UNBURDENED, type Burden } from '../ship/motion';
import { insideBreadth } from '../ship/plan';
import { GRAVITY, STEP_SECONDS } from '../units';

/** The steps her inside is measured in, m: along her, and up. */
const MEASURE_ALONG = 0.1;
const MEASURE_UP = 0.05;
/** The parallel sinkings her displacement is measured at, m (up to a little past her deck's edge). */
const SINKING_STEP = 0.25;
const SINKINGS = 8;
/** A half's middle stands this share of the surface's breadth out from her middle line (the middle of a box's half). */
const HALF_MIDDLE = 1 / 4;
/** A round opening's area over its diameter squared (π/4). */
const ROUND_AREA = Math.PI / 4;
/** tan x ≈ x + x³ × TAN_CUBE: her heel's tangent without an arc function (every engine rounds + and × alike). */
const TAN_CUBE = 1 / 3;

/** Her inside by height: at each height (from `low`, every MEASURE_UP) the water's volume below it (m³), its height's and its along's moments (m⁴), and the breadth of its surface at her middle (m). */
interface Inside {
  readonly low: number;
  readonly volume: Float64Array;
  readonly upMoment: Float64Array;
  readonly alongMoment: Float64Array;
  readonly breadth: Float64Array;
}
let inside: Inside | null = null;

function measureInside(): Inside {
  let low = Infinity, high = -Infinity;
  for (let a = HULL_AFT; a <= HULL_FORE; a += MEASURE_ALONG) { low = Math.min(low, hullBottom(a)); high = Math.max(high, sheer(a)); }
  const n = Math.ceil((high - low) / MEASURE_UP) + 1;
  const volume = new Float64Array(n), upMoment = new Float64Array(n), alongMoment = new Float64Array(n), breadth = new Float64Array(n);
  for (let k = 1; k < n; k++) {
    const h = low + (k - 1 / 2) * MEASURE_UP;
    let layer = 0, along = 0;
    for (let a = HULL_AFT; a <= HULL_FORE; a += MEASURE_ALONG) {
      const area = 2 * insideBreadth(a, h) * MEASURE_ALONG * MEASURE_UP;
      layer += area;
      along += area * a;
    }
    volume[k] = volume[k - 1]! + layer;
    upMoment[k] = upMoment[k - 1]! + layer * h;
    alongMoment[k] = alongMoment[k - 1]! + along;
    breadth[k] = 2 * insideBreadth(0, low + k * MEASURE_UP);
  }
  return { low, volume, upMoment, alongMoment, breadth };
}

/** How water of `tonnes` lies in her when level: its surface's height, its middle's height and along, and its surface's breadth (m). */
export interface Lying {
  readonly level: number;
  readonly h: number;
  readonly along: number;
  readonly breadth: number;
}

/** How `tonnes` of sea water lie in her, level. */
export function lyingOf(tonnes: number): Lying {
  const t = (inside ??= measureInside()), v = Math.max(0, tonnes) / SEA_WATER, last = t.volume.length - 1;
  if (v <= 0) return { level: t.low, h: t.low, along: 0, breadth: 0 };
  let lo = 0, hi = last;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (t.volume[mid]! < v) lo = mid; else hi = mid; }
  const f = Math.min(1, (v - t.volume[lo]!) / (t.volume[hi]! - t.volume[lo]! || 1));
  const between = (x: Float64Array) => x[lo]! + (x[hi]! - x[lo]!) * f;
  const vol = between(t.volume);
  return { level: t.low + (lo + f) * MEASURE_UP, h: between(t.upMoment) / vol, along: between(t.alongMoment) / vol, breadth: between(t.breadth) };
}

/** The water in her, `larboard` and `starboard` halves (t), as what she carries (motion.ts `Burden`, ship space): each half's middle a quarter of the surface's breadth out from her middle line. */
export function loadOf(larboard: number, starboard: number): Burden {
  const tonnes = larboard + starboard;
  if (!(tonnes > 0)) return UNBURDENED;
  const l = lyingOf(tonnes);
  return { tonnes, x: ((starboard - larboard) / tonnes) * l.breadth * HALF_MIDDLE, y: l.h - LOAD_WATERLINE, z: -l.along };
}

/** The sea's flow in at one hole, t/s: its ball's opening (rules/damage.ts `RAGGED`), `depth` m under the sea outside, `over` m of water inside standing over it. */
export function inflow(shot: ShotKind, gun: GunKind, depth: number, over = 0): number {
  const head = depth - Math.max(0, over);
  if (!(head > 0)) return 0;
  const d = SHOT[shot].diameter[gun] * RAGGED;
  return DISCHARGE * (ROUND_AREA * d * d) * Math.sqrt(2 * GRAVITY * head) * SEA_WATER;
}

/** What one pump fully manned clears, t/s: the sea coming in at `PUMPING.holds` 32-pound shot holes at her waterline. */
export const pumpRate = (): number => PUMPING.holds * inflow('round', 'carronade', AT_WATERLINE);

/** What the pumps clear, t/s, worked by `men` (each pump fully manned by PUMPING.hands), while more than PUMPING.least lies in her. */
export function pumped(men: number, tonnes: number): number {
  if (tonnes <= PUMPING.least) return 0;
  return (Math.min(PUMPING.count * PUMPING.hands, Math.max(0, men)) / PUMPING.hands) * pumpRate();
}

/**
 * The water's halves one step on: `inLarboard` and `inStarboard` t/s coming in at each side's holes, `out` t/s pumped
 * from the well (from both halves as they hold), and the halves running toward the level for her heel (`roll`, rad,
 * starboard down): level, the half on the low side holds more by her breadth over the water's mean depth.
 */
export function flowed(larboard: number, starboard: number, inLarboard: number, inStarboard: number, out: number, roll: number): [number, number] {
  let l = larboard + inLarboard * STEP_SECONDS, s = starboard + inStarboard * STEP_SECONDS;
  const total = l + s;
  if (!(total > 0)) return [0, 0];
  const taken = Math.min(total, out * STEP_SECONDS), keep = (total - taken) / total;
  l *= keep; s *= keep;
  const left = l + s;
  if (!(left > 0)) return [0, 0];
  // Level at this heel: a box of the water's surface breadth and mean depth holds breadth·tan(roll)/(4·depth) more of its water on the low side.
  const lie = lyingOf(left), depth = Math.max(MEASURE_UP, lie.level - lie.h) * 2;
  const tilt = roll * (1 + roll * roll * TAN_CUBE);
  const want = Math.max(-1, Math.min(1, (lie.breadth * tilt * HALF_MIDDLE) / depth)) * left;
  const moved = ((want - (s - l)) / 2) * Math.min(1, STEP_SECONDS / CROSS_SECONDS);
  return [l - moved, s + moved];
}

/** Her sinkings (m, every SINKING_STEP) and the water that sinks her so far (t), measured once. */
let sinkings: Float64Array | null = null;
function sinkingTable(): Float64Array {
  if (sinkings) return sinkings;
  const v0 = displacedVolume(), out = new Float64Array(SINKINGS + 1);
  for (let k = 1; k <= SINKINGS; k++) out[k] = (displacedVolume((a) => designWaterline(a) + k * SINKING_STEP) - v0) * SEA_WATER;
  sinkings = out;
  return out;
}

/** How far water of `tonnes` sinks her bodily in calm water, m (her displacement measured from her lines). */
export function sinkingFor(tonnes: number): number {
  const t = sinkingTable();
  for (let k = 1; k < t.length; k++) if (tonnes <= t[k]!) return (k - 1 + (tonnes - t[k - 1]!) / (t[k]! - t[k - 1]!)) * SINKING_STEP;
  return SINKINGS * SINKING_STEP;
}

let founders: number | null = null;
/** The water that founders her, t: enough to sink her bodily until the lowest edge of her deck meets the calm sea (then it pours in over her side and down her hatches). */
export function founderTonnes(): number {
  if (founders !== null) return founders;
  let low = Infinity;
  for (let a = HULL_AFT; a <= HULL_FORE; a += MEASURE_ALONG) low = Math.min(low, sheer(a) - designWaterline(a));
  const t = sinkingTable(), k = Math.min(SINKINGS - 1, Math.floor(low / SINKING_STEP)), f = low / SINKING_STEP - k;
  founders = t[k]! + (t[k + 1]! - t[k]!) * f;
  return founders;
}
