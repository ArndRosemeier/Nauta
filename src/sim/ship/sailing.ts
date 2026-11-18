/**
 * The sailing model (pure, implementation plan N3.3): how the brig moves under her sails in the wind. The one owner
 * of her heading and her speed through the water (rules.json `owners`: `sailing`).
 *
 * Each step, in her own frame (ahead, to starboard):
 * - **The apparent wind** at each sail is the true wind (wind.ts `windAt`, gusts and all) less her own motion: her
 *   way ahead, her leeway and her turning (a sail forward of her centre swings across the wind). Her roll swings each
 *   sail aloft across the wind much faster, and the cloth presses against the swing: this is what steadies a ship
 *   under sail in a seaway.
 * - **Each set sail** presses by its angle of attack (rules/sailing.ts polars), its area as it stands (sails.ts
 *   `sailArea`) and the wind's dynamic pressure. A square sail stands on its yard, braced round; a fore-and-aft sail
 *   lies to leeward on its sheet. A sail with the wind on its fore side is aback and pushes her astern.
 * - **The crew trims** each mast's yards for the best drive the brace limits allow (rules/rig.ts), swinging them at a
 *   crew's pace; a mast's sails change sides only when the wind is well over, so in a tack the fore yards stay aback
 *   and push her bow round, and the main yards swing as she comes head to wind ("mainsail haul"). Laid aback on
 *   order, a mast's yards push her astern instead (heaving to).
 * - **The hull** resists going ahead, sideways (her leeway) and turning; **the rudder** turns her by the square of her
 *   speed through the water, so without way she does not answer her helm (and with sternway it acts the other way).
 * - **The helmsman** steers the heading he is told, the short way or the way he is told to turn (through the wind is
 *   a tack, away from it a wear). In a tack that stops short of the wind she misses stays: he bears away onto the old
 *   tack.
 *
 * Out of a step come her new state, how she moves on the water and the sails' heeling moment (`Way`, for motion.ts,
 * which owns her pose), and what happened (tacked, wore, missed stays).
 */
import { angleDiff, clamp } from '@futuremagic/core';
import {
  ADDED_MASS, AIR, BOOM_SHEET_LEAST, BRACE_RATE, CANVAS, CARRIED_UP_TO, FORE_AFT_POLAR, GYBE, HAUL, HEADSAIL_SHEET,
  HELM_RATE, HELMSMAN, HULL_AHEAD, GATHERING, LIGHT_AIRS, HULL_SIDEWAYS, HULL_TURNING, LET_FLY_ANGLE, LET_FLY_SHARE, MISSED_STAYS, REEF_AT,
  RUDDER, SAIL_ROLL_SLOPE, SHIVER_ANGLE, SQUARE_POLAR, START_CANVAS, TRIM_TRIES, TURN_GYRATION, TURN_SKID, WINDAGE, type CanvasName, type Polar,
} from '../rules/sailing';
import { beaufortForce } from '../rules/beaufort';
import { BOOM, type MastName } from '../rules/rig';
import { DESIGN_WATERLINE } from '../rules/ships';
import { linearCurve, type Curve } from '../curve';
import { sincos } from '../trig';
import { DEGREE, STEP_SECONDS, wrapBearing } from '../units';
import type { Wind } from '../wind';
import { buoyancyAlong } from './hull';
import type { ShipPose, Way } from './motion';
import { shipPlan } from './plan';
import { rigPlan, sparOf } from './rig';
import { drawShare, sailArea, type Sail, type SailSetting } from './sails';
import { shipWeight } from './weight';

/** What the helmsman has been told: a heading (compass bearing, rad) and which way to turn to it (+1 to starboard, -1 to larboard, 0 the short way). */
export interface Steer {
  readonly heading: number;
  readonly turn: number;
}

/** A ship under sail: plain data, changed only here. Masts are listed fore, main (`MASTS`). */
export interface Sailing {
  /** Her heading, a compass bearing, rad, and how fast it turns, rad/s (+ to starboard). */
  readonly heading: number;
  readonly turnRate: number;
  /** Her speed through the water ahead (negative: sternway) and to starboard (her leeway), m/s. */
  readonly ahead: number;
  readonly leeway: number;
  /** Where her rudder lies, rad: + turns her to starboard. */
  readonly helm: number;
  /** What the helmsman steers. */
  readonly steer: Steer;
  /** How each sail stands, in the rig plan's order (rigPlan().sails). */
  readonly canvas: readonly SailSetting[];
  /** Each mast's yards, as a share of their brace limit from square: + braced for a wind from starboard. */
  readonly braces: readonly number[];
  /** The side each mast's sails take the wind on: +1 starboard, -1 larboard (the fore-and-aft sails lie on the other). */
  readonly sides: readonly number[];
  /** Each mast's yards laid aback on order (heaving to). */
  readonly backed: readonly boolean[];
}

/**
 * What her damage does to her sailing (damage.ts `stepAftermath`, N6.2): the share of its drive each sail keeps (rig plan
 * order; null: all of it), whether she answers her helm (false: her rudder trails amidships), what lies alongside
 * dragging her (where, m forward of the mainmast and across, and how hard, kN per (m/s)² of the water past it), and the
 * water in her, t (she is that much heavier to move).
 */
export interface SailingDamage {
  readonly draws: readonly number[] | null;
  readonly steered: boolean;
  readonly wrecks: readonly { readonly along: number; readonly across: number; readonly drag: number }[];
  readonly flooded: number;
}
/** A ship's sailing with nothing wrong. */
export const UNDAMAGED: SailingDamage = { draws: null, steered: true, wrecks: [], flooded: 0 };

/** The masts' order in `braces`, `sides` and `backed`. */
export const MASTS: readonly MastName[] = ['fore', 'main'];
const FORE = 0;
const MAIN = 1;

/** Something that happened under sail in a step: through the wind (tacked), round before it (wore), or failed in a tack. */
export type SailingEvent = 'tacked' | 'wore' | 'missed stays' | 'bore away';

/** One step under sail: her next state, how she moves, and what happened. */
export interface SailingStep {
  readonly sailing: Sailing;
  readonly way: Way;
  readonly events: readonly SailingEvent[];
}

/** A sail as the model reads it, worked out once from the rig plan. */
interface SailBody {
  readonly sail: Sail;
  readonly square: boolean;
  /** A headsail (on a stay forward): its sheets are let fly in a tack. */
  readonly head: boolean;
  readonly mast: number;
  /** Where its centre stands: m forward of her centre of gravity, and m above her base. */
  readonly along: number;
  readonly height: number;
  /** cos and sin of each angle the crew tries: a yard's brace (TRIM_TRIES from square to its limit), a sheet's swing off the centre line. */
  readonly tryCos: Float64Array;
  readonly trySin: Float64Array;
  /** A yard's brace limit, rad (square sails, from square), or how far a sheet lets the sail swing off her centre line, least and most. */
  readonly least: number;
  readonly limit: number;
}

/** The hull and rig, worked out once. */
interface Body {
  readonly sails: readonly SailBody[];
  readonly mass: number;
  /** Her centre of gravity: m forward of the mainmast, and m above her base. */
  readonly along: number;
  readonly height: number;
  /** What moves with her going ahead and sideways (t), and turning (t·m²). */
  readonly aheadMass: number;
  readonly sideMass: number;
  readonly turnInertia: number;
  readonly square: Curves;
  readonly foreAft: Curves;
  /** sin of the haul and gybe angles, per mast. */
  readonly haul: readonly number[];
  readonly gybe: readonly number[];
  readonly letFly: number;
}

/** A polar keyed by the sine of the angle of attack (so no arc function is needed: the same bits on every engine). */
interface Curves {
  readonly lift: Curve;
  readonly drag: Curve;
}

let body: Body | null = null;

function sailingBody(): Body {
  return (body ??= buildSailingBody());
}

const sc: [number, number] = [0, 0];
const sinOf = (a: number): number => (sincos(a, sc), sc[0]);

function curves(p: Polar): Curves {
  const xs = p.angle.map((a) => sinOf(a * DEGREE));
  return { lift: linearCurve(xs, p.lift), drag: linearCurve(xs, p.drag) };
}

function buildSailingBody(): Body {
  const rig = rigPlan(), weight = shipWeight(shipPlan());
  const along = buoyancyAlong(), height = weight.centre, mass = weight.tonnes;
  const length = DESIGN_WATERLINE.fore[0] - DESIGN_WATERLINE.aft[0];
  const sails = rig.sails.map((sail): SailBody => {
    const n = sail.corners.length;
    const c = sail.corners.reduce((a, k) => ({ along: a.along + k.at.along / n, height: a.height + k.at.height / n }), { along: 0, height: 0 });
    const square = sail.kind === 'square';
    const least = square ? 0 : sail.kind === 'boom' ? BOOM_SHEET_LEAST : HEADSAIL_SHEET.least;
    const most = square ? sparOf(rig, sail.on[0]!).yard!.brace : sail.kind === 'boom' ? BOOM.swing : HEADSAIL_SHEET.most;
    const tryCos = new Float64Array(TRIM_TRIES), trySin = new Float64Array(TRIM_TRIES);
    for (let k = 0; k < TRIM_TRIES; k++) {
      sincos(least + ((most - least) * k) / (TRIM_TRIES - 1), sc);
      tryCos[k] = sc[1];
      trySin[k] = sc[0];
    }
    return {
      sail, square, head: sail.kind === 'head', mast: sail.mast === 'main' ? MAIN : FORE,
      along: c.along - along, height: c.height, tryCos, trySin, least, limit: most,
    };
  });
  return {
    sails, mass, along, height,
    aheadMass: mass * (1 + ADDED_MASS.ahead),
    sideMass: mass * (1 + ADDED_MASS.sideways),
    turnInertia: mass * (1 + ADDED_MASS.turning) * (TURN_GYRATION * length) ** 2,
    square: curves(SQUARE_POLAR), foreAft: curves(FORE_AFT_POLAR),
    haul: [sinOf(HAUL.fore), sinOf(HAUL.main)],
    gybe: [sinOf(GYBE.fore), sinOf(GYBE.main)],
    letFly: sinOf(LET_FLY_ANGLE),
  };
}

/** The sails' settings for a named canvas in a wind of `force`: what the crew sets, reefed for the wind (rules/sailing.ts). */
export function canvasFor(name: CanvasName, force: number): SailSetting[] {
  return rigPlan().sails.map((sail) => {
    const set = CANVAS[name].includes(sail.id) && force <= (CARRIED_UP_TO[sail.id] ?? 0);
    const reefs = Math.min(sail.reefs, (REEF_AT[sail.id] ?? []).filter((f) => force >= f).length);
    return { set, reefs: set ? reefs : 0 };
  });
}

/** How a ship starts under sail. */
export interface SailingStart {
  readonly heading: number;
  /** Her way ahead, m/s (0: still). */
  readonly speed?: number;
  /** Her canvas (battle sail if not given). */
  readonly canvas?: CanvasName;
}

/** A ship under sail at the start: holding her heading, her canvas set for the wind's force, her yards trimmed to the wind. */
export function startSailing(start: SailingStart, wind: Wind, force: number): Sailing {
  const heading = wrapBearing(start.heading), ahead = start.speed ?? 0;
  const { ax, ay } = apparent(heading, ahead, 0, wind);
  const side = ay < 0 ? 1 : -1;
  const s: Sailing = {
    heading, turnRate: 0, ahead, leeway: 0, helm: 0, steer: { heading, turn: 0 },
    canvas: canvasFor(start.canvas ?? START_CANVAS, force), braces: [0, 0], sides: [side, side], backed: [false, false],
  };
  return { ...s, braces: MASTS.map((_, m) => braceTarget(s, m, ax, ay)) };
}

/** The helmsman told to steer `heading` (compass bearing, rad), turning to it the way `turn` says (+1 starboard, -1 larboard, 0 the short way). */
export function steerTo(s: Sailing, heading: number, turn: number): Sailing {
  return { ...s, steer: { heading: wrapBearing(heading), turn: Math.sign(turn) } };
}

/** One sail (by its place in rigPlan().sails) set as `setting`: furled, or set with its reefs. The orders (orders.ts) set a canvas sail by sail. */
export function setSail(s: Sailing, sail: number, setting: SailSetting): Sailing {
  return { ...s, canvas: s.canvas.map((c, i) => (i === sail ? { set: setting.set, reefs: setting.set ? setting.reefs : 0 } : c)) };
}

/** A sail's work under way: how far it is set (0 furled to 1 sheeted home) and the reefs it is set with. */
export interface SailWork {
  readonly sail: number;
  readonly share: number;
  readonly reefs: number;
}

/** The sails the crew is working (crew/crew.ts) moved to how far each is set; furled at 0, set as it is at 1, its share kept in between. */
export function setShares(s: Sailing, work: readonly SailWork[]): Sailing {
  if (work.length === 0) return s;
  const canvas = [...s.canvas];
  for (const w of work) {
    if (w.share <= 0) canvas[w.sail] = { set: false, reefs: 0 };
    else if (w.share >= 1) canvas[w.sail] = { set: true, reefs: w.reefs };
    else canvas[w.sail] = { set: true, reefs: w.reefs, share: w.share };
  }
  return { ...s, canvas };
}

/** The area a sail drives her with: its area as it stands, by how far it is sheeted home (sails.ts `drawShare`) and what of it her damage leaves (`draws`, its place `i`). */
const drawingArea = (sail: Sail, setting: SailSetting, harm: SailingDamage, i: number): number =>
  sailArea(sail, setting) * drawShare(sail, setting) * (harm.draws?.[i] ?? 1);

/** What moves with her when she is shoved (ships touch, touch.ts): her mass (t), with the water that goes with her ahead and sideways (t), and turning (t·m², about her centre of gravity). */
export interface ShovedMasses {
  readonly mass: number;
  readonly ahead: number;
  readonly sideways: number;
  readonly turning: number;
}

/** Her masses as a shove meets them. */
export function shovedMasses(): ShovedMasses {
  const b = sailingBody();
  return { mass: b.mass, ahead: b.aheadMass, sideways: b.sideMass, turning: b.turnInertia };
}

/**
 * She shoved (ships touch, touch.ts): blows ahead and to starboard (kN·s) and a turning blow (kN·m·s, + to starboard)
 * change her way, leeway and turning by what moves with her.
 */
export function shoved(s: Sailing, ahead: number, sideways: number, turning: number): Sailing {
  const m = shovedMasses();
  return { ...s, ahead: s.ahead + ahead / m.ahead, leeway: s.leeway + sideways / m.sideways, turnRate: s.turnRate + turning / m.turning };
}

/** One mast's yards laid aback (or filled again). */
export function layAback(s: Sailing, mast: MastName, aback: boolean): Sailing {
  const m = MASTS.indexOf(mast);
  return { ...s, backed: s.backed.map((b, i) => (i === m ? aback : b)) };
}

/** The air across her, m/s, in her frame (ahead, to starboard), at her centre: the true wind less her way. */
function apparent(heading: number, ahead: number, leeway: number, wind: Wind): { ax: number; ay: number } {
  sincos(heading, sc);
  const fx = sc[0], fz = -sc[1], sx = sc[1], sz = sc[0];
  return { ax: wind.speed * (wind.x * fx + wind.z * fz) - ahead, ay: wind.speed * (wind.x * sx + wind.z * sz) - leeway };
}

/** The apparent wind on a ship making `way` through the water in the true wind `wind`, m/s, in her frame: ahead, and to starboard (the air moving that way). */
export const apparentAt = (way: Pick<Sailing, 'heading' | 'ahead' | 'leeway'>, wind: Wind): { ax: number; ay: number } => apparent(way.heading, way.ahead, way.leeway, wind);

/** The apparent wind's speed on a ship making `way` through the water in the true wind `wind`, m/s: what she feels aloft and on deck (the sound under sail, N3.9). */
export function apparentSpeed(way: Pick<Sailing, 'heading' | 'ahead' | 'leeway'>, wind: Wind): number {
  const { ax, ay } = apparentAt(way, wind);
  return Math.hypot(ax, ay);
}

/** A sail's push per unit of half the air's density and its area: the force vector in her frame, written into `push`. */
const push = { x: 0, y: 0, sinAttack: 0, onFace: 0 };
function sailPush(c: Curves, nx: number, ny: number, ax: number, ay: number): void {
  const v2 = ax * ax + ay * ay;
  if (v2 === 0) { push.x = 0; push.y = 0; push.sinAttack = 0; push.onFace = 0; return; }
  const v = Math.sqrt(v2), wn = ax * nx + ay * ny;
  const s = Math.abs(wn) / v;
  const lift = c.lift(s), drag = c.drag(s);
  // Lift across the wind, on the side the wind presses the cloth toward.
  const side = (ny * ax - nx * ay) * wn >= 0 ? 1 : -1;
  push.x = v * (drag * ax - lift * side * ay);
  push.y = v * (drag * ay + lift * side * ax);
  push.sinAttack = s;
  push.onFace = wn;
}

/**
 * The share of its brace limit (+ for a wind from starboard) the crew wants a mast's yards at: the brace that drives
 * her best with the wind on the mast's side, or, laid aback, the one that pushes her astern hardest. Unchanged when the
 * mast carries no square sail.
 */
function braceTarget(s: Sailing, mast: number, ax: number, ay: number, harm: SailingDamage = UNDAMAGED): number {
  const b = sailingBody(), side = s.sides[mast]!, backed = s.backed[mast]!;
  const set: { sb: SailBody; area: number }[] = [];
  b.sails.forEach((sb, i) => {
    const area = sb.square && sb.mast === mast ? drawingArea(sb.sail, s.canvas[i]!, harm, i) : 0;
    if (area > 0) set.push({ sb, area });
  });
  if (set.length === 0) return s.braces[mast]!;
  let best = s.braces[mast]!, bestDrive = backed ? Infinity : -Infinity;
  // Laid aback, the yards may go either way; drawing, they are braced for the side the wind is on.
  for (let k = backed ? 1 - TRIM_TRIES : 0; k < TRIM_TRIES; k++) {
    const j = Math.abs(k), turn = -side * Math.sign(k);
    let drive = 0;
    for (const { sb, area } of set) {
      // γ = -side·share·limit: the sail's normal (cos γ, sin γ).
      sailPush(b.square, sb.tryCos[j]!, turn * sb.trySin[j]!, ax, ay);
      drive += area * push.x;
    }
    if (backed ? drive < bestDrive : drive > bestDrive) { bestDrive = drive; best = (side * k) / (TRIM_TRIES - 1); }
  }
  return best;
}

/**
 * How a fore-and-aft sail lies: the side (`lee`: +1 starboard) and its sheet's try (index into tryCos). Trimmed, it lies
 * to leeward of its mast's side at the sheet that drives her best. When the fore yards are laid aback, the headsails are
 * hauled flat to windward too (backed, pushing her bow off and her astern); the main's fore-and-aft sails keep drawing.
 */
const sheet = { lee: 0, k: 0 };
function sheetOf(sb: SailBody, c: Curves, s: Sailing, ax: number, ay: number): void {
  const side = s.sides[sb.mast]!;
  if (sb.mast === FORE && s.backed[FORE]) { sheet.lee = side; sheet.k = 0; return; }
  let best = 0, bestDrive = -Infinity;
  for (let k = 0; k < TRIM_TRIES; k++) {
    sailPush(c, -side * sb.trySin[k]!, sb.tryCos[k]!, ax, ay);
    if (push.x > bestDrive) { bestDrive = push.x; best = k; }
  }
  sheet.lee = -side;
  sheet.k = best;
}

/** The forces on her in a step, in her frame: ahead (kN), to starboard (kN), turning to starboard (kN·m), heeling to starboard (kN·m). */
const force = { x: 0, y: 0, turn: 0, heel: 0 };

/**
 * The wind's forces on her sails and rig. `ax`, `ay`: the air across her at her centre; each sail also feels her
 * turning (`turnRate`) and her roll (`pose`), which steady her.
 */
function windForces(s: Sailing, pose: ShipPose, ax: number, ay: number, letFly: boolean, harm: SailingDamage, drive: number): void {
  const b = sailingBody();
  sincos(pose.roll, sc);
  const heelCos = sc[1];
  let x = 0, y = 0, turn = 0, heel = 0;
  // The bare rig and hull above water: a plate square to the wind, at her centre.
  {
    const cy = (ay - pose.rollRate * (WINDAGE.height - b.height)) * heelCos, v2 = ax * ax + cy * cy, v = Math.sqrt(v2);
    const area = v2 > 0 ? (WINDAGE.ahead * ax * ax + WINDAGE.abeam * cy * cy) / v2 : 0;
    const k = (AIR / 2) * area * WINDAGE.drag * v;
    x += k * ax;
    y += k * cy * heelCos;
    heel += k * cy * (WINDAGE.height - HULL_SIDEWAYS.height);
  }
  for (let i = 0; i < b.sails.length; i++) {
    const sb = b.sails[i]!, area = drawingArea(sb.sail, s.canvas[i]!, harm, i);
    if (area === 0) continue;
    // The air this sail feels: her turning swings it across the wind; in the heeled sail's frame.
    const sx = ax, sy = (ay - s.turnRate * sb.along) * heelCos;
    let share = 1;
    if (sb.square) {
      sincos(-s.braces[sb.mast]! * sb.limit, sc);
      sailPush(b.square, sc[1], sc[0], sx, sy);
    } else {
      sheetOf(sb, b.foreAft, s, ax, ay);
      sailPush(b.foreAft, sheet.lee * sb.trySin[sheet.k]!, sb.tryCos[sheet.k]!, sx, sy);
      if (sb.head && letFly) share = LET_FLY_SHARE;
    }
    const k = (AIR / 2) * area * share;
    const fx = k * push.x, fy = k * push.y;
    // Her roll swings the sail across the wind: the cloth meets the air at a changing angle and presses against the swing.
    const lever = sb.height - b.height, swing = pose.rollRate * lever;
    const steady = (AIR / 2) * area * SAIL_ROLL_SLOPE * (Math.hypot(sx, sy) + Math.abs(swing)) * swing;
    // Light airs (rules/sailing.ts LIGHT_AIRS): a drawing sail drives her ahead the harder; its heel and leeway are the wind's.
    x += fx > 0 ? fx * drive : fx;
    y += fy * heelCos;
    turn += sb.along * fy * heelCos;
    heel += (fy - steady) * (sb.height - HULL_SIDEWAYS.height);
  }
  force.x = x;
  force.y = y;
  force.turn = turn;
  force.heel = heel;
}

/** Light airs and gathering way (rules/sailing.ts `LIGHT_AIRS`, `GATHERING`), as curves, built once: by the wind's force, and by the true wind's angle off her bow. */
interface LightAirs { readonly drive: Curve; readonly gather: Curve; readonly angle: Curve }
let lightAirsCurves: LightAirs | null = null;
function lightAirs(): LightAirs {
  return (lightAirsCurves ??= {
    drive: linearCurve(LIGHT_AIRS.force, LIGHT_AIRS.drive),
    gather: linearCurve(GATHERING.force, GATHERING.times),
    angle: linearCurve(LIGHT_AIRS.angle, LIGHT_AIRS.share),
  });
}

/** The signed heading still to go, rad, the way the helmsman turns: the short way, or all the way round the way he was told. */
function headingToGo(heading: number, steer: Steer): number {
  const short = angleDiff(heading, steer.heading);
  if (steer.turn === 0 || Math.sign(short) === steer.turn || short === 0) return short;
  return short + steer.turn * 2 * Math.PI;
}

/** Her hull's own forces: resistance ahead, sideways and to turning, the rudder's, and the drag of what lies alongside (added into `force`). */
function hullForces(s: Sailing, harm: SailingDamage): void {
  const b = sailingBody(), u = s.ahead, v = s.leeway, r = s.turnRate, au = Math.abs(u);
  // What lies alongside: the water past it where it lies (her way, her leeway and her turning there), against it.
  for (const w of harm.wrecks) {
    const along = w.along - b.along, wu = u - r * w.across, wv = v + r * along, speed = Math.hypot(wu, wv);
    const fx = -w.drag * speed * wu, fy = -w.drag * speed * wv;
    force.x += fx;
    force.y += fy;
    force.turn += along * fy - w.across * fx;
  }
  const wave = 1 + (au / HULL_AHEAD.hullSpeed) ** HULL_AHEAD.wave;
  const ahead = -Math.sign(u) * HULL_AHEAD.ahead * u * u * wave * (u < 0 ? HULL_AHEAD.astern : 1);
  const side = -(HULL_SIDEWAYS.linear * au * v + HULL_SIDEWAYS.square * v * Math.abs(v));
  // The rudder: side force at her stern by the water past it (pushing her stern to larboard turns her to starboard).
  const rudderSide = -RUDDER.lift * u * au * s.helm;
  const rudderDrag = -Math.sign(u) * RUDDER.drag * u * u * s.helm * s.helm;
  force.x += ahead + rudderDrag;
  force.y += side + rudderSide;
  force.turn += side * (HULL_SIDEWAYS.along - b.along) + rudderSide * (RUDDER.along - b.along)
    - HULL_TURNING.linear * au * r - HULL_TURNING.square * r * Math.abs(r);
}

/**
 * One step of the simulation's fixed length under sail, in the true wind `wind` (wind.ts `windAt` at her place),
 * lying as `pose` says (her roll and its rate, from motion.ts), in a match sailed in the wind's force `windForce` (its
 * light airs, rules/sailing.ts `LIGHT_AIRS`; by default the force of `wind` itself). Pure: `s` is not changed.
 */
export function stepSailing(s: Sailing, pose: ShipPose, wind: Wind, harm: SailingDamage = UNDAMAGED, windForce = beaufortForce(wind.speed)): SailingStep {
  const b = sailingBody(), dt = STEP_SECONDS, events: SailingEvent[] = [];
  // The water in her is moved with her (her masses are the dry ship's and the water's).
  const heavier = 1 + harm.flooded / b.mass;
  const { ax, ay } = apparent(s.heading, s.ahead, s.leeway, wind);
  const air = Math.hypot(ax, ay), fromAhead = ax < 0;

  // The helmsman: which way she must still turn, and the side the wind will be on at the heading he steers for. Her
  // sails go over to that side only; while the fore yards are still on the other and her turn takes her through the
  // wind's eye, she is in stays (a tack).
  let steer = s.steer;
  if (steer.turn !== 0 && Math.abs(angleDiff(s.heading, steer.heading)) < HELMSMAN.settled) steer = { ...steer, turn: 0 };
  const toGo = headingToGo(s.heading, steer), turning = Math.sign(toGo);
  const windSide = ay < 0 ? 1 : -1, eye = angleDiff(s.heading, wind.from);
  const bound = Math.sign(angleDiff(steer.heading, wind.from)) || s.sides[FORE]!;
  const inStays = bound !== s.sides[FORE] && Math.sign(eye) === turning && Math.abs(toGo) > Math.abs(eye);
  const letFly = inStays && Math.abs(ay) < air * b.letFly;

  // Light airs: her drawing sails drive her the harder the lighter the match's wind; and how quickly she gathers way in it.
  const light = lightAirs(), off = Math.abs(angleDiff(s.heading, wind.from)) / DEGREE;
  const drive = 1 + (light.drive(windForce) - 1) * light.angle(off), gather = light.gather(windForce);
  windForces(s, pose, ax, ay, letFly, harm, drive);
  hullForces(s, harm);

  // Her way, leeway and turning, with the water moving with her (turning, her way carries her outward: the skid).
  const aheadMass = b.aheadMass * heavier, sideMass = b.sideMass * heavier;
  // Gathering way with some way on her, not in stays nor laid aback, she gains it the quicker (rules/sailing.ts GATHERING); she carries it as ever.
  const gain = (dt * (force.x + TURN_SKID * sideMass * s.leeway * s.turnRate)) / aheadMass;
  const ahead = s.ahead + (gain > 0 && s.ahead >= GATHERING.from && !inStays && !s.backed.some(Boolean) ? gain * gather : gain);
  const leeway = s.leeway + (dt * (force.y - TURN_SKID * aheadMass * s.ahead * s.turnRate)) / sideMass;
  const turnRate = s.turnRate + (dt * force.turn) / (b.turnInertia * heavier);
  const heading = wrapBearing(s.heading + turnRate * dt);

  // The helm: hard over at most, put over at the helmsman's pace, the other way with sternway.
  // With her steering shot away the rudder trails amidships, whatever he does.
  const wanted = harm.steered ? clamp(HELMSMAN.heading * toGo - HELMSMAN.turning * s.turnRate, -RUDDER.most, RUDDER.most) * (s.ahead < 0 ? -1 : 1) : 0;
  const helm = s.helm + clamp(wanted - s.helm, -HELM_RATE * dt, HELM_RATE * dt);

  // Missed stays: in a tack, she has lost her way or begun to fall back. The helmsman bears away on the old tack and
  // the main yards, if hauled already, go back with the fore.
  let from = s.sides, goal = bound;
  if (inStays && (s.ahead <= MISSED_STAYS.way || s.turnRate * turning < -MISSED_STAYS.rate)) {
    steer = { heading: wrapBearing(wind.from - s.sides[FORE]! * MISSED_STAYS.bearAway), turn: 0 };
    goal = s.sides[FORE]!;
    from = [goal, goal];
    events.push('missed stays');
  }

  // Each mast's sails go over when the wind is well over on the side she is bound for; then the yards are braced round for it.
  const sides = from.map((side, m) => {
    if (windSide === side || windSide !== goal || Math.abs(ay) <= air * (fromAhead ? b.haul[m]! : b.gybe[m]!)) return side;
    if (m === FORE && fromAhead) events.push('tacked');
    if (m === MAIN && !fromAhead) events.push('wore');
    return windSide;
  });
  const trimmed: Sailing = { ...s, sides };
  const braces = s.braces.map((brace, m) => brace + clamp(braceTarget(trimmed, m, ax, ay, harm) - brace, -BRACE_RATE * dt, BRACE_RATE * dt));

  return {
    sailing: { ...s, heading, turnRate, ahead, leeway, helm, steer, braces, sides },
    way: { heading, ahead, leeway, rollMoment: force.heel },
    events,
  };
}

/** How one sail stands this moment, for the drawing (N3.10) and the sound (N3.9). */
export interface SailStanding {
  readonly id: string;
  /** Its area as set, m² (0: furled). */
  readonly area: number;
  /** A square sail's yard braced round from square, rad (+ its starboard yardarm aft); a fore-and-aft sail's swing off her centre line, + to starboard. */
  readonly angle: number;
  /** The wind's pressure on it, kN/m² (its force over its area). */
  readonly pressure: number;
  /** The wind is on its fore side (a square sail aback, a headsail backed). */
  readonly aback: boolean;
  /** Its luff lifts: too fine to the wind to draw. */
  readonly shivering: boolean;
}

/** How each of her sails stands in the true wind `wind`, in the rig plan's order (what her damage leaves of each, `harm`). */
export function sailsStanding(s: Sailing, wind: Wind, harm: SailingDamage = UNDAMAGED): SailStanding[] {
  const b = sailingBody(), { ax, ay } = apparent(s.heading, s.ahead, s.leeway, wind), shiver = sinOf(SHIVER_ANGLE);
  return b.sails.map((sb, i) => {
    const area = drawingArea(sb.sail, s.canvas[i]!, harm, i);
    let angle: number, aback: boolean;
    if (sb.square) {
      angle = -s.braces[sb.mast]! * sb.limit;
      sincos(angle, sc);
      sailPush(b.square, sc[1], sc[0], ax, ay);
      aback = push.onFace < 0;
    } else {
      sheetOf(sb, b.foreAft, s, ax, ay);
      angle = sheet.lee * (sb.least + ((sb.limit - sb.least) * sheet.k) / (TRIM_TRIES - 1));
      sailPush(b.foreAft, sheet.lee * sb.trySin[sheet.k]!, sb.tryCos[sheet.k]!, ax, ay);
      // Backed: the wind comes from the side it lies on.
      aback = (ay < 0 ? 1 : -1) === sheet.lee;
    }
    return {
      id: sb.sail.id, area, angle,
      pressure: area > 0 ? (AIR / 2) * Math.hypot(push.x, push.y) : 0,
      aback: area > 0 && aback,
      shivering: area > 0 && push.sinAttack < shiver,
    };
  });
}

/**
 * Whether any of her drawing sails would be aback with her yards braced round as the crew trims them (`braceTarget`) in
 * the true wind `wind`: one that no trim can fill, so the helmsman bears away (orders.ts `carryOut`). Yards still swinging
 * round, or the wind just shifted, are not counted.
 */
export function sailAback(s: Sailing, wind: Wind): boolean {
  const { ax, ay } = apparent(s.heading, s.ahead, s.leeway, wind);
  return sailsStanding({ ...s, braces: s.braces.map((_, m) => braceTarget(s, m, ax, ay)) }, wind).some((x) => x.aback);
}
