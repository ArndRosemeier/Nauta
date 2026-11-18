/**
 * Her wake, pure (plan N2.5): what the GPU's wake map (wakeMap.ts) is drawn from, and the reference for its sums.
 *
 *  - `kelvinAt`: the waves a moving point of pressure leaves on deep water (Kelvin's pattern), by stationary phase:
 *    behind it, inside the wedge of 19.47° either side of its track, every point has two waves, the transverse one
 *    and the divergent one, each a plane wave of the wavenumber g/U² · sec²θ. Where the two meet (the cusp line)
 *    the sum is held to Airy's height instead of growing without end; outside the wedge it dies away. The pressure
 *    point's size takes out waves much shorter than her bow, so the pattern needs no finer sampling than the map's.
 *    Her bow is a source and her stern a sink: the two patterns cross, which is why her waves grow and shrink with
 *    speed as a real hull's do.
 *  - `Track`: where she has been, a point a second, with how fast she went and how much she churned the water: the
 *    map lays the wake along this line, so her wake bends where she turned and stays on the water she passed over.
 *  - `ChurnWatch`: the water against her side at stations along her waterline: how fast it rises and falls on her
 *    hull (her heave, pitch and roll against the waves), which whitens the water at her side and, at the bow, makes
 *    the spray when she slams; and how high it has wetted her side, draining down after.
 */
import { smoothstep } from '@futuremagic/core';
import { GRAVITY, STEP_SECONDS, apartOnWater } from '../sim/units';
import { surfaceAt, seaSample, type SeaState } from '../sim/sea/sea';
import { shipBody, toWorld, type ShipPose } from '../sim/ship/motion';
import { designWaterline, hullEnds, hullHalfBreadth } from '../sim/ship/hull';
import { shipY, shipZ } from '../sim/ship/section';
import { LOAD_WATERLINE, PLANKING } from '../sim/rules/ships';

/** A turn, rad. */
const TURN = 2 * Math.PI;
/** The least value a length or a wavenumber is taken as (keeps divisions sane). */
const TINY = 1e-6;
/** Where each number of a list's vec4 sits. */
const X = 0, Y = 1, Z = 2, W = 3;

// --- Kelvin's pattern.
/** The cusp line: tan of the wedge's half angle squared is 1/8 (19.47°). */
const WEDGE = 8;
/**
 * Where the two waves meet, stationary phase's height grows without end; Airy's integral holds it at about
 * (k₀s)^(−1/3) instead of (k₀s)^(−1/2): the curvature of the phase is never taken as less than this times (k₀s)^(2/3).
 */
export const KELVIN_CUSP = 3;
/** Outside the wedge the waves die away as Airy's tail does: e^(−TAIL · k₀s · (8t² − 1)^1.5). */
export const KELVIN_TAIL = 6;
/** The pattern grows in over the first part of a wavelength behind the source (k₀s, rad); the bow's own wave is there. */
export const KELVIN_NEAR = 2.5;
/** The divergent wave's slope tanθ is held below this: beyond it its wavenumber is far too short for any source's size. */
const STEEPEST = 20;
/** Stationary phase's quarter-turn shift, rad. */
const QUARTER = Math.PI / 4;
/** Airy's tail's power, and the cusp's: the phase's curvature there grows as (k₀s)^(2/3). */
const TAIL_POWER = 1.5;
const CUSP_POWER = 2 / 3;
/** The cap joins stationary phase sharply (as a 4-norm), so it changes nothing away from the cusp. */
const CUSP_NORM = 4;
/** The roots of 2t·p² + p + t = 0 (the stationary points' tanθ) have 4t below them. */
const ROOT_BELOW = 4;
/** The phase's second derivative: secθ·(s·(2p² + 1) + y·p·(6p² + 5)). */
const CURVE_CUBIC = 6;
const CURVE_LINEAR = 5;
/** A source of size b passes a wavenumber k as e^(−(kb)²/4). */
const SIZE_SPREAD = 4;

/** One wave of the pattern at a point: its height and slope along s and y. */
export interface KelvinWave {
  height: number;
  alongS: number;
  alongY: number;
}

/**
 * Kelvin's pattern of a unit source at a point `s` m behind it along its track and `y` m to the side (starboard +),
 * the source moving at a speed whose g/U² is `k0` (1/m), its size `size` m (waves much shorter than it are not
 * made). Height in units of the source's strength; slope along s and y (1/m times that). Zero ahead of it (s ≤ 0).
 */
export function kelvinAt(s: number, y: number, k0: number, size: number, out: KelvinWave = { height: 0, alongS: 0, alongY: 0 }): KelvinWave {
  out.height = 0; out.alongS = 0; out.alongY = 0;
  if (!(s > 0)) return out;
  const ay = Math.abs(y), side = y < 0 ? -1 : 1, t = ay / s, ks = k0 * s;
  const d2 = 1 - WEDGE * t * t, d = Math.sqrt(Math.max(d2, 0));
  const tail = d2 < 0 ? Math.exp(-KELVIN_TAIL * ks * (-d2) ** TAIL_POWER) : 1;
  const near = smoothstep(0, KELVIN_NEAR, ks);
  const least = KELVIN_CUSP * ks ** CUSP_POWER;
  for (let branch = 0; branch < 2; branch++) {
    // tanθ at the stationary point: the transverse wave's (small), then the divergent wave's (steep).
    const p = branch === 0 ? (-2 * t) / (1 + d) : Math.max(-STEEPEST, -(1 + d) / (ROOT_BELOW * Math.max(t, TINY)));
    const sec = Math.sqrt(1 + p * p), k = k0 * (1 + p * p);
    const f = sec * (s + ay * p), f2 = sec * (s * (2 * p * p + 1) + ay * p * (CURVE_CUBIC * p * p + CURVE_LINEAR));
    const kf2 = k0 * f2, amp = Math.sqrt(TURN / (kf2 ** CUSP_NORM + least ** CUSP_NORM) ** (1 / CUSP_NORM));
    const filtered = Math.exp(-((k * size) ** 2) / SIZE_SPREAD);
    const phase = k0 * f + Math.sign(f2) * QUARTER, a = near * tail * amp * filtered;
    out.height += a * Math.cos(phase);
    // The phase's gradient at a stationary point is the wave's own wavenumber: k₀·secθ·(1, tanθ).
    const sn = -a * Math.sin(phase) * k0 * sec;
    out.alongS += sn;
    out.alongY += sn * p * side;
  }
  return out;
}

/** g/U², 1/m, for a speed (held above a crawl, where she makes no waves anyway). */
export const kelvinWavenumber = (speed: number): number => GRAVITY / Math.max(speed * speed, WAKE.crawl * WAKE.crawl);

/** The water's height that a speed's dynamic pressure stands for, U²/2g, m: what her bow wave and wake scale with. */
export const speedHead = (speed: number): number => (speed * speed) / (2 * GRAVITY);

/**
 * The wake's tuning (first proposals, judged by eye on the iPad): heights as shares of U²/2g, lengths in m, times in s.
 */
export const WAKE = {
  /** Below this speed, m/s, she makes no waves to speak of (a crawl). */
  crawl: 0.3,
  /** The speed her wake is reckoned against, m/s (11 knots, about her best). */
  top: 5.7,
  /** Kelvin's pattern from her bow (a source) and her stern (a sink), as shares of U²/2g. */
  bowSource: 0.22,
  sternSink: 0.06,
  /** The size of the pressure that makes her waves, m: about half her bow's breadth at the waterline. */
  sourceSize: 1.4,
  /** Her bow wave: its height at the stem, how fast it falls aft, how far it spreads out from her side as it goes aft (tan) and how wide its crest is. */
  bowRise: 0.45,
  bowReach: 6,
  bowSpread: 0.38,
  bowWidth: 0.7,
  bowWiden: 0.08,
  /** The hollow along her middle body and the rise under her quarters, as shares of U²/2g, and how far each reaches out from her side, m. */
  shoulderDip: 0.12,
  quarterRise: 0.1,
  sideReach: 2.5,
  /** How much more her lee bow (the side she is making leeway toward) piles the water, per unit of leeway over way. */
  leewayPush: 3,
  /** The bow wave breaks white from this height, m, fully white this much higher. */
  bowFoamFrom: 0.12,
  bowFoamRamp: 0.35,
  /** Foam close along her side: how far out it reaches, m; how white a churn of 1 m/s makes it; and how white her way alone makes it at her top speed. */
  ringReach: 0.6,
  ringChurn: 0.8,
  ringSpeed: 0.55,
  /** The turbulent water behind her: its width at her stern as a share of her breadth, how it widens (its width grows with √(age / this), s), how long it stays white and how long it stays slick, s. */
  stripStart: 0.8,
  stripSpread: 8,
  stripLife: 10,
  /** How white the turbulent water and the bow wave's arms are at their freshest (never one white sheet: lace and patches). */
  stripWhite: 0.5,
  armWhite: 0.45,
  /** How much whiter behind her a churn of 1 m/s at her side makes them (the churn mostly whitens the water along her, the ring). */
  trailChurn: 0.25,
  slickLife: 150,
  /** The slick spreads wider than the white: its width as a share of the strip's. */
  slickWider: 1.2,
  /** How far to windward the slick lies when she makes leeway, as a share of her half length, per unit of leeway over way. */
  slickWindward: 0.8,
  /** The foam her bow wave leaves along its arms, how long it stays, s. */
  armLife: 9,
  /** Foam younger than this is fresh (white, dense); older, a thinning lace, s. */
  freshAge: 1.5,
  /** Her waves fade on the water behind her over this time, s (beyond the 1/√distance stationary phase gives). */
  waveLife: 180,
};

// --- Her hull as the wake sees it.
/** Her stem and sternpost at the load waterline, m forward of the mainmast, and her centre of gravity's place. */
const ENDS = hullEnds(LOAD_WATERLINE);
/** Her half-breadth at the waterline amidships, outside her planking, m. */
export const WATERLINE_HALF = hullHalfBreadth(0, LOAD_WATERLINE) + PLANKING.side;
/** Her bow and stern as sources of waves, m ahead of and abaft her centre of gravity (where the track runs). */
export const BOW_AHEAD = -shipBody().centreZ < ENDS.fore ? ENDS.fore + shipBody().centreZ : 0;
export const STERN_ABAFT = -ENDS.aft - shipBody().centreZ;
/** Her stem's and sternpost's ship-space z at the waterline. */
export const STEM_Z = shipZ(ENDS.fore);
export const STERN_Z = shipZ(ENDS.aft);
/** Her half length on the waterline, m. */
export const HALF_LENGTH = (ENDS.fore - ENDS.aft) / 2;

// --- Where she has been.
/** The track keeps a point every this many seconds, and this many of them (about a minute and a half of her way). */
export const TRACK_EVERY = 1;
export const TRACK_POINTS = 96;
/** Room in the map's lists: the kept points, where she is now, and a point ahead of her bow (so the water alongside her has a track beside it). */
export const TRACK_SLOTS = TRACK_POINTS + 2;
/** The point ahead of her bow lies this far beyond it, m. */
const AHEAD_OF_BOW = 12;

/** A point of her track: where (world x, z), when (s), how far she had come (m), and what she was doing there. */
interface TrackPoint {
  x: number;
  z: number;
  time: number;
  run: number;
  speed: number;
  bowChurn: number;
  sideChurn: number;
  /** Her leeway over her way then (+: making leeway to starboard). */
  drift: number;
  /** The direction she moved over the water then (unit, world x and z). */
  dirX: number;
  dirZ: number;
}

/** Numbers per point in each of the map's three lists (vec4s). */
export const TRACK_STRIDE = 4;

/** Her track as the map reads it: per slot, newest first, relative to the sea's origin. */
export interface TrackLists {
  /** x, z (from the sea's origin), m behind her centre of gravity along the track, s since she was there. */
  readonly place: Float32Array;
  /** Her speed (m/s), churn at the bow and along her side (m/s), leeway over way. */
  readonly doing: Float32Array;
  /** The direction she moved (world x, z), and two unused. */
  readonly heading: Float32Array;
  /** Slots filled. */
  count: number;
}

/** What the track needs of her each frame. */
export interface WakeSource {
  readonly pose: ShipPose;
  /** Her way through the water: ahead and leeway (to starboard), m/s, and her heading. */
  readonly ahead: number;
  readonly leeway: number;
  readonly bowChurn: number;
  readonly sideChurn: number;
}

export class Track {
  private readonly points: TrackPoint[] = [];
  private run = 0;
  private last: TrackPoint | null = null;
  readonly lists: TrackLists = {
    place: new Float32Array(TRACK_SLOTS * TRACK_STRIDE), doing: new Float32Array(TRACK_SLOTS * TRACK_STRIDE),
    heading: new Float32Array(TRACK_SLOTS * TRACK_STRIDE), count: 0,
  };

  /** Forgets where she has been (a scene set afresh). */
  clear(): void {
    this.points.length = 0;
    this.run = 0;
    this.last = null;
  }

  /** She is where `src` says at time `t`: keeps a point when one is due, and lays out the lists from the sea's origin (ox, oz). */
  follow(src: WakeSource, t: number, ox: number, oz: number): TrackLists {
    const now = this.pointOf(src, t);
    const kept = this.points[0];
    if (!kept || t - kept.time >= TRACK_EVERY || t < kept.time) {
      if (kept && t < kept.time) this.clear();
      this.points.unshift(now);
      if (this.points.length > TRACK_POINTS) this.points.pop();
    }
    return this.lay(now, ox, oz);
  }

  private pointOf(src: WakeSource, t: number): TrackPoint {
    const p = src.pose, last = this.last;
    if (last) this.run += apartOnWater(p, last);
    // Her heading as a direction on the water (bearing 0 north = −z), turned by her leeway.
    const fx = Math.sin(p.heading), fz = -Math.cos(p.heading), speed = Math.hypot(src.ahead, src.leeway);
    let dirX = fx, dirZ = fz;
    if (speed > WAKE.crawl) { dirX = (fx * src.ahead - fz * src.leeway) / speed; dirZ = (fz * src.ahead + fx * src.leeway) / speed; }
    const point: TrackPoint = {
      x: p.x, z: p.z, time: t, run: this.run, speed, bowChurn: src.bowChurn, sideChurn: src.sideChurn,
      drift: src.ahead > WAKE.crawl ? src.leeway / src.ahead : 0, dirX, dirZ,
    };
    this.last = point;
    return point;
  }

  /** The lists: a point ahead of her bow, where she is, then the kept points from the newest. */
  private lay(now: TrackPoint, ox: number, oz: number): TrackLists {
    const L = this.lists;
    let n = 0;
    const put = (q: TrackPoint, x: number, z: number, behind: number, ago: number) => {
      const at = n++ * TRACK_STRIDE;
      L.place[at + X] = x - ox; L.place[at + Y] = z - oz; L.place[at + Z] = behind; L.place[at + W] = ago;
      L.doing[at + X] = q.speed; L.doing[at + Y] = q.bowChurn; L.doing[at + Z] = q.sideChurn; L.doing[at + W] = q.drift;
      L.heading[at + X] = q.dirX; L.heading[at + Y] = q.dirZ;
    };
    const ahead = BOW_AHEAD + AHEAD_OF_BOW;
    put(now, now.x + now.dirX * ahead, now.z + now.dirZ * ahead, -ahead, 0);
    put(now, now.x, now.z, 0, 0);
    for (const q of this.points) {
      if (q === now) continue;
      put(q, q.x, q.z, now.run - q.run, now.time - q.time);
    }
    L.count = n;
    return L;
  }
}

// --- The water against her side.
/** Stations along her waterline each side, from just forward of her sternpost to just abaft her stem. */
export const CHURN_STATIONS = 16;
/** How far in from her ends the first and last stations stand, m. */
const STATION_INSET = 0.4;
/** A churn of water fades over this time once the hull stops working the water there, s. */
const CHURN_FADE = 2.5;
/** The wetted line drains down her side at this rate, m/s. */
const DRAIN_RATE = 0.12;
/** The bow slams when the water climbs her stem faster than this, m/s; and the stations forward of this share of her length count as her bow. */
export const SLAM_RATE = 1.6;
/** Steps one frame may catch up; after a longer gap the watch starts afresh. */
const CATCH_UP_STEPS = 8;
const BOW_SHARE = 0.8;

/** One station: where on her (ship space), and the water there. */
interface Station {
  readonly along: number;
  readonly point: readonly [number, number, number];
  depth: number;
  churn: number;
  wet: number;
}

/** A slam at her bow: where (world) and how hard (how fast the water climbed her stem, m/s). */
export interface Slam {
  readonly at: readonly [number, number, number];
  readonly rate: number;
  readonly side: number;
}

/**
 * The water at stations along her waterline, port then starboard: how fast it rises and falls against her hull (its
 * churn, faded over a few seconds), how high it has wetted her (draining down), and slams at her bow.
 */
export class ChurnWatch {
  readonly stations: Station[] = [];
  /** Each station's ship-space z, churn (m/s), wetted height over its waterline point (m) and that point's ship-space y, port then starboard: CHURN_STATIONS × 2 × 4 numbers. */
  readonly lists = new Float32Array(CHURN_STATIONS * 2 * TRACK_STRIDE);
  private readonly sample = seaSample();
  private readonly world: [number, number, number] = [0, 0, 0];
  private first = true;
  /** The clock's time of the last step watched (NaN until the first). */
  private at = Number.NaN;

  constructor() {
    for (const side of [-1, 1]) for (let i = 0; i < CHURN_STATIONS; i++) {
      const along = ENDS.aft + STATION_INSET + ((ENDS.fore - ENDS.aft - 2 * STATION_INSET) * i) / (CHURN_STATIONS - 1);
      const h = designWaterline(along), half = hullHalfBreadth(along, h) + PLANKING.side;
      this.stations.push({ along, point: [side * half, shipY(h), shipZ(along)], depth: 0, churn: 0, wet: 0 });
    }
  }

  /**
   * Once a frame, with her drawn at `pose` on `sea` at the clock's `t`: as many steps of the simulation's length as
   * the clock has gone on (a jump of it, or a clock run back, starts the watch afresh); slams are added to `slams`.
   */
  keepUp(pose: ShipPose, sea: SeaState, t: number, slams: Slam[] = []): Slam[] {
    if (!(t >= this.at && t - this.at < CATCH_UP_STEPS * STEP_SECONDS)) {
      this.at = t - STEP_SECONDS;
      this.first = true;
    }
    while (this.at + STEP_SECONDS <= t) {
      this.at += STEP_SECONDS;
      this.watch(pose, sea, this.at, slams);
    }
    return slams;
  }

  /** One step of the simulation's length with her at `pose` on `sea` at `t`: the churn, the wet line, and any slams. */
  watch(pose: ShipPose, sea: SeaState, t: number, slams: Slam[] = []): Slam[] {
    const fade = Math.exp(-STEP_SECONDS / CHURN_FADE), bowFrom = ENDS.aft + BOW_SHARE * (ENDS.fore - ENDS.aft);
    this.stations.forEach((s, i) => {
      const w = toWorld(pose, s.point[0], s.point[1], s.point[2], this.world);
      const depth = surfaceAt(sea, w[X], w[Z], t, this.sample).height - w[Y];
      const rate = this.first ? 0 : (depth - s.depth) / STEP_SECONDS;
      s.depth = depth;
      s.churn = Math.max(Math.abs(rate), s.churn * fade);
      s.wet = Math.max(depth, s.wet - DRAIN_RATE * STEP_SECONDS, 0);
      if (rate > SLAM_RATE && s.along >= bowFrom) slams.push({ at: [w[0], w[1] + depth, w[2]], rate, side: Math.sign(s.point[0]) });
      const at = i * TRACK_STRIDE;
      this.lists[at + X] = s.point[Z]; this.lists[at + Y] = s.churn; this.lists[at + Z] = s.wet; this.lists[at + W] = s.point[Y];
    });
    this.first = false;
    return slams;
  }

  /** The most churn at her bow and the mean along her sides now, m/s (what her track keeps). */
  churnNow(): { bow: number; side: number } {
    const bowFrom = ENDS.aft + BOW_SHARE * (ENDS.fore - ENDS.aft);
    let bow = 0, side = 0;
    for (const s of this.stations) {
      if (s.along >= bowFrom) bow = Math.max(bow, s.churn);
      side += s.churn;
    }
    return { bow, side: side / this.stations.length };
  }
}
