/**
 * Her rig drawn (plan N2.0, N2.4, N3.6): the spars (masts.ts), every line of the rig plan (rigging.ts), and the iron
 * and timber the lines are set up to, built here from the rig plan (sim/ship/rig.ts): the channels and stools with
 * their deadeyes and chain plates, the deadeyes in the tops with their futtock plates, each pair of deadeyes rove
 * with its lanyard; the pin rails inside her bulwarks and every belaying pin of the plan, each carrying its line's
 * turns and the coil of its fall.
 */
import { Matrix4, Vector3 } from 'three/webgpu';
import { Rng } from '@futuremagic/core';
import { CHANNEL } from '../../sim/rules/rig';
import { CHAIN_PLATE_FOOT, DEADEYE, MAIN_CHANNEL, MAIN_SHROUDS, PIN_RAIL, PLANKING, ROPE } from '../../sim/rules/ships';
import { hullHalfBreadth, waistDeck } from '../../sim/ship/hull';
import { shipY, shipZ } from '../../sim/ship/section';
import { rigPlan, type RigPlan } from '../../sim/ship/rig';
import { SIDES, type Deadeye } from '../../sim/ship/spars';
import type { Belay, ShipPlan } from '../../sim/ship/plan';
import { box, frameAlong, lathe, rod, direction } from './shapes';
import { BLACK, IRON, RED } from './looks';
import { place, type Fittings } from './fittings';
import type { ZoneParts } from './parts';
import { BEVEL, SMALL_BEVEL } from './hullSide';
import { FEW_SIDES, HEMP, TARRED, type Ropes } from './rope';
import { drawSpars } from './masts';
import { LINE_OFF_PIN, buildRigging, type LineFoot } from './rigging';
import { shipPoint, swingsOf } from './swings';

/** How far the deadeyes' holes are from their middle, m (the pack's: 0.052), and the hole pattern's turn. */
const HOLE_RADIUS = 0.052;
/** The holes' angles round the deadeye as the spec turns them, rad (90°, 210°, 330°): one at the top, two below. */
const HOLE_ANGLES = [Math.PI / 2, (7 / 6) * Math.PI, (11 / 6) * Math.PI] as const;
/** The topmast shrouds' deadeyes in the tops are this share of the lower ones (their shrouds are this much thinner). */
const TOP_DEADEYE = 0.65;
/** A deadeye aloft as a turned disc (its face across the frame's y), its rim grooved for the strop: [radius, height], m. */
const DEADEYE_DISC: readonly (readonly [number, number])[] = [
  [0, -DEADEYE.thick / 2], [0.9 * DEADEYE.diameter / 2, -DEADEYE.thick / 2], [DEADEYE.diameter / 2, -DEADEYE.thick / 4],
  [0.93 * DEADEYE.diameter / 2, 0], [DEADEYE.diameter / 2, DEADEYE.thick / 4], [0.9 * DEADEYE.diameter / 2, DEADEYE.thick / 2], [0, DEADEYE.thick / 2],
];
const DISC_SIDES = 10;
/** The chain plates: an iron strap's width and thickness, m. */
const CHAIN_PLATE = { width: 0.05, thick: 0.016 } as const;
/** A futtock plate: an iron strap from under a top's deadeye down through the rim, m long and wide. */
const FUTTOCK_PLATE = { length: 0.45, width: 0.035 } as const;
/** Sides of the chain plate's bolt heads, and their radius, m. */
const BOLT = { sides: 8, radius: 0.022 } as const;
/** A channel reaches this far beyond its first and last deadeye, m (the main channel on the draught). */
const CHANNEL_BEYOND = { aft: 0.28, fore: 0.36 } as const;
/** Deadeyes further apart than this along her are on separate channels or stools, m. */
const CHANNEL_GAP = 1.6;
/** Deadeyes further apart in height than this, m, are on two channels. */
const CHANNEL_STEP = 0.3;
/** The rope's colour where it is drawn as a solid (the turns round a pin): hemp. */
const ROPE_HEMP_RGB = [0.18, 0.12, 0.065] as const;
/** The pin rail runs this far beyond its first and last pin, m; pins further apart than this are on separate lengths of rail. */
const RAIL_BEYOND = 0.15;
const RAIL_GAP = 2.5 * PIN_RAIL.pitch;
/** The belaying pin's collar sits on the rail: its foot is this far below the rail's top, m (the pack's pin: 0.205). */
const PIN_FOOT_BELOW = 0.205;
/** Turns of a line round its pin (figure of eight) are drawn as one short band: its height and radius round the pin, m. */
const BELAY_BAND = 0.07;
const BELAY_RADIUS = 0.026;
/** A coil hanging on its pin: loops, their length down and width across, m, the spread between loops, and points round a loop. */
const COIL = { loops: 6, drop: 0.55, width: 0.13, spread: 0.009, points: 10 } as const;
/** How much a loop's drop and width differ from the next, as a share. */
const COIL_VARY = { drop: 0.1, width: 0.2 } as const;
/** A coil hangs this far out from its pin's middle, m: the rail's half width and the loops' own. */
const COIL_OUT = PIN_RAIL.width / 2;
/** Seed of the coils' small differences. */
const COIL_SEED = 1797;
/** A turn, rad. */
const TURN = 2 * Math.PI;

/** Her whole rig: spars, iron and timber aloft and on her sides, every line, the pins and coils. `belowDeck` gives the zone under a place (the masts stand through her decks), `turning` a turning spar's own parts. */
export function buildRigs(fittings: Fittings, plan: ShipPlan, out: ZoneParts, belowDeck: (along: number, h: number) => ZoneParts | null, turning: (id: string) => ZoneParts | null, far = false): void {
  const rig = rigPlan(plan), swings = swingsOf(rig);
  drawSpars(rig, { out, below: belowDeck, swung: turning, far });
  const feet = drawDeadeyes(rig, fittings, out, far);
  buildRigging(rig, swings, { ropes: out.ropes, solid: (frame) => (frame ? turning(swings[frame - 1]!.id)!.wood : out.wood), feet, far });
  if (!far) buildPins(plan, rig, fittings, out);
}

/**
 * A pair of deadeyes on a line: the lower one at `lower`, the upper one up the line towards `top`; returns where the
 * rope leaves the upper one. `aloft`: high in a top, where its holes cannot be told from the deck, a turned disc
 * stands for the fitting.
 */
function deadeyePair(fittings: Fittings, out: ZoneParts, lower: Vector3, top: Vector3, scale: number, seed: number, far: boolean, aloft: boolean): Vector3 {
  const dir = direction(lower, top), apart = DEADEYE.apart * scale, diameter = DEADEYE.diameter * scale;
  const upper = lower.clone().addScaledVector(dir, apart);
  // The deadeyes' faces lie in the plane of the line and her length (across her, for a line running fore and aft).
  const flat = Math.abs(dir.x) < Math.abs(dir.z) ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1);
  const n = new Vector3(), b = new Vector3();
  frameAlong(lower, top, flat).extractBasis(n, new Vector3(), b);
  b.negate();
  // Both with the same X, so the holes line up; the upper turned over (its single hole points down).
  const frameAt = (c: Vector3, flip: number) => new Matrix4().makeBasis(b, n.clone().multiplyScalar(flip), dir.clone().multiplyScalar(-flip)).setPosition(c).scale(new Vector3(scale, scale, scale));
  const lowFrame = frameAt(lower, 1), upFrame = frameAt(upper, -1);
  for (const [m, k] of [[lowFrame, seed], [upFrame, seed + 1]] as const) {
    // From off her a deadeye is a dark block in the line.
    if (far) box(out.wood, m, [DEADEYE.diameter, DEADEYE.thick, DEADEYE.diameter], BLACK, 0, 0);
    else if (aloft) lathe(out.wood, m, DEADEYE_DISC, DISC_SIDES, BLACK);
    else place(fittings, 'prop_deadeye', m, { wood: { solid: out.wood, paint: 1 }, hole: { solid: out.wood, paint: 1 } }, k);
  }
  if (!far) {
    // The lanyard: its holes in the pack's model space (one at the top, two below), rove up and down between the deadeyes.
    const holes = HOLE_ANGLES.map((a) => new Vector3(HOLE_RADIUS * Math.cos(a), 0, -HOLE_RADIUS * Math.sin(a)));
    const face = (m: Matrix4, flip: number, h: Vector3, sideOf: number) => h.clone().setY(flip * sideOf * DEADEYE.thick / 2).applyMatrix4(m);
    const L = (i: number, s: number) => face(lowFrame, 1, holes[i]!, s), U = (i: number, s: number) => face(upFrame, -1, holes[i]!, s);
    const radius = ROPE.lanyard * scale / 2;
    for (let i = 0; i < holes.length; i++) out.ropes.line([U(i, 1), L(i, 1)], radius, TARRED, FEW_SIDES);
    for (let i = 0; i < holes.length - 1; i++) out.ropes.line([L(i, -1), U(i + 1, -1)], radius, TARRED, FEW_SIDES);
  }
  return upper.addScaledVector(dir, diameter / 2);
}

/**
 * Every deadeye of the rig: on her channels and stools (the lower shrouds, the backstays) with their chain plates,
 * and in the tops (the topmast shrouds) with their futtock plates. Returns, for each line set up to one, where it
 * leaves its upper deadeye.
 */
function drawDeadeyes(rig: RigPlan, fittings: Fittings, out: ZoneParts, far: boolean): Map<string, LineFoot> {
  const feet = new Map<string, LineFoot>();
  const tops = new Map(rig.lines.filter((l) => l.ends[1].on === 'deadeye').map((l) => [l.ends[1].id, l]));
  rig.deadeyes.forEach((d, k) => {
    const line = tops.get(d.id);
    if (!line) return;
    const lower = shipPoint(d), top = shipPoint(line.ends[0]);
    const scale = d.on === 'top' ? TOP_DEADEYE : 1;
    const start = deadeyePair(fittings, out, lower, top, scale, 2 * k, far, d.on === 'top');
    feet.set(line.id, { at: start });
    if (d.on === 'channel') chainPlate(out, d, lower, direction(lower, top));
    else {
      // The futtock plate from under the deadeye down through the top's rim, where the futtock shroud is hooked.
      const foot = lower.clone().addScaledVector(direction(lower, top), -DEADEYE.diameter * scale / 2);
      const plateEnd = foot.clone().add(new Vector3(0, -FUTTOCK_PLATE.length, 0));
      rod(out.iron, foot, plateEnd, FUTTOCK_PLATE.width / 2, BOLT.sides / 2, IRON);
      feet.set(`${d.id}:plate`, { at: plateEnd });
    }
  });
  // Each side's channels; the fore and main runs part by the gap between them.
  for (const side of SIDES) channels(out, rig.deadeyes.filter((d) => d.side === side && d.on === 'channel'));
  return feet;
}

/** The chain plate under a channel's deadeye: an iron strap down her side, along the line's direction, to its bolt through the wale. */
function chainPlate(out: ZoneParts, d: Deadeye, lower: Vector3, dir: Vector3): void {
  const plateFoot = CHAIN_PLATE_FOOT + (waistDeck(d.along) - waistDeck(MAIN_SHROUDS[0]!));
  const footY = shipY(plateFoot), footX = d.side * (hullHalfBreadth(d.along, plateFoot) + PLANKING.wale + CHAIN_PLATE.thick);
  const strapTop = lower.clone().addScaledVector(dir, -DEADEYE.diameter / 2);
  const foot = new Vector3(footX, footY, strapTop.z - dir.z * (strapTop.y - footY) / Math.max(dir.y, SMALL_BEVEL));
  rod(out.iron, strapTop, foot, CHAIN_PLATE.width / 2, BOLT.sides / 2, IRON);
  rod(out.iron, foot.clone().setX(footX - d.side * CHAIN_PLATE.thick), foot.clone().setX(footX + d.side * CHAIN_PLATE.thick), BOLT.radius, BOLT.sides, IRON);
}

/** A side's channels and stools: one timber under each run of deadeyes, from her planking out past them. */
function channels(out: ZoneParts, eyes: readonly Deadeye[]): void {
  const sorted = [...eyes].sort((a, b) => a.along - b.along);
  const runs: Deadeye[][] = [];
  for (const d of sorted) {
    const last = runs[runs.length - 1];
    // A run parts where her side steps up to a raised deck's (N2.12): each channel lies under its own rail.
    if (last && d.along - last[last.length - 1]!.along < CHANNEL_GAP && Math.abs(d.height - last[last.length - 1]!.height) < CHANNEL_STEP) last.push(d);
    else runs.push([d]);
  }
  for (const run of runs) {
    const side = run[0]!.side, aft = run[0]!.along - CHANNEL_BEYOND.aft, fore = run[run.length - 1]!.along + CHANNEL_BEYOND.fore;
    const top = Math.min(...run.map((d) => d.height)) - CHANNEL.seatUp, mid = (aft + fore) / 2;
    const thick = MAIN_CHANNEL.thick, h = top - thick / 2;
    const planked = (a: number) => hullHalfBreadth(a, h) + PLANKING.side;
    const outer = Math.max(...run.map((d) => Math.abs(d.across))) + CHANNEL.seatIn;
    const inner = Math.min(planked(aft), planked(fore), planked(mid));
    box(out.wood, new Matrix4().setPosition(side * (inner + outer) / 2, shipY(h), shipZ(mid)), [outer - inner, thick, fore - aft], BLACK, BEVEL, 2);
  }
}

/** The pin rails along her bulwarks (a length of rail under each run of pins) and every pin of the plan, each with its line's turns and coil. */
function buildPins(plan: ShipPlan, rig: RigPlan, fittings: Fittings, out: ZoneParts): void {
  const byRail = new Map<string, Belay[]>();
  for (const b of plan.belays) {
    // The fife rails are the bitts' (N2.6); only the pin rails along her sides are drawn here.
    if (b.toward[1] === 0) continue;
    const rail = `${b.rail}:${Math.sign(b.across)}`;
    byRail.set(rail, [...(byRail.get(rail) ?? []), b]);
  }
  for (const pins of byRail.values()) {
    const sorted = [...pins].sort((a, b) => a.along - b.along);
    let run: Belay[] = [];
    const flush = () => { if (run.length) railRun(out, run); run = []; };
    for (const b of sorted) {
      if (run.length && b.along - run[run.length - 1]!.along > RAIL_GAP) flush();
      run.push(b);
    }
    flush();
  }
  const lineOn = new Map(rig.lines.filter((l) => l.belay).map((l) => [l.belay!, l]));
  const rng = new Rng(COIL_SEED);
  plan.belays.forEach((b, i) => {
    const top = shipPoint(b);
    place(fittings, 'prop_belaying_pin', new Matrix4().setPosition(top.x, top.y - PIN_FOOT_BELOW, top.z), { wood: { solid: out.wood, paint: 1 } }, i);
    const line = lineOn.get(b.id);
    if (!line) return;
    // The line's turns round the pin, and its fall hanging in a coil on the side the crew stand.
    lathe(out.wood, new Matrix4().setPosition(top.x, top.y + LINE_OFF_PIN - BELAY_BAND, top.z), [[0, 0], [BELAY_RADIUS, 0], [BELAY_RADIUS, BELAY_BAND], [0, BELAY_BAND]], BOLT.sides, { rgb: ROPE_HEMP_RGB, paint: 1 });
    const toward = new Vector3(b.toward[1], 0, -b.toward[0]).normalize();
    coil(out.ropes, top.clone().addScaledVector(toward, COIL_OUT).setY(top.y + LINE_OFF_PIN - BELAY_BAND), toward, line.diameter / 2, rng);
  });
}

/** A length of pin rail under a run of pins, inside her bulwark: a timber from pin to pin, following her side. */
function railRun(out: ZoneParts, pins: readonly Belay[]): void {
  const railUnder = (b: Belay) => shipPoint(b).setY(shipY(b.height) - PIN_RAIL.thick / 2);
  const first = railUnder(pins[0]!), last = railUnder(pins[pins.length - 1]!);
  const ends = [first.clone().add(new Vector3(0, 0, RAIL_BEYOND)), ...pins.map(railUnder), last.clone().add(new Vector3(0, 0, -RAIL_BEYOND))];
  for (let i = 0; i < ends.length - 1; i++) {
    const a = ends[i]!, b = ends[i + 1]!, m = frameAlong(a, b).multiply(new Matrix4().setPosition(0, a.distanceTo(b) / 2, 0));
    box(out.wood, m, [PIN_RAIL.width, a.distanceTo(b) + PIN_RAIL.thick / 2, PIN_RAIL.thick], RED, SMALL_BEVEL, 1);
  }
}

/** A coil hanging from `top` toward `out` (level): loops one in front of the other, each a little different. */
function coil(ropes: Ropes, top: Vector3, out: Vector3, radius: number, rng: Rng): void {
  const across = new Vector3(0, 1, 0).cross(out).normalize();
  const pts: Vector3[] = [];
  for (let l = 0; l < COIL.loops; l++) {
    const drop = COIL.drop * (1 - l * COIL.spread * 2) * (1 + (rng.float() - 1 / 2) * COIL_VARY.drop);
    const width = COIL.width * (1 + (rng.float() - 1 / 2) * COIL_VARY.width);
    const shift = (rng.float() - 1 / 2) * COIL.spread * 2;
    const base = top.clone().addScaledVector(out, l * COIL.spread).addScaledVector(across, shift);
    for (let k = 0; k < COIL.points; k++) {
      const a = (k / COIL.points) * TURN;
      // A loop hangs from the pin as a long drop: narrow at the top, round at the bottom.
      const down = (1 - Math.cos(a)) / 2, side = Math.sin(a) * Math.sqrt(down);
      pts.push(base.clone().add(new Vector3(0, -down * drop, 0)).addScaledVector(across, side * width / 2));
    }
  }
  pts.push(pts[0]!.clone());
  ropes.line(pts, radius, HEMP, FEW_SIDES);
}
