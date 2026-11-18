/**
 * Her rooms as the drawing knows them (plan N2.4, ship.md "Rooms and openings"): each zone is drawn as its own
 * meshes, and only the zones that can be seen are drawn. A zone is one of the plan's spaces below the weather deck,
 * or several that are open to each other (OPEN_JOINS); the outside (her hull, the weather deck and all above it) is
 * one zone of its own. The openings between zones are portals: the hatches, ladderways, scuttles and the companion
 * through the decks, and the doors in her bulkheads.
 *
 * Places are the plan's: m forward of the mainmast (`along`), m from the centreline (`across`), heights m above her base.
 */
import { DOOR, DOORS, OPEN_JOINS, PLANKING, BERTH_BEAM, type Level } from '../../sim/rules/ships';
import { berthDeck, floorAt, insideBreadth, rectCentre, type ShipPlan, type Space } from '../../sim/ship/plan';
import { weatherDeck, weatherDeckUnderside } from '../../sim/ship/hull';

/** The outside: her hull, the weather deck and everything on and above it. */
export const OUTSIDE = 'out';

/** The middle of an oblong of the plan (the plan's, here for the drawing's callers). */
export { rectCentre };

/** The plan's openings through the deck of a level. */
export const openingsOn = (plan: ShipPlan, level: Level) => plan.openings.filter((o) => o.level === level);

/** A portal between two zones: its four corners (along, across, height) going round it, and the door or opening it is. */
export interface Portal {
  readonly a: string;
  readonly b: string;
  readonly corners: readonly (readonly [number, number, number])[];
  /** A door's id (the portal is shut while the door is), or null for a hole in a deck. */
  readonly door: string | null;
  readonly opening: string | null;
}

/** Two plan coordinates this close are one, m. */
const SAME = 1e-6;

/** The zone each space is drawn in: spaces open to each other share the zone of the first of them. */
export function zoneOfSpaces(plan: ShipPlan): ReadonlyMap<string, string> {
  const parent = new Map(plan.spaces.map((s) => [s.id, s.id]));
  const root = (id: string): string => {
    const p = parent.get(id)!;
    return p === id ? id : root(p);
  };
  for (const { between: [a, b] } of OPEN_JOINS) parent.set(root(b), root(a));
  return new Map(plan.spaces.filter((s) => s.level !== 'weather').map((s) => [s.id, root(s.id)]));
}

/** Every zone: the outside first, then each zone below. */
export function zoneNames(plan: ShipPlan): string[] {
  return [OUTSIDE, ...new Set(zoneOfSpaces(plan).values())];
}

/** The space of a level whose oblong holds a place, or null. */
export function spaceAt(plan: ShipPlan, level: Level, along: number, across: number): Space | null {
  return plan.spaces.find((s) => s.level === level && along >= s.aft - SAME && along <= s.fore + SAME && across >= s.port - SAME && across <= s.starboard + SAME) ?? null;
}

/** The level a height at a place belongs to: the weather deck's from the underside of its planking up, then the berth deck's down to the underside of its beams. */
export function levelAt(along: number, h: number): Level {
  if (h >= weatherDeckUnderside(along)) return 'weather';
  return h >= berthDeck(along) - PLANKING.berthDeck - BERTH_BEAM ? 'berth' : 'hold';
}

/** The zone a point is in: the outside above the deck or beyond her side; else the zone of the space there (null in her closed voids). */
export function zoneAt(plan: ShipPlan, zones: ReadonlyMap<string, string>, along: number, across: number, h: number): string | null {
  const level = levelAt(along, h);
  if (level === 'weather' || Math.abs(across) >= insideBreadth(along, h)) return OUTSIDE;
  const s = spaceAt(plan, level, along, across);
  return s ? zones.get(s.id) ?? null : null;
}

/** The zone of the space a level has under a place, or null. */
export function zoneUnder(plan: ShipPlan, zones: ReadonlyMap<string, string>, level: Level, along: number, across: number): string | null {
  const s = spaceAt(plan, level, along, across);
  return s ? zones.get(s.id) ?? null : null;
}

/** The level below each level, for holes through its deck. */
const BELOW: Readonly<Record<Level, Level | null>> = { weather: 'berth', berth: 'hold', hold: null };

/** Every portal: each opening that leads below (not the skylight, which is glazed), and each door. */
export function portals(plan: ShipPlan): Portal[] {
  const zones = zoneOfSpaces(plan), out: Portal[] = [];
  for (const o of plan.openings) {
    const below = BELOW[o.level];
    if (!below || o.kind === 'skylight') continue;
    const { along, across } = rectCentre(o);
    const a = o.level === 'weather' ? OUTSIDE : zoneUnder(plan, zones, o.level, along, across);
    const b = zoneUnder(plan, zones, below, along, across);
    if (!a || !b) continue;
    const h = o.level === 'weather' ? weatherDeck(along, across) : berthDeck(along);
    out.push({ a, b, door: null, opening: o.id, corners: [[o.aft, o.port, h], [o.fore, o.port, h], [o.fore, o.starboard, h], [o.aft, o.starboard, h]] });
  }
  const byId = new Map(plan.spaces.map((s) => [s.id, s]));
  for (const d of DOORS) {
    const sa = byId.get(d.between[0])!, sb = byId.get(d.between[1])!;
    const a = zones.get(sa.id)!, b = zones.get(sb.id)!;
    const floor = Math.max(floorAt(sa, d.along, d.across), floorAt(sb, d.along, d.across)), top = floor + DOOR.height, half = DOOR.width / 2;
    const corners: [number, number, number][] = doorAthwart(sa, sb)
      ? [[d.along, d.across - half, floor], [d.along, d.across + half, floor], [d.along, d.across + half, top], [d.along, d.across - half, top]]
      : [[d.along - half, d.across, floor], [d.along + half, d.across, floor], [d.along + half, d.across, top], [d.along - half, d.across, top]];
    out.push({ a, b, door: d.id, opening: null, corners });
  }
  return out;
}

/** A door's wall stands athwart her when its two spaces meet end to end, else along her. */
export function doorAthwart(a: Space, b: Space): boolean {
  return Math.abs(a.fore - b.aft) < SAME || Math.abs(b.fore - a.aft) < SAME;
}
