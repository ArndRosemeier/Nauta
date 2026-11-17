/**
 * The slice's part of her rig (plan N2.0): the lower mainmast with its top, the main channels with their deadeyes
 * and chain plates, the shrouds with their lanyards and ratlines, the pin rails inside the bulwarks with their pins,
 * and the lines belayed there, each with its coil hanging on the pin. The whole rig comes with N3.6 from the rig plan.
 */
import { Matrix4, Vector3 } from 'three/webgpu';
import { Rng } from '@futuremagic/core';
import {
  BULWARK, CHAIN_PLATE_FOOT, PORT, DEADEYE, DECK_AT_SIDE, MAIN_CHANNEL, MAIN_MAST, MAIN_SHROUDS, MAIN_TOP, PIN_RAIL, PLANKING,
  RATLINE_PITCH, ROPE,
} from '../../sim/rules/ships';
import { deckY, halfBreadth, shipY, shipZ } from '../../sim/ship/section';
import { box, lathe, rod } from './shapes';
import type { Solid } from './solid';
import { Ropes, hanging, straight } from './rope';
import { BLACK, IRON, MAST, OAK, RED, TAR } from './looks';
import { place, type Fittings } from './fittings';

export interface RigParts {
  /** The masthead's middle where the shrouds go round it, ship space. */
  readonly masthead: Vector3;
}

/** The mast's sides when turned. */
const MAST_SIDES = 24;
/** Iron hoops on the lower mast: how far apart, their width and thickness, m. */
const HOOP = { pitch: 1.25, width: 0.06, thick: 0.012 } as const;
/** The mast coat at the partners: how high it reaches up the mast and how far out on the partners, m. */
const COAT = { up: 0.28, out: 0.14 } as const;
/** The coat's shoulder, where its slope eases: up from its foot and out from the mast, m. */
const COAT_SHOULDER = { up: 0.09, out: 0.07 } as const;
/** The masthead is square above the hounds: its side, m, and the cap on top (thick, long fore and aft). */
const MASTHEAD_SIDE = 0.36;
const CAP = { thick: 0.22, length: 1.05, breadth: 0.52 } as const;
/** The trestle trees and crosstrees under the top, m: their depth and siding. */
const TRESTLE = { deep: 0.26, sided: 0.14 } as const;
/** The crosstrees: how far forward and aft of the mast's middle, and their depth, m. */
const CROSSTREES = { at: 0.8, deep: 0.21 } as const;
/** The top's rim, m: its height. */
const TOP_RIM = 0.09;
/** The shrouds' eyes go round the masthead stacked this high per pair, m. */
const EYE_STACK = 0.05;
/** A pair's two eyes lie this far forward and aft of the masthead's middle, m. */
const EYE_FORE_AFT = 0.09;
/** Where on the channel's edge the lower deadeye sits, m in from its outer edge, and how high above it its middle stands. */
const DEADEYE_SEAT = { in: 0.06, up: 0.1 } as const;
/** The chain plates: an iron strap's width and thickness, m. */
const CHAIN_PLATE = { width: 0.05, thick: 0.016 } as const;
/** How far the deadeyes' holes are from their middle, m (the pack's: 0.052), and the hole pattern's turn. */
const HOLE_RADIUS = 0.052;
/** The holes' angles round the deadeye as the spec turns them, rad (90°, 210°, 330°): one at the top, two below. */
const HOLE_ANGLES = [Math.PI / 2, (7 / 6) * Math.PI, (11 / 6) * Math.PI] as const;
/** Ratlines start above the upper deadeyes by, m, and stop below the masthead by, m; their sag between shrouds, m. */
const RATLINE_FROM = 0.45;
const RATLINE_TO = 1.4;
const RATLINE_SAG = 0.012;
/** Pieces of a running line from its pin to its lead block aloft, and its sag, m. */
const LINE_STEPS = 12;
const LINE_SAG = 0.18;
/** The lead blocks under the top that the belayed lines come down from: how far out from the mast, m. */
const LEAD_OUT = 1.1;
/** ...and spread up to this far forward or aft of it, m. */
const LEAD_SPREAD = 0.8;
/** A coil hanging on its pin: loops, their length down and width across, m, the spread between loops, and points round a loop. */
const COIL = { loops: 11, drop: 0.58, width: 0.13, spread: 0.0065, points: 18 } as const;
/** How much a loop's drop and width differ from the next, as a share. */
const COIL_VARY = { drop: 0.1, width: 0.2 } as const;
/** Every how many pins carries a line. */
const LINE_EVERY = 2;
/** The pin rail's first pin is this far forward of the channel's after end, m. */
const PIN_START = 0.15;
/** A pin stands at least this far beside a port's side, m. */
const PORT_CLEAR = 0.1;
/** The belaying pin's collar sits on the rail: its foot is this far below the rail's top, m (the pack's pin: 0.205). */
const PIN_FOOT_BELOW = 0.205;
/** Where a belayed line leaves its pin, m above the rail's top. */
const LINE_OFF_PIN = 0.08;
/** Turns of a line round its pin (figure of eight) are drawn as one short band: its height, m. */
const BELAY_BAND = 0.07;
/** ...and its radius round the pin, m. */
const BELAY_RADIUS = 0.026;
/** Seed of the coils' small differences. */
const COIL_SEED = 1797;
/** A turn, rad. */
const TURN = 2 * Math.PI;
/** Points on the chain plate's run to its bolt. */
const PLATE_STEPS = 1;
/** Sides of the chain plate's bolt heads, and their radius, m. */
const BOLT = { sides: 8, radius: 0.022 } as const;
/** The rigging's ropes are tarred (standing) or plain hemp (running). */
const TARRED = 1;
const HEMP = 0.15;

/** Options the slice gives: where it ends, the berth deck's height, the partners round the mast. */
export interface RigOptions {
  readonly zFore: number;
  readonly zAft: number;
  readonly berthY: number;
  readonly partners: number;
  readonly partnersRise: number;
  /** The ports' middles inside the slice, ship-space z. */
  readonly ports: readonly number[];
}

export function buildRig(fittings: Fittings, wood: Solid, iron: Solid, ropes: Ropes, o: RigOptions): RigParts {
  // --- The lower mainmast, from the berth deck up through the partners to the hounds, then the square masthead and its cap.
  const deck = deckY(0);
  const hounds = shipY(MAIN_MAST.step + MAIN_MAST.length - MAIN_MAST.head), headTop = shipY(MAIN_MAST.step + MAIN_MAST.length);
  const r0 = MAIN_MAST.partners / 2, r1 = MAIN_MAST.hounds / 2;
  const radiusAt = (y: number) => r0 + (r1 - r0) * Math.max(0, (y - deck) / (hounds - deck));
  lathe(wood, new Matrix4(), [[0, o.berthY], [r0, o.berthY], [r0, deck], [r1, hounds], [0, hounds]], MAST_SIDES, MAST);
  box(wood, new Matrix4().makeTranslation(0, (hounds + headTop) / 2, 0), [MASTHEAD_SIDE, headTop - hounds, MASTHEAD_SIDE], BLACK, BEVEL, 1);
  box(wood, new Matrix4().makeTranslation(0, headTop - CAP.thick / 2, -CAP.length / 2 + MASTHEAD_SIDE / 2), [CAP.breadth, CAP.thick, CAP.length], BLACK, BEVEL, 2);
  for (let y = deck + HOOP.pitch; y < hounds - HOOP.pitch / 2; y += HOOP.pitch) {
    const r = radiusAt(y) + HOOP.thick;
    lathe(iron, new Matrix4().makeTranslation(0, y, 0), [[r - HOOP.thick, -HOOP.width / 2], [r, -HOOP.width / 2], [r, HOOP.width / 2], [r - HOOP.thick, HOOP.width / 2]], MAST_SIDES, IRON);
  }
  // The partners: a raised square of oak round the mast, and the tarred canvas coat that keeps the water out.
  box(wood, new Matrix4().makeTranslation(0, deck + o.partnersRise / 2 - PLANKING.deck / 2, 0), [o.partners, o.partnersRise + PLANKING.deck, o.partners], OAK, BEVEL, 0);
  lathe(wood, new Matrix4(), [[r0 + COAT.out, deck + o.partnersRise], [r0 + COAT_SHOULDER.out, deck + o.partnersRise + COAT_SHOULDER.up], [r0, deck + o.partnersRise + COAT.up]], MAST_SIDES, TAR);

  // --- The top: trestle trees along her either side of the masthead, crosstrees across, the platform with its hole and rim.
  const tt = hounds + TRESTLE.deep / 2;
  for (const s of [1, -1]) box(wood, new Matrix4().makeTranslation(s * (MASTHEAD_SIDE + TRESTLE.sided) / 2, tt, 0), [TRESTLE.sided, TRESTLE.deep, MAIN_TOP.length], OAK, BEVEL, 2);
  for (const z of [-CROSSTREES.at, CROSSTREES.at]) box(wood, new Matrix4().makeTranslation(0, tt, z), [MAIN_TOP.breadth, CROSSTREES.deep, TRESTLE.sided], OAK, BEVEL, 0);
  const plat = hounds + TRESTLE.deep + MAIN_TOP.thick / 2, hole = MAIN_TOP.hole / 2;
  const side = (MAIN_TOP.breadth / 2 - hole);
  for (const s of [1, -1]) {
    box(wood, new Matrix4().makeTranslation(s * (hole + side / 2), plat, 0), [side, MAIN_TOP.thick, MAIN_TOP.length], BLACK, SMALL_BEVEL, 2);
    box(wood, new Matrix4().makeTranslation(0, plat, s * (hole + (MAIN_TOP.length / 2 - hole) / 2)), [2 * hole, MAIN_TOP.thick, MAIN_TOP.length / 2 - hole], BLACK, SMALL_BEVEL, 0);
    box(wood, new Matrix4().makeTranslation(s * MAIN_TOP.breadth / 2, plat + TOP_RIM / 2, 0), [TRESTLE.sided, MAIN_TOP.thick + TOP_RIM, MAIN_TOP.length], BLACK, SMALL_BEVEL, 2);
  }
  const masthead = new Vector3(0, hounds + TRESTLE.deep / 2, 0);

  // --- Each side: the channel, its deadeyes and chain plates, the shrouds, lanyards and ratlines, the pin rail and its lines.
  const rng = new Rng(COIL_SEED);
  for (const s of [1, -1]) {
    const chH = MAIN_CHANNEL.top - MAIN_CHANNEL.thick / 2;
    const outside = halfBreadth(chH) + PLANKING.side;
    const chZ0 = Math.max(o.zFore, shipZ(MAIN_CHANNEL.fore)), chZ1 = Math.min(o.zAft, shipZ(MAIN_CHANNEL.aft));
    box(wood, new Matrix4().makeTranslation(s * (outside + MAIN_CHANNEL.width / 2), shipY(chH), (chZ0 + chZ1) / 2), [MAIN_CHANNEL.width, MAIN_CHANNEL.thick, chZ1 - chZ0], BLACK, BEVEL, 2);
    const shrouds: { foot: Vector3; top: Vector3 }[] = [];
    MAIN_SHROUDS.forEach((fwd, k) => {
      const z = shipZ(fwd);
      const lower = new Vector3(s * (outside + MAIN_CHANNEL.width - DEADEYE_SEAT.in), shipY(MAIN_CHANNEL.top) + DEADEYE_SEAT.up, z);
      // The shrouds go round the masthead in pairs, the foremost lowest.
      const top = new Vector3(s * (MASTHEAD_SIDE / 2 + ROPE.shroud / 2), masthead.y + Math.floor(k / 2) * EYE_STACK, (k % 2 === 0 ? -1 : 1) * EYE_FORE_AFT);
      const dir = new Vector3().subVectors(top, lower).normalize();
      const upper = lower.clone().addScaledVector(dir, DEADEYE.apart);
      // The deadeyes' faces lie in the plane of the shroud and her length.
      const n = new Vector3().crossVectors(dir, new Vector3(0, 0, 1)).normalize();
      const b = new Vector3().crossVectors(dir, n);
      // Both with the same X, so the holes on one side line up; the upper turned over (its single hole points down).
      const frameAt = (c: Vector3, flip: number) => new Matrix4().makeBasis(b, n.clone().multiplyScalar(flip), dir.clone().multiplyScalar(-flip)).setPosition(c);
      const lowFrame = frameAt(lower, 1), upFrame = frameAt(upper, -1);
      place(fittings, 'prop_deadeye', lowFrame, { wood: { solid: wood, paint: 1 }, hole: { solid: wood, paint: 1 } }, k);
      place(fittings, 'prop_deadeye', upFrame, { wood: { solid: wood, paint: 1 }, hole: { solid: wood, paint: 1 } }, k + MAIN_SHROUDS.length);
      // The lanyard: its holes in the pack's model space (one at the top, two below), reeved up and down between the deadeyes.
      const holes = HOLE_ANGLES.map((a) => new Vector3(HOLE_RADIUS * Math.cos(a), 0, -HOLE_RADIUS * Math.sin(a)));
      // sideOf 1 is the outboard face (along n) of either deadeye.
      const face = (m: Matrix4, flip: number, h: Vector3, sideOf: number) => h.clone().setY(flip * sideOf * DEADEYE.thick / 2).applyMatrix4(m);
      const L = holes.map((h) => (sideOf: number) => face(lowFrame, 1, h, sideOf)), U = holes.map((h) => (sideOf: number) => face(upFrame, -1, h, sideOf));
      for (let i = 0; i < holes.length; i++) ropes.line(straight(U[i]!(1), L[i]!(1)), ROPE.lanyard / 2, TARRED);
      for (let i = 0; i < holes.length - 1; i++) ropes.line(straight(L[i]!(-1), U[i + 1]!(-1)), ROPE.lanyard / 2, TARRED);
      // The chain plate: an iron strap from under the lower deadeye down her side to its bolt through the wale.
      const footY = shipY(CHAIN_PLATE_FOOT), footX = s * (halfBreadth(CHAIN_PLATE_FOOT) + PLANKING.wale + CHAIN_PLATE.thick);
      const strapTop = lower.clone().addScaledVector(dir, -DEADEYE.diameter / 2);
      const foot = new Vector3(footX, footY, z - dir.z * (strapTop.y - footY) / Math.max(dir.y, SMALL_BEVEL));
      // Where the slice's end cuts the strap, it ends there like everything else.
      const cut = foot.z > o.zAft ? (o.zAft - strapTop.z) / (foot.z - strapTop.z) : 1;
      for (const p of straight(strapTop, foot.clone().lerpVectors(strapTop, foot, cut), PLATE_STEPS).slice(1)) rod(iron, strapTop, p, CHAIN_PLATE.width / 2, BOLT.sides / 2, IRON);
      if (cut === 1) rod(iron, foot.clone().setX(footX - s * CHAIN_PLATE.thick), foot.clone().setX(footX + s * CHAIN_PLATE.thick), BOLT.radius, BOLT.sides, IRON);
      // The shroud itself, from round the upper deadeye to the masthead.
      const start = upper.clone().addScaledVector(dir, DEADEYE.diameter / 2);
      ropes.line(straight(start, top, 2), ROPE.shroud / 2, TARRED);
      shrouds.push({ foot: start, top });
    });
    // Ratlines across the shrouds, a man's step apart, each sagging a little between two shrouds.
    const low = Math.max(...shrouds.map((r) => r.foot.y)) + RATLINE_FROM, high = masthead.y - RATLINE_TO;
    const atY = (r: { foot: Vector3; top: Vector3 }, y: number) => new Vector3().lerpVectors(r.foot, r.top, (y - r.foot.y) / (r.top.y - r.foot.y));
    for (let y = low; y < high; y += RATLINE_PITCH) {
      for (let k = 0; k < shrouds.length - 1; k++) ropes.line(hanging(atY(shrouds[k]!, y), atY(shrouds[k + 1]!, y), RATLINE_SAG, 2), ROPE.ratline / 2, TARRED);
    }

    // The pin rail inside the bulwark along the shrouds, its pins, and the lines belayed on them.
    const thick = PLANKING.side + BULWARK.timber + BULWARK.insideBoard;
    const railH = DECK_AT_SIDE + PIN_RAIL.height;
    const inX = halfBreadth(railH) + PLANKING.side - thick;
    const railX = s * (inX - PIN_RAIL.width / 2);
    const rz0 = Math.max(o.zFore, shipZ(MAIN_SHROUDS[MAIN_SHROUDS.length - 1]!) - PIN_START), rz1 = Math.min(o.zAft, shipZ(MAIN_SHROUDS[0]!) + PIN_START);
    box(wood, new Matrix4().makeTranslation(railX, shipY(railH) - PIN_RAIL.thick / 2, (rz0 + rz1) / 2), [PIN_RAIL.width, PIN_RAIL.thick, rz1 - rz0], RED, SMALL_BEVEL, 2);
    const count = Math.floor((rz1 - rz0) / PIN_RAIL.pitch);
    for (let i = 0; i <= count; i++) {
      const z = rz0 + (rz1 - rz0 - count * PIN_RAIL.pitch) / 2 + i * PIN_RAIL.pitch;
      // No pin over a port: its coil would hang across the gun.
      if (o.ports.some((p) => Math.abs(z - p) < PORT.width / 2 + PORT_CLEAR)) continue;
      const pinTop = shipY(railH);
      place(fittings, 'prop_belaying_pin', new Matrix4().makeTranslation(railX, pinTop - PIN_FOOT_BELOW, z), { wood: { solid: wood, paint: 1 } }, i);
      if (i % LINE_EVERY !== 0) continue;
      // The line comes down from a lead block under the top, is belayed round the pin, and its fall hangs in a coil.
      const lead = new Vector3(s * LEAD_OUT, hounds - TRESTLE.deep, (rng.float() - 1 / 2) * 2 * LEAD_SPREAD);
      const off = new Vector3(railX, pinTop + LINE_OFF_PIN, z);
      ropes.line(hanging(lead, off, LINE_SAG, LINE_STEPS), ROPE.running / 2, HEMP);
      lathe(wood, new Matrix4().makeTranslation(railX, pinTop + LINE_OFF_PIN - BELAY_BAND, z), [[0, 0], [BELAY_RADIUS, 0], [BELAY_RADIUS, BELAY_BAND], [0, BELAY_BAND]], BOLT.sides, { rgb: ROPE_HEMP_RGB, paint: 1 });
      ropes.line(coil(new Vector3(railX - s * (PIN_RAIL.width / 2 + COIL.spread), pinTop + LINE_OFF_PIN - BELAY_BAND, z), s, rng), ROPE.running / 2, HEMP);
    }
  }
  return { masthead };
}

/** Hemp rope's colour where it is drawn as a solid (the turns round a pin). */
const ROPE_HEMP_RGB = [0.18, 0.12, 0.065] as const;
/** Rounding of timber edges, m. */
const BEVEL = 0.02;
const SMALL_BEVEL = 0.008;

/** A coil hanging from `top`: loops one in front of the other toward the side `s` points away from, each a little different. */
function coil(top: Vector3, s: number, rng: Rng): Vector3[] {
  const pts: Vector3[] = [];
  for (let l = 0; l < COIL.loops; l++) {
    const drop = COIL.drop * (1 - l * COIL.spread * 2) * (1 + (rng.float() - 1 / 2) * COIL_VARY.drop);
    const width = COIL.width * (1 + (rng.float() - 1 / 2) * COIL_VARY.width);
    const x = top.x - s * l * COIL.spread, dz = (rng.float() - 1 / 2) * COIL.spread * 2;
    for (let k = 0; k < COIL.points; k++) {
      const a = (k / COIL.points) * TURN;
      // A loop hangs from the pin as a long drop: narrow at the top, round at the bottom.
      const down = (1 - Math.cos(a)) / 2, across = Math.sin(a) * Math.sqrt(down);
      pts.push(new Vector3(x, top.y - down * drop, top.z + dz + across * width / 2));
    }
  }
  pts.push(pts[0]!.clone());
  return pts;
}
