/**
 * Where one can stand on the brig and look (plan N2.0, N2.4): the places Arnd judges her from until the walker comes
 * (N2.3). Ship space (sim/ship/section.ts): metres, +x starboard, +y up from her load waterline, -z forward; the
 * look's yaw 0 is forward, growing to port. An eye on board rides with her; one off her (`off`) stands still on the
 * water where she lies, turned with her heading only.
 */
import { HOLD_FLOOR, PORTS } from '../sim/rules/ships';
import { rigPlan } from '../sim/ship/rig';
import { shipY, shipZ } from '../sim/ship/section';
import { sheer, weatherDeck } from '../sim/ship/hull';
import { berthDeck, insideBreadth } from '../sim/ship/plan';
import type { Look } from './look';

export interface Standpoint {
  /** The button's word. */
  readonly name: string;
  /** The eye, ship space. */
  readonly eye: readonly [number, number, number];
  /** Where it looks first. */
  readonly look: Look;
  /** Off her: the eye stands still on the water, not riding her pitch, roll and heave. */
  readonly off?: boolean;
  /**
   * How the head is held, ship space (a unit up; his body on her deck gives it, app/body.ts). None: a standpoint
   * without a body, whose eye rides a fixed share of her pitch and roll.
   */
  readonly up?: readonly [number, number, number];
}

/** A man's eye over the deck he stands on, m; stooping under the beams below; crouching in the hold. */
const EYE = 1.62;
const EYE_BELOW = 1.45;
const EYE_HOLD = 0.95;
/** Angles, rad: a quarter and a half turn. */
const QUARTER = Math.PI / 2;
const HALF = Math.PI;
/** The gun port the gun standpoint stands behind (E, the fifth from aft), and how far inboard of her side, m. */
const GUN_PORT = PORTS[4]!;
const GUN_INBOARD = 2.1;
/** Where each eye stands (m forward of the mainmast, m across) and how it looks. */
const AT = {
  quarterdeck: { along: -6.9, x: 1.6, look: { yaw: 0.12, pitch: -0.06 } },
  waist: { along: 4.6, x: -1.9, look: { yaw: -0.35, pitch: -0.1 } },
  bow: { along: 17.6, x: 0.5, look: { yaw: HALF - 0.12, pitch: -0.08 } },
  bowsprit: { along: 21.2, x: 0.3, up: 0.6, look: { yaw: -2.55, pitch: -0.6 } },
  rail: { along: 2, x: 3.75, up: 0.75, look: { yaw: -QUARTER + 0.25, pitch: -0.72 } },
  /** Astern along her wake from her main top (on deck her boats at the stern davits fill the view aft). */
  astern: { look: { yaw: HALF, pitch: -0.32 } },
  /** On the main top: aft of the masthead, m along from the mast there; and on the main crosstrees, beside the topmast. */
  top: { aft: 0.8, x: 1.0, look: { yaw: 0.4, pitch: -0.5 } },
  crosstrees: { aft: 0.3, x: 0.8, look: { yaw: 0.2, pitch: -0.6 } },
  berth: { along: 9.6, x: 0.6, look: { yaw: HALF - 0.2, pitch: 0.02 } },
  cabin: { along: -6.1, x: -0.85, look: { yaw: HALF + 0.35, pitch: -0.08 } },
  hold: { along: 10.2, x: 0.3, look: { yaw: HALF - 0.1, pitch: 0.05 } },
  alongside: { along: 1.5, x: 15, up: 1.3, look: { yaw: QUARTER, pitch: 0.16 } },
  near: { along: 9, x: 50, up: 3.5, look: { yaw: QUARTER + 0.12, pitch: 0.02 } },
  far: { along: 120, x: 480, up: 4.5, look: { yaw: QUARTER + 0.25, pitch: 0 } },
  farthest: { along: 500, x: 1940, up: 4.5, look: { yaw: QUARTER + 0.25, pitch: 0.004 } },
  above: { along: -75, x: 22, up: 38, look: { yaw: 0.2, pitch: -0.5 } },
} as const;

const deckEye = (along: number, x: number): [number, number, number] => [x, shipY(weatherDeck(along, x)) + EYE, shipZ(along)];
/** The main mast's heights and rake (the rig plan, N3.2): its top and crosstrees are stood on. */
const MAIN = rigPlan().masts.main;
const aloftEye = (aft: number, x: number, floor: number, at: (h: number) => number): [number, number, number] => [x, shipY(floor) + EYE, shipZ(at(floor) - aft)];
/** The bowsprit's standpoint stands over her stem: the deck's height is taken this far forward of the mainmast (the forecastle's end), m. */
const HULL_FORE_DECK = 19.5;
/** An eye raised by `up`, m (standing on a gun's slide to look over the rail). */
const lift = (e: [number, number, number], up: number): [number, number, number] => [e[0], e[1] + up, e[2]];

export const STANDPOINTS: readonly Standpoint[] = [
  { name: 'Quarterdeck', eye: deckEye(AT.quarterdeck.along, AT.quarterdeck.x), look: AT.quarterdeck.look },
  { name: 'Waist', eye: deckEye(AT.waist.along, AT.waist.x), look: AT.waist.look },
  { name: 'Gun', eye: deckEye(GUN_PORT[1], insideBreadth(GUN_PORT[1], sheer(GUN_PORT[1])) - GUN_INBOARD), look: { yaw: -QUARTER, pitch: -0.2 } },
  { name: 'Bow', eye: deckEye(AT.bow.along, AT.bow.x), look: AT.bow.look },
  { name: 'Bowsprit', eye: lift([AT.bowsprit.x, shipY(sheer(HULL_FORE_DECK)) + EYE, shipZ(AT.bowsprit.along)], AT.bowsprit.up), look: AT.bowsprit.look },
  { name: 'Rail', eye: lift(deckEye(AT.rail.along, AT.rail.x), AT.rail.up), look: AT.rail.look },
  { name: 'Astern', eye: aloftEye(AT.top.aft, AT.top.x, MAIN.topFloor, MAIN.lowerAt), look: AT.astern.look },
  { name: 'Top', eye: aloftEye(AT.top.aft, AT.top.x, MAIN.topFloor, MAIN.lowerAt), look: AT.top.look },
  { name: 'Crosstrees', eye: aloftEye(AT.crosstrees.aft, AT.crosstrees.x, MAIN.crosstrees, MAIN.topmastAt), look: AT.crosstrees.look },
  { name: 'Berth deck', eye: [AT.berth.x, shipY(berthDeck(AT.berth.along)) + EYE_BELOW, shipZ(AT.berth.along)], look: AT.berth.look },
  { name: 'Cabin', eye: [AT.cabin.x, shipY(berthDeck(AT.cabin.along)) + EYE_BELOW, shipZ(AT.cabin.along)], look: AT.cabin.look },
  { name: 'Hold', eye: [AT.hold.x, shipY(HOLD_FLOOR) + EYE_HOLD, shipZ(AT.hold.along)], look: AT.hold.look },
  { name: 'Alongside', eye: [AT.alongside.x, AT.alongside.up, shipZ(AT.alongside.along)], look: AT.alongside.look },
  { name: '50 m off', eye: [AT.near.x, AT.near.up, shipZ(AT.near.along)], look: AT.near.look, off: true },
  { name: 'Above', eye: [AT.above.x, AT.above.up, shipZ(AT.above.along)], look: AT.above.look, off: true },
  { name: '500 m off', eye: [AT.far.x, AT.far.up, shipZ(AT.far.along)], look: AT.far.look, off: true },
  { name: '2 km off', eye: [AT.farthest.x, AT.farthest.up, shipZ(AT.farthest.along)], look: AT.farthest.look, off: true },
];

/** The standpoint named `name` (any case, spaces as dashes or left out), or the first. */
export function standpoint(name: string): Standpoint {
  const key = (s: string) => s.toLowerCase().replace(/[\s-]+/g, '');
  return STANDPOINTS.find((s) => key(s.name) === key(name)) ?? STANDPOINTS[0]!;
}

