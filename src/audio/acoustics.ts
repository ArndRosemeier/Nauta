/**
 * How the room the ear is in changes what is heard (plan N2.8). On deck, the open air: nothing changes. Below deck,
 * the sea and the wind come through her planking, muffled and quieter, more open under a hatch or a ladderway than shut
 * in a cabin, least in the hold; and the room rings with its own short echo, its T60 from its size in the plan (spaces
 * open to each other, OPEN_JOINS, ring as one room). Pure.
 */
import { clamp, lerp } from '@futuremagic/core';
import { LOAD_WATERLINE, OPEN_JOINS } from '../sim/rules/ships';
import { floorAt, floorsUnder, holds, insideBreadth, overheadAt, rectCentre, spacesById, type Rect, type ShipPlan, type Space } from '../sim/ship/plan';
import {
  ABSORPTION, ECHO_T60, ECHO_WET, HOLD_HZ, OPEN_HZ, OPENING_REACH, SABINE, SHUT_HZ, THROUGH,
} from './shipTuning';

/** What the room the ear is in does to the sound. */
export interface Room {
  /** 0 on deck (or off her, or aloft), 1 below deck. */
  readonly below: number;
  /** The space the ear is in below deck (the plan's id), or null in the open air. */
  readonly space: string | null;
  /** The low-pass the sea and the wind are heard through, Hz (null: open). */
  readonly muffle: number | null;
  /** How much of the sea's and the wind's level comes through, 0..1. */
  readonly through: number;
  /** The room's echo: its T60, s, and how much of it (0 outdoors). */
  readonly t60: number;
  readonly wet: number;
}

/** The open air: on deck, aloft or off her. */
export const OPEN_AIR: Room = { below: 0, space: null, muffle: null, through: 1, t60: 0, wet: 0 };

/** The distance in plan from a place to an oblong, m (0 inside it). */
export function distanceToRect(r: Rect, along: number, across: number): number {
  const da = Math.max(r.aft - along, 0, along - r.fore), dc = Math.max(r.port - across, 0, across - r.starboard);
  return Math.hypot(da, dc);
}

/** A space and every space open to it (OPEN_JOINS, followed through), as one room. */
export function roomSpaces(plan: ShipPlan, id: string): Space[] {
  const byId = spacesById(plan), found = new Set([id]);
  for (let grew = true; grew;) {
    grew = false;
    for (const { between: [a, b] } of OPEN_JOINS) {
      if (found.has(a) !== found.has(b)) { found.add(a); found.add(b); grew = true; }
    }
  }
  return [...found].map((s) => byId.get(s)!).filter((s) => s !== undefined);
}

/**
 * A room's T60 by Sabine's rule, s: its volume and surface from its spaces' oblongs and their heights at their middles
 * (walls reckoned round the oblong that holds them all).
 */
export function roomT60(spaces: readonly Space[]): number {
  let volume = 0, floor = 0, aft = Infinity, fore = -Infinity, port = Infinity, starboard = -Infinity, heightArea = 0;
  for (const s of spaces) {
    const { along, across } = rectCentre(s);
    const area = (s.fore - s.aft) * (s.starboard - s.port), height = overheadAt(s, along, across) - floorAt(s, along, across);
    volume += area * height; floor += area; heightArea += height * area;
    aft = Math.min(aft, s.aft); fore = Math.max(fore, s.fore); port = Math.min(port, s.port); starboard = Math.max(starboard, s.starboard);
  }
  const height = heightArea / floor, surface = 2 * floor + 2 * (fore - aft + starboard - port) * height;
  return clamp((SABINE * volume) / (ABSORPTION * surface), ECHO_T60[0], ECHO_T60[1]);
}

const rooms = new WeakMap<ShipPlan, Map<string, { spaces: Space[]; t60: number }>>();
/** The room of a space and its T60, made once for a plan. */
function roomOf(plan: ShipPlan, id: string): { spaces: Space[]; t60: number } {
  let m = rooms.get(plan);
  if (!m) { m = new Map(); rooms.set(plan, m); }
  let r = m.get(id);
  if (!r) { const spaces = roomSpaces(plan, id); r = { spaces, t60: roomT60(spaces) }; m.set(id, r); }
  return r;
}

/** A frequency between two, glided in log frequency (as the ear hears it): `u` 0 gives `a`, 1 gives `b`. */
const logLerp = (a: number, b: number, u: number): number => a * Math.pow(b / a, u);

/**
 * The room at an eye in ship space (+x starboard, +y up from the load waterline, -z forward): open air on deck, aloft
 * and off her; below deck the space under the deck the eye is under, muffled by how near it is to an opening to the sky.
 */
export function roomAt(plan: ShipPlan, eye: readonly [number, number, number]): Room {
  const along = -eye[2], across = eye[0], h = eye[1] + LOAD_WATERLINE;
  if (Math.abs(across) >= insideBreadth(along, h)) return OPEN_AIR;
  let under: Space | null = null;
  for (const f of floorsUnder(plan, along, across)) if (f.floor <= h) under = f.space;
  if (!under || under.level === 'weather' || h >= overheadAt(under, along, across)) return OPEN_AIR;
  const { spaces, t60 } = roomOf(plan, under.id);
  if (under.level === 'hold') return { below: 1, space: under.id, muffle: HOLD_HZ, through: THROUGH.hold, t60, wet: ECHO_WET };
  // How near the nearest opening to the sky over this room is (the skylight is glazed).
  let near = Infinity;
  for (const o of plan.openings) {
    if (o.level !== 'weather' || o.kind === 'skylight') continue;
    const mid = rectCentre(o);
    if (!spaces.some((s) => holds(s, mid.along, mid.across))) continue;
    near = Math.min(near, distanceToRect(o, along, across));
  }
  const shut = clamp(near / OPENING_REACH, 0, 1);
  return { below: 1, space: under.id, muffle: logLerp(OPEN_HZ, SHUT_HZ, shut), through: lerp(THROUGH.open, THROUGH.shut, shut), t60, wet: ECHO_WET };
}
