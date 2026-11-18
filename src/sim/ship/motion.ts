/**
 * Floating (pure, implementation plan N2.2): the brig on the simulated sea. Her hull is a closed surface of pressure
 * points (the plan's hull, `hullMesh`, outside her planking, with her keel); each point under the water is pushed in
 * by the water's pressure at its depth below the surface over it, and her weight pulls her centre down. Heave, pitch
 * and roll are integrated at the simulation's fixed step; her heading, her way through the water and her sails'
 * heeling moment come from the sailing model (sailing.ts, `Way`). The one owner of her pose (rules.json `owners`).
 *
 * Ship space is section.ts's: metres, +x starboard, +y up from the load waterline, -z forward. Her pose places her
 * centre of gravity in the world and turns ship space about it: rolled (starboard down), pitched (bow up), then
 * turned to her heading, the same order three.js calls 'YXZ' with (pitch, -heading, -roll).
 *
 * **Why pressure and not a waterplane.** The pressure over her wetted hull sums to her displaced water wherever
 * the surface stands, so a wave under her bow, a deck edge going under at a hard heel, or her bilge coming out of
 * the water all act as they do on the real hull, and her stability at any heel is her own lines' (no metacentric
 * height is written down anywhere: the roll period comes out of the hull and her weight).
 *
 * **Cost.** The water is sampled once a step on a small grid under her (`surfaceAt` is the costly part), and every
 * pressure point reads it bilinearly; one step is about 55 µs on a desktop.
 */
import { surfaceAt, seaSample, type SeaState } from '../sea/sea';
import { sincos } from '../trig';
import { GRAVITY, STEP_SECONDS } from '../units';
import {
  DESIGN_WATERLINE, HEAVE_ADDED_MASS, HULL_DAMPING, KEEL_DEPTH, KEEL_HALF_SIDING, LOAD_WATERLINE, MIDSHIP_SECTION,
  PITCH_ADDED_INERTIA, PITCH_GYRATION, PLANKING, ROLL_GYRATION, SEA_WATER,
} from '../rules/ships';
import { buoyancyAlong, designWaterline, hullEnds, hullMesh } from './hull';
import { shipPlan } from './plan';
import { shipWeight } from './weight';

/**
 * How she lies on the water: her centre of gravity in the world (x, z on the calm sea; `heave` its height over the
 * calm level, m), her heading (a compass bearing, rad), pitch (bow up, rad) and roll (to starboard, rad), and how fast
 * heave, pitch and roll change (m/s, rad/s).
 */
export interface ShipPose {
  readonly x: number;
  readonly z: number;
  readonly heave: number;
  readonly heading: number;
  readonly pitch: number;
  readonly roll: number;
  readonly heaveRate: number;
  readonly pitchRate: number;
  readonly rollRate: number;
}

/** A ship afloat: her pose, changed only here. Plain data, so the simulation frame (N3.1) can encode and hash it. */
export interface ShipMotion {
  readonly pose: ShipPose;
}

/**
 * How she goes, from the sailing model (sailing.ts): her heading (compass bearing, rad), her speed through the water
 * ahead and to starboard (m/s), and the moment her sails heel her with, to starboard, kN·m (it holds her heeled and,
 * since a sail aloft swinging across the wind presses against the swing, damps her roll).
 */
export interface Way {
  readonly heading: number;
  readonly ahead: number;
  readonly leeway: number;
  readonly rollMoment: number;
}

/** Lying still with her head on `heading` and no sail: the way of a ship at anchor (the slice). */
export const lyingStill = (heading: number): Way => ({ heading, ahead: 0, leeway: 0, rollMoment: 0 });

/** Her hull as pressure points: sections from end to end and rows up each side (about 1.6 m by 0.6 m panels). */
const HULL_SECTIONS = 20;
const HULL_ROWS = 10;
/**
 * The water's grid under her, in her heading's frame: samples along her, and at her two sides. About 4 m along and
 * her breadth across resolve the waves that move a hull of her size (a force 8 sea's shortest are about 28 m long);
 * shorter ones push her ends and sides both ways at once and leave her nearly still. The water is the costly part of a
 * step (`surfaceAt`, about 1.5 µs a sample), so the grid is no finer than that.
 */
const WATER_ALONG = 9;
const WATER_ACROSS = 2;
/** How far the water's grid reaches out to each side of her centre line, m (her half-breadth and a heel's swing). */
const WATER_HALF_WIDTH = 4.8;
/** How far the grid reaches beyond her ends, m (her ends swing as she pitches). */
const WATER_BEYOND_ENDS = 0.5;
/** A panel's least half-height for its share under water, m (a level panel goes under at once). */
const LEAST_EXTENT = 1e-3;
/** kN of sea water's weight per m³ (t/m³ times g): her pressure points push with this times their depth. */
const WATER_WEIGHT = SEA_WATER * GRAVITY;
/** Coordinates of a point, and entries of a 3 × 3 rotation. */
const XYZ = 3;
const MATRIX = 9;
/** Water samples carry height and the water's velocity (x, y, z), at these offsets; the grid's last places, and one row's length. */
const WATER_FIELDS = 4;
const VX = 1;
const VY = 2;
const VZ = 3;
const LAST_ALONG = WATER_ALONG - 1;
const LAST_ACROSS = WATER_ACROSS - 1;
const ROW_FIELDS = WATER_ACROSS * WATER_FIELDS;

/** Her body afloat, worked out once from the plan: pressure points, mass, centre and inertia. */
interface Body {
  /** Pressure-point mesh in ship space: vertices (x, y, z) and triangles. */
  readonly vertices: Float64Array;
  readonly triangles: Uint32Array;
  /** Each triangle's outward area vector in ship space (m²), and its area. */
  readonly areas: Float64Array;
  readonly area: Float64Array;
  /** Her mass, t, and her centre of gravity in ship space (on her centre line). */
  readonly mass: number;
  readonly centreY: number;
  readonly centreZ: number;
  /** What heaves with her (t) and her inertia in pitch and roll with the water moving with her, t·m². */
  readonly heaveMass: number;
  readonly pitchInertia: number;
  readonly rollInertia: number;
  /** The water grid's ends along her, ship space z (forward is -z), relative to her centre. */
  readonly gridAft: number;
  readonly gridFore: number;
}

let body: Body | null = null;

/** Her body afloat (built once). */
export function shipBody(): Body {
  return (body ??= makeBody());
}

function makeBody(): Body {
  const weight = shipWeight(shipPlan());
  const mesh = withKeel(planked(hullMesh(HULL_SECTIONS, HULL_ROWS)));
  const n = mesh.triangles.length / XYZ;
  const areas = new Float64Array(n * XYZ), area = new Float64Array(n);
  const v = mesh.vertices, t = mesh.triangles;
  for (let k = 0; k < n; k++) {
    const a = t[k * XYZ]! * XYZ, b = t[k * XYZ + 1]! * XYZ, c = t[k * XYZ + 2]! * XYZ;
    const ux = v[b]! - v[a]!, uy = v[b + 1]! - v[a + 1]!, uz = v[b + 2]! - v[a + 2]!;
    const wx = v[c]! - v[a]!, wy = v[c + 1]! - v[a + 1]!, wz = v[c + 2]! - v[a + 2]!;
    const nx = (uy * wz - uz * wy) / 2, ny = (uz * wx - ux * wz) / 2, nz = (ux * wy - uy * wx) / 2;
    areas[k * XYZ] = nx;
    areas[k * XYZ + 1] = ny;
    areas[k * XYZ + 2] = nz;
    area[k] = Math.sqrt(nx * nx + ny * ny + nz * nz);
  }
  // Her weight's centre: its height from the plan; along her, over her centre of buoyancy at the draught's waterline,
  // so she floats at the trim she was drawn to.
  const centreY = weight.centre - LOAD_WATERLINE, centreZ = -buoyancyAlong();
  const beam = 2 * Math.max(...MIDSHIP_SECTION.map((r) => r[1])), length = DESIGN_WATERLINE.fore[0] - DESIGN_WATERLINE.aft[0];
  const mass = weight.tonnes;
  let lo = Infinity, hi = -Infinity;
  for (let k = 2; k < v.length; k += XYZ) { lo = Math.min(lo, v[k]!); hi = Math.max(hi, v[k]!); }
  return {
    vertices: v, triangles: t, areas, area, mass, centreY, centreZ,
    heaveMass: mass * (1 + HEAVE_ADDED_MASS),
    pitchInertia: mass * (1 + PITCH_ADDED_INERTIA) * (PITCH_GYRATION * length) ** 2,
    rollInertia: mass * (ROLL_GYRATION * beam) ** 2,
    gridAft: hi - centreZ + WATER_BEYOND_ENDS,
    gridFore: lo - centreZ - WATER_BEYOND_ENDS,
  };
}

/** The plan's hull (heights above the base, metres along) in ship space, each point pushed out through her planking. */
function planked(m: { points: Float64Array; triangles: Uint32Array }): { vertices: Float64Array; triangles: Uint32Array } {
  const p = m.points, t = m.triangles, normals = new Float64Array(p.length);
  // Each vertex's normal: the sum of its faces' area vectors (their weights), in the mesh's own (x, height, along) frame.
  for (let k = 0; k < t.length; k += XYZ) {
    const a = t[k]! * XYZ, b = t[k + 1]! * XYZ, c = t[k + 2]! * XYZ;
    const ux = p[b]! - p[a]!, uy = p[b + 1]! - p[a + 1]!, uz = p[b + 2]! - p[a + 2]!;
    const wx = p[c]! - p[a]!, wy = p[c + 1]! - p[a + 1]!, wz = p[c + 2]! - p[a + 2]!;
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    for (const i of [a, b, c]) { normals[i] += nx; normals[i + 1] += ny; normals[i + 2] += nz; }
  }
  const out = new Float64Array(p.length);
  for (let i = 0; i < p.length; i += XYZ) {
    const len = Math.hypot(normals[i]!, normals[i + 1]!, normals[i + 2]!) || 1, s = PLANKING.side / len;
    out[i] = p[i]! + normals[i]! * s;
    out[i + 1] = p[i + 1]! + normals[i + 1]! * s - LOAD_WATERLINE;
    // Along her forward is -z in ship space; the flip turns the mesh's (x, height, along) into right-handed (x, y, z) and keeps its faces outward.
    out[i + 2] = -(p[i + 2]! + normals[i + 2]! * s);
  }
  // Mirroring z turns the winding over; swap two corners so the faces still turn out.
  const tris = Uint32Array.from(t);
  for (let k = 0; k < tris.length; k += XYZ) [tris[k + 1], tris[k + 2]] = [tris[k + 2]!, tris[k + 1]!];
  return { vertices: out, triangles: tris };
}

/** The keel box's faces by corner (corner = 4·end + 2·top + starboard), each wound to turn out. */
const KEEL_FACES = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]] as const;

/** Her keel below the rabbet, a closed box from the sternpost to the forefoot, added to the hull's points. */
function withKeel(m: { vertices: Float64Array; triangles: Uint32Array }): { vertices: Float64Array; triangles: Uint32Array } {
  const { aft, fore } = hullEnds(KEEL_DEPTH);
  const x = KEEL_HALF_SIDING, low = -LOAD_WATERLINE, high = KEEL_DEPTH - LOAD_WATERLINE;
  const base = m.vertices.length / XYZ, box: number[] = [];
  for (const z of [-aft, -fore]) for (const y of [low, high]) for (const sx of [-x, x]) box.push(sx, y, z);
  const tris = [...m.triangles];
  for (const [a, b, c, d] of KEEL_FACES) tris.push(base + a!, base + b!, base + c!, base + a!, base + c!, base + d!);
  return { vertices: Float64Array.from([...m.vertices, ...box]), triangles: Uint32Array.from(tris) };
}

/** Her rotation (ship space to the world) at a pose, as a row-major 3 × 3 into `out`. */
export function poseRotation(pose: ShipPose, out: Float64Array = new Float64Array(MATRIX)): Float64Array {
  sincos(pose.heading, sc);
  const sh = sc[0], ch = sc[1];
  sincos(pose.pitch, sc);
  const sp = sc[0], cp = sc[1];
  sincos(pose.roll, sc);
  const sr = sc[0], cr = sc[1];
  // R = turn(-heading) · pitch · roll(-roll): about y, then x, then z.
  out[0] = ch * cr + sh * sp * sr; out[1] = ch * sr - sh * sp * cr; out[2] = -sh * cp;
  out[3] = -cp * sr; out[4] = cp * cr; out[5] = -sp;
  out[6] = sh * cr - ch * sp * sr; out[7] = sh * sr + ch * sp * cr; out[8] = ch * cp;
  return out;
}
const sc: [number, number] = [0, 0];

/** A point of ship space (x, y, z) in the world at her pose, into `out`. */
export function toWorld(pose: ShipPose, x: number, y: number, z: number, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  const r = poseRotation(pose, rotation), b = shipBody();
  const dy = y - b.centreY, dz = z - b.centreZ;
  out[0] = pose.x + r[0]! * x + r[1]! * dy + r[2]! * dz;
  out[1] = pose.heave + r[3]! * x + r[4]! * dy + r[5]! * dz;
  out[2] = pose.z + r[6]! * x + r[7]! * dy + r[8]! * dz;
  return out;
}
const rotation = new Float64Array(MATRIX);

/** Where ship space's origin stands in the world at her pose (what a drawing of her is placed at). */
export const shipOrigin = (pose: ShipPose, out: [number, number, number] = [0, 0, 0]): [number, number, number] => toWorld(pose, 0, 0, 0, out);

/**
 * She put on the water with her centre at (x, z) and her bow toward `heading`, still, at the draught's load waterline:
 * trimmed by the stern as it slopes, the waterline at the mainmast on the calm level.
 */
export function startMotion(x: number, z: number, heading: number): ShipMotion {
  const [a0, h0] = DESIGN_WATERLINE.aft, [a1, h1] = DESIGN_WATERLINE.fore;
  const pitch = Math.atan((h0 - h1) / (a1 - a0));
  // The waterline's point at the mainmast, (0, y0, 0) in ship space, on the calm level: her centre's height follows.
  const y0 = designWaterline(0) - LOAD_WATERLINE;
  const level: ShipPose = { x, z, heave: 0, heading, pitch, roll: 0, heaveRate: 0, pitchRate: 0, rollRate: 0 };
  const heave = -toWorld(level, 0, y0, 0)[1];
  return { pose: { ...level, heave } };
}

/** The water under her this step: its height and velocity on the grid. */
const water = new Float64Array(WATER_ALONG * WATER_ACROSS * WATER_FIELDS);
const sample = seaSample();
/** Her pressure points in the world this step. */
let world = new Float64Array(0);

/**
 * One step of the simulation's fixed length: the water under her at `t` pushes on her hull, her weight pulls, her
 * sails heel her, and her heave, pitch and roll move on; her heading is set and she goes on through the water as the
 * sailing model says (`way`).
 */
export function stepMotion(m: ShipMotion, sea: SeaState, t: number, way: Way): ShipMotion {
  const b = shipBody(), p = m.pose, r = poseRotation(p, rotation);
  const v = b.vertices, tris = b.triangles, areas = b.areas;
  // Her heading's axes on the water: forward and to starboard.
  sincos(p.heading, sc);
  const fx = sc[0], fz = -sc[1], sx = sc[1], sz = sc[0];
  const highest = sampleWater(sea, p, t, b, fx, fz, sx, sz) - p.heave;

  // Her pressure points in the world, relative to her centre.
  if (world.length !== v.length) world = new Float64Array(v.length);
  const w = world;
  for (let i = 0; i < v.length; i += XYZ) {
    const x = v[i]!, y = v[i + 1]! - b.centreY, z = v[i + 2]! - b.centreZ;
    w[i] = r[0]! * x + r[1]! * y + r[2]! * z;
    w[i + 1] = r[3]! * x + r[4]! * y + r[5]! * z;
    w[i + 2] = r[6]! * x + r[7]! * y + r[8]! * z;
  }

  // Her turning as a vector in the world: pitch about her athwartships axis, roll about her fore-and-aft one.
  sincos(p.pitch, sc);
  const sp = sc[0], cp = sc[1];
  const hx = p.pitchRate, hy = sp * p.rollRate, hz = -cp * p.rollRate;
  const ch = sx, sh = fx;
  const wx = ch * hx - sh * hz, wy = hy, wz = sh * hx + ch * hz;

  let fy = -b.mass * GRAVITY, tx = 0, ty = 0, tz = 0;
  const aftZ = b.gridAft, along = LAST_ALONG / (b.gridFore - aftZ), across = LAST_ACROSS / (2 * WATER_HALF_WIDTH), heave = p.heave;
  const weight = WATER_WEIGHT, area = b.area, sideways = Math.sqrt(HULL_DAMPING.sideways), upward = Math.sqrt(HULL_DAMPING.upward);
  for (let k = 0, n = 0; k < tris.length; k += XYZ, n++) {
    const a = tris[k]! * XYZ, bb = tris[k + 1]! * XYZ, c = tris[k + 2]! * XYZ;
    const ya = w[a + 1]!, yb = w[bb + 1]!, yc = w[c + 1]!;
    // The panel's middle (relative to her centre), and how far it reaches up and down.
    const cx = (w[a]! + w[bb]! + w[c]!) / XYZ, cy = (ya + yb + yc) / XYZ, cz = (w[a + 2]! + w[bb + 2]! + w[c + 2]!) / XYZ;
    const bottom = ya < yb ? (ya < yc ? ya : yc) : (yb < yc ? yb : yc);
    // Above the highest water under her this step: dry.
    if (bottom >= highest) continue;
    const top = ya > yb ? (ya > yc ? ya : yc) : (yb > yc ? yb : yc);
    const extent = Math.max(LEAST_EXTENT, (top - bottom) / 2);
    // The water over it: its place on the grid in her heading's frame (along is ship-space z, so aft is +).
    const gu = (-(cx * fx + cz * fz) - aftZ) * along, gv = (cx * sx + cz * sz + WATER_HALF_WIDTH) * across;
    // Its grid cell and the four corners' weights (held at the grid's edges).
    const cu = gu < 0 ? 0 : gu > LAST_ALONG ? LAST_ALONG : gu, cv = gv < 0 ? 0 : gv > LAST_ACROSS ? LAST_ACROSS : gv;
    const gi = cu >= LAST_ALONG ? LAST_ALONG - 1 : Math.floor(cu), gj = cv >= LAST_ACROSS ? LAST_ACROSS - 1 : Math.floor(cv);
    const du = cu - gi, dv = cv - gj, o = (gi * WATER_ACROSS + gj) * WATER_FIELDS;
    const w00 = (1 - du) * (1 - dv), w01 = (1 - du) * dv, w10 = du * (1 - dv), w11 = du * dv;
    const o01 = o + WATER_FIELDS, o10 = o + ROW_FIELDS, o11 = o10 + WATER_FIELDS;
    const depth = water[o]! * w00 + water[o01]! * w01 + water[o10]! * w10 + water[o11]! * w11 - (heave + cy);
    if (depth <= -extent) continue;
    // The mean depth over the panel and its share under water (its depth taken as spread evenly over ±extent).
    const wet = depth >= extent ? 1 : (depth + extent) / (2 * extent);
    const pressed = depth >= extent ? depth : (depth + extent) * wet / 2;
    const i = k;
    const ax = r[0]! * areas[i]! + r[1]! * areas[i + 1]! + r[2]! * areas[i + 2]!;
    const ay = r[3]! * areas[i]! + r[4]! * areas[i + 1]! + r[5]! * areas[i + 2]!;
    const az = r[6]! * areas[i]! + r[7]! * areas[i + 1]! + r[8]! * areas[i + 2]!;
    // The panel's motion through the water across its own face: her heave and turning against the water's own.
    const vx = wy * cz - wz * cy - (water[o + VX]! * w00 + water[o01 + VX]! * w01 + water[o10 + VX]! * w10 + water[o11 + VX]! * w11);
    const vy = p.heaveRate + wz * cx - wx * cz - (water[o + VY]! * w00 + water[o01 + VY]! * w01 + water[o10 + VY]! * w10 + water[o11 + VY]! * w11);
    const vz = wx * cy - wy * cx - (water[o + VZ]! * w00 + water[o01 + VZ]! * w01 + water[o10 + VZ]! * w10 + water[o11 + VZ]! * w11);
    // Pressure pushes in against the outward area. The damping resists the motion across the face, sideways and up
    // weighed apart (their roots, so the force always takes energy away): F = −wet·(S·v·n)·S·A, S = diag(side, up, side).
    const slip = wet * (sideways * (vx * ax + vz * az) + upward * vy * ay) / area[n]!;
    const press = -weight * pressed;
    const px = press * ax - slip * sideways * ax, py = press * ay - slip * upward * ay, pz = press * az - slip * sideways * az;
    fy += py;
    tx += cy * pz - cz * py;
    ty += cz * px - cx * pz;
    tz += cx * py - cy * px;
  }

  // Her turning moments in her heading's frame, about her athwartships (pitch) and fore-and-aft (roll) axes.
  const hTx = ch * tx + sh * tz, hTy = ty, hTz = -sh * tx + ch * tz;
  const pitchAcc = hTx / b.pitchInertia, rollAcc = (way.rollMoment - (-sp * hTy + cp * hTz)) / b.rollInertia;
  const heaveRate = p.heaveRate + (fy / b.heaveMass) * STEP_SECONDS;
  const pitchRate = p.pitchRate + pitchAcc * STEP_SECONDS, rollRate = p.rollRate + rollAcc * STEP_SECONDS;
  // On through the water: ahead along her heading, her leeway to starboard of it.
  sincos(way.heading, sc);
  return {
    pose: {
      x: p.x + (way.ahead * sc[0] + way.leeway * sc[1]) * STEP_SECONDS,
      z: p.z + (way.leeway * sc[0] - way.ahead * sc[1]) * STEP_SECONDS,
      heave: p.heave + heaveRate * STEP_SECONDS,
      heading: way.heading,
      pitch: p.pitch + pitchRate * STEP_SECONDS,
      roll: p.roll + rollRate * STEP_SECONDS,
      heaveRate, pitchRate, rollRate,
    },
  };
}

/** Sample the water on her grid: heights and velocities at her centre's place, along and across her heading. The highest water on it, m. */
function sampleWater(sea: SeaState, p: ShipPose, t: number, b: Body, fx: number, fz: number, sx: number, sz: number): number {
  let highest = -Infinity;
  for (let i = 0; i < WATER_ALONG; i++) {
    // Ship-space z of the row (aft is +), turned into metres forward.
    const forward = -(b.gridAft + ((b.gridFore - b.gridAft) * i) / (WATER_ALONG - 1));
    for (let j = 0; j < WATER_ACROSS; j++) {
      const side = -WATER_HALF_WIDTH + (2 * WATER_HALF_WIDTH * j) / (WATER_ACROSS - 1);
      surfaceAt(sea, p.x + fx * forward + sx * side, p.z + fz * forward + sz * side, t, sample);
      const o = (i * WATER_ACROSS + j) * WATER_FIELDS;
      water[o] = sample.height;
      highest = Math.max(highest, sample.height);
      water[o + VX] = sample.velocity[0];
      water[o + VY] = sample.velocity[1];
      water[o + VZ] = sample.velocity[2];
    }
  }
  return highest;
}

/** Her pose `f` of the way from one step's to the next (0..1), for drawing between steps. */
export function poseBetween(a: ShipPose, b: ShipPose, f: number): ShipPose {
  const mix = (u: number, w: number) => u + (w - u) * f;
  // The heading the short way round.
  const turn = Math.atan2(Math.sin(b.heading - a.heading), Math.cos(b.heading - a.heading));
  return {
    x: mix(a.x, b.x), z: mix(a.z, b.z), heave: mix(a.heave, b.heave), heading: a.heading + turn * f,
    pitch: mix(a.pitch, b.pitch), roll: mix(a.roll, b.roll),
    heaveRate: mix(a.heaveRate, b.heaveRate), pitchRate: mix(a.pitchRate, b.pitchRate), rollRate: mix(a.rollRate, b.rollRate),
  };
}
