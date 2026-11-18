/**
 * The trial's crews (plan N4.0): who stands where and does what, for 240 men in two crews of a brig. Pure: places in
 * her ship space (sim/ship/section.ts: metres, +x starboard, +y up from her load waterline, -z forward), each man's
 * seed, rank, navy, clip and, for those walking, the two ends of his beat.
 *
 * Her own crew stands at her guns (the starboard battery manned), at the pins, the stations and the shrouds, a few
 * walk the gangways and the rest are below on the berth deck. The other crew is mustered the same way on her twin:
 * until a second ship is drawn (N2.5) it stands where the enemy's deck would be, off her bow (`crewOffset`), or, with
 * the offset 0, on her own deck as well, at the places hers left free. Where the men stand and what they do is a
 * stand-in until the crew's tasks (N4.1) and ways (N4.2) come: the trial is about what they cost.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import { berthDeck, floorAt, insideBreadth, shipPlan, spacesById, type CrewPlace, type ShipPlan, type Space } from '../sim/ship/plan';
import { shipY, shipZ } from '../sim/ship/section';
import { sheer } from '../sim/ship/hull';
import type { Navy, Rank } from './crewLooks';

/** Men in a crew in the trial (implementation plan N4.0: two crews of 120, a brig's company). */
export const CREW_SIZE = 120;
/** How each crew is made up: officers at the stations, marines, seamen at guns and pins, walking, and below. */
export const MUSTER = { officers: 4, marines: 12, guns: 48, pins: 24, walking: 12, below: 20 } as const;
/** The seed of the trial's men. */
const CREW_SEED = 1805;
/** Where the other crew stands until a second ship is drawn: off her starboard bow, m in her ship space (x, z), about 80 m off. */
export const TWIN_OFFSET = { x: 40, z: -70 } as const;
/** A grid of places on the berth deck: its spacing, and how far from her side, the ladders and the mast a man keeps, m. */
const BERTH_SPACING = 0.8;
const BERTH_CLEAR = 0.45;
/** A walker's beat on the gangways: from abaft the mainmast to the fore hatch, m forward of the mainmast, and inboard of her side, m. */
const BEAT = { aft: -6, fore: 8, inboard: 1.3 } as const;
/** How fast a walker goes, m/s: an easy walk on a moving deck. */
export const WALK_SPEED = 1.1;
/** The clips each kind of place gives its man (crewLooks.ts PACK_CLIPS), picked by his seed. */
const CLIPS = {
  station: ['idle', 'talk', 'arms folded', 'nod'],
  marine: ['idle', 'idle', 'lean on rail'],
  gun: ['idle', 'crouch', 'pick up', 'interact', 'arms folded'],
  pin: ['idle', 'interact', 'arms folded', 'call from rail'],
  below: ['talk', 'idle', 'repair (kneeling)', 'interact', 'arms folded', 'nod'],
} as const;

/** One man of the trial. */
export interface Man {
  readonly seed: number;
  /** 0: her crew, 1: the other. */
  readonly crew: 0 | 1;
  readonly navy: Navy;
  readonly rank: Rank;
  /** The space of hers he stands in (plan ids: 'deck' is the weather deck); his zone draws him (render/ship/zones.ts). */
  readonly space: string;
  /** Where his feet are, in the ship space of the deck he stands on (hers, or her twin's). */
  readonly at: readonly [number, number, number];
  /** Where he faces, rad about +y: 0 faces +z (aft), a half turn forward. */
  readonly facing: number;
  readonly clip: string;
  /** Where his clip starts, 0..1 of its length: no two men move in step. */
  readonly phase: number;
  /** A walker's beat: the far end of his walk (he walks from `at` to here and back); null for those standing. */
  readonly beat: readonly [number, number, number] | null;
}

/** A place on a floor of hers, ship space. */
const feet = (plan: ShipPlan, space: string, along: number, across: number): [number, number, number] => {
  const s = spacesById(plan).get(space)!;
  return [across, shipY(floorAt(s, along, across)), shipZ(along)];
};
/** The turn about +y that faces a man from (x, z) toward (tx, tz) in ship space. */
export const facingToward = (x: number, z: number, tx: number, tz: number): number => Math.atan2(tx - x, tz - z);

/** The spaces below where men off watch are found: the mess deck first, then midships, the passage, the cabin and the stores fore and aft. */
const BELOW = ['messdeck', 'midships', 'passage', 'cabin', 'fore-store', 'breadroom'] as const;

/** Places on the berth deck, on a grid clear of her sides and of what stands there: by space (BELOW), nearest the middle first. */
export function berthPlaces(plan: ShipPlan): { space: string; along: number; across: number }[] {
  const blocked = plan.obstacles.filter((o) => o.level === 'berth');
  const out: { space: string; along: number; across: number }[] = [];
  for (const id of BELOW) {
    const room: Space = spacesById(plan).get(id)!, here: typeof out = [];
    for (let along = room.aft + BERTH_CLEAR; along <= room.fore - BERTH_CLEAR; along += BERTH_SPACING) {
      const half = Math.min(insideBreadth(along, berthDeck(along)), Math.max(-room.port, room.starboard)) - BERTH_CLEAR;
      for (let across = Math.max(-half, room.port + BERTH_CLEAR); across <= Math.min(half, room.starboard - BERTH_CLEAR); across += BERTH_SPACING) {
        if (blocked.some((o) => along > o.aft - BERTH_CLEAR && along < o.fore + BERTH_CLEAR && across > o.port - BERTH_CLEAR && across < o.starboard + BERTH_CLEAR)) continue;
        here.push({ space: id, along, across });
      }
    }
    out.push(...here.sort((a, b) => Math.abs(a.across) - Math.abs(b.across)));
  }
  return out;
}

/**
 * The trial's men: her crew, then the other. `twinAboard`: the other crew stands on her deck too, at the places hers
 * left free (the port battery, the other pins, the rest of the berth deck); otherwise on her twin's, at the same places as hers.
 */
export function musterCrews(twinAboard: boolean, plan: ShipPlan = shipPlan()): Man[] {
  const used = new Set<string>(), usedBerth = new Set<number>(), berth = berthPlaces(plan), men: Man[] = [];
  for (const crew of [0, 1] as const) {
    const r = new Rng(deriveSeed(CREW_SEED, 'crew', crew));
    const navy: Navy = crew === 0 ? 'british' : 'french';
    // The other crew on its own deck takes the same places as hers; aboard hers, the free ones.
    if (crew === 1 && !twinAboard) { used.clear(); usedBerth.clear(); }
    const free = (kind: CrewPlace['kind'], ok: (p: CrewPlace) => boolean = () => true) => plan.places.filter((p) => p.kind === kind && p.space === 'deck' && !used.has(p.id) && ok(p));
    const add = (rank: Rank, space: string, at: [number, number, number], facing: number, clips: readonly string[], beat: Man['beat'] = null) => {
      const seed = deriveSeed(CREW_SEED, 'man', crew, men.length);
      men.push({ seed, crew, navy, rank, space, at, facing, clip: beat ? 'walk' : r.pick(clips), phase: r.float(), beat });
    };
    const take = (p: CrewPlace) => { used.add(p.id); return p; };
    const before = men.length;
    // Officers at the stations on deck, looking forward.
    for (const p of free('station').slice(0, MUSTER.officers)) add('officer', 'deck', feet(plan, 'deck', take(p).along, p.across), Math.PI, CLIPS.station);
    // Marines along the quarterdeck's rails, at the aftmost pins, facing inboard.
    for (const p of free('pin').sort((a, b) => a.along - b.along).slice(0, MUSTER.marines)) add('marine', 'deck', feet(plan, 'deck', take(p).along, p.across), facingToward(p.across, 0, 0, 0), CLIPS.marine);
    // One battery's crews (starboard for hers, port for the other aboard), facing out through the port.
    const side = crew === 1 && twinAboard ? -1 : 1;
    for (const p of free('gun', (g) => Math.sign(g.across) === side).slice(0, MUSTER.guns)) add('seaman', 'deck', feet(plan, 'deck', take(p).along, p.across), facingToward(0, 0, side, 0), CLIPS.gun);
    // Hands at the pins, facing their pin.
    const belays = new Map(plan.belays.map((b) => [`pin-${b.id}`, b]));
    for (const p of free('pin').filter((_, k) => k % 2 === crew).slice(0, MUSTER.pins)) {
      const b = belays.get(take(p).id)!;
      add('seaman', 'deck', feet(plan, 'deck', p.along, p.across), facingToward(p.across, shipZ(p.along), b.across, shipZ(b.along)), CLIPS.pin);
    }
    // Walkers on the gangways, along her from aft to forward and back, each a little apart.
    for (let k = 0; k < MUSTER.walking; k++) {
      const s = k % 2 ? 1 : -1, along = BEAT.aft + ((BEAT.fore - BEAT.aft) * k) / MUSTER.walking;
      const across = s * (insideBreadth(along, sheer(along)) - BEAT.inboard);
      const from = feet(plan, 'deck', along, across), to = feet(plan, 'deck', BEAT.fore, across);
      add('seaman', 'deck', from, facingToward(from[0], from[2], to[0], to[2]), [], to);
    }
    // The rest below, facing each other across the mess tables (with those the deck had no free place for).
    let placed = 0;
    const below = CREW_SIZE - (men.length - before);
    for (let i = 0; i < berth.length && placed < below; i++) {
      if (usedBerth.has(i)) continue;
      usedBerth.add(i);
      placed++;
      const b = berth[i]!;
      add('seaman', b.space, feet(plan, b.space, b.along, b.across), facingToward(b.across, 0, 0, 0) + (b.across === 0 ? Math.PI / 2 : 0), CLIPS.below);
    }
  }
  return men;
}

/** Where a walker is on his beat after `t` seconds, and which way he faces: there and back at WALK_SPEED, from his phase. */
export function walkerPlace(man: Man, t: number, out: [number, number, number]): number {
  const b = man.beat!, a = man.at;
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], length = Math.hypot(dx, dz);
  const legs = (man.phase * 2 + (t * WALK_SPEED) / Math.max(length, 1)) % 2, there = legs < 1, s = there ? legs : 2 - legs;
  out[0] = a[0] + dx * s; out[1] = a[1] + dy * s; out[2] = a[2] + dz * s;
  return there ? Math.atan2(dx, dz) : Math.atan2(-dx, -dz);
}
