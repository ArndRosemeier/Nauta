/**
 * The crews drawn, decided (implementation plan N4.3): for every man of both ships, where he is drawn between the last
 * two steps of the match, which way he faces and what motion he plays, from his task (N4.1), his way through her
 * (N4.2) and his hurt (N6.1); which men of her crew are drawn as full characters near the captain (the near pool); and
 * how often each man is placed again (the animation rate). Pure: the crew view (render/crew/crewView.ts) applies it.
 * Every value Arnd's iPad numbers decide is a knob of the quality table (quality.ts `CrewKnobs`), none is here.
 *
 * Ship space (sim/ship/section.ts): x across her (+ starboard), y up from her load waterline, z aft.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import type { SimShip } from '../sim/state';
import { harmOf } from '../sim/damage';
import { manAt, sameSpot, taskOf, type Task } from '../sim/crew/crew';
import { goingAt, goingRoute } from '../sim/crew/going';
import { jobWork } from '../sim/crew/drill';
import { brigRoster, crewPlaces, placeSpot, type Man } from '../sim/crew/roster';
import { heightAt, routeNetwork, standable } from '../sim/crew/network';
import type { Spot } from '../sim/ship/plan';
import type { JobName } from '../sim/rules/crew';
import type { Bunk } from '../sim/rules/bunks';
import { shipY, shipZ } from '../sim/ship/section';
import type { CrewKnobs } from './quality';
import { floorApart } from './officers';
import { standByClip, standToClip, watchClip } from './standBy';
import { apartOnWater } from '../sim/units';
import { BREAKS } from '../sim/rules/ships';
import { gunClip, gunWork, stepBack, type GunWork } from './gunDrill';

/** The motion a man hauling plays (at a pin, tailing on a fall). */
const HAUL = 'pick up';
/** What a man at work plays, by his job (crewLooks.ts PACK_CLIPS): hauling at the pins, at the wheel, out on a yard, the repairs. */
export const JOB_CLIPS: Readonly<Record<JobName, string>> = {
  helm: 'interact', stations: HAUL, brace: HAUL, sheet: HAUL, clew: HAUL, hoist: HAUL, douse: HAUL,
  loose: 'interact', furl: 'interact', reef: 'interact',
  plug: 'repair (kneeling)', fish: 'repair (kneeling)', splice: 'repair (kneeling)', tackle: 'interact', cut: 'chop wood',
  pump: 'push', fight: 'interact', fetch: 'pick up', carry: 'walk carrying',
};
/** On his way: walking, or smartly at a run. */
export const WALKING = 'walk';
export const RUNNING = 'jog';
/** Killed, or badly hurt and lying where he fell (the badly hurt are carried below by others, `carriedAt`). */
export const LYING = 'death';
/** Asleep in his hammock: the mocap of a man lying down (CMU 111_12), its last frame held (crewLooks.ts PACK_MOCAP). */
export const SLEEPING = 'cmu 111_12';
/** Shot striking near a man makes him duck (Arnd 2026-11-18, crew realism: ducking at close shot): his own clip is replaced by a crouch for this long, s, each man's start put off by up to `DUCK_SPREAD` s so they do not all move as one. */
export const DUCK = 'crouch';
const DUCK_SECONDS = 1.4;
const DUCK_SPREAD = 0.3;
const DUCK_STEPS = 4;
/** Men who do not duck: on their way (a walk is not stopped by a ball), carried, or lying. */
const NO_DUCK: ReadonlySet<string> = new Set([WALKING, RUNNING, JOB_CLIPS.carry, LYING, SLEEPING]);
/** The clip a man plays `sinceStruck` seconds after shot struck within reach of him: a crouch for a moment, else his own. A man on a way or aloft keeps his hold (`holding`). */
export function duckTo(clip: string, sinceStruck: number, seed: number, holding: boolean): string {
  const late = (seed % DUCK_STEPS) * (DUCK_SPREAD / DUCK_STEPS);
  return !holding && !NO_DUCK.has(clip) && sinceStruck >= late && sinceStruck < late + DUCK_SECONDS ? DUCK : clip;
}

/** Clips that play once and hold their last frame. */
export const ONCE_CLIPS = [LYING, SLEEPING];

/** Jobs where the men tail on a fall: they spread along it inboard of the pin, a row aft for every so many. */
const HAULING: ReadonlySet<JobName> = new Set(['brace', 'sheet', 'clew', 'hoist', 'douse']);
/** Men sharing a pin's fall stand this far apart along it (inboard), and so many abreast before the next row, m. */
const FALL_SPACING = 0.6;
const FALL_ABREAST = 4;
/** Between rows on a fall, m (aft). */
const FALL_ROWS = 0.75;
/** Kinds of crew place a man faces outboard at: a pin on the rail, a gun's crew place. */
const FACING_OUT: ReadonlySet<string> = new Set(['pin', 'gun']);
/** A man faces forward (a half turn from +z, which is aft). */
const FORWARD = Math.PI;
const QUARTER = Math.PI / 2;
/** A man carried below is held this high above the floor, m: at his bearers' hips and hands. */
const CARRIED_HEIGHT = 0.85;
/** A repair's men crowd about its spot (a hole, a fire, the pumps, a wounded man): the n-th stands on the n-th clear point of the grid about it, the wounded man's own place left clear (`fetch`). */
const OWN_PLACE: ReadonlySet<JobName> = new Set(['fetch']);
/**
 * Men the match puts on one spot (several share a post, or a place of their task) stand around it this far apart, m:
 * the first on it, the rest on the nearest clear deck of a grid about it, along the side before inboard (men at a rail
 * line it, and leave her middle line clear for the walkers and the captain). Aloft they keep it.
 */
const SPREAD = 0.7;
/** The grid's steps tried about a shared spot (forward, inboard), nearest first; a man beyond them keeps the spot. */
const SPREAD_STEPS = 5;
/** A step inboard counts as this many along the side when the nearest point is looked for. */
const INBOARD_COST = 2;
const AROUND: readonly (readonly [number, number])[] = (() => {
  const out: [number, number][] = [];
  for (let f = -SPREAD_STEPS; f <= SPREAD_STEPS; f++) for (let i = -SPREAD_STEPS; i <= SPREAD_STEPS; i++) out.push([f, i]);
  const far = ([f, i]: readonly [number, number]) => Math.hypot(f, INBOARD_COST * i);
  // Nearest first; at one distance, inboard before outboard, then forward before aft.
  return out.sort((a, b) => far(a) - far(b) || b[1] - a[1] || b[0] - a[0]);
})();

/** One man as he is to be drawn this frame. */
export interface ManDrawn {
  /** His feet, ship space, m. */
  x: number;
  y: number;
  z: number;
  /** The way he faces, rad about +y (0: aft, toward +z). */
  yaw: number;
  /** The space of hers he is in (whose room draws him). */
  space: string;
  /** The motion he plays (crewLooks.ts PACK_CLIPS). */
  clip: string;
  /** On a way between two floors (a ladder, the shrouds, the climb onto a footrope), its kind; null on a floor or a surface aloft. */
  way: string | null;
}

/** A new, empty man drawn (to be filled by `manDrawn`). */
export const newManDrawn = (): ManDrawn => ({ x: 0, y: 0, z: 0, yaw: FORWARD, space: '', clip: JOB_CLIPS.tackle, way: null });

/** Where a man is in one state, before the frame's in-between. */
interface At { along: number; across: number; height: number; space: string; yaw: number; way: string | null; moving: boolean; bunked?: boolean }

/** His spot and height in one state, which way he faces and whether he is on his way. */
function atIn(ship: SimShip, man: number, m: Man, task: Task | null): At {
  const carried = carriedAt(ship, man);
  if (carried) return carried;
  const hand = ship.crew.men[man]!;
  if (hand.going) {
    const w = goingAt(hand.going), way = w.way === null ? null : goingRoute(hand.going).legs[hand.going.leg]?.kind ?? null;
    const out: At = { along: w.along, across: w.across, height: w.height, space: w.space, yaw: Math.atan2(w.facing[1], -w.facing[0]), way, moving: true };
    const bed = m.bunk ?? m.berth;
    return bed ? outOfBunk(out, bed, placeSpot(bed.station)) : out;
  }
  if (!task && !hand.stands && m.bunk) return inBunk(m.bunk, placeSpot(m.home));
  // A watch-keeper whose watch is below lies in the hammock of his own (the berth), at its station.
  if (!task && hand.stands && m.berth && sameSpot(hand.stands, placeSpot(m.berth.station))) return inBunk(m.berth, placeSpot(m.berth.station));
  const at = manAt(hand, m.home), own = !task && !hand.stands ? postSpots().get(man) : undefined;
  let { along, across } = own ?? at.spot, yaw = FORWARD, height = own?.height ?? at.height;
  const place = task ? placeOf(task, man) : hand.stands ? null : { id: m.home, rank: 0 };
  const kind = place ? crewPlaces().get(place.id)?.kind : undefined;
  if (kind && FACING_OUT.has(kind)) yaw = across >= 0 ? QUARTER : -QUARTER;
  if (task && place && place.rank > 0 && HAULING.has(task.job)) {
    // Tailing on the fall: inboard of the pin, abreast, then a row aft.
    const inboard = across >= 0 ? -1 : 1, row = Math.floor((place.rank - 1) / FALL_ABREAST);
    across += inboard * FALL_SPACING * (1 + ((place.rank - 1) % FALL_ABREAST));
    along -= FALL_ROWS * row;
  } else if (place && place.rank > 0) {
    const s = spreadAbout(at.spot, place.rank);
    along = s.along; across = s.across; height = s.height;
  } else if (task?.at && !place) {
    // A repair: its men crowd about its spot and face it.
    const rank = task.hands.indexOf(man) + (OWN_PLACE.has(task.job) ? 1 : 0);
    if (rank > 0) {
      const s = spreadAbout(at.spot, rank);
      along = s.along; across = s.across; height = s.height;
    }
    yaw = Math.atan2(at.spot.across - across, shipZ(at.spot.along) - shipZ(along));
  }
  return { along, across, height, space: at.spot.space, yaw, way: null, moving: false };
}

/**
 * A sleeper lies athwart her in his hammock, his head inboard; the lying clip ends with the man's head this far round from
 * the way he faced when it began (CMU 111_12, measured from its last frame: 50 degrees toward his left), so he is turned
 * by that much less. His feet are on the floor under the hammock's middle (`Man.home`) and he lies this high over it.
 */
const LIES_HEAD = (50 * Math.PI) / 180;
/** A man getting into or out of his hammock is lifted or dropped over this much of his way to or from his home place, m. */
const BUNK_DROP = 1;
/** A sleeper in his hammock (his home place, with his bunk's tier). */
function inBunk(bunk: Bunk, home: Spot): At {
  const inboard = bunk.across > 0 ? -QUARTER : bunk.across < 0 ? QUARTER : QUARTER;
  return { along: bunk.along, across: bunk.across, height: heightAt(routeNetwork(), home) + bunk.height, space: bunk.space, yaw: inboard - LIES_HEAD, way: null, moving: false, bunked: true };
}
/** A man on his way from or to his hammock, the first and last metre eased out of and into it (he rolls out and drops, or climbs in). */
function outOfBunk(on: At, bunk: Bunk, home: Spot): At {
  if (on.space !== home.space || on.way !== null) return on;
  const apart = floorApart(on, home);
  if (apart >= BUNK_DROP) return on;
  const lying = inBunk(bunk, home), k = 1 - apart / BUNK_DROP;
  return { ...on, along: on.along + k * (lying.along - home.along), across: on.across + k * (lying.across - home.across), height: on.height + k * bunk.height, bunked: k > BUNKED_SHARE };
}
/** While this much of the way into or out of the hammock is left (0..1) he is still lying. */
const BUNKED_SHARE = 0.6;

/** A man stands this far from the foot of a raised deck's face, m: a body nearer sinks into it (N2.12). */
const BREAK_CLEAR = 0.5;
/** Which of her three decks (aft of the quarterdeck's break, the waist, forward of the forecastle's) a place of the weather deck is on. */
const deckOf = (along: number): number => (along <= BREAKS.quarterdeck ? 0 : along >= BREAKS.forecastle ? 2 : 1);
/** Whether `p` is on the deck of `own` (a man shared round his place never crosses a break) and not against the face of a break. */
function awayFromBreaks(own: Spot, p: Spot): boolean {
  if (own.space !== 'deck') return true;
  return deckOf(p.along) === deckOf(own.along) && Math.abs(p.along - BREAKS.quarterdeck) >= BREAK_CLEAR && Math.abs(p.along - BREAKS.forecastle) >= BREAK_CLEAR;
}

/** A man shared round a place keeps this far from the foot or head of a ladder, m: they are for the men going up and down. */
const LADDER_CLEAR = 0.7;
let ladders: readonly Spot[] | null = null;
/** Whether `p` is within `LADDER_CLEAR` of a ladder's foot or head on its floor. */
function nearLadder(p: Spot): boolean {
  ladders ??= [...crewPlaces().values()].filter((c) => c.kind === 'ladder').map((c) => placeSpot(c.id));
  return ladders.some((l) => l.space === p.space && floorApart(l, p) < LADDER_CLEAR);
}

/** The task that carries man `man` below (his bearers are at it), or null. */
export const carryOf = (crew: SimShip['crew'], man: number): Task | null => crew.tasks.find((t) => t.job === 'carry' && t.on === man && t.hands.length > 0) ?? null;

/**
 * Where a man carried below is: held between his two bearers (one if the other was struck), lying along their way,
 * at their hip height, as the pair walk; null when nobody carries him. The bearers are drawn as they are (`atIn`).
 */
function carriedAt(ship: SimShip, man: number): At | null {
  const task = carryOf(ship.crew, man);
  if (!task) return null;
  const roster = brigRoster(), [first, second] = task.hands;
  const a = atIn(ship, first!, roster[first!]!, taskOf(ship.crew, first!));
  const b = second !== undefined ? atIn(ship, second, roster[second]!, taskOf(ship.crew, second)) : null;
  const both = b !== null && b.space === a.space && b.way === a.way;
  return {
    along: both ? (a.along + b.along) / 2 : a.along, across: both ? (a.across + b.across) / 2 : a.across,
    height: (both ? (a.height + b.height) / 2 : a.height) + CARRIED_HEIGHT, space: a.space, yaw: a.yaw, way: a.way, moving: true,
  };
}

/** A floor point of hers and its height. */
interface Stand { readonly along: number; readonly across: number; readonly height: number }

/**
 * Where each man of the roster stands at his home place when the match has him there: the first man of each post on it,
 * then the others on the nearest clear points about theirs (`AROUND`, along the side first; those who share the
 * captain's post 2 m from him), each a step from every man placed
 * before him (some places of her plan lie closer than that: a pin beside a gun's place). Worked out once: the roster
 * and her plan do not change. Aloft a man keeps his place (the places on a yard are its own).
 */
function postSpots(): Map<number, Stand> {
  if (posted) return posted;
  const net = routeNetwork(), roster = brigRoster(), out = new Map<number, Stand>(), taken: Spot[] = [], first = new Set<string>();
  const clear = (p: Spot, gap: number) => taken.every((t) => floorApart(t, p) >= gap - TINY);
  const captain = placeSpot(roster[CAPTAIN]!.home);
  const put = (i: number) => {
    const spot = placeSpot(roster[i]!.home), inboard = spot.across >= 0 ? -1 : 1, aloft = net.surfaces.get(spot.space);
    // The officers who share his post keep their distance from the captain (the quarterdeck is his: design ruling 2026-11-18).
    const room = i !== CAPTAIN && roster[i]!.home === roster[CAPTAIN]!.home ? CAPTAIN_ROOM : 0;
    // On a yard the places are its own; in a top or on the crosstrees, the men a half step apart round the place.
    if (aloft && aloft.kind !== 'top' && aloft.kind !== 'crosstrees') return;
    for (const gap of aloft ? [SPREAD / 2] : [SPREAD, SPREAD / 2]) {
      for (const [f, k] of AROUND) {
        if (aloft && Math.max(Math.abs(f), Math.abs(k)) > TOP_STEPS) continue;
        const p = { space: spot.space, along: spot.along + f * gap, across: spot.across + inboard * k * gap };
        // His own place is where the match has him, standable or not (a pin at the rail); the others must be clear deck.
        if ((f !== 0 || k !== 0) && (!standable(net, p, []) || !awayFromBreaks(spot, p) || nearLadder(p))) continue;
        if (!clear(p, gap) || floorApart(captain, p) < room - TINY) continue;
        taken.push(p);
        out.set(i, { along: p.along, across: p.across, height: heightAt(net, p) });
        return;
      }
    }
  };
  const firsts = roster.map((m, i) => (first.has(m.home) ? -1 : (first.add(m.home), i))).filter((i) => i >= 0);
  for (const i of firsts) put(i);
  roster.forEach((_, i) => { if (!firsts.includes(i)) put(i); });
  return (posted = out);
}
let posted: Map<number, Stand> | null = null;
/** The captain is the first man of the roster; the men who share his post stand at least this far from him, m. */
const CAPTAIN = 0;
const CAPTAIN_ROOM = 2;
/** In a top, the men stand within this many half steps of their place (a top is about 3 m across). */
const TOP_STEPS = 2;
/** Slack for points on the grid's steps, m. */
const TINY = 1e-6;

/** Where the `rank`-th man on a shared floor spot stands: the `rank`-th clear point of the grid about it (cached: spots are few). */
function spreadAbout(spot: Spot, rank: number): Stand {
  const key = `${spot.space}|${spot.along}|${spot.across}|${rank}`;
  let s = spread.get(key);
  if (s) return s;
  const net = routeNetwork(), inboard = spot.across >= 0 ? -1 : 1;
  s = { along: spot.along, across: spot.across, height: heightAt(net, spot) };
  if (!net.surfaces.has(spot.space)) {
    let n = 0;
    for (const [f, i] of AROUND) {
      const p = { space: spot.space, along: spot.along + f * SPREAD, across: spot.across + inboard * i * SPREAD };
      if (!standable(net, p, [])) continue;
      if (n++ === rank) { s = { along: p.along, across: p.across, height: heightAt(net, p) }; break; }
    }
  }
  spread.set(key, s);
  return s;
}
const spread = new Map<string, Stand>();

/** The crew place a man of a task stands at, and how many of the task's men are at it before him. */
function placeOf(task: Task, man: number): { id: string; rank: number } | null {
  const places = jobWork(task.job, task.on).places, n = task.hands.indexOf(man);
  if (!places.length || n < 0) return null;
  return { id: places[n % places.length]!, rank: Math.floor(n / places.length) };
}

/** A man standing still keeps this far from the captain's body, m: he steps aside as the captain walks up to him. */
export const CAPTAIN_CLEAR = 1;

/**
 * A man standing at `at` (ship space) with the captain's feet at `eye`: where he is drawn, kept `CAPTAIN_CLEAR` from
 * the captain along the line from him, so the captain never walks through him. Only the drawing moves: the match does
 * not know where the captain walks. Into `out` (a man who is already clear is left as he is).
 */
export function stepAside(at: ManDrawn, eye: { readonly x: number; readonly z: number }): void {
  const dx = at.x - eye.x, dz = at.z - eye.z, near = apartOnWater(at, eye);
  if (near >= CAPTAIN_CLEAR) return;
  const along = near > TINY ? 1 / near : 0;
  at.x = eye.x + (near > TINY ? dx * along : 1) * CAPTAIN_CLEAR;
  at.z = eye.z + (near > TINY ? dz * along : 0) * CAPTAIN_CLEAR;
}

/** The turn from `a` to `b` the short way round, rad. */
const turnBetween = (a: number, b: number): number => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/**
 * Man `man` (his place in the roster) of a ship as drawn `f` of the way from her state `from` to `to` (the match's
 * last two steps), into `out`. `seed`: his own (`manSeed`), for his standing-by motion.
 */
export function manDrawn(from: SimShip, to: SimShip, f: number, man: number, m: Man, seed: number, out: ManDrawn): ManDrawn {
  const task = taskOf(to.crew, man), b = atIn(to, man, m, task);
  const a = from === to ? b : atIn(from, man, m, taskOf(from.crew, man));
  const lerp = a.space === b.space && a.way === b.way;
  const g = lerp ? f : 1;
  out.x = a.across + g * (b.across - a.across);
  out.y = shipY(a.height + g * (b.height - a.height));
  out.z = shipZ(a.along + g * (b.along - a.along));
  out.yaw = a.yaw + g * turnBetween(a.yaw, b.yaw);
  out.space = b.space;
  out.way = b.way;
  const gun = !b.moving && !task && !isDown(to, man) ? gunWork(to, man, m) : null;
  // At the report the men at a gun step clear of her (only the drawing moves them).
  if (gun) out.x -= Math.sign(out.x) * stepBack(gun);
  out.clip = clipOf(to, man, m, task, b, seed, gun);
  return out;
}

/** Whether a man is killed, or badly hurt and lying where he fell. */
const isDown = (ship: SimShip, man: number): boolean => {
  const harm = harmOf(ship.damage, man);
  return harm === 'killed' || harm === 'badly';
};

let powderSpots: readonly Spot[] | null = null;
/** Whether a man is on his way to a gun with a cartridge: a powder boy bound for a gun's powder place (rules/crew.ts POWDER_SECONDS). */
function bearsPowder(hand: SimShip['crew']['men'][number]): boolean {
  const to = hand.going?.path.to;
  if (!to) return false;
  powderSpots ??= [...crewPlaces().values()].filter((p) => p.kind === 'powder');
  return powderSpots.some((p) => sameSpot(p, to));
}

/** The motion a man plays: lying if struck down, on his way walking or running, at work by his job, at his gun by her drill (N5.4b), else busy at his home place. */
function clipOf(ship: SimShip, man: number, m: Man, task: Task | null, at: At, seed: number, gun: GunWork | null): string {
  if (isDown(ship, man)) return LYING;
  const hand = ship.crew.men[man]!;
  if (at.bunked && !task) return SLEEPING;
  if (at.moving) return task?.job === 'carry' || bearsPowder(hand) ? JOB_CLIPS.carry : hand.going?.haste === 'smart' ? RUNNING : WALKING;
  if (task) return task.began === null ? standToClip(m, seed) : JOB_CLIPS[task.job];
  // At his gun he works the drill (gunDrill.ts); the steps that give his part no work, he stands to.
  const work = gun && gunClip(gun);
  if (work) return work;
  // At his home place he busies himself (standBy.ts); away from it (at his gun at quarters) he stands to, ready.
  const watching = hand.stands === null ? null : watchClip(m, hand.stands);
  if (watching) return watching;
  return hand.stands === null ? standByClip(m, seed) : standToClip(m, seed);
}

/** A man's own seed (his phase in a clip, his standing-by motion), the same on every machine. */
export const manSeed = (ship: number, man: number): number => deriveSeed(MOTION_SEED, ship, man);
const MOTION_SEED = 1807;
/** How far into his clip a man starts, s: no two men move in step. */
export const clipPhase = (seed: number): number => new Rng(seed).range(0, MAX_PHASE);
const MAX_PHASE = 4;

/** A man's animation step (placed again every this many frames) at `distance`, seen or not. */
export function stepAt(k: CrewKnobs, distance: number, seen: boolean): number {
  if (!seen) return k.hiddenStep;
  const i = k.stepsTo.findIndex((to) => distance <= to);
  return k.steps[i < 0 ? k.steps.length - 1 : i]!;
}

/** Whether a man is placed again this frame: every `step` frames, spread over the frames by his place in the crew. */
export const dueThisFrame = (frame: number, step: number, man: number): boolean => (frame + man) % step === 0;

/** A man of her crew the near pool could take. */
export interface PoolCandidate {
  readonly man: number;
  /** From the eye, m. */
  readonly distance: number;
  /** In view and in a room of hers that is drawn. */
  readonly seen: boolean;
  /** He matters now (speaking, just addressed: plan "Faces"): taken before any man who does not, wherever in view. */
  readonly matters: boolean;
}

/** How much farther than the pool's reach a man already in it keeps his place, m: two men at the edge do not trade every frame. */
export const POOL_STICK = 1.5;

/**
 * The men drawn as full characters this frame (at most `size`, which is the pool loaded, and the knobs' `pool`): those
 * who matter now and are in view first, then the nearest seen within the pool's reach; a man already in it (`held`)
 * keeps his place a little beyond the reach.
 */
export function choosePool(men: readonly PoolCandidate[], k: CrewKnobs, held: ReadonlySet<number>, size: number): number[] {
  const most = Math.min(size, k.pool);
  const reach = (c: PoolCandidate) => k.poolTo + (held.has(c.man) ? POOL_STICK : 0);
  return men.filter((c) => c.seen && (c.matters || c.distance <= reach(c)))
    .sort((p, q) => Number(q.matters) - Number(p.matters) || p.distance - q.distance)
    .slice(0, most).map((c) => c.man);
}

/** Actors' levels a full character is drawn at: Full near, Medium beyond `fullTo`. */
export const FULL = 0;
export const MEDIUM = 1;
/** The level for a full character at `distance` (a man keeps Full a little longer than its limit, as the pool does). */
export const poolLevel = (k: CrewKnobs, distance: number, now: number): number =>
  k.fullTo > 0 && distance <= k.fullTo + (now === FULL ? POOL_STICK : 0) ? FULL : MEDIUM;
