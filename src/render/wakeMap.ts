// @ts-nocheck -- three's TSL typings infer vector widths poorly for compute shaders; checked by rendering it (npm run shot).
/**
 * Her wake on the GPU (plan N2.5): the one seam through which a ship's water goes into the sea's material.
 *
 * Each frame a compute pass per level fills two textures over a square of the sea around her, on a lattice fixed to
 * the water (so nothing swims as she moves):
 *
 *  - `surface`: the height her waves add (m), their slope along x and z, and fresh foam (0..1);
 *  - `trail`: the slick she leaves (turbulent water, smoothed of its ripples, green with bubbles) and old foam's lace.
 *
 * What fills them (wake.ts holds the reference and the tuning):
 *
 *  - Kelvin's pattern from her bow and her stern, laid along her track (each texel finds the nearest point of where
 *    she has been: how far behind her, how far to the side, how long ago), so it bends where she turned;
 *  - close to her hull, in her own frame: the bow wave piled at her stem and running aft along her sides, the hollow
 *    along her middle body and the rise under her quarters, all growing with her speed and higher on the bow she makes
 *    leeway toward;
 *  - foam: where her bow wave breaks, close along her side where the water works against her hull (her heave, pitch
 *    and roll in the waves, wake.ts `ChurnWatch`) and where her way drags it; behind her, the white of the turbulent
 *    water and the bow wave's arms, thinning to lace, and the slick that lasts for minutes, to windward when she makes
 *    leeway.
 *
 * The near level (0.5 m texels, 128 m) holds all of it; the far level (2 m texels, 512 m) the long wake. The sea's
 * shader reads the near level where it reaches and the far one beyond (`wakeHeight`, `wakeSurface`).
 *
 * Every ship drawn has a map of her own (plan N3.8: hers and the other captain's), each with its own inputs
 * (`wakeInputs`); the sea's shader adds their waves and takes the most of their foam and slick.
 */
import { HalfFloatType, LinearFilter, LinearMipmapLinearFilter, ClampToEdgeWrapping, Matrix4, RGBAFormat, StorageTexture, Vector4, type ComputeNode, type WebGPURenderer } from 'three/webgpu';
import {
  Fn, If, Loop, abs, clamp, dot, exp, float, instanceIndex, int, length, max, min, mix, normalize, select, sign, smoothstep, sqrt, step,
  texture, textureStore, uniform, uniformArray, uvec2, vec2, vec4, cos, sin, pow,
} from 'three/tsl';
import { GRAVITY } from '../sim/units';
import {
  BOW_AHEAD, CHURN_STATIONS, HALF_LENGTH, KELVIN_CUSP, KELVIN_NEAR, KELVIN_TAIL, STEM_Z, STERN_ABAFT, STERN_Z, TRACK_SLOTS, TRACK_STRIDE,
  WAKE, WATERLINE_HALF, type TrackLists,
} from './wake';
import { hullAt } from './ship/hullNode';

/** Texels along a level's side. */
export const WAKE_TEXELS = 256;
/** The levels' texels, m: the near one (128 m across) and the far one (512 m). */
export const WAKE_TEXEL = [0.5, 2] as const;
/** Threads in a workgroup. */
const WORKGROUP = 64;
/** Samples a texture takes along a pixel's long side at a grazing angle. */
const WAKE_ANISOTROPY = 8;
/** A wave is drawn fully where it spans this many texels and not at all below that many. */
const WAVE_FULL_TEXELS = 8;
const WAVE_GONE_TEXELS = 4;
/** A level's last share toward its edge fades to nothing (the far level's content; the near one is blended into the far there). */
const EDGE_FADE = 0.12;
/** Half a texel, and the middle of a level. */
const HALF = 0.5;
/** The step the near field's slope is taken over, m. */
const SLOPE_STEP = 0.25;
/** A turn, rad, and a quarter of it. */
const TURN = 2 * Math.PI;
const QUARTER = Math.PI / 4;
/** Kelvin's sums (wake.ts `kelvinAt`): the wedge's 8, the roots' 4, the curvature's 6 and 5, the source's spread 4, Airy's 1.5 and 2/3, the cap's norm 4. */
const WEDGE = 8;
const ROOT_BELOW = 4;
const CURVE_CUBIC = 6;
const CURVE_LINEAR = 5;
const SIZE_SPREAD = 4;
const TAIL_POWER = 1.5;
const CUSP_POWER = 2 / 3;
const CUSP_NORM = 4;
const STEEPEST = 20;
/** The least value a length or a wavenumber is taken as. */
const TINY = 1e-6;
/** Further than any texel from her track, m². */
const FAR_AWAY = 1e12;
/** Her bow's entrance: over this run aft of the stem her sides reach their full breadth, m (where her bow wave's arms start from). */
const ENTRANCE = 8;
/** The middle body's hollow lies between these shares of her length, the quarters' rise from the first. */
const SHOULDER = [0.15, 0.35, 0.6, 0.8] as const;
const QUARTERS = [0.75, 0.95] as const;
/** Beyond her sternpost the quarter's rise dies out over this, m. */
const QUARTER_TAIL = 4;
/** Her lee bow piles no less than this share of the water her bow does. */
const PUSH_LEAST = 0.3;
/** Her wake's slick shows from this share of her speed's strength (a ship barely moving leaves a slick too). */
const SLICK_GAIN = 2;
/** The track's water a little ahead of her stern begins to turn turbulent, m, and is fully so this far behind it. */
const STRIP_FROM = -2;
const STRIP_TO = 4;

/**
 * Shot falling in the sea (N5.4a): each splash leaves a patch of white water where the ball went in, its radius
 * (`radius`, m, by the ball and how it struck) widening as the square root of its age by `SPLASH_SPREAD` (m per
 * √s), fresh for `SPLASH_FRESH` s and then lace that thins over `SPLASH_LACE` s. A map holds its `MOST_SPLASHES`
 * newest, each for `SPLASH_LIFE` s; the patch's edge is soft over its outer `SPLASH_EDGE` share.
 */
export const MOST_SPLASHES = 32;
const SPLASH_SPREAD = 0.6;
const SPLASH_FRESH = 2.5;
const SPLASH_LACE = 12;
const SPLASH_LIFE = 30;
const SPLASH_EDGE = 0.5;

/** The waterline's length, m. */
const WATERLINE_LENGTH = STERN_Z - STEM_Z;

/** What one ship's passes read each frame (SeaView writes it from her, through `WakeMap.update`). */
function makeInputs() {
  return {
    /** Her track, newest first (wake.ts `TrackLists`), and how many points of it are filled. */
    place: uniformArray(Array.from({ length: TRACK_SLOTS }, () => new Vector4()), 'vec4'),
    doing: uniformArray(Array.from({ length: TRACK_SLOTS }, () => new Vector4()), 'vec4'),
    heading: uniformArray(Array.from({ length: TRACK_SLOTS }, () => new Vector4()), 'vec4'),
    count: uniform(0, 'int'),
    /** Per level: its corner from the sea's origin (x, z, m), its texel (m), and 1 while it is drawn. */
    level: uniformArray(WAKE_TEXEL.map(() => new Vector4()), 'vec4'),
    /** The stations along her waterline, port then starboard: ship-space z, churn (m/s), wetted height (m), the waterline's ship-space y (wake.ts `ChurnWatch`). */
    churn: uniformArray(Array.from({ length: CHURN_STATIONS * 2 }, () => new Vector4()), 'vec4'),
    /** Her way now: speed (m/s), leeway over way, and 1 while she is on the water. */
    now: uniform(new Vector4()),
    /** From the sea's frame (its origin) into her ship space. */
    toShip: uniform(new Matrix4()),
    /** Shot fallen in the sea near her: x, z from the sea's origin, the clock's time it fell, its patch's radius (m); how many, and the clock now. */
    splash: uniformArray(Array.from({ length: MOST_SPLASHES }, () => new Vector4()), 'vec4'),
    splashes: uniform(0, 'int'),
    clock: uniform(0),
  };
}
type WakeInputs = ReturnType<typeof makeInputs>;

/** Each ship's inputs, by her index (0 hers, 1 the other captain's: shipMaterials.ts `SHIP_OBJECT.ship`), made when first asked for. */
const INPUTS: WakeInputs[] = [];
/** How many ships have a wake map at once: the sea's shader reads four textures of each, so only the ships nearest the eye are given one (`seaView.show`). */
export const WAKE_SLOTS = 2;

export function wakeInputs(ship: number): WakeInputs {
  for (let i = INPUTS.length; i <= ship; i++) INPUTS.push(makeInputs());
  return INPUTS[ship]!;
}

/** A level's texture: rgba16float, clamped at its edges, mipmapped for the pixels far off. */
function wakeTexture(name: string): StorageTexture {
  const t = new StorageTexture(WAKE_TEXELS, WAKE_TEXELS);
  t.name = name;
  t.type = HalfFloatType;
  t.format = RGBAFormat;
  t.wrapS = t.wrapT = ClampToEdgeWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = WAKE_ANISOTROPY;
  return t;
}

/**
 * Kelvin's pattern of a source of strength `a` (m) at `s` m behind it along its track and `y` to its side, for a
 * speed whose g/U² is `k0`; waves shorter than the texel can hold (`kGone`, `kFull`) are left out. As wake.ts
 * `kelvinAt`: x the height, y and z the slope along s and y.
 */
function kelvin(s, y, k0, a, kFull, kGone) {
  const sp = max(s, TINY), ay = abs(y), side = select(y.lessThan(0), float(-1), float(1)), t = ay.div(sp), ks = k0.mul(sp);
  const d2 = float(1).sub(t.mul(t).mul(WEDGE)), d = sqrt(max(d2, 0));
  const tail = exp(ks.mul(pow(max(d2.negate(), 0), TAIL_POWER)).mul(-KELVIN_TAIL));
  const near = smoothstep(0, KELVIN_NEAR, ks).mul(select(s.greaterThan(0), float(1), float(0)));
  const least = pow(ks, CUSP_POWER).mul(KELVIN_CUSP);
  const out = vec4(0).toVar();
  for (let branch = 0; branch < 2; branch++) {
    const p = branch === 0 ? t.mul(-2).div(d.add(1)) : max(float(-STEEPEST), d.add(1).negate().div(max(t, TINY).mul(ROOT_BELOW)));
    const p2 = p.mul(p), sec = sqrt(p2.add(1)), k = k0.mul(p2.add(1));
    const f = sec.mul(sp.add(ay.mul(p))), f2 = sec.mul(sp.mul(p2.mul(2).add(1)).add(ay.mul(p).mul(p2.mul(CURVE_CUBIC).add(CURVE_LINEAR))));
    const kf2 = abs(k0.mul(f2));
    const amp = sqrt(float(TURN).div(pow(pow(kf2, CUSP_NORM).add(pow(least, CUSP_NORM)), 1 / CUSP_NORM)));
    const filtered = exp(k.mul(WAKE.sourceSize).pow(2).div(-SIZE_SPREAD)).mul(float(1).sub(smoothstep(kFull, kGone, k)));
    const phase = k0.mul(f).add(sign(f2).mul(QUARTER)), w = a.mul(near).mul(tail).mul(amp).mul(filtered);
    const sn = w.mul(sin(phase)).mul(k0).mul(sec).negate();
    out.addAssign(vec4(w.mul(cos(phase)), sn, sn.mul(p).mul(side), 0));
  }
  return out;
}

/** The water piled and drawn down close to her hull at a point of the sea (`p`, from its origin), in her own frame (`toShip`); and her side there. */
function nearField(p, head, drift, toShip) {
  const ship = toShip.mul(vec4(p.x, 0, p.y, 1));
  const half = hullAt(ship.z, ship.y).half, zeta = ship.z.sub(STEM_Z), aft = max(zeta, 0);
  // How far out from her side (ahead of her stem: from the stem).
  const out = select(zeta.lessThan(0), length(vec2(ship.x, zeta)), max(abs(ship.x).sub(half), 0));
  const side = sign(ship.x), push = max(float(PUSH_LEAST), drift.mul(WAKE.leewayPush).mul(side).add(1));
  const crest = aft.mul(WAKE.bowSpread), width = aft.mul(WAKE.bowWiden).add(WAKE.bowWidth);
  const bow = head.mul(WAKE.bowRise).mul(push).mul(exp(aft.div(-WAKE.bowReach))).mul(exp(out.sub(crest).div(width).pow(2).negate()));
  const L = WATERLINE_LENGTH, reach = exp(out.div(-WAKE.sideReach));
  const shoulder = smoothstep(SHOULDER[0] * L, SHOULDER[1] * L, zeta).mul(float(1).sub(smoothstep(SHOULDER[2] * L, SHOULDER[3] * L, zeta)));
  const quarter = smoothstep(QUARTERS[0] * L, QUARTERS[1] * L, zeta).mul(float(1).sub(smoothstep(L, L + QUARTER_TAIL, zeta)));
  const body = head.mul(reach).mul(quarter.mul(WAKE.quarterRise).sub(shoulder.mul(WAKE.shoulderDip)));
  return { height: bow.add(body), bow, out, zeta, side, along: ship.z };
}

/** The stations' numbers (`I.churn`) at her side at ship-space z on `side` (−1 port, +1 starboard), between the two nearest (wake.ts `ChurnWatch`). */
function stationAt(I: WakeInputs, z, side) {
  const C = I.churn, z0 = C.element(0).x, z1 = C.element(CHURN_STATIONS - 1).x;
  const f = clamp(z.sub(z0).div(z1.sub(z0)), 0, 1).mul(CHURN_STATIONS - 1);
  const i0 = int(min(f, float(CHURN_STATIONS - 2))), u = f.sub(float(i0));
  const base = select(side.lessThan(0), int(0), int(CHURN_STATIONS));
  return mix(C.element(base.add(i0)), C.element(base.add(i0).add(1)), u);
}

/** The churn at her side (m/s). */
const churnAt = (I: WakeInputs, z, side) => stationAt(I, z, side).y;

/** Wet timber is darker and glossy. */
const WET_DARK = 0.55;
const WET_ROUGH = 0.18;
/** The wet edge is ragged where water runs down in streaks: how far below the line they reach, m, and how many to a metre along her. */
const STREAK_DEPTH = 0.25;
const STREAKS = 9;
/** Seed of the streaks. */
const STREAK_SEED = 0.6180339;
/** How soft the drying edge is, m. */
const WET_EDGE = 0.06;

/**
 * Her side wet from the sea (plan N2.5, "water running off"): at a point of her outside (ship space), how wet it is,
 * 0..1: up to where the water has climbed her side lately and is draining down (the stations' wet line), and her bow
 * wave at speed; ragged in streaks below the line as it runs off. `colour` and `rough` darkened and made glossy by it.
 * `ship`: the wake slot of the ship whose hull it is (a node, 0 to `ships` − 1, or below 0 for none): each ship's own stations wet her.
 */
export function wetHull(p, colour, rough, ship, ships: number) {
  // A ship with no wake map (a negative slot: too far to need one) is not wetted.
  const live = step(float(0), float(ship));
  const pick = (f) => {
    let v = f(wakeInputs(0));
    for (let i = 1; i < ships; i++) v = select(ship.equal(i), f(wakeInputs(i)), v);
    return v;
  };
  const st = pick((J) => stationAt(J, p.z, sign(p.x))), now = pick((J) => J.now), speed = now.x;
  const zeta = max(p.z.sub(STEM_Z), 0), bowWave = speed.mul(speed).div(2 * GRAVITY).mul(WAKE.bowRise).mul(exp(zeta.div(-WAKE.bowReach)));
  const line = st.w.add(st.z).add(bowWave);
  // Streaks: a hash per strip along her, so the edge runs down in fingers.
  const strip = p.z.mul(STREAKS).floor(), streak = sin(strip.mul(STREAK_SEED * TURN * STREAKS)).mul(HALF).add(HALF);
  const wet = float(1).sub(smoothstep(line.sub(streak.mul(STREAK_DEPTH)), line.sub(streak.mul(STREAK_DEPTH)).add(WET_EDGE), p.y)).mul(now.w).mul(live);
  return { colour: mix(colour, colour.mul(WET_DARK), wet), rough: mix(rough, float(WET_ROUGH), wet) };
}

export class WakeMap {
  /** What her passes read (`wakeInputs` of her index). */
  readonly inputs: WakeInputs;
  /** Per level: the surface and the trail (see the file's head). */
  readonly surface = WAKE_TEXEL.map((_, l) => wakeTexture(`wake ${l} surface`));
  readonly trail = WAKE_TEXEL.map((_, l) => wakeTexture(`wake ${l} trail`));
  /** The passes, one per level. */
  readonly passes: ComputeNode[];
  /** Levels filled each frame (a quality knob: 1 draws only the near one). */
  levels: number = WAKE_TEXEL.length;
  /** Whether each level is drawn this frame. */
  private readonly drawn: boolean[] = WAKE_TEXEL.map(() => false);

  /** The map of ship `ship` (0 hers, 1 the other captain's). */
  constructor(ship = 0) {
    this.inputs = wakeInputs(ship);
    this.passes = WAKE_TEXEL.map((_, l) => this.pass(l));
  }

  private pass(l: number): ComputeNode {
    const I = this.inputs, N = WAKE_TEXELS, near = l === 0;
    return Fn(() => {
      const id = instanceIndex, ix = id.mod(N), iy = id.div(N);
      const L = I.level.element(l);
      const p = L.xy.add(vec2(float(ix), float(iy)).add(HALF).mul(L.z));
      const kFull = float(TURN / WAVE_FULL_TEXELS).div(L.z), kGone = float(TURN / WAVE_GONE_TEXELS).div(L.z);

      // --- The nearest point of her track: how far behind her, to which side, how long ago, and what she did there.
      const best = float(FAR_AWAY).toVar(), behind = float(-FAR_AWAY).toVar(), aside = float(0).toVar(), ago = float(FAR_AWAY).toVar();
      const doing = vec4(0).toVar(), dir = vec2(0, -1).toVar();
      Loop({ start: int(0), end: I.count.sub(1), type: 'int', condition: '<' }, ({ i }) => {
        const A = I.place.element(i), B = I.place.element(i.add(1));
        const ab = B.xy.sub(A.xy), u = clamp(dot(p.sub(A.xy), ab).div(max(dot(ab, ab), TINY)), 0, 1);
        const off = p.sub(A.xy.add(ab.mul(u))), d2 = dot(off, off);
        If(d2.lessThan(best), () => {
          best.assign(d2);
          behind.assign(mix(A.z, B.z, u));
          ago.assign(mix(A.w, B.w, u));
          doing.assign(mix(I.doing.element(i), I.doing.element(i.add(1)), u));
          const h = normalize(mix(I.heading.element(i).xy, I.heading.element(i.add(1)).xy, u).add(vec2(TINY, 0)));
          dir.assign(h);
          aside.assign(dot(off, vec2(h.y.negate(), h.x)));
        });
      });
      const on = I.now.w.mul(select(I.count.greaterThan(1), float(1), float(0)));
      const speed = doing.x, head = speed.mul(speed).div(2 * GRAVITY), strength = speed.div(WAKE.top);
      const k0 = float(GRAVITY).div(max(speed.mul(speed), WAKE.crawl * WAKE.crawl));
      const sBow = behind.add(BOW_AHEAD), sStern = behind.sub(STERN_ABAFT);
      const fading = exp(ago.div(-WAKE.waveLife));

      // --- Kelvin's pattern from bow and stern, its slope turned from along-and-across her track into the sea's x and z.
      const waves = kelvin(sBow, aside, k0, head.mul(WAKE.bowSource), kFull, kGone)
        .sub(kelvin(sStern, aside, k0, head.mul(WAKE.sternSink), kFull, kGone)).mul(fading);
      const height = waves.x.toVar();
      const slope = dir.mul(waves.y.negate()).add(vec2(dir.y.negate(), dir.x).mul(waves.z)).toVar();

      // --- Behind her: the turbulent strip, the bow wave's arms, the slick.
      const width = sqrt(ago.div(WAKE.stripSpread)).add(WAKE.stripStart).mul(WATERLINE_HALF);
      const across = aside.div(width);
      const strip = strength.add(doing.z.mul(WAKE.trailChurn)).mul(WAKE.stripWhite).mul(exp(ago.div(-WAKE.stripLife))).mul(exp(across.mul(across).negate()))
        .mul(smoothstep(STRIP_FROM, STRIP_TO, sStern));
      const armAt = max(sBow, 0), armLine = armAt.mul(WAKE.bowSpread).add(smoothstep(0, ENTRANCE, armAt).mul(WATERLINE_HALF));
      const armWidth = armAt.mul(WAKE.bowWiden).add(WAKE.bowWidth);
      const armStrength = clamp(clamp(head.mul(WAKE.bowRise).sub(WAKE.bowFoamFrom).div(WAKE.bowFoamRamp), 0, 1).add(doing.y.mul(WAKE.trailChurn)), 0, 1).mul(WAKE.armWhite);
      const arm = armStrength.mul(exp(ago.div(-WAKE.armLife))).mul(exp(abs(aside).sub(armLine).div(armWidth).pow(2).negate()))
        .mul(select(sBow.greaterThan(0), float(1), float(0)));
      const behindFoam = clamp(max(strip, arm), 0, 1);
      const young = exp(ago.div(-WAKE.freshAge));
      const fresh = behindFoam.mul(young).toVar(), old = behindFoam.mul(float(1).sub(young)).toVar();
      const windward = doing.w.mul(-WAKE.slickWindward * HALF_LENGTH);
      const slickAcross = aside.sub(windward).div(width.mul(WAKE.slickWider));
      const slick = clamp(strength.mul(SLICK_GAIN), 0, 1).mul(exp(ago.div(-WAKE.slickLife))).mul(exp(slickAcross.mul(slickAcross).negate()))
        .mul(smoothstep(-HALF_LENGTH, 0, sStern));

      // --- Shot fallen in the sea: white water where each ball went in, spreading and thinning to lace.
      Loop({ start: int(0), end: I.splashes, type: 'int', condition: '<' }, ({ i }) => {
        const S = I.splash.element(i), age = max(I.clock.sub(S.z), 0), r = S.w.add(sqrt(age).mul(SPLASH_SPREAD));
        const patch = float(1).sub(smoothstep(r.mul(1 - SPLASH_EDGE), r, length(p.sub(S.xy))));
        const young = exp(age.div(-SPLASH_FRESH));
        fresh.assign(max(fresh, patch.mul(young)));
        old.assign(max(old, patch.mul(float(1).sub(young)).mul(exp(age.div(-SPLASH_LACE)))));
      });

      if (near) {
        // --- Close to her hull, in her own frame: the bow wave and the body's hollow and rise; its slope by differences.
        const nowSpeed = I.now.x, nowHead = nowSpeed.mul(nowSpeed).div(2 * GRAVITY), drift = I.now.y;
        const here = nearField(p, nowHead, drift, I.toShip);
        const dx = nearField(p.add(vec2(SLOPE_STEP, 0)), nowHead, drift, I.toShip).height, dz = nearField(p.add(vec2(0, SLOPE_STEP)), nowHead, drift, I.toShip).height;
        height.addAssign(here.height);
        slope.addAssign(vec2(dx.sub(here.height), dz.sub(here.height)).div(SLOPE_STEP));
        // Foam where the bow wave breaks, and close along her side where the water works on her hull or her way drags it.
        const breaking = clamp(here.bow.sub(WAKE.bowFoamFrom).div(WAKE.bowFoamRamp), 0, 1);
        const alongHer = smoothstep(-HALF, 0, here.zeta).mul(float(1).sub(smoothstep(WATERLINE_LENGTH, WATERLINE_LENGTH + HALF, here.zeta)));
        const ring = churnAt(I, here.along, here.side).mul(WAKE.ringChurn)
          .add(nowSpeed.div(WAKE.top).mul(WAKE.ringSpeed)).mul(exp(here.out.div(-WAKE.ringReach))).mul(alongHer);
        fresh.assign(max(fresh, clamp(max(breaking, ring), 0, 1)));
      } else {
        // The far level's edges fade out (beyond it there is no wake drawn).
        const edge = max(abs(float(ix).add(HALF).div(N).sub(HALF)), abs(float(iy).add(HALF).div(N).sub(HALF)));
        const keep = float(1).sub(smoothstep(HALF - EDGE_FADE, HALF, edge));
        height.mulAssign(keep); slope.mulAssign(keep); fresh.mulAssign(keep); old.mulAssign(keep);
        textureStore(this.surface[l], uvec2(ix, iy), vec4(height, slope, fresh).mul(on));
        textureStore(this.trail[l], uvec2(ix, iy), vec4(slick.mul(keep), old, 0, 0).mul(on));
        return;
      }
      textureStore(this.surface[l], uvec2(ix, iy), vec4(height, slope, fresh).mul(on));
      textureStore(this.trail[l], uvec2(ix, iy), vec4(slick, old, 0, 0).mul(on));
    })().compute(N * N, [WORKGROUP]);
  }

  /**
   * Once a frame, before the passes run: her track (`track`, laid out from the sea's origin; null: no ship floats
   * here), her way now, the stations along her waterline, `toShip` from the sea's frame into hers, and where each
   * level lies: centred on her (`cx`, `cz`, from the sea's origin), on the lattice of its texel so the water's texels
   * never swim. `near`: the eye is close enough to her for the near level (else only the far one is filled).
   */
  update(track: TrackLists | null, speed: number, drift: number, churn: Float32Array | null, toShip: Matrix4 | null, cx: number, cz: number, ox: number, oz: number, near = true): void {
    const I = this.inputs;
    I.now.value.set(speed, drift, 0, track ? 1 : 0);
    I.count.value = track?.count ?? 0;
    if (track) {
      const place = I.place.array as Vector4[], doing = I.doing.array as Vector4[], heading = I.heading.array as Vector4[];
      for (let i = 0; i < track.count; i++) {
        const at = i * TRACK_STRIDE;
        place[i]!.fromArray(track.place, at);
        doing[i]!.fromArray(track.doing, at);
        heading[i]!.fromArray(track.heading, at);
      }
    }
    if (churn) (I.churn.array as Vector4[]).forEach((v, i) => v.fromArray(churn, i * TRACK_STRIDE));
    if (toShip) I.toShip.value.copy(toShip);
    // Near her: the levels from the near one, as many as the quality level fills; far off, the far level alone.
    WAKE_TEXEL.forEach((_, l) => { this.drawn[l] = track !== null && (near ? l < this.levels : l === WAKE_TEXEL.length - 1); });
    (I.level.array as Vector4[]).forEach((v, l) => {
      const texel = WAKE_TEXEL[l]!, side = texel * WAKE_TEXELS;
      // The lattice is the sea's absolute one: the corner snapped in world metres, then measured from the sea's origin.
      const x = Math.floor((cx + ox - side / 2) / texel) * texel - ox, z = Math.floor((cz + oz - side / 2) / texel) * texel - oz;
      v.set(x, z, texel, this.drawn[l] ? 1 : 0);
    });
  }

  /** Shot fallen in the sea near her, the newest last (the world: x, z; the clock's time; the patch's radius, m). */
  private readonly fallen: { x: number; z: number; t: number; radius: number }[] = [];

  /** A ball fallen into the sea at world `x`, `z` at the clock's `t`, its white water `radius` m at first. */
  splash(x: number, z: number, t: number, radius: number): void {
    this.fallen.push({ x, z, t, radius });
    if (this.fallen.length > MOST_SPLASHES) this.fallen.shift();
  }

  /** Once a frame, before the passes run: the splashes still showing at the clock's `t`, laid out from the sea's origin (`ox`, `oz`). */
  laySplashes(t: number, ox: number, oz: number): void {
    while (this.fallen.length && t - this.fallen[0]!.t > SPLASH_LIFE) this.fallen.shift();
    const I = this.inputs, list = I.splash.array as Vector4[];
    this.fallen.forEach((f, i) => list[i]!.set(f.x - ox, f.z - oz, f.t, f.radius));
    I.splashes.value = this.fallen.length;
    I.clock.value = t;
  }

  /** Compiles the passes (behind the loading screen). */
  async compile(renderer: WebGPURenderer): Promise<void> {
    await renderer.compileComputeAsync(this.passes);
  }

  /** Runs the passes of the levels drawn, while she floats here. */
  fill(renderer: WebGPURenderer): void {
    const run = this.passes.filter((_, l) => this.drawn[l]);
    if (run.length) renderer.compute(run);
  }
}

/** Where a point of the sea (from its origin) lies in level `l` of a map (`I` its inputs): its texture coordinate, and how far inside the level it is (1 inside, 0 at its edge). */
function inLevel(I: WakeInputs, l: number, calm) {
  const L = I.level.element(l), side = L.z.mul(WAKE_TEXELS);
  const uv = calm.sub(L.xy).div(side);
  const edge = max(abs(uv.x.sub(HALF)), abs(uv.y.sub(HALF)));
  return { uv, inside: float(1).sub(smoothstep(HALF - EDGE_FADE, HALF, edge)).mul(L.w) };
}

/** One map's height at a point of the sea (`calm`, from its origin): the near level where it reaches, the far beyond. */
function mapHeight(map: WakeMap, calm) {
  const I = map.inputs, n = inLevel(I, 0, calm), f = inLevel(I, 1, calm);
  const near = texture(map.surface[0], n.uv).level(0).x, far = texture(map.surface[1], f.uv).level(0).x;
  return mix(far.mul(f.inside), near, n.inside).mul(I.now.w);
}

/** The wakes' height at a point of the sea (`calm`, from its origin), for the vertex stage: every ship's waves added. */
export function wakeHeight(maps: readonly WakeMap[], calm) {
  return maps.map((m) => mapHeight(m, calm)).reduce((a, b) => a.add(b));
}

/** One map's surface and trail at a point of the sea, filtered to the pixel. */
function mapSurface(map: WakeMap, calm) {
  const I = map.inputs, n = inLevel(I, 0, calm), f = inLevel(I, 1, calm);
  const s = mix(texture(map.surface[1], f.uv).mul(f.inside), texture(map.surface[0], n.uv), n.inside).mul(I.now.w);
  const t = mix(texture(map.trail[1], f.uv).mul(f.inside), texture(map.trail[0], n.uv), n.inside).mul(I.now.w);
  return { s, t };
}

/**
 * The wakes at a point of the sea for the fragment stage, filtered to the pixel: their slope (x, z) added, and the
 * most of their fresh foam, old foam and slick.
 */
export function wakeSurface(maps: readonly WakeMap[], calm) {
  const each = maps.map((m) => mapSurface(m, calm));
  const slope = each.map((e) => e.s.yz).reduce((a, b) => a.add(b)), fresh = each.map((e) => e.s.w).reduce((a, b) => max(a, b));
  const old = each.map((e) => e.t.y).reduce((a, b) => max(a, b)), slick = each.map((e) => e.t.x).reduce((a, b) => max(a, b));
  return { slope, fresh, old, slick };
}
