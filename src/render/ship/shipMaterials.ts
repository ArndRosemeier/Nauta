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
import { Color, DoubleSide, FrontSide, MeshBasicNodeMaterial, MeshStandardNodeMaterial, Vector3, Vector4 } from 'three/webgpu';
import {
  Fn, abs, attribute, clamp, dot, float, floor, fract, fwidth, hash, length, max, min, mix, normalGeometry, normalLocal, normalize,
  positionGeometry, positionLocal, smoothstep, step, texture, transformNormalToView, uniform, varyingProperty, vec2, vec3,
} from 'three/tsl';
import { DECK_PLANK_LENGTH, PLANKING } from '../../sim/rules/ships';
import { GRAIN_SPAN, makeGrainTexture } from './grain';
import { deckTopY, hullHalfBreadth } from './hullNode';

/** What the ship's shaders read, written each frame by the ship's view (shipView.ts). */
export const SHIP_INPUTS = {
  /** The eye in ship space (rope is widened to a pixel toward it), and the view's angle per pixel, rad. */
  eye: uniform(new Vector3()),
  pixel: uniform(0.001),
  /** The lantern's flame in ship space, and its light: colour times strength as the scene's lights carry it. */
  flame: uniform(new Vector3()),
  lantern: uniform(new Color()),
  /** The horn's glow: colour times strength (it flickers with the flame). */
  glow: uniform(new Color()),
  /** The hatch's opening: middle x and z, half its width and half its length, ship space (m). */
  hatch: uniform(new Vector4()),
};

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
 * Below her deck the sky's light comes only through the hatch: the share of the open sky a point sees through an
 * opening of area A at distance d is about A / (A + π d²) (a disc seen face on); turned toward it, a little more.
 */
const HATCH_TURN = 1 / 2;
/** Even far from the hatch a little light finds its way (scuttles, gratings, the cut ends of this slice). */
const BELOW_FLOOR = 0.012;
/** The ship's inside is this far inside her moulded breadth (m): her outer planking lies outside it. */
const INSIDE = PLANKING.side;
/** The lantern's light falls off as 1/(d² + this), m²: a flame is not a point. */
const FLAME_SIZE = 0.04;

/** One kind's lighting of her below deck: how much sky reaches a point (ambient occlusion), and the lantern's light on it. */
function belowDeck(ao) {
  const I = SHIP_INPUTS, p = positionLocal, n = normalize(normalLocal);
  // Below the deck's underside and inside her planking: no open sky but through the hatch.
  const inside = step(abs(p.x), hullHalfBreadth(p.y).sub(INSIDE));
  const under = step(p.y, deckTopY(p.x).sub(PLANKING.deck / 2));
  const below = inside.mul(under);
  const toHatch = vec3(I.hatch.x, deckTopY(I.hatch.x), I.hatch.y).sub(p);
  const d = length(toHatch);
  const facing = mix(float(1 - HATCH_TURN), float(1 + HATCH_TURN), dot(n, toHatch.div(max(d, NO_PLANKS))).mul(1 / 2).add(1 / 2));
  const area = I.hatch.z.mul(I.hatch.w).mul(2 * 2);
  const open = area.div(area.add(d.mul(d).mul(Math.PI))).mul(facing).max(BELOW_FLOOR);
  const sky = mix(float(1), open, below).mul(ao);
  const toFlame = I.flame.sub(p), f2 = dot(toFlame, toFlame);
  const lamp = I.lantern.mul(max(dot(n, normalize(toFlame)), 0)).div(f2.add(FLAME_SIZE)).mul(below);
  return { sky, lamp };
}

/** Her timber: grain, planks and their caulked seams, paint and its wear, grime. One kind for every piece of wood. */
export function makeWoodMaterial(): MeshStandardNodeMaterial {
  // Both faces cast: her timbers touch (beam under deck, mast through partners), and back faces alone let the sun in at the joints.
  const m = new MeshStandardNodeMaterial({ side: FrontSide, shadowSide: DoubleSide });
  m.name = 'ship wood';
  const fin = attribute('finish', 'vec4'), gr = attribute('grain', 'vec4'), sh = attribute('shade', 'vec2');
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
  m.colorNode = mix(surface, seamColour, seam);
  m.roughnessNode = mix(mix(float(ROUGH_WOOD), float(ROUGH_PAINT), cover), float(ROUGH_PITCH), seam.mul(float(1).sub(cover)));
  m.metalnessNode = float(0);
  const light = belowDeck(ao);
  m.aoNode = light.sky;
  m.emissiveNode = m.colorNode.mul(light.lamp);
  return m;
}

// --- Iron.
const ROUGH_IRON = 0.55;
const METAL_IRON = 0.35;
/** Iron: black-leaded or painted, its colour from the fittings pack or the builder. */
export function makeIronMaterial(): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ side: FrontSide, shadowSide: DoubleSide });
  m.name = 'ship iron';
  const fin = attribute('finish', 'vec4'), sh = attribute('shade', 'vec2');
  m.colorNode = fin.rgb;
  m.roughnessNode = float(ROUGH_IRON);
  m.metalnessNode = float(METAL_IRON);
  const light = belowDeck(sh.x);
  m.aoNode = light.sky;
  m.emissiveNode = fin.rgb.mul(light.lamp);
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
export function makeCopperMaterial(): MeshStandardNodeMaterial {
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
  m.colorNode = mix(mix(metal, vec3(...VERDIGRIS), green), vec3(...COPPER_BROWN), max(lap, nail));
  m.metalnessNode = float(1).sub(green);
  m.roughnessNode = mix(float(ROUGH_TARNISH), float(ROUGH_COPPER), tarnish).add(green.mul(1 / 2));
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
const ROUGH_TAR = 0.72;
/** Rope: tubes widened to a pixel and faded by how much of it they cover, with the lay of three strands up close. */
export function makeRopeMaterial(): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ side: FrontSide, transparent: true });
  m.name = 'ship rope';
  const I = SHIP_INPUTS;
  const r = attribute('rope', 'vec4'), along = attribute('along', 'vec3');
  const cover = varyingProperty('float', 'vRopeCover');
  m.positionNode = Fn(() => {
    const centre = positionGeometry, radius = r.z;
    const least = length(centre.sub(I.eye)).mul(I.pixel).mul(ROPE_PIXELS / 2);
    const w = max(radius, least);
    cover.assign(radius.div(w));
    return centre.add(normalGeometry.mul(w));
  })();
  // The lay: strands wound round the rope; seen from far the grooves average out.
  const phase = r.x.mul(STRANDS).add(r.y.div(r.z.mul(2 * LAY_PER_DIAMETER)));
  const f = fract(phase).sub(1 / 2), near = float(1).sub(smoothstep(STRAND_EDGE, 1, fwidth(phase)));
  const groove = float(1).sub(f.mul(f).div(STRAND_EDGE).mul(LAY_DARK).mul(near));
  m.normalNode = transformNormalToView(normalize(normalLocal.add(along.mul(f.mul(LAY_TILT).mul(near)))));
  m.colorNode = mix(vec3(...HEMP), vec3(...TAR), r.w).mul(groove);
  m.roughnessNode = mix(float(ROUGH_HEMP), float(ROUGH_TAR), r.w);
  m.metalnessNode = float(0);
  m.opacityNode = cover;
  return m;
}
