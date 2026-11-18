// @ts-nocheck -- three's TSL typings infer vector widths poorly for this much shader math; checked by rendering it (npm run shot).
/**
 * The ship's materials (plan N2.0, ship.md "Looks, British"): timber bare and painted, black-leaded iron, the copper
 * sheathing, the lantern's horn and flame, and rope. All are laid in ship space, so they hold still on her as she
 * moves. What the slice fixes here is kept for the whole ship (N2.4).
 *
 * Light: the sun and the sky light her through the light rig (@futuremagic/sky), with the sun's shadow map. Below her
 * deck no sky comes in but through the hatch, so the sky's fill there falls off with the distance from it; and the
 * lantern's light is added to what it shines on, in the shader (a light of the scene's would be in every lit shader).
 */
import { Color, DataTexture, DoubleSide, FloatType, FrontSide, Matrix4, MeshBasicNodeMaterial, MeshStandardNodeMaterial, NearestFilter, RGBAFormat, UnsignedByteType, Vector2, Vector4 } from 'three/webgpu';
import {
  Fn, Loop, abs, attribute, clamp, dot, float, floor, fract, fwidth, hash, int, ivec2, length, max, min, mix, modelViewMatrix, normalGeometry,
  normalLocal, normalize, positionGeometry, positionLocal, screenCoordinate, sin, smoothstep, step, texture, textureLoad, transformNormalToView,
  uniform, uniformArray, varyingProperty, vec2, vec3, vec4,
} from 'three/tsl';
import { DECK_PLANK_LENGTH } from '../../sim/rules/ships';
import { GRAIN_SPAN, makeGrainTexture } from './grain';
import { DAMAGE_MAP_SIZE, DAMAGE_REGIONS, DAMAGE_TEXEL } from './damageMap';
import { MOST_FRAMES } from './swings';
import { wetHull } from '../wakeMap';

/** How many lanterns and sky openings her shaders can hold. */
export const MOST_LAMPS = 40;
export const MOST_SKIES = 24;
/** Rows of a moving frame (an affine 3 × 4). */
const FRAME_ROWS = 3;
/**
 * Ships her kinds draw at once (plan N3.8): hers and the other captain's. Each mesh says whose it is
 * (`SHIP_OBJECT.ship`), and the per-ship textures (her moving frames here, the sails' rows in sailMaterial.ts) hold a
 * block of rows per ship, so the second ship draws with the same shaders.
 */
export const SHIPS_DRAWN = 2;

/** What the ship's shaders read, written by the ship's view (shipView.ts). */
export const SHIP_INPUTS = {
  /** The view's angle per pixel, rad (rope is widened to a pixel). */
  pixel: uniform(0.001),
  /** The lanterns' light: colour times strength as the scene's lights carry it. */
  lantern: uniform(new Color()),
  /** The horn's glow: colour times strength. */
  glow: uniform(new Color()),
  /** Seconds, for the flames' flicker. */
  time: uniform(0),
  /** Her lanterns' flames (ship space) and each one's flicker phase, grouped by zone. */
  lamps: uniformArray(Array.from({ length: MOST_LAMPS }, () => new Vector4()), 'vec4'),
  /** The openings that let the sky in below, grouped by zone: middle x and z, half width and half length (ship space, m)... */
  skyPlace: uniformArray(Array.from({ length: MOST_SKIES }, () => new Vector4()), 'vec4'),
  /** ...and the height of the deck they are in (ship space) and how much they let through. */
  skyKind: uniformArray(Array.from({ length: MOST_SKIES }, () => new Vector4()), 'vec4'),
};

/** Numbers per texel of the frames' texture. */
const TEXEL = 4;
/**
 * Her moving frames (swings.ts) as a small float texture, a row of it per frame and a texel per row of the frame's
 * affine matrix (ship space to ship space); frame 0, her hull, stays the identity. A texture, read texel by texel,
 * works alike on WebGPU and WebGL 2.
 */
export const FRAMES_TEXTURE = new DataTexture(new Float32Array(SHIPS_DRAWN * MOST_FRAMES * FRAME_ROWS * TEXEL), FRAME_ROWS, SHIPS_DRAWN * MOST_FRAMES, RGBAFormat, FloatType);
nearest(FRAMES_TEXTURE);
for (let ship = 0; ship < SHIPS_DRAWN; ship++) for (let f = 0; f < MOST_FRAMES; f++) setShipFrame(f, new Matrix4(), ship);

/** A data texture read texel by texel: no filtering, and uploaded on first use. */
export function nearest(t: DataTexture): DataTexture {
  t.magFilter = NearestFilter;
  t.minFilter = NearestFilter;
  t.needsUpdate = true;
  return t;
}

/** Moving frame `frame` of ship `ship` (0 hers, 1 the other's) set to `m` (ship space to ship space), for her ropes' shaders. */
export function setShipFrame(frame: number, m: Matrix4, ship = 0): void {
  if (frame >= MOST_FRAMES || ship >= SHIPS_DRAWN) return;
  const d = FRAMES_TEXTURE.image.data, e = m.elements, row = (ship * MOST_FRAMES + frame) * FRAME_ROWS;
  // Three rows of the affine matrix (three.js keeps it column by column).
  for (let r = 0; r < FRAME_ROWS; r++) for (let c = 0; c < TEXEL; c++) d[(row + r) * TEXEL + c] = e[c * TEXEL + r];
  FRAMES_TEXTURE.needsUpdate = true;
}

/** No light ranges: the outside, under the open sky. */
const OUTSIDE_RANGE = new Vector4(-1, -1, -1, -1);
const IDENTITY = new Matrix4();
/** Drawn whole: no fading. */
const WHOLE = new Vector2(0, 1);

/** What each mesh of her tells her shaders, read as each is drawn (mesh.userData, written by shipView.ts). */
export const SHIP_OBJECT = {
  /** Which lanterns light it and which openings let the sky in: [first lamp, past the last, first opening, past the last]; all -1 outside. */
  light: uniform(new Vector4()).onObjectUpdate(({ object }) => object.userData.light ?? OUTSIDE_RANGE),
  /** From its own space into ship space (a door turns on its hinge). */
  toShip: uniform(new Matrix4()).onObjectUpdate(({ object }) => object.userData.toShip ?? IDENTITY),
  /** Its share of a crossfade between levels of detail: drawn where the screen's dither lies in [x, y). */
  fade: uniform(new Vector2()).onObjectUpdate(({ object }) => object.userData.fade ?? WHOLE),
  /** Whose it is: 0 her own, 1 the other captain's ship (its block of rows in the per-ship textures). */
  ship: uniform(0).onObjectUpdate(({ object }) => object.userData.ship ?? 0),
};


/** Bytes per texel of the damage map (before the map: the bundle reads it as undefined when it comes later, and the map is empty). */
const RGBA = 4;
/** The damage map (damageMap.ts): one texel per 4 cm of her hull and decks; N6.5 writes holes and scorches into it. */
export const DAMAGE_TEXTURE = new DataTexture(new Uint8Array(DAMAGE_MAP_SIZE.width * DAMAGE_MAP_SIZE.height * RGBA), DAMAGE_MAP_SIZE.width, DAMAGE_MAP_SIZE.height, RGBAFormat, UnsignedByteType);
DAMAGE_TEXTURE.needsUpdate = true;
/** Each region's least u and v (m) and its corner in the map (texels), by region number less one. */
const REGIONS = uniformArray(DAMAGE_REGIONS.map((r) => new Vector4(r.u, r.v, r.x, r.y)), 'vec4');

/** The grain, shared by all the ship's kinds (made once, on first use). */
let grain = null;
const grainTexture = () => (grain ??= makeGrainTexture());

// --- Timber.
/** Pine as it weathers on deck: the grain's light early wood (linear RGB, sRGB 0.66, 0.56, 0.44). */
const PINE = [0.39, 0.27, 0.16];
/** How dark the late wood rings are against the early wood. */
const LATE_DARK = 0.38;
/** How much the pores darken, and how much planks differ in shade one from another. */
const PORE_DARK = 0.12;
const PLANK_SHADE = 0.22;
/** Grime of years at sea: where the noise passes this, the wood darkens to this share. */
const GRIME_FROM = 0.42;
const GRIME_TO = 0.78;
const GRIME_DARK = 0.62;
/** Grime gathers in corners: wood where the ambient occlusion is lowest darkens to this share. */
const CORNER_DARK = 0.7;
/** Paint shows the grain's relief faintly (a share). */
const PAINT_RELIEF = 0.06;
/** Paint worn through at edges: from this much wear on, mixed with the grime noise, over this softness. */
const WEAR_FROM = 0.55;
const WEAR_SOFT = 0.18;
/** The caulked seams between planks: oakum and pitch, this wide (m), and pitch's colour. */
const SEAM = 0.009;
const PITCH = [0.012, 0.01, 0.008];
/** A seam under paint is a groove the paint fills: it darkens the paint to this share. */
const SEAM_UNDER_PAINT = 0.55;
/** Roughness of bare wood, of oil paint, and of a seam's pitch. */
const ROUGH_WOOD = 0.82;
const ROUGH_PAINT = 0.48;
const ROUGH_PITCH = 0.4;
/** How far each plank's grain is shifted along and across, at most, m (no two alike). */
const PLANK_SHIFT = { along: 17, across: 0.37 } as const;
/** Planks thinner than this have no seams, m (solid pieces carry 0). */
const NO_PLANKS = 1e-3;
/** Seeds of the per-plank hashes. */
const ROW_SEED = 41.7;
const SHADE_SEED = 13.1;
/** Two seams in one pixel are one grey line: past this many seams per pixel they fade to an even tone. */
const SEAMS_FADE = 0.5;

// --- Below deck.
/**
 * Below her deck the sky's light comes only through her openings: the share of the open sky a point sees through an
 * opening of area A at distance d is about A / (A + π d²) (a disc seen face on); turned toward it, a little more.
 */
const HATCH_TURN = 1 / 2;
/** Even far from an opening a little light finds its way (seams, gratings, scuttles), a share of the sky. */
const BELOW_FLOOR = 0.012;
/** A lantern's light falls off as 1/(d² + this), m²: a flame is not a point. */
const FLAME_SIZE = 0.04;
/** The flames' flicker: how deep, its two rates (Hz), and how far apart the second rate's phase is from the first's. */
const FLICKER = { depth: 0.12, slow: 1.3, fast: 7.7, apart: 2.7 } as const;
/** Lengths below this are none, m. */
const TINY = 1e-3;
/** A turn, rad. */
const TURN = 2 * Math.PI;

/**
 * How a mesh of hers is lit below deck: the share of the sky reaching a point through the openings of its zone
 * (times the ambient occlusion `ao`), and the light of its zone's lanterns on it. Outside both are as under the sky.
 */
function belowDeck(ao) {
  const O = SHIP_OBJECT, I = SHIP_INPUTS, r = O.light;
  const p = O.toShip.mul(vec4(positionLocal, 1)).xyz, n = normalize(O.toShip.mul(vec4(normalLocal, 0)).xyz);
  const inside = step(0, r.w);
  const light = Fn(() => {
    const sky = float(0).toVar(), lamp = vec3(0).toVar();
    Loop({ start: int(r.z), end: int(r.w), type: 'int', condition: '<' }, ({ i }) => {
      const place = I.skyPlace.element(i), kind = I.skyKind.element(i);
      const to = vec3(place.x, kind.x, place.y).sub(p), d = length(to);
      const facing = mix(float(1 - HATCH_TURN), float(1 + HATCH_TURN), dot(n, to.div(max(d, TINY))).mul(1 / 2).add(1 / 2));
      const area = place.z.mul(place.w).mul(2 * 2);
      sky.addAssign(area.div(area.add(d.mul(d).mul(Math.PI))).mul(facing).mul(kind.y));
    });
    Loop({ start: int(r.x), end: int(r.y), type: 'int', condition: '<' }, ({ i }) => {
      const L = I.lamps.element(i), to = L.xyz.sub(p), f2 = dot(to, to);
      const flicker = float(1).add(sin(I.time.mul(FLICKER.slow * TURN).add(L.w)).add(sin(I.time.mul(FLICKER.fast * TURN).add(L.w.mul(FLICKER.apart)))).mul(FLICKER.depth / 2));
      lamp.addAssign(I.lantern.mul(flicker).mul(max(dot(n, normalize(to)), 0)).div(f2.add(FLAME_SIZE)));
    });
    return vec4(sky.max(BELOW_FLOOR), lamp);
  })();
  return { sky: mix(float(1), light.x, inside).mul(ao), lamp: light.yzw.mul(inside) };
}

/** Where a mesh being crossfaded is not drawn (its share of the screen's dither lies elsewhere). */
export function crossfadeMask() {
  const d = hash(screenCoordinate.xy), f = SHIP_OBJECT.fade;
  return step(f.x, d).mul(step(d, f.y.sub(TINY / 2))).greaterThan(1 / 2);
}

/** The damage drawn on a surface laid out in the damage map (shade.z its region): scorch darkens it. N6.5 adds holes. */
function scorched(colour, gr, region) {
  const k = REGIONS.element(int(max(region.sub(1), 0)));
  const uv = vec2(k.z.add(gr.x.sub(k.x).div(DAMAGE_TEXEL)), k.w.add(gr.y.sub(k.y).div(DAMAGE_TEXEL))).div(vec2(DAMAGE_MAP_SIZE.width, DAMAGE_MAP_SIZE.height));
  const scorch = texture(DAMAGE_TEXTURE, uv).g.mul(step(1 / 2, region));
  return mix(colour, vec3(...CHAR), scorch);
}
/** Charred timber (linear RGB). */
const CHAR = [0.008, 0.007, 0.006];

/**
 * Her timber: grain, planks and their caulked seams, paint and its wear, grime, and the damage drawn on it. One kind
 * for every piece of wood; `crossfade` makes the kind of it a crossfade between levels of detail draws with.
 */
export function makeWoodMaterial(crossfade = false): MeshStandardNodeMaterial {
  // Both faces cast: her timbers touch (beam under deck, mast through partners), and back faces alone let the sun in at the joints.
  const m = new MeshStandardNodeMaterial({ side: FrontSide, shadowSide: DoubleSide });
  m.name = 'ship wood';
  const fin = attribute('finish', 'vec4'), gr = attribute('grain', 'vec4'), sh = attribute('shade', 'vec3');
  const plank = gr.z, planked = step(NO_PLANKS, plank);
  // Which plank: rows across the planks, butts along them every plank's length, staggered by row.
  const across = gr.y.div(max(plank, NO_PLANKS)), row = floor(across).mul(planked);
  const rowHash = hash(row.add(gr.w.mul(ROW_SEED))), shadeHash = hash(row.add(gr.w.mul(SHADE_SEED)).add(1));
  const along = gr.x.add(rowHash.mul(DECK_PLANK_LENGTH));
  const g = texture(grainTexture(), vec2(gr.x.add(rowHash.mul(PLANK_SHIFT.along)).div(GRAIN_SPAN.along), gr.y.add(rowHash.mul(PLANK_SHIFT.across)).div(GRAIN_SPAN.across)));
  const ao = sh.x, wear = sh.y;

  const grime = mix(float(1), float(GRIME_DARK), smoothstep(GRIME_FROM, GRIME_TO, g.z.mul(1 / 2).add(g.w.mul(1 / 2))));
  const corner = mix(float(CORNER_DARK), float(1), ao);
  const wood = vec3(...PINE).mul(fin.rgb).mul(float(1).sub(g.x.mul(LATE_DARK))).mul(float(1).sub(g.y.mul(PORE_DARK)))
    .mul(float(1).sub(shadeHash.mul(PLANK_SHADE))).mul(grime).mul(corner);
  // Paint, worn through where edges are rubbed (the grime noise breaks the edge up).
  const worn = smoothstep(WEAR_FROM, WEAR_FROM + WEAR_SOFT, wear.add(g.w.sub(1 / 2).mul(1 / 2)));
  const cover = fin.w.mul(float(1).sub(worn));
  const paint = fin.rgb.mul(float(1).sub(g.x.mul(PAINT_RELIEF))).mul(mix(float(1), grime, 1 / 2)).mul(corner);
  const surface = mix(wood, paint, cover);

  // The seams: distance to the nearest plank edge and butt, m, drawn with a pixel's width of smoothing.
  const edge = min(fract(across), float(1).sub(fract(across))).mul(plank);
  const butt = fract(along.div(DECK_PLANK_LENGTH)), buttEdge = min(butt, float(1).sub(butt)).mul(DECK_PLANK_LENGTH);
  const wAcross = fwidth(gr.y), wAlong = fwidth(gr.x);
  const seamA = float(1).sub(smoothstep(SEAM / 2, wAcross.add(SEAM / 2), edge));
  const seamB = float(1).sub(smoothstep(SEAM / 2, wAlong.add(SEAM / 2), buttEdge));
  // Far off, more than one seam a pixel: the seams become the even tone they average to.
  const fade = float(1).sub(smoothstep(0, SEAMS_FADE, wAcross.div(max(plank, NO_PLANKS))));
  const seam = max(seamA, seamB).mul(planked).mul(fade);
  const seamColour = mix(vec3(...PITCH), surface.mul(SEAM_UNDER_PAINT), cover);
  // Her outside wet where the sea has climbed it (wakeMap.ts `wetHull`); inside, dry.
  const wet = wetHull(positionLocal, scorched(mix(surface, seamColour, seam), gr, sh.z), mix(mix(float(ROUGH_WOOD), float(ROUGH_PAINT), cover), float(ROUGH_PITCH), seam.mul(float(1).sub(cover))), SHIP_OBJECT.ship, SHIPS_DRAWN);
  const outside = float(1).sub(step(0, SHIP_OBJECT.light.w));
  m.colorNode = mix(scorched(mix(surface, seamColour, seam), gr, sh.z), wet.colour, outside);
  m.roughnessNode = mix(mix(mix(float(ROUGH_WOOD), float(ROUGH_PAINT), cover), float(ROUGH_PITCH), seam.mul(float(1).sub(cover))), wet.rough, outside);
  m.metalnessNode = float(0);
  const light = belowDeck(ao);
  m.aoNode = light.sky;
  m.emissiveNode = m.colorNode.mul(light.lamp);
  if (crossfade) m.maskNode = crossfadeMask();
  return m;
}

// --- Iron.
const ROUGH_IRON = 0.55;
const METAL_IRON = 0.35;
/** Iron: black-leaded or painted, its colour from the fittings pack or the builder. */
export function makeIronMaterial(crossfade = false): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ side: FrontSide, shadowSide: DoubleSide });
  m.name = 'ship iron';
  const fin = attribute('finish', 'vec4'), sh = attribute('shade', 'vec3');
  m.colorNode = fin.rgb;
  m.roughnessNode = float(ROUGH_IRON);
  m.metalnessNode = float(METAL_IRON);
  const light = belowDeck(sh.x);
  m.aoNode = light.sky;
  m.emissiveNode = fin.rgb.mul(light.lamp);
  if (crossfade) m.maskNode = crossfadeMask();
  return m;
}

// --- Copper sheathing.
/** A copper sheet: 4 ft by 14 in, laid in rows along her, each row lapped over the one below (m). */
const SHEET = { length: 1.22, girth: 0.36 } as const;
/** The nails round each sheet's edge: how far apart, how far in from the edge, and their size (m). */
const NAILS = { pitch: 0.038, inset: 0.012, size: 0.005 } as const;
/** Copper bright, tarnished to brown, and green where it stays wet and dries (linear RGB). */
const COPPER_BROWN = [0.2, 0.085, 0.045];
const VERDIGRIS = [0.12, 0.26, 0.2];
/** How much of the sheet is tarnished, and where the green comes (noise above this). */
const TARNISH = 0.7;
const GREEN_FROM = 0.62;
const GREEN_SOFT = 0.12;
/** A sheet's lapped edge throws a fine dark line, this wide (m). */
const LAP = 0.004;
const ROUGH_COPPER = 0.42;
const ROUGH_TARNISH = 0.3;
/** The copper sheathing below her waterline: sheets, laps, nails, tarnish and verdigris. */
export function makeCopperMaterial(crossfade = false): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ side: FrontSide });
  m.name = 'ship copper';
  const fin = attribute('finish', 'vec4'), gr = attribute('grain', 'vec4');
  const rowF = gr.y.div(SHEET.girth), row = floor(rowF);
  const alongF = gr.x.div(SHEET.length).add(row.mul(1 / 2)), col = floor(alongF);
  const sheet = hash(row.mul(ROW_SEED).add(col));
  const g = texture(grainTexture(), vec2(gr.x.div(GRAIN_SPAN.along), gr.y.div(GRAIN_SPAN.along)));
  const eA = min(fract(rowF), float(1).sub(fract(rowF))).mul(SHEET.girth), eB = min(fract(alongF), float(1).sub(fract(alongF))).mul(SHEET.length);
  const lap = float(1).sub(smoothstep(LAP / 2, fwidth(gr.y).add(LAP), min(eA, eB)));
  // Nails: a row just inside each edge, every pitch.
  const nailRow = smoothstep(NAILS.size, 0, abs(min(eA, eB).sub(NAILS.inset)));
  const nailAlong = smoothstep(NAILS.size, 0, abs(fract(gr.x.add(gr.y).div(NAILS.pitch)).sub(1 / 2)).mul(NAILS.pitch));
  const nail = nailRow.mul(nailAlong);
  const tarnish = clamp(g.w.mul(TARNISH).add(sheet.mul(1 - TARNISH)), 0, 1);
  const green = smoothstep(GREEN_FROM, GREEN_FROM + GREEN_SOFT, g.z);
  const metal = mix(fin.rgb, vec3(...COPPER_BROWN), tarnish);
  const wet = wetHull(positionLocal, mix(mix(metal, vec3(...VERDIGRIS), green), vec3(...COPPER_BROWN), max(lap, nail)), mix(float(ROUGH_TARNISH), float(ROUGH_COPPER), tarnish).add(green.mul(1 / 2)), SHIP_OBJECT.ship, SHIPS_DRAWN);
  m.colorNode = wet.colour;
  m.metalnessNode = float(1).sub(green);
  m.roughnessNode = wet.rough;
  if (crossfade) m.maskNode = crossfadeMask();
  return m;
}

// --- The lantern's horn and flame.
/** The lantern's horn windows and its candle: lit from within, not by the scene. */
export function makeGlowMaterial(): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial({ side: DoubleSide });
  m.name = 'ship glow';
  m.colorNode = attribute('finish', 'vec4').rgb.mul(SHIP_INPUTS.glow);
  return m;
}

// --- Rope.
/** Hemp's colour new and as tarred (linear RGB). */
const HEMP = [0.3, 0.2, 0.1];
const TAR = [0.018, 0.015, 0.012];
/** A rope is three strands laid round it once every this many of its diameters. */
const STRANDS = 3;
const LAY_PER_DIAMETER = 3.4;
/** How deep the lay's grooves shade, and how much they tip the normal. */
const LAY_DARK = 0.45;
const LAY_TILT = 0.35;
/** (f - 1/2)² at a strand's edge, where the groove is deepest. */
const STRAND_EDGE = 1 / 4;
/** A rope is never drawn thinner than this many pixels across; its colour fades instead (ship.md: far rigging never shimmers). */
const ROPE_PIXELS = 1.4;
const ROUGH_HEMP = 0.88;
const ROUGH_TAR = 0.86;
/** A point (w 1) or a direction (w 0) carried by moving frame `i` (a float index). */
function framed(i, p, w) {
  const f = int(i).add(int(SHIP_OBJECT.ship).mul(MOST_FRAMES));
  const row = (r) => textureLoad(FRAMES_TEXTURE, ivec2(r, f)), q = vec4(p, w);
  return vec3(dot(row(0), q), dot(row(1), q), dot(row(2), q));
}

/**
 * Rope: tubes widened to a pixel and faded by how much of it they cover, with the lay of three strands up close. A
 * rope follows the spars it is made fast to (rope.ts RopeFollow): turned rigidly with one, or its ends carried by two.
 */
export function makeRopeMaterial(): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ side: FrontSide, transparent: true });
  m.name = 'ship rope';
  const I = SHIP_INPUTS;
  const r = attribute('rope', 'vec4'), along = attribute('along', 'vec3');
  const fw = attribute('follow', 'vec3'), A = attribute('anchorA', 'vec3'), B = attribute('anchorB', 'vec3');
  const cover = varyingProperty('float', 'vRopeCover');
  const nMoved = varyingProperty('vec3', 'vRopeNormal'), tMoved = varyingProperty('vec3', 'vRopeAlong');
  /** Where its ends' frames carry it: rigidly with one, or by the moves of its two ends, blended along it; its centre line, along and out. */
  const carriedRope = () => {
    const rigid = step(abs(fw.x.sub(fw.y)), 1 / 2);
    const carried = positionGeometry.add(mix(framed(fw.x, A, 1).sub(A), framed(fw.y, B, 1).sub(B), fw.z));
    const centre = mix(carried, framed(fw.x, positionGeometry, 1), rigid);
    const t = normalize(mix(framed(fw.x, along, 0), framed(fw.y, along, 0), fw.z));
    const n0 = mix(framed(fw.x, normalGeometry, 0), framed(fw.y, normalGeometry, 0), fw.z);
    return { centre, t, n: normalize(n0.sub(t.mul(dot(n0, t)))) };
  };
  m.positionNode = Fn(() => {
    const { centre, t, n } = carriedRope();
    nMoved.assign(n);
    tMoved.assign(t);
    const radius = r.z;
    const least = length(modelViewMatrix.mul(vec4(centre, 1)).xyz).mul(I.pixel).mul(ROPE_PIXELS / 2);
    const w = max(radius, least);
    cover.assign(radius.div(w));
    return centre.add(n.mul(w));
  })();
  // Its shadow is the rope as thick as it is: widened by the sun's camera's distance it would throw a band (plan N3.10).
  m.castShadowPositionNode = Fn(() => {
    const { centre, n } = carriedRope();
    return centre.add(n.mul(r.z));
  })();
  // The lay: strands wound round the rope; seen from far the grooves average out.
  const phase = r.x.mul(STRANDS).add(r.y.div(r.z.mul(2 * LAY_PER_DIAMETER)));
  const f = fract(phase).sub(1 / 2), near = float(1).sub(smoothstep(STRAND_EDGE, 1, fwidth(phase)));
  const groove = float(1).sub(f.mul(f).div(STRAND_EDGE).mul(LAY_DARK).mul(near));
  m.normalNode = transformNormalToView(normalize(nMoved.add(tMoved.mul(f.mul(LAY_TILT).mul(near)))));
  m.colorNode = mix(vec3(...HEMP), vec3(...TAR), r.w).mul(groove);
  m.roughnessNode = mix(float(ROUGH_HEMP), float(ROUGH_TAR), r.w);
  m.metalnessNode = float(0);
  // Crossfading between levels of detail, a rope fades by its share instead of being dithered.
  m.opacityNode = cover.mul(SHIP_OBJECT.fade.y.sub(SHIP_OBJECT.fade.x));
  return m;
}
