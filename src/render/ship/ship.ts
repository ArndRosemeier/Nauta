/**
 * The whole brig drawn (plan N2.4): her hull, decks, rooms and openings built from the plan (sim/ship/plan.ts) and
 * her lines (sim/ship/hull.ts) to the quality the slice fixed (N2.0), each zone of her as its own meshes (zones.ts),
 * with the light that reaches each zone below deck, the portals between zones, and a coarse outside for the other
 * ship at a distance. Built in a worker at load (shipWorker.ts); the page only makes the meshes.
 */
import { Matrix4, Vector3 } from 'three/webgpu';
import { MAIN_HATCH, PORTS, PORT_GUNS, ROPE } from '../../sim/rules/ships';
import { weatherDeck } from '../../sim/ship/hull';
import { berthDeck, shipPlan, type ShipPlan } from '../../sim/ship/plan';
import { shipY, shipZ } from '../../sim/ship/section';
import { lathe } from './shapes';
import { hanging } from './rope';
import { IRON, RED } from './looks';
import { place, type Fittings } from './fittings';
import { ShipParts, type ZoneParts } from './parts';
import type { Packed } from './gathered';
import { bulwarkInside, buildBulwarks, buildOutside, deckEnds, lidEdge, outsideX, type Detail } from './hullSide';
import { buildDeckBeams, buildDeckOpenings, buildPartners, buildWeatherDeck, type DeckContext } from './decks';
import { buildRooms } from './rooms';
import { buildRigs } from './rig';
import { buildSailGrids, type SailDetail } from './sailGrid';
import { OUTSIDE, levelAt, openingsOn, rectCentre, portals, zoneOfSpaces, zoneUnder, type Portal } from './zones';

/** The breeching's ring bolts either side of a port (m from its middle, m above the deck) and the rope's slack. */
const BREECHING_BOLT = { out: 0.62, up: 0.55, sag: 0.16, steps: 10 } as const;
/** Ring bolts: ring radius and thickness, m; sides of the ring. */
const RING_BOLT = { radius: 0.035, thick: 0.012, sides: 10 } as const;
/** The port lid's lanyard runs to a hole this far below the rail, m; its sag and pieces. */
const LANYARD = { belowRail: 0.12, sag: 0.03, steps: 6 } as const;
/** The carronade's breeching ring in the pack's model space (Blender's [0, 0.97, 0.70] turned Y up, front +Z). */
const BREECHING_RING = [0, 0.7, -0.97] as const;
/** Each carronade's seed from its place along her (its small differences of finish). */
const GUN_SEED_PER_METRE = 10;
/** A quarter turn, rad. */
const QUARTER = Math.PI / 2;
/** How much of the sky an opening lets through below: a grating's holes, a hooded companion, the glazed skylight, open ladderways and scuttles. */
const LETS_THROUGH: Readonly<Record<string, number>> = { hatch: 0.4, companion: 0.35, skylight: 0.5, ladderway: 1, scuttle: 1 };
/** The far ship's detail: rows along her and points up her girth this far apart, m. */
const FAR_DETAIL: Detail = { rowStep: 0.9, girthStep: 0.3 };
/** The weather deck's coamings, m thick. */
const COAMING_THICK = MAIN_HATCH.coamingThick;

/** An opening that lets the sky in below, as the shaders read it: its middle and half sizes in ship space, its deck's height, and how much it lets through. */
export interface SkyOpening {
  readonly zone: string;
  readonly x: number;
  readonly z: number;
  readonly halfWidth: number;
  readonly halfLength: number;
  readonly y: number;
  readonly strength: number;
}

/** One zone's meshes as typed arrays. */
export interface ZoneBuild {
  readonly name: string;
  readonly wood: Packed;
  readonly iron: Packed;
  readonly copper: Packed;
  readonly glow: Packed;
  readonly ropes: Packed;
}

/** The ship as built: what the page makes meshes of. Plain data, so a worker can send it. */
export interface ShipBuild {
  readonly zones: readonly ZoneBuild[];
  /** The coarse outside for the far ship. */
  readonly far: ZoneBuild;
  /** The spars that turn (yards, boom, gaff), each named by its spar id, near and on the far ship. */
  readonly swings: readonly ZoneBuild[];
  readonly farSwings: readonly ZoneBuild[];
  readonly doors: readonly { readonly id: string; readonly wood: Packed; readonly iron: Packed; readonly hinge: readonly [number, number, number]; readonly shut: number; readonly opens: number; readonly zones: readonly [string, string] }[];
  readonly lamps: readonly { readonly zone: string; readonly at: readonly [number, number, number] }[];
  readonly skies: readonly SkyOpening[];
  readonly portals: readonly Portal[];
  /** Metres of rope laid, for the notes. */
  readonly rope: number;
  /** Her sails and flags as grids shaped on the GPU (sailGrid.ts): fine and coarse near (a quality knob), and the far ship's. */
  readonly sails: Readonly<Record<SailDetail, Packed>>;
}

/** Every buffer of a build, to hand it from the worker to the page without a copy. */
export function shipBuffers(build: ShipBuild): ArrayBuffer[] {
  const out: ArrayBuffer[] = [];
  const add = (p: Packed) => { for (const a of p.attributes) out.push(a.data.buffer as ArrayBuffer); out.push(p.index.buffer as ArrayBuffer); };
  for (const z of [...build.zones, build.far, ...build.swings, ...build.farSwings]) for (const p of [z.wood, z.iron, z.copper, z.glow, z.ropes]) add(p);
  for (const d of build.doors) { add(d.wood); add(d.iron); }
  for (const p of Object.values(build.sails)) add(p);
  return [...new Set(out)];
}

const pack = (name: string, z: ZoneParts): ZoneBuild => ({ name, wood: z.wood.packed(), iron: z.iron.packed(), copper: z.copper.packed(), glow: z.glow.packed(), ropes: z.ropes.packed() });

/** The whole ship from the fittings pack. */
export function buildShip(fittings: Fittings): ShipBuild {
  const plan = shipPlan(), zones = zoneOfSpaces(plan), parts = new ShipParts();
  const ctx: DeckContext = { plan, zones, parts };
  const out = parts.zone(OUTSIDE);
  const { aft, fore } = deckEnds();
  buildOutside(out);
  buildBulwarks(out, aft, fore);
  buildWeatherDeck(ctx, aft, fore);
  buildPartners(out);
  buildDeckBeams(ctx, aft, fore);
  buildDeckOpenings(ctx, COAMING_THICK);
  const lamps = buildRooms(ctx, fittings);
  buildGuns(fittings, out);
  buildRigs(fittings, plan, out, (along, h) => {
    const z = zoneUnder(plan, zones, levelAt(along, h), along, 0);
    return z ? parts.zone(z) : null;
  }, (id) => parts.swing(id));

  const far = buildFar(fittings);
  let rope = 0;
  for (const z of parts.zones.values()) rope += z.ropes.length;
  for (const z of parts.swings.values()) rope += z.ropes.length;
  return {
    zones: [...parts.zones].map(([name, z]) => pack(name, z)),
    far: pack(OUTSIDE, far.out),
    swings: [...parts.swings].map(([name, z]) => pack(name, z)),
    farSwings: [...far.parts.swings].map(([name, z]) => pack(name, z)),
    doors: parts.doors.map((d) => ({ id: d.id, wood: d.wood.packed(), iron: d.iron.packed(), hinge: d.hinge, shut: d.shut, opens: d.opens, zones: d.zones })),
    lamps: lamps.map((l) => ({ zone: l.zone, at: [l.at.x, l.at.y, l.at.z] as const })),
    skies: skyOpenings(plan, zones),
    portals: portals(plan),
    rope,
    sails: { fine: buildSailGrids('fine'), coarse: buildSailGrids('coarse'), far: buildSailGrids('far') },
  };
}

/** Her outside alone, coarse, for when she is far off: hull, bulwarks, deck, openings and the rig; no guns, no rooms. */
function buildFar(fittings: Fittings): { out: ZoneParts; parts: ShipParts } {
  const plan = shipPlan(), parts = new ShipParts(), ctx: DeckContext = { plan, zones: new Map(), parts, far: true };
  const out = parts.zone(OUTSIDE);
  const { aft, fore } = deckEnds();
  buildOutside(out, FAR_DETAIL);
  buildBulwarks(out, aft, fore, FAR_DETAIL);
  buildWeatherDeck(ctx, aft, fore, FAR_DETAIL.rowStep);
  buildDeckOpenings(ctx, COAMING_THICK);
  buildRigs(fittings, plan, out, () => null, (id) => parts.swing(id), true);
  return { out, parts };
}

/** The carronades at their ports, both sides, run out, with their breechings and the port lids' lanyards (the long sixes come with N2.6). */
function buildGuns(fittings: Fittings, out: ZoneParts): void {
  for (const side of [1, -1]) {
    for (const [mark, along, sill, top] of PORTS) {
      const zc = shipZ(along);
      const inX = (h: number) => side * bulwarkInside(along, h);
      // The ring bolts either side of the port for the breeching.
      const boltH = weatherDeck(along, bulwarkInside(along, sill)) + BREECHING_BOLT.up;
      for (const dz of [-BREECHING_BOLT.out, BREECHING_BOLT.out]) {
        lathe(out.iron, new Matrix4().makeRotationZ(side * QUARTER).setPosition(new Vector3(inX(boltH), shipY(boltH), zc + dz)), ringProfile(), RING_BOLT.sides, IRON);
      }
      // The lid's lanyard, from its lower edge up through the bulwark under the rail.
      const hole = new Vector3(side * outsideX(along, top), shipY(top + LANYARD.belowRail), zc);
      out.ropes.line(hanging(lidEdge(along, top, sill, side), hole, LANYARD.sag, LANYARD.steps), ROPE.running / 2, 1);
      if (PORT_GUNS[mark]!.gun !== 'carronade') continue;
      const x = inX(sill), frame = new Matrix4().makeRotationY(side * QUARTER).setPosition(x, shipY(weatherDeck(along, x)), zc);
      place(fittings, 'prop_carronade_32', frame, { iron: { solid: out.iron, paint: 1 }, wood: { solid: out.wood, paint: 1, rgb: RED.rgb } }, Math.round(along * GUN_SEED_PER_METRE));
      // The breeching: from a ring bolt by the port, through the ring on the cascabel, to the other.
      const ring = new Vector3(...BREECHING_RING).applyMatrix4(frame);
      for (const dz of [-BREECHING_BOLT.out, BREECHING_BOLT.out]) {
        out.ropes.line(hanging(new Vector3(inX(boltH), shipY(boltH), zc + dz), ring, BREECHING_BOLT.sag, BREECHING_BOLT.steps), ROPE.breeching / 2, 0);
      }
    }
  }
}

/** A ring bolt's ring as a turned profile (a short eye standing off the timber). */
function ringProfile(): [number, number][] {
  const r = RING_BOLT.radius, t = RING_BOLT.thick;
  return [[0, -t], [t, -t], [t, r], [r, r + t], [r, r + 2 * t], [0, r + 2 * t]];
}

/** The sky's share through an opening of area `area` seen from `d` m off: about A / (A + π d²). */
const share = (area: number, d: number) => area / (area + Math.PI * d * d);

/**
 * Where the sky comes in below, for each zone: each weather-deck opening lights the berth deck's zone under it, and
 * each opening in the berth deck lights the hold's zone under it with what reaches it from above.
 */
export function skyOpenings(plan: ShipPlan, zones: ReadonlyMap<string, string>): SkyOpening[] {
  const out: SkyOpening[] = [];
  const weather = openingsOn(plan, 'weather');
  for (const o of plan.openings) {
    const c = rectCentre(o), below = o.level === 'weather' ? 'berth' : o.level === 'berth' ? 'hold' : null;
    if (!below) continue;
    const zone = zoneUnder(plan, zones, below, c.along, c.across);
    if (!zone) continue;
    const y = o.level === 'weather' ? weatherDeck(c.along, c.across) : berthDeck(c.along);
    let strength = LETS_THROUGH[o.kind] ?? 1;
    if (o.level === 'berth') {
      // What reaches this opening from the weather deck's openings above.
      strength *= weather.reduce((sum, w) => {
        const wc = rectCentre(w), d = Math.hypot(wc.along - c.along, wc.across - c.across, weatherDeck(wc.along, wc.across) - y);
        return sum + share((w.fore - w.aft) * (w.starboard - w.port), d) * (LETS_THROUGH[w.kind] ?? 1);
      }, 0);
    }
    out.push({ zone, x: c.across, z: shipZ(c.along), halfWidth: (o.starboard - o.port) / 2, halfLength: (o.fore - o.aft) / 2, y: shipY(y), strength });
  }
  return out;
}
