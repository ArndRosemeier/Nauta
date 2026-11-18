/**
 * Her lower rig as the slice built it (plan N2.0), for both masts on the whole ship (N2.4): each lower mast with its
 * top, the channels with their deadeyes and chain plates, the shrouds with their lanyards and ratlines, the pin rails
 * inside the bulwarks with their pins, and the lines belayed there, each with its coil hanging on the pin. The whole
 * rig, its spars above the tops and every line, comes with N3.6 from the rig plan (N3.2).
 */
import { Matrix4, Vector3 } from 'three/webgpu';
import { Rng } from '@futuremagic/core';
import {
  CHAIN_PLATE_FOOT, DEADEYE, FORE_MAST, FORE_SHROUDS, FORE_TOP, MAIN_CHANNEL, MAIN_MAST, MAIN_SHROUDS, MAIN_TOP, MASTS, PIN_RAIL,
  PLANKING, PORTS, RAILS, RATLINE_PITCH, ROPE,
} from '../../sim/rules/ships';
import { hullHalfBreadth, sheer, sideTop, weatherDeck } from '../../sim/ship/hull';
import { shipY, shipZ } from '../../sim/ship/section';
import { box, lathe, rod, direction } from './shapes';
import { hanging, straight } from './rope';
import { BLACK, IRON, MAST, OAK, RED } from './looks';
import { place, type Fittings } from './fittings';
import type { ZoneParts } from './parts';
import { bulwarkInside } from './hullSide';


/** The mast's sides when turned. */
const MAST_SIDES = 24;
/** Iron hoops on the lower mast: how far apart, their width and thickness, m. */
const HOOP = { pitch: 1.25, width: 0.06, thick: 0.012 } as const;
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
/** A pin stands at least this far beside a port's side, m. */
const PORT_CLEAR = 0.1;
/** The channel reaches this far abaft the aftmost shroud and forward of the foremost, m (the main channel on the draught). */
const CHANNEL_BEYOND = { aft: 0.28, fore: 0.36 } as const;
/** The pin rail runs this far beyond its first and last pin, m. */
const RAIL_BEYOND = 0.15;
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

/** A mast's lower rig: where it stands, its sizes, its top, its shrouds' deadeyes and its pin rail. */
interface MastRig {
  readonly along: number;
  readonly mast: { readonly step: number; readonly length: number; readonly partners: number; readonly hounds: number; readonly head: number };
  readonly top: { readonly breadth: number; readonly length: number; readonly thick: number; readonly hole: number };
  readonly shrouds: readonly number[];
  readonly rail: string;
}
const RIGS: readonly MastRig[] = [
  { along: MASTS.main.along, mast: MAIN_MAST, top: MAIN_TOP, shrouds: MAIN_SHROUDS, rail: 'main-pins' },
  { along: MASTS.fore.along, mast: FORE_MAST, top: FORE_TOP, shrouds: FORE_SHROUDS, rail: 'fore-pins' },
];

/** Her channels' upper side at a place, m above the base: as far below the top of her side as the main channel stands on the draught. */
function channelTop(along: number): number {
  const main = (MAIN_SHROUDS[0]! + MAIN_SHROUDS[MAIN_SHROUDS.length - 1]!) / 2;
  return sideTop(along) - (sideTop(main) - MAIN_CHANNEL.top);
}

/** Both lower rigs. The masts below the weather deck are drawn in the zones they pass through (`below`). */
export function buildRigs(fittings: Fittings, out: ZoneParts, below: (along: number, h: number) => ZoneParts | null, far = false): void {
  RIGS.forEach((r, k) => buildRig(fittings, out, below, r, k, far));
}

/** One lower rig; `far`: the far ship's, without what cannot be told apart from off her (hoops, lanyards, ratlines, the pin rail). */
function buildRig(fittings: Fittings, out: ZoneParts, below: (along: number, h: number) => ZoneParts | null, r: MastRig, index: number, far: boolean): void {
  const { wood, iron, ropes } = out;
  const zc = shipZ(r.along), deckH = weatherDeck(r.along, 0), deck = shipY(deckH);
  // --- The lower mast: from its step up through the decks to the hounds, then the square masthead and its cap.
  const hounds = shipY(r.mast.step + r.mast.length - r.mast.head), headTop = shipY(r.mast.step + r.mast.length);
  const r0 = r.mast.partners / 2, r1 = r.mast.hounds / 2, heel = shipY(r.mast.step);
  const at = new Matrix4().makeTranslation(0, 0, zc);
  lathe(wood, at, [[0, deck], [r0, deck], [r1, hounds], [0, hounds]], MAST_SIDES, MAST);
  // Below the deck the mast stands in the rooms it passes through.
  const levels = [heel, shipY(deckH - PLANKING.deck)];
  const mid = below(r.along, (r.mast.step + deckH) / 2);
  const low = below(r.along, r.mast.step + PLANKING.deck);
  for (const [z, y0, y1] of [[mid, (levels[0]! + levels[1]!) / 2, levels[1]!], [low, levels[0]!, (levels[0]! + levels[1]!) / 2]] as const) {
    if (z) lathe(z.wood, at, [[0, y0], [r0, y0], [r0, y1], [0, y1]], MAST_SIDES, MAST);
  }
  box(wood, new Matrix4().makeTranslation(0, (hounds + headTop) / 2, zc), [MASTHEAD_SIDE, headTop - hounds, MASTHEAD_SIDE], BLACK, BEVEL, 1);
  box(wood, new Matrix4().makeTranslation(0, headTop - CAP.thick / 2, zc - CAP.length / 2 + MASTHEAD_SIDE / 2), [CAP.breadth, CAP.thick, CAP.length], BLACK, BEVEL, 2);
  const radiusAt = (y: number) => r0 + (r1 - r0) * Math.max(0, (y - deck) / (hounds - deck));
  for (let y = deck + HOOP.pitch; !far && y < hounds - HOOP.pitch / 2; y += HOOP.pitch) {
    const rr = radiusAt(y) + HOOP.thick;
    lathe(iron, new Matrix4().makeTranslation(0, y, zc), [[rr - HOOP.thick, -HOOP.width / 2], [rr, -HOOP.width / 2], [rr, HOOP.width / 2], [rr - HOOP.thick, HOOP.width / 2]], MAST_SIDES, IRON);
  }

  // --- The top: trestle trees along her either side of the masthead, crosstrees across, the platform with its hole and rim.
  const T = r.top, tt = hounds + TRESTLE.deep / 2;
  for (const s of [1, -1]) box(wood, new Matrix4().makeTranslation(s * (MASTHEAD_SIDE + TRESTLE.sided) / 2, tt, zc), [TRESTLE.sided, TRESTLE.deep, T.length], OAK, BEVEL, 2);
  for (const z of [-CROSSTREES.at, CROSSTREES.at]) box(wood, new Matrix4().makeTranslation(0, tt, zc + z), [T.breadth, CROSSTREES.deep, TRESTLE.sided], OAK, BEVEL, 0);
  const plat = hounds + TRESTLE.deep + T.thick / 2, hole = T.hole / 2, wing = T.breadth / 2 - hole;
  for (const s of [1, -1]) {
    box(wood, new Matrix4().makeTranslation(s * (hole + wing / 2), plat, zc), [wing, T.thick, T.length], BLACK, SMALL_BEVEL, 2);
    box(wood, new Matrix4().makeTranslation(0, plat, zc + s * (hole + (T.length / 2 - hole) / 2)), [2 * hole, T.thick, T.length / 2 - hole], BLACK, SMALL_BEVEL, 0);
    box(wood, new Matrix4().makeTranslation(s * T.breadth / 2, plat + TOP_RIM / 2, zc), [TRESTLE.sided, T.thick + TOP_RIM, T.length], BLACK, SMALL_BEVEL, 2);
  }
  const masthead = new Vector3(0, hounds + TRESTLE.deep / 2, zc);

  // --- Each side: the channel, its deadeyes and chain plates, the shrouds, lanyards and ratlines, the pin rail and its lines.
  const rng = new Rng(COIL_SEED + index);
  const chAft = r.shrouds[0]! - CHANNEL_BEYOND.aft, chFore = r.shrouds[r.shrouds.length - 1]! + CHANNEL_BEYOND.fore;
  for (const s of [1, -1]) {
    const chMid = (chAft + chFore) / 2, chTop = channelTop(chMid), chH = chTop - MAIN_CHANNEL.thick / 2;
    const outsideAt = (a: number) => hullHalfBreadth(a, Math.min(chH, sideTop(a))) + PLANKING.side;
    // The channel follows her side: a timber from her planking out, its outer edge straight.
    const outer = Math.max(outsideAt(chAft), outsideAt(chFore), outsideAt(chMid)) + MAIN_CHANNEL.width;
    const inner = Math.min(outsideAt(chAft), outsideAt(chFore), outsideAt(chMid));
    box(wood, new Matrix4().makeTranslation(s * (inner + outer) / 2, shipY(chH), shipZ(chMid)), [outer - inner, MAIN_CHANNEL.thick, chFore - chAft], BLACK, BEVEL, 2);
    const shrouds: { foot: Vector3; top: Vector3 }[] = [];
    r.shrouds.forEach((fwd, k) => {
      const z = shipZ(fwd);
      const lower = new Vector3(s * (outer - DEADEYE_SEAT.in), shipY(channelTop(chMid)) + DEADEYE_SEAT.up, z);
      // The shrouds go round the masthead in pairs, the foremost lowest.
      const top = new Vector3(s * (MASTHEAD_SIDE / 2 + ROPE.shroud / 2), masthead.y + Math.floor(k / 2) * EYE_STACK, zc + (k % 2 === 0 ? -1 : 1) * EYE_FORE_AFT);
      const dir = direction(lower, top);
      const upper = lower.clone().addScaledVector(dir, DEADEYE.apart);
      // The deadeyes' faces lie in the plane of the shroud and her length.
      const n = new Vector3().crossVectors(dir, new Vector3(0, 0, 1)).normalize();
      const b = new Vector3().crossVectors(dir, n);
      // Both with the same X, so the holes on one side line up; the upper turned over (its single hole points down).
      const frameAt = (c: Vector3, flip: number) => new Matrix4().makeBasis(b, n.clone().multiplyScalar(flip), dir.clone().multiplyScalar(-flip)).setPosition(c);
      const lowFrame = frameAt(lower, 1), upFrame = frameAt(upper, -1);
      for (const [m, seed] of [[lowFrame, k], [upFrame, k + r.shrouds.length]] as const) {
        // From off her a deadeye is a dark block in the shroud.
        if (far) box(wood, m, [DEADEYE.diameter, DEADEYE.thick, DEADEYE.diameter], BLACK, 0, 0);
        else place(fittings, 'prop_deadeye', m, { wood: { solid: wood, paint: 1 }, hole: { solid: wood, paint: 1 } }, seed);
      }
      // The lanyard: its holes in the pack's model space (one at the top, two below), reeved up and down between the deadeyes.
      const holes = HOLE_ANGLES.map((a) => new Vector3(HOLE_RADIUS * Math.cos(a), 0, -HOLE_RADIUS * Math.sin(a)));
      // sideOf 1 is the outboard face (along n) of either deadeye.
      const face = (m: Matrix4, flip: number, h: Vector3, sideOf: number) => h.clone().setY(flip * sideOf * DEADEYE.thick / 2).applyMatrix4(m);
      const L = holes.map((h) => (sideOf: number) => face(lowFrame, 1, h, sideOf)), U = holes.map((h) => (sideOf: number) => face(upFrame, -1, h, sideOf));
      for (let i = 0; i < holes.length && !far; i++) ropes.line(straight(U[i]!(1), L[i]!(1)), ROPE.lanyard / 2, TARRED);
      for (let i = 0; i < holes.length - 1 && !far; i++) ropes.line(straight(L[i]!(-1), U[i + 1]!(-1)), ROPE.lanyard / 2, TARRED);
      // The chain plate: an iron strap from under the lower deadeye down her side to its bolt through the wale.
      const plateFoot = CHAIN_PLATE_FOOT + (sheer(fwd) - sheer(MAIN_SHROUDS[0]!));
      const footY = shipY(plateFoot), footX = s * (hullHalfBreadth(fwd, plateFoot) + PLANKING.wale + CHAIN_PLATE.thick);
      const strapTop = lower.clone().addScaledVector(dir, -DEADEYE.diameter / 2);
      const foot = new Vector3(footX, footY, z - dir.z * (strapTop.y - footY) / Math.max(dir.y, SMALL_BEVEL));
      for (const p of straight(strapTop, foot, PLATE_STEPS).slice(1)) rod(iron, strapTop, p, CHAIN_PLATE.width / 2, BOLT.sides / 2, IRON);
      rod(iron, foot.clone().setX(footX - s * CHAIN_PLATE.thick), foot.clone().setX(footX + s * CHAIN_PLATE.thick), BOLT.radius, BOLT.sides, IRON);
      // The shroud itself, from round the upper deadeye to the masthead.
      const start = upper.clone().addScaledVector(dir, DEADEYE.diameter / 2);
      ropes.line(straight(start, top, 2), ROPE.shroud / 2, TARRED);
      shrouds.push({ foot: start, top });
    });
    // Ratlines across the shrouds, a man's step apart, each sagging a little between two shrouds.
    const lowR = Math.max(...shrouds.map((q) => q.foot.y)) + RATLINE_FROM, high = masthead.y - RATLINE_TO;
    const atY = (q: { foot: Vector3; top: Vector3 }, y: number) => new Vector3().lerpVectors(q.foot, q.top, (y - q.foot.y) / (q.top.y - q.foot.y));
    for (let y = lowR; !far && y < high; y += RATLINE_PITCH) {
      for (let k = 0; k < shrouds.length - 1; k++) ropes.line(hanging(atY(shrouds[k]!, y), atY(shrouds[k + 1]!, y), RATLINE_SAG, 2), ROPE.ratline / 2, TARRED);
    }

    // The pin rail inside the bulwark along the shrouds, its pins, and the lines belayed on them.
    const rail = RAILS.find((x) => x.id === r.rail);
    if (far || !rail || rail.kind !== 'pin rail') continue;
    const pins = Array.from({ length: Math.floor((rail.fore - rail.aft) / PIN_RAIL.pitch) + 1 }, (_, k) => rail.aft + k * PIN_RAIL.pitch);
    const railAt = (a: number) => sheer(a) + PIN_RAIL.height;
    const railX = (a: number) => s * (bulwarkInside(a, railAt(a)) - PIN_RAIL.width / 2);
    const from = rail.aft - RAIL_BEYOND, to = rail.fore + RAIL_BEYOND, railMid = (from + to) / 2;
    box(wood, new Matrix4().makeTranslation(railX(railMid), shipY(railAt(railMid)) - PIN_RAIL.thick / 2, shipZ(railMid)), [PIN_RAIL.width, PIN_RAIL.thick, to - from], RED, SMALL_BEVEL, 2);
    pins.forEach((a, i) => {
      // No pin over a port: its coil would hang across the gun.
      if (PORTS.some(([, along, , , w]) => Math.abs(a - along) < w / 2 + PORT_CLEAR)) return;
      const z = shipZ(a), x = railX(railMid), pinTop = shipY(railAt(railMid));
      place(fittings, 'prop_belaying_pin', new Matrix4().makeTranslation(x, pinTop - PIN_FOOT_BELOW, z), { wood: { solid: wood, paint: 1 } }, i);
      if (i % LINE_EVERY !== 0) return;
      // The line comes down from a lead block under the top, is belayed round the pin, and its fall hangs in a coil.
      const lead = new Vector3(s * LEAD_OUT, hounds - TRESTLE.deep, zc + (rng.float() - 1 / 2) * 2 * LEAD_SPREAD);
      const off = new Vector3(x, pinTop + LINE_OFF_PIN, z);
      ropes.line(hanging(lead, off, LINE_SAG, LINE_STEPS), ROPE.running / 2, HEMP);
      lathe(wood, new Matrix4().makeTranslation(x, pinTop + LINE_OFF_PIN - BELAY_BAND, z), [[0, 0], [BELAY_RADIUS, 0], [BELAY_RADIUS, BELAY_BAND], [0, BELAY_BAND]], BOLT.sides, { rgb: ROPE_HEMP_RGB, paint: 1 });
      ropes.line(coil(new Vector3(x - s * (PIN_RAIL.width / 2 + COIL.spread), pinTop + LINE_OFF_PIN - BELAY_BAND, z), s, rng), ROPE.running / 2, HEMP);
    });
  }
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
