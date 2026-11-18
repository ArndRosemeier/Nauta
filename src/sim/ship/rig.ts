/**
 * The brig's rig plan (pure, N3.2): her spars, sails and every line of her rigging as data, and the rig's climbable
 * surfaces and ways, built once from rules/rig.ts and the ship plan (N2.1) and frozen. Read alike by the sailing model
 * (N3.3), the crew (N4), the damage (N6) and the drawing (N3.6, N3.10); `rigWalk` joins the rig to the plan's walk
 * graph, so every surface aloft is reached the way every deck is.
 */
import { BODY } from '../rules/ships';
import { buildAloft, buildClimbs, walkAloft, type AloftSurface, type AloftWay, type MastClimb } from './aloft';
import { buildRunning, buildStanding, buildStays, type RigLine } from './lines';
import { deepFreeze, shipPlan, type CrewPlace, type Obstacle, type ShipPlan, type Station } from './plan';
import { buildSails, type Sail } from './sails';
import { atMark, buildDeadeyes, buildSpars, mastGeometry, type Deadeye, type MastGeometry, type Spar } from './spars';
import { walkGraph, type Body, type WalkGraph } from './walk';
import type { MastName } from '../rules/rig';

export interface RigPlan {
  readonly masts: Readonly<Record<MastName, MastGeometry>>;
  readonly spars: readonly Spar[];
  readonly deadeyes: readonly Deadeye[];
  readonly sails: readonly Sail[];
  /** Every line of the rig: the stays, the rest of the standing rigging, then the running rigging. */
  readonly lines: readonly RigLine[];
  readonly climbs: readonly MastClimb[];
  readonly surfaces: readonly AloftSurface[];
  readonly ways: readonly AloftWay[];
  /** The stations aloft (the tops, the masthead) and the crew's places there (on the tops and along the yards). */
  readonly stations: readonly Station[];
  readonly places: readonly CrewPlace[];
}

let built: RigPlan | null = null;

/** The brig's rig, built once from the rules and her plan, and frozen. */
export function rigPlan(plan: ShipPlan = shipPlan()): RigPlan {
  if (built) return built;
  const masts = { fore: mastGeometry('fore'), main: mastGeometry('main') };
  const spars = buildSpars(masts.fore, masts.main), byId = new Map(spars.map((s) => [s.id, s]));
  const deadeyes = buildDeadeyes(masts);
  const climbs = buildClimbs(plan, masts, deadeyes);
  const stays = buildStays(byId, masts);
  const sails = buildSails(byId, masts, new Map(stays.map((l) => [l.id, [l.ends[0], l.ends[1]] as const])));
  const lines = [...stays, ...buildStanding(byId, masts, deadeyes, climbs), ...buildRunning(byId, masts, sails, stays, plan.belays)];
  const aloft = buildAloft(plan, masts, byId, climbs);
  built = deepFreeze({ masts, spars, deadeyes, sails, lines, climbs, surfaces: aloft.surfaces, ways: aloft.ways, stations: aloft.stations, places: aloft.places });
  return built;
}

/**
 * What of the rig stands on her decks in a body's way, from its own spar data (never typed again into the plan's
 * fittings): the bowsprit's inboard part, from its heel to the stem, as wide as the spar. Its top is far above a
 * step, so it is walked round, and got onto only by its way at the stem (ship.md, "Every space navigable").
 */
export function rigObstacles(rig: RigPlan): Obstacle[] {
  const bowsprit = sparOf(rig, 'bowsprit'), stem = atMark(bowsprit, 'stem'), half = bowsprit.diameter / 2;
  return [{ id: 'bowsprit-inboard', level: 'weather', aft: Math.min(bowsprit.heel.along, stem.along), fore: Math.max(bowsprit.heel.along, stem.along), port: bowsprit.heel.across - half, starboard: bowsprit.heel.across + half }];
}

/** The one walk graph with the rig joined to it: decks, cabins and hold (N2.1) round what of the rig stands on them, and every surface aloft. */
export function rigWalk(plan: ShipPlan = shipPlan(), body: Body = BODY): WalkGraph {
  const rig = rigPlan(plan);
  const decks = walkGraph({ ...plan, obstacles: [...plan.obstacles, ...rigObstacles(rig)] }, body);
  return walkAloft(decks, { climbs: rig.climbs, surfaces: rig.surfaces, ways: rig.ways, stations: rig.stations, places: rig.places });
}

/** A spar of the rig by id. */
export function sparOf(rig: RigPlan, id: string): Spar {
  const s = rig.spars.find((x) => x.id === id);
  if (!s) throw new Error(`no spar ${id}`);
  return s;
}
