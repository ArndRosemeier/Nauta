/**
 * Her weight fitted for sea (pure, N2.1): her timber reckoned from the plan's own cells and sizes, and what she
 * carries (rules: LOADS), each with the height of its middle, so floating (N2.2) has her weight and its centre.
 */
import {
  BERTH_BEAM, BULWARK, CEILING, CEILING_SHARE, DEADWOOD, DEAL, DECK_BEAM, FRAME_DEPTH, FRAME_FILL, IRONWORK, KEEL_DEPTH,
  KEEL_HALF_SIDING, KEELSON, LOADS, OAK, PLANKING, BEAM_FRAMING, SEA_WATER, PROFILE,
} from '../rules/ships';
import { hullBottom, sideTop, sheer } from './hull';
import { berthDeck, type ShipPlan } from './plan';

/** A part of her weight: what, tonnes, and the height of its middle above the base. */
export interface WeightPart {
  readonly what: string;
  readonly tonnes: number;
  readonly height: number;
}

/** The middle height of a set of cells' girth or deck, by area. */
function areaAndHeight(plan: ShipPlan, kind: 'planking' | 'frame' | 'deck' | 'bulwark', level?: string): [number, number] {
  let area = 0, moment = 0;
  for (const c of plan.cells) {
    if (c.kind !== kind || (level && c.level !== level)) continue;
    const mid = (c.aft + c.fore) / 2;
    const h = kind === 'deck' ? (c.level === 'weather' ? sheer(mid) : berthDeck(mid))
      : kind === 'bulwark' ? (c.from + c.to) / 2
      : (hullBottom(mid) + sideTop(mid)) / 2;
    area += c.area;
    moment += c.area * h;
  }
  return [area, area > 0 ? moment / area : 0];
}

/** Her timber and ironwork, part by part, from the plan. */
export function structure(plan: ShipPlan): WeightPart[] {
  const [skin, skinH] = areaAndHeight(plan, 'planking');
  const [frames, framesH] = areaAndHeight(plan, 'frame');
  const [weather, weatherH] = areaAndHeight(plan, 'deck', 'weather');
  const [berth, berthH] = areaAndHeight(plan, 'deck', 'berth');
  const [bulwark, bulwarkH] = areaAndHeight(plan, 'bulwark');
  const keelLength = PROFILE[PROFILE.length - 1]![0] - PROFILE[0]![0];
  const keelSiding = 2 * KEEL_HALF_SIDING;
  const beams = (weather / DECK_BEAM.spacing) * DECK_BEAM.sided * DECK_BEAM.moulded, berthBeams = (berth / DECK_BEAM.spacing) * DECK_BEAM.sided * BERTH_BEAM;
  const parts: WeightPart[] = [
    { what: 'outside planking and wales', tonnes: skin * PLANKING.side * OAK, height: skinH },
    { what: 'frames', tonnes: frames * FRAME_DEPTH * FRAME_FILL * OAK, height: framesH },
    { what: 'ceiling', tonnes: frames * CEILING_SHARE * CEILING * OAK, height: framesH },
    { what: 'keel, keelson, stem, sternpost and deadwood', tonnes: (keelLength * keelSiding * KEEL_DEPTH + keelLength * KEELSON.sided * KEELSON.moulded + DEADWOOD) * OAK, height: KEEL_DEPTH },
    { what: 'weather deck planking', tonnes: weather * PLANKING.deck * DEAL, height: weatherH },
    { what: 'berth deck planking', tonnes: berth * PLANKING.berthDeck * DEAL, height: berthH },
    { what: "weather deck beams, carlings and knees", tonnes: beams * (1 + BEAM_FRAMING) * OAK, height: weatherH - DECK_BEAM.moulded },
    { what: "berth deck beams, carlings and knees", tonnes: berthBeams * (1 + BEAM_FRAMING) * OAK, height: berthH - BERTH_BEAM },
    { what: 'bulwarks and rails', tonnes: bulwark * (BULWARK.insideBoard + BULWARK.outsideBoard + BULWARK_TIMBER_SHARE * BULWARK.timber) * OAK, height: bulwarkH },
  ];
  const timber = parts.reduce((t, p) => t + p.tonnes, 0), centre = parts.reduce((m, p) => m + p.tonnes * p.height, 0) / timber;
  parts.push({ what: 'iron and copper', tonnes: timber * IRONWORK, height: centre });
  return parts;
}
/** Of the bulwark's length, the share its timbers stand in (sided 6 in, about 15 in apart). */
const BULWARK_TIMBER_SHARE = 0.4;

/** Her whole weight fitted for sea: every part, the total in tonnes, and the height of its centre above the base. */
export function shipWeight(plan: ShipPlan): { parts: WeightPart[]; tonnes: number; centre: number } {
  const parts = [...structure(plan), ...LOADS.map(([what, tonnes, height]) => ({ what, tonnes, height }))];
  const tonnes = parts.reduce((t, p) => t + p.tonnes, 0);
  return { parts, tonnes, centre: parts.reduce((m, p) => m + p.tonnes * p.height, 0) / tonnes };
}

/** Tonnes of sea water a volume displaces. */
export const displacementTonnes = (volume: number): number => volume * SEA_WATER;
