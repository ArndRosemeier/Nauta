/**
 * Her fittings drawn (plan N2.6): every fitting `furnish` sets out on her plan (sim/ship/furnish.ts), drawn as
 * instances of the models in the fittings pack (`@futuremagic/props`, AssetGenerator specs) through
 * `@futuremagic/instances`, set once in her moving frame so they move with her pose. Each model's material slots go
 * to her own kinds as on the slice (wood, iron, glow; fitted.ts makes them draw instances in her frame), each at the
 * levels of detail its spec ships, and far off small things drop out.
 *
 * One set of draws per zone of her (zones.ts), put into that zone's group: seen when it is, lit by its lanterns and
 * the openings over it.
 */
import { Matrix4, Vector3, type Camera, type Object3D, type WebGPURenderer } from 'three/webgpu';
import { createInstanceDraws, DITHER, FRAME, KIND, RECORD, type DrawKind, type DrawLod, type InstanceDraws } from '@futuremagic/instances';
import { hash2f } from '@futuremagic/core';
import type { Furnishing } from '../../sim/ship/furnish';
import { shipPlan } from '../../sim/ship/plan';
import { OUTSIDE, zoneOfSpaces, zoneUnder } from './zones';
import { FITTED_GLOW, FITTED_IRON, FITTED_WOOD } from '../materials';
import { place, type Fittings, type SlotTarget } from './fittings';
import { TO_SHIP } from './fitted';
import { OAK, RED } from './looks';
import { MODEL } from '../../sim/rules/fittings';
import { Solid } from './solid';

/** Which of her kinds draws each material slot of the fittings' specs: timber and cloth, metal and glass, and what glows. */
const SLOT_KIND: Readonly<Record<string, 'wood' | 'iron' | 'glow'>> = {
  wood: 'wood', planks: 'wood', timber: 'wood', paint: 'wood', oar: 'wood', rope: 'wood', canvas: 'wood', blanket: 'wood',
  cloth: 'wood', leather: 'wood', fleece: 'wood', brick: 'wood', head: 'wood', soot: 'wood', sheave: 'wood', match: 'wood',
  hole: 'wood', card: 'wood',
  iron: 'iron', brass: 'iron', bronze: 'iron', copper: 'iron', tin: 'iron', glass: 'iron', water: 'iron',
  fire: 'glow', horn: 'glow', candle: 'glow', glow: 'glow',
};
const KINDS = [['wood', FITTED_WOOD], ['iron', FITTED_IRON], ['glow', FITTED_GLOW]] as const;
/**
 * Her timber as on the rest of her (looks.ts): bare wood takes her oak with its grain, the guns' carriages her red
 * ochre as on the slice. Every other slot (paint, rope, canvas, metal) keeps the spec's own colours.
 */
const BARE: ReadonlySet<string> = new Set(['wood', 'planks', 'timber', 'head', 'oar', 'sheave']);
const GUNS: ReadonlySet<string> = new Set([MODEL.long6]);

/**
 * Levels of detail by size: a model's radius r (m) is drawn whole to r × NEAR_PER_METRE, its spec's lower levels each
 * LEVEL_STEP times further, and none past r × FAR_PER_METRE (between FAR_LEAST and FAR_MOST), faded out over the
 * last FADE share.
 */
const NEAR_PER_METRE = 14;
const LEVEL_STEP = 3;
const FAR_PER_METRE = 260;
const FAR_LEAST = 35;
const FAR_MOST = 900;
const FADE = 0.25;
/** Lower levels a spec may ship (`<id>_lod1`, `<id>_lod2`, ...). */
const MOST_LEVELS = 4;
/**
 * Fittings whose middle size is under this (m: buckets, garlands, rammers, handspikes) cast no sun shadow: each
 * caster is drawn again in the shadow map, and their shadows are thinner than its texels show well.
 */
const LEAST_CASTER = 0.35;
/** How far the fittings' shadows reach at a low sun, m (the boats on the skids, the anchors). */
const SHADOW_REACH = 12;
/** Room for this many fittings on a level at first (they grow as needed). */
const CAPACITY = 512;
/** Seed of the fade's dither. */
const DITHER_SEED = 2604;
/** A lower level's name ends so (`<id>_lod1`). */
const LOD_SUFFIX = /_lod\d+$/;
/** Numbers per position. */
const XYZ = 3;

/** One model's mesh per kind at one level of detail. */
interface Part { readonly kind: (typeof KINDS)[number][1]; readonly solid: Solid }

/** A model's slots poured into fresh solids, one per kind, in its own frame. */
function partsOf(fittings: Fittings, name: string): Part[] {
  const solids = { wood: new Solid(), iron: new Solid(), glow: new Solid() };
  const m = fittings.get(name);
  if (!m) throw new Error(`the fittings pack has no ${name}`);
  const slots: Record<string, SlotTarget> = {};
  for (const s of m.slotNames) {
    const k = SLOT_KIND[s];
    if (!k) throw new Error(`${name}: no kind draws its slot ${s} (furnishings.ts SLOT_KIND)`);
    const finish = !BARE.has(s) ? null : GUNS.has(name.replace(LOD_SUFFIX, '')) && s === 'wood' ? RED : OAK;
    slots[s] = finish ? { solid: solids[k], paint: finish.paint, rgb: finish.rgb } : { solid: solids[k], paint: 1, own: true };
  }
  place(fittings, name, new Matrix4(), slots);
  return KINDS.filter(([k]) => solids[k].triangles > 0).map(([k, kind]) => ({ kind, solid: solids[k] }));
}

/** A model's radius about its origin, m. */
function radiusOf(fittings: Fittings, name: string): number {
  const m = fittings.get(name)!;
  let r = 0;
  for (let i = 0; i < m.positions.length; i += XYZ) r = Math.max(r, Math.hypot(m.positions[i]!, m.positions[i + 1]!, m.positions[i + 2]!));
  return r;
}

/** A model's levels of detail: its own and its spec's lower levels, by distance from its size. */
function drawKind(fittings: Fittings, name: string): DrawKind {
  const names = [name];
  for (let k = 1; k <= MOST_LEVELS && fittings.has(`${name}_lod${k}`); k++) names.push(`${name}_lod${k}`);
  const r = radiusOf(fittings, name), m = fittings.get(name)!;
  const casts = [0, 1, 2].map((k) => m.max[k]! - m.min[k]!).sort((a, b) => a - b)[1]! >= LEAST_CASTER;
  const far = Math.min(FAR_MOST, Math.max(FAR_LEAST, r * FAR_PER_METRE));
  const lods: DrawLod[] = names.map((n, i) => {
    const near = i === 0 ? 0 : Math.min(far, r * NEAR_PER_METRE * LEVEL_STEP ** (i - 1));
    const last = i === names.length - 1, end = last ? far : Math.min(far, r * NEAR_PER_METRE * LEVEL_STEP ** i);
    return {
      ...(i > 0 ? { near } : {}), far: end, ...(last ? { fade: [end * (1 - FADE), end] as [number, number] } : {}),
      parts: partsOf(fittings, n).map((p) => ({ geometry: p.solid.geometry(), material: p.kind.make(), castShadow: p.kind.shadow.cast && casts, receiveShadow: p.kind.shadow.receive, name: n })),
    };
  });
  return { lods };
}

/** Her fittings, drawn in her frame: give each zone's group to that zone of her (ShipView.addToZone), and call `update` each frame after she is posed. */
export class Furnishings {
  /** The draws of each zone of her (zones.ts): a zone's fittings are seen when it is, and lit by its lanterns. */
  readonly zones = new Map<string, InstanceDraws>();
  /** Her frame: from her space to the world, read by the draws on each update. */
  private readonly frame = new Matrix4();
  private readonly sunDir = new Vector3(0, -1, 0);
  /** How many fittings stand on her, and their triangles at full detail (for the HUD and the plan's notes). */
  readonly count: number;
  readonly triangles: number;

  constructor(renderer: WebGPURenderer, fittings: Fittings, list: readonly Furnishing[]) {
    const plan = shipPlan(), spaceZones = zoneOfSpaces(plan);
    const zoneOf = (f: Furnishing) => (f.level === 'weather' ? OUTSIDE : zoneUnder(plan, spaceZones, f.level, -f.z, f.x)) ?? OUTSIDE;
    const byZone = new Map<string, Furnishing[]>();
    for (const f of list) {
      const z = zoneOf(f);
      byZone.set(z, [...(byZone.get(z) ?? []), f]);
    }
    let triangles = 0;
    for (const [zone, here] of byZone) {
      const models: string[] = [];
      for (const f of here) if (!models.includes(f.model)) models.push(f.model);
      const kinds = models.map((m) => drawKind(fittings, m));
      const draws = createInstanceDraws(renderer, kinds, { frames: [this.frame], shadow: { dir: this.sunDir, reach: SHADOW_REACH }, capacity: CAPACITY });
      draws.group.name = `furnishings ${zone}`;
      const data = new Float32Array(here.length * RECORD), m = new Matrix4(), spin = new Matrix4(), lean = new Matrix4();
      here.forEach((f, i) => {
        m.makeRotationY(f.turn).multiply(lean.makeRotationX(f.lean)).multiply(spin.makeRotationY(f.spin)).setPosition(f.x, f.y, f.z);
        const o = i * RECORD, k = models.indexOf(f.model);
        m.toArray(data, o);
        data[o + KIND] = k;
        data[o + DITHER] = hash2f(DITHER_SEED, i, k);
        data[o + FRAME] = 1;
        triangles += kinds[k]!.lods[0]!.parts.reduce((n, p) => n + (p.geometry.index?.count ?? 0) / XYZ, 0);
      });
      draws.set(data, here.length);
      this.zones.set(zone, draws);
    }
    this.count = list.length;
    this.triangles = triangles;
  }

  /** Builds what the draws need ahead (the GPU path's compute shaders); then the Stage's warm-up builds their draw shaders with the groups. */
  async ready(): Promise<void> {
    for (const d of this.zones.values()) await d.ready();
  }

  /** Each frame once her group is posed: her frame from it, the way back for her materials, and the draws' levels. */
  update(ship: Object3D, camera: Camera, sunDir?: Vector3): void {
    this.frame.copy(ship.matrixWorld);
    TO_SHIP.value.copy(this.frame).invert();
    if (sunDir) this.sunDir.copy(sunDir).negate();
    for (const d of this.zones.values()) d.update(camera);
  }
}
