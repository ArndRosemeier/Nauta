/**
 * Where one can stand on the slice (plan N2.0) and look: the places Arnd judges it from. Ship space (section.ts):
 * metres, +x starboard, +y up from her load waterline, -z forward; the look's yaw 0 is forward, growing to port.
 */
import { BERTH_HEADROOM, DECK_BEAM, MAIN_MAST, MAIN_TOP, PLANKING } from '../sim/rules/ships';
import { deckY, shipY, shipZ } from '../sim/ship/section';
import type { Look } from './look';

export interface Standpoint {
  /** The button's word. */
  readonly name: string;
  /** The eye, ship space. */
  readonly eye: readonly [number, number, number];
  /** Where it looks first. */
  readonly look: Look;
}

/** A man's eye over the deck he stands on, m; stooping under the beams below. */
const EYE = 1.62;
const EYE_BELOW = 1.45;
/** The two carronades' ports, m forward of the mast (rules WAIST_PORTS inside the slice). */
const AFT_GUN = -1.9;
/** The main top's floor over the hounds: trestle trees and its planks, m (rig.ts). */
const TOP_FLOOR = 0.36;
/** Angles, rad: a quarter turn, and the looks chosen. */
const QUARTER = Math.PI / 2;
const LOOKS = {
  waist: { yaw: -0.55, pitch: -0.12 },
  gun: { yaw: -QUARTER, pitch: -0.2 },
  shrouds: { yaw: 1.25, pitch: 0.75 },
  below: { yaw: 0.35, pitch: 0.05 },
  top: { yaw: 0.6, pitch: -0.95 },
  alongside: { yaw: QUARTER, pitch: 0.16 },
} as const;
/** Where each eye stands, m: across (x) and forward of the mast. */
const AT = {
  waist: { x: -1.3, forward: -3.4 },
  gun: { x: 2.25 },
  shrouds: { x: -3.4, forward: -1.4 },
  below: { x: 0.3, forward: -1.4 },
  top: { x: 1.15, forward: -0.95 },
  alongside: { x: 15, forward: -0.6, up: 1.3 },
} as const;

const deck = deckY(0);
const berth = deck - PLANKING.deck - DECK_BEAM.moulded - BERTH_HEADROOM;
const top = shipY(MAIN_MAST.step + MAIN_MAST.length - MAIN_MAST.head) + TOP_FLOOR + MAIN_TOP.thick;

export const STANDPOINTS: readonly Standpoint[] = [
  { name: 'Waist', eye: [AT.waist.x, deck + EYE, shipZ(AT.waist.forward)], look: LOOKS.waist },
  { name: 'Gun', eye: [AT.gun.x, deckY(AT.gun.x) + EYE, shipZ(AFT_GUN)], look: LOOKS.gun },
  { name: 'Shrouds', eye: [AT.shrouds.x, deckY(AT.shrouds.x) + EYE, shipZ(AT.shrouds.forward)], look: LOOKS.shrouds },
  { name: 'Below', eye: [AT.below.x, berth + EYE_BELOW, shipZ(AT.below.forward)], look: LOOKS.below },
  { name: 'Top', eye: [AT.top.x, top + EYE, shipZ(AT.top.forward)], look: LOOKS.top },
  { name: 'Alongside', eye: [AT.alongside.x, AT.alongside.up, shipZ(AT.alongside.forward)], look: LOOKS.alongside },
];

/** The standpoint named `name` (any case), or the first. */
export function standpoint(name: string): Standpoint {
  return STANDPOINTS.find((s) => s.name.toLowerCase() === name.toLowerCase()) ?? STANDPOINTS[0]!;
}
