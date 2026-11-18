// @ts-nocheck -- three's TSL typings infer vector widths poorly for this much shader math; checked by rendering it (npm run shot).
/**
 * The sails' material (plan N3.10, ship.md "Sails"): one kind for every sail and both flags, in one draw. The vertex
 * stage shapes each sail's grid from its numbers (sailForm.ts: a row of SAIL_TEXTURE per sail, written each frame by
 * sailsView.ts), the same function `clothAt` runs on the CPU, so a sail fills, shivers, goes aback and is clewed up and
 * furled without anything rebuilt and without a shader compiled. The fragment stage draws the canvas: cloths and their
 * seams every 0.6 m, reef bands and reef points, tablings and the bolt rope at the edges, each cloth a little
 * different, weathered toward the foot; the flags' colours. And the light comes through the canvas: with the sun
 * behind a sail it glows, the doubled cloth of its seams and bands darker against it and the rig's shadows on it (the
 * sun's light as it reaches the cloth, shadowed, through the back of the canvas).
 */
import { DataTexture, DoubleSide, FloatType, LinearFilter, MeshStandardNodeMaterial, PhysicalLightingModel, RGBAFormat, UnsignedByteType, Vector2 } from 'three/webgpu';
import {
  Fn, abs, attribute, clamp, cos, cross, faceDirection, float, floor, fract, fwidth, hash, int, ivec2, max, min, mix, normalView, normalize,
  round, select, sin, smoothstep, step, texture, textureLoad, transformNormalToView, uniform, varyingProperty, vec2, vec3, vec4,
} from 'three/tsl';
import {
  BREATHE_HZ, BREATHE_U, BREATHE_V, BUNT, FLAG, NONE, REEF_ROLL, SAME_POINT, ROLL_ENDS, ROLL_IN, ROLL_TURNS, ROW_TEXELS, SCALLOP, SHIVER_FALL, SHIVER_HZ,
  SHIVER_SLANT, SHIVER_WAVES,
} from './sailForm';
import { ENSIGN_PATTERN, FLAGS, PENNANT_PATTERN, SAIL_ATLAS_SIZE } from './sailGrid';
import { SHIPS_DRAWN, SHIP_OBJECT, crossfadeMask, nearest } from './shipMaterials';
import { filtered } from '../dataTexture';

/** Rows of the sails' state: her 11 sails, the ensign and the pennant, and room to spare. */
export const MOST_SAIL_ROWS = 16;
/** Numbers per texel. */
const RGBA = 4;
/** Each sail's numbers (sailForm.ts ROW), a row of texels per sail, a block of rows per ship drawn: written by sailsView.ts, read by the vertex stage. */
export const SAIL_TEXTURE = new DataTexture(new Float32Array(SHIPS_DRAWN * MOST_SAIL_ROWS * ROW_TEXELS * RGBA), ROW_TEXELS, SHIPS_DRAWN * MOST_SAIL_ROWS, RGBAFormat, FloatType);
nearest(SAIL_TEXTURE);
/** Ship `ship`'s sail rows (sailsView.ts `rows`) into the texture, for the next frame. */
export function setShipSails(rows: Float32Array, ship = 0): void {
  (SAIL_TEXTURE.image.data as Float32Array).set(rows, ship * MOST_SAIL_ROWS * ROW_TEXELS * RGBA);
  SAIL_TEXTURE.needsUpdate = true;
}
/**
 * The sails' hole map (sailGrid.ts `sailAtlas`): a texel per 5 cm of every sail's cloth, a block per ship drawn (her
 * own first), with the marks damageMarks.ts writes (hole, scorch, frayed rim, cut): the holed kind leaves the cut out.
 */
export const SAIL_DAMAGE_TEXTURE = new DataTexture(new Uint8Array(SAIL_ATLAS_SIZE * SAIL_ATLAS_SIZE * SHIPS_DRAWN * RGBA), SAIL_ATLAS_SIZE, SAIL_ATLAS_SIZE * SHIPS_DRAWN, RGBAFormat, UnsignedByteType);
filtered(SAIL_DAMAGE_TEXTURE, LinearFilter);
/** Canvas frayed round a shot hole: greyed and darkened toward this (linear RGB), this much at most. */
const FRAYED = [0.09, 0.08, 0.065];
const FRAY_SHOWS = 0.7;
/** A sail's hole map from this on is cut away. */
const SAIL_CUT_FROM = 0.5;
/**
 * Which ships drawn fly the French colours (1) and which the British (0), by the ship's index drawn (0 hers, 1 the
 * other's): a uniform, so the menu's choice of navy (docs/design/menu.md) changes the flags without a shader compiled.
 */
const FRENCH_FLAGS = uniform(new Vector2(0, 1));
/** The colours each ship drawn flies: hers and the other's (true: French). */
export function setFrenchFlags(mine: boolean, hers: boolean): void {
  FRENCH_FLAGS.value.set(mine ? 1 : 0, hers ? 1 : 0);
}
/** Seconds, for the sails' shiver, breathing and the flags' waves (sailsView.ts keeps it with the CPU's copy). */
export const SAIL_TIME = uniform(0);

/** A turn, rad. */
const TURN = 2 * Math.PI;
/** The step for the cloth's slope in its own coordinates (the normal), and the farthest a point's slope is taken from its head. */
const SLOPE = 0.004;
/** Below this squared length the two slopes make no normal (a sail's head where its edges meet; some software GPUs lose a short one): the cloth is lit as if facing up. */
const NO_NORMAL = 1e-14;

// --- The shape (sailForm.ts clothAt, line for line).
/** A row's texels by number. */
const TEXELS = Array.from({ length: ROW_TEXELS }, (_, i) => i);
const T = (row, k) => textureLoad(SAIL_TEXTURE, ivec2(int(k), int(row).add(int(SHIP_OBJECT.ship).mul(MOST_SAIL_ROWS))));
const sinHalf = (x) => sin(x.mul(Math.PI));
const bilerp = (p00, p10, p01, p11, u, v) => mix(mix(p00, p10, u), mix(p01, p11, u), v);
/** sailForm.ts `scallop`. */
const scallop = (u) => sinHalf(select(u.lessThan(BUNT), u.div(BUNT), select(u.greaterThan(1 - BUNT), u.sub(1 - BUNT).div(BUNT), u.sub(BUNT).div(1 - 2 * BUNT))));
/** sailForm.ts `rolled`. */
const rollNode = (at, up, toward, spar, radius, t) => {
  const a = t.mul(ROLL_TURNS * TURN), r = radius.mul(float(1).sub(t.mul(ROLL_IN)));
  return at.add(up.mul(spar.add(radius).sub(cos(a).mul(r)))).add(toward.mul(sin(a).mul(r)));
};

/** A sail's point (u, v) at time t: sailForm.ts `clothAt`. */
const sailCloth = Fn(([row, u, v, t]) => {
  const [t0, t1, t2, t3, t4, t5, t6, t7, t8, t9] = TEXELS.map((k) => T(row, k));
  const p00 = t0.xyz, p10 = t1.xyz, p01 = t2.xyz, p11 = t3.xyz;
  const square = float(1).sub(min(t0.w, 1)), taken = t6.w, uKeep = t6.y, vKeep = t6.z, reefed = taken.greaterThan(NONE);
  const vs = select(reefed, clamp(v.sub(taken).div(max(float(1).sub(taken), NONE)), 0, 1), v);
  // Gathered toward the yard's middle (square), the luff (fore-and-aft), or a headsail as a smaller triangle down its stay (clothAt).
  const tri = float(1).sub(square).mul(step(p01.distance(p11), SAME_POINT));
  const gathered = u.mul(uKeep).mul(float(1).sub(vs.mul(tri))).div(max(float(1).sub(vs.mul(vKeep).mul(tri)), NONE));
  const ug = mix(gathered, float(1 / 2).add(u.sub(1 / 2).mul(float(1).add(uKeep.sub(1).mul(vs)))), square);
  const vg = vs.mul(vKeep).add(square.mul(float(1).sub(vKeep)).mul(SCALLOP).mul(vs).mul(scallop(u)));
  const belly = t4.xyz;
  // The belly's shape: each edge's share by how near it lies, and the middle's (t5: the v = 0, v = 1, u = 0, u = 1 edges).
  const su = sinHalf(u), sv = sinHalf(vs);
  const f = t5.dot(vec4(float(1).sub(vs).mul(su), vs.mul(su), float(1).sub(u).mul(sv), u.mul(sv))).add(t6.x.mul(su).mul(sv));
  const coord = t9.xy.dot(vec2(u, vs)), phase = t3.w;
  const shiverW = float(1).sub(abs(u.sub(t8.x)).mul(SHIVER_FALL)).mul(sinHalf(vs));
  const off = t1.w.mul(f)
    .add(t8.z.mul(sin(coord.mul(t8.y).mul(TURN))))
    .add(t2.w.mul(shiverW).mul(sin(u.add(vs.mul(SHIVER_SLANT)).mul(SHIVER_WAVES).sub(t.mul(SHIVER_HZ)).mul(TURN).add(phase))))
    .add(t4.w.mul(sinHalf(u)).mul(sinHalf(vs)).mul(sin(t.mul(BREATHE_HZ * TURN).add(phase).add(u.mul(BREATHE_U)).add(vs.mul(BREATHE_V)))));
  const shaped = bilerp(p00, p10, p01, p11, ug, vg).add(belly.mul(off));
  const up = t7.xyz, head = mix(p00, p10, u), radius = t8.w.mul(float(ROLL_ENDS).add(sinHalf(u).mul(1 - ROLL_ENDS)));
  const furled = mix(shaped, rollNode(head, up, belly, t9.z, radius, vs), t7.w.mul(square));
  return select(reefed.and(v.lessThan(taken)), rollNode(head, up, belly, t9.z, radius.mul(REEF_ROLL), v.div(max(taken, NONE))), furled);
}).setLayout({ name: 'sailCloth', type: 'vec3', inputs: [{ name: 'row', type: 'float' }, { name: 'u', type: 'float' }, { name: 'v', type: 'float' }, { name: 't', type: 'float' }] });

/** A flag's point (u along the fly, v down the hoist) at time t: sailForm.ts `flagAt`. */
const flagCloth = Fn(([row, u, v, t]) => {
  const [t0, t1, t2, t3, t4, , , , t8, t9] = TEXELS.map((k) => T(row, k));
  const top = t0.xyz, toFoot = t2.xyz.sub(top), hoist = toFoot.length(), down = toFoot.div(max(hoist, NONE)), fly = t4.xyz, k = t9.w;
  const side = normalize(cross(fly, down)), along = normalize(down.mul(float(1).sub(k)).add(fly.mul(k)));
  const tv = float(1 / 2).add(v.sub(1 / 2).mul(float(1).sub(t8.x.mul(u))));
  const wave = t2.w.mul(u).mul(sin(t8.y.mul(u).sub(t8.z.mul(t)).mul(TURN).add(t3.w)));
  return top.add(down.mul(tv.mul(hoist))).add(along.mul(u.mul(t1.w))).add(side.mul(wave));
}).setLayout({ name: 'flagCloth', type: 'vec3', inputs: [{ name: 'row', type: 'float' }, { name: 'u', type: 'float' }, { name: 'v', type: 'float' }, { name: 't', type: 'float' }] });

/** Any row's point: a flag's or a sail's. */
const clothShape = (row, u, v, t) => select(T(row, 0).w.greaterThan(FLAG - 1 / 2), flagCloth(row, u, v, t), sailCloth(row, u, v, t));

// --- The canvas.
/** New canvas, a little weathered (linear RGB, sRGB about 0.82, 0.79, 0.71), and how much each cloth differs in shade. */
const CANVAS = [0.64, 0.6, 0.47];
const CLOTH_SHADE = 0.07;
/** Toward the foot (v 1 of a square sail) and the edges it is greyed by weather and handling, to this share. */
const WEATHERED = 0.82;
/** A cloth's width (24 in), m; the stitched line of a seam and the overlap of its two cloths, m; how dark the stitching. */
const CLOTH = 0.6;
const STITCH = 0.008;
const OVERLAP = 0.038;
const STITCH_DARK = 0.35;
/** Past this many cloths a pixel the seams fade to an even tone. */
const SEAMS_FADE = 0.5;
/** A reef band (doubled canvas), m wide; reef points every this far, hanging this far either side of the band, this thick, m; their colour (hemp). */
const BAND = 0.15;
const POINT_PITCH = 0.6;
const POINT_HANG = 0.3;
const POINT_WIDTH = 0.012;
const HEMP = [0.2, 0.14, 0.075];
/** The tabling round the edge (doubled canvas) and the bolt rope sewn to it, m wide; the bolt rope's colour (tarred). */
const TABLING = 0.1;
const BOLT_ROPE = 0.028;
const TARRED = [0.05, 0.04, 0.03];
/** How much sunlight canvas lets through (single cloth), how much of that doubled cloth lets through, and bunting (the flags). */
const CANVAS_THROUGH = 0.42;
const DOUBLED = 0.45;
const BUNTING_THROUGH = 0.55;
/** Canvas is matte; bunting a little less so. */
const ROUGH_CANVAS = 0.92;
const ROUGH_BUNTING = 0.8;
/** Seed of each cloth's shade. */
const CLOTH_SEED = 7.31;
/** Scorched canvas (linear RGB). */
const SCORCH = [0.02, 0.016, 0.012];

// --- The flags (linear RGB): the red ensign of 1805 with the Union of 1801 in its canton; the pennant, St George's cross at its hoist and a red fly.
// French: the tricolour of 1794 (blue at the hoist, white, red, in equal bands), and the pennant blue, white and red from its hoist.
const RED = [0.5, 0.018, 0.022];
const WHITE = [0.78, 0.77, 0.72];
const BLUE = [0.006, 0.02, 0.11];
const FRENCH_BLUE = [0.01, 0.035, 0.2];
const FRENCH_RED = [0.55, 0.03, 0.03];
/** The tricolour's three bands. */
const BANDS = 3;
/** The French pennant's blue and white, each this long from its hoist, m (the rest red). */
const FRENCH_PENNANT_BAND = 0.9;
/** The Union's crosses as shares of the canton's hoist (it is 30 high): the white saltire, the red saltire, the white cross, the red cross (half widths). */
const UNION_HOIST = 30;
const SALTIRE_WHITE = 3 / UNION_HOIST;
const SALTIRE_RED = 1 / UNION_HOIST;
const CROSS_WHITE = 5 / UNION_HOIST;
const CROSS_RED = 3 / UNION_HOIST;
/** The pennant's hoist end that carries the cross, m, and the cross's half width as a share of the hoist. */
const PENNANT_CROSS = 0.9;
const PENNANT_CROSS_WIDTH = 0.15;

const ENSIGN = FLAGS.find((f) => f.pattern === ENSIGN_PATTERN);
const PENNANT = FLAGS.find((f) => f.pattern === PENNANT_PATTERN);

/** The ensign's colour at (s m along the fly, t m down the hoist). */
function ensignColour(s, t) {
  const w = ENSIGN.fly / 2, h = ENSIGN.hoist / 2, len = Math.hypot(w, h);
  const inCanton = step(s, w).mul(step(t, h));
  const d1 = abs(s.mul(h).sub(t.mul(w))).div(len), d2 = abs(float(w).sub(s).mul(h).sub(t.mul(w))).div(len), dS = min(d1, d2);
  const dC = min(abs(s.sub(w / 2)), abs(t.sub(h / 2)));
  let c = vec3(...BLUE);
  c = mix(c, vec3(...WHITE), step(dS, h * SALTIRE_WHITE));
  c = mix(c, vec3(...RED), step(dS, h * SALTIRE_RED));
  c = mix(c, vec3(...WHITE), step(dC, h * CROSS_WHITE));
  c = mix(c, vec3(...RED), step(dC, h * CROSS_RED));
  return mix(vec3(...RED), c, inCanton);
}

/** The pennant's colour at (s, t). */
function pennantColour(s, t) {
  const cross = max(step(abs(t.sub(PENNANT.hoist / 2)), PENNANT.hoist * PENNANT_CROSS_WIDTH), step(abs(s.sub(PENNANT_CROSS / 2)), PENNANT.hoist * PENNANT_CROSS_WIDTH));
  return mix(vec3(...RED), mix(vec3(...WHITE), vec3(...RED), cross), step(s, PENNANT_CROSS));
}

/** The tricolour's colour at s m along a fly whose first two bands are each `band` m long. */
function tricolour(s, band) {
  return mix(vec3(...FRENCH_BLUE), mix(vec3(...WHITE), vec3(...FRENCH_RED), step(band * 2, s)), step(band, s));
}

/** The lighting of a cloth: as any matte surface, and the sun's light through it from behind (shadowed as it reaches it). */
class ClothLighting extends PhysicalLightingModel {
  constructor(through) {
    super();
    this.through = through;
  }

  direct(input, builder) {
    super.direct(input, builder);
    const behind = normalView.dot(input.lightDirection).negate().clamp();
    input.reflectedLight.directDiffuse.addAssign(behind.mul(input.lightColor).mul(this.through).mul(1 / Math.PI));
  }
}

class ClothMaterial extends MeshStandardNodeMaterial {
  /** The light the cloth lets through (colour times share). */
  throughNode = null;
  setupLightingModel() {
    return new ClothLighting(this.throughNode);
  }
}

/** The sails and flags: shaped on the GPU from their rows, canvas and bunting drawn; `crossfade` makes the far ship's crossfading kind. */
export function makeSailMaterial(crossfade = false, holed = crossfade): MeshStandardNodeMaterial {
  const m = new ClothMaterial({ side: DoubleSide });
  m.name = 'ship sails';
  const cl = attribute('cloth', 'vec3'), cv = attribute('canvas', 'vec4'), bd = attribute('band', 'vec4');
  const normal = varyingProperty('vec3', 'vClothNormal');
  m.positionNode = Fn(() => {
    const row = cl.x, u = cl.y, v = cl.z, t = SAIL_TIME;
    const p = clothShape(row, u, v, t);
    // The slope along u and v (stepping back at the far edges), taken short of a headsail's head where its edges meet.
    const vd = min(v, 1 - 2 * SLOPE), su = select(u.greaterThan(1 - SLOPE), float(-SLOPE), float(SLOPE)), sv = select(vd.greaterThan(1 - 2 * SLOPE), float(-SLOPE), float(SLOPE));
    const q = clothShape(row, u, vd, t);
    const du = clothShape(row, u.add(su), vd, t).sub(q).mul(su.sign()), dv = clothShape(row, u, vd.add(sv), t).sub(q).mul(sv.sign());
    const n = cross(du, dv), n2 = n.dot(n);
    normal.assign(select(n2.greaterThan(NO_NORMAL), n.mul(n2.inverseSqrt()), vec3(0, 1, 0)));
    return p;
  })();
  m.normalNode = transformNormalToView(normal).mul(faceDirection);

  const s = cv.x, drop = cv.y, edge = cv.z, pattern = cv.w, isFlag = step(1 / 2, pattern);
  // Cloths and seams, fading to an even tone where a pixel holds many.
  const ws = fwidth(s), wd = fwidth(drop), we = fwidth(edge);
  const fs = fract(s.div(CLOTH)), toSeam = min(fs, float(1).sub(fs)).mul(CLOTH);
  const seamsSeen = float(1).sub(smoothstep(0, SEAMS_FADE, ws.div(CLOTH)));
  const stitch = float(1).sub(smoothstep(STITCH / 2, ws.add(STITCH / 2), toSeam)).mul(seamsSeen);
  const overlap = float(1).sub(smoothstep(OVERLAP / 2, ws.add(OVERLAP / 2), toSeam)).mul(seamsSeen);
  const shade = float(1).sub(hash(floor(s.div(CLOTH)).add(cl.x.mul(CLOTH_SEED))).mul(CLOTH_SHADE));
  // Reef bands where reefs are taken, the points either side of them.
  const spacing = max(bd.x, NONE), k = clamp(round(drop.div(spacing)), 1, max(bd.y, 1)), toBand = abs(drop.sub(k.mul(spacing))), hasReefs = step(1 / 2, bd.y);
  const band = float(1).sub(smoothstep(BAND / 2, wd.add(BAND / 2), toBand)).mul(hasReefs);
  const fp = fract(s.div(POINT_PITCH).add(1 / 2)), toPoint = min(fp, float(1).sub(fp)).mul(POINT_PITCH);
  const point = float(1).sub(smoothstep(POINT_WIDTH / 2, ws.add(POINT_WIDTH / 2), toPoint)).mul(step(toBand, POINT_HANG)).mul(hasReefs).mul(seamsSeen);
  // The edge: tabling and bolt rope.
  const tabling = float(1).sub(smoothstep(TABLING, we.add(TABLING), edge));
  const bolt = float(1).sub(smoothstep(BOLT_ROPE, we.add(BOLT_ROPE), edge));
  const weather = mix(float(1), float(WEATHERED), max(cl.z.mul(cl.z), tabling).mul(1 / 2));
  let canvas = vec3(...CANVAS).mul(shade).mul(weather).mul(float(1).sub(stitch.mul(STITCH_DARK)));
  canvas = mix(canvas, vec3(...HEMP), point);
  canvas = mix(canvas, vec3(...TARRED), bolt);
  // Her block of the hole map; the flags have none.
  const marks = texture(SAIL_DAMAGE_TEXTURE, vec2(bd.z, bd.w.add(SHIP_OBJECT.ship).div(SHIPS_DRAWN))).mul(float(1).sub(isFlag));
  canvas = mix(mix(canvas, vec3(...FRAYED), marks.b.mul(FRAY_SHOWS)), vec3(...SCORCH), marks.g);
  const doubled = max(max(overlap, band), tabling);
  const canvasThrough = float(CANVAS_THROUGH).mul(mix(float(1), float(DOUBLED), doubled)).mul(float(1).sub(max(bolt, point)));
  const isPennant = pattern.greaterThan(ENSIGN_PATTERN + 1 / 2);
  const british = select(isPennant, pennantColour(s, drop), ensignColour(s, drop));
  const french = select(isPennant, tricolour(s, FRENCH_PENNANT_BAND), tricolour(s, ENSIGN.fly / BANDS));
  const flies = select(int(SHIP_OBJECT.ship).equal(0), FRENCH_FLAGS.x, FRENCH_FLAGS.y);
  const flag = mix(british, french, flies);
  m.colorNode = mix(canvas, flag, isFlag);
  m.throughNode = m.colorNode.mul(mix(canvasThrough, float(BUNTING_THROUGH), isFlag));
  m.roughnessNode = mix(float(ROUGH_CANVAS), float(ROUGH_BUNTING), isFlag);
  m.metalnessNode = float(0);
  const whole = marks.a.lessThan(SAIL_CUT_FROM);
  if (crossfade || holed) m.maskNode = crossfade ? crossfadeMask().and(whole) : whole;
  return m;
}
