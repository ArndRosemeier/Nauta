/**
 * Hits (pure, implementation plan N6.1): the one routine that takes a hit and decides everything it does to a ship.
 * Nothing else changes her structure or a man's health (rules.json `owners`); her guns are guns.ts's, and a gun a
 * ball meets is dismounted by asking it (`dismountGun`).
 *
 * **Shots in flight.** A gun fired (N5.3 raises `GunFired`) is handed here by `launch`: the match keeps only which gun
 * fired it in which tick and how much each ball has spent (`flying`), and the shot's whole flight (shot.ts, worked out
 * when it was fired) is kept beside the state, keyed by them. Each step, `stepHits` traces the part of each ball's
 * path flown in that step through every other ship as she lies then (her pose at the step), so a ball meets her where
 * she has rolled to when it arrives. A machine that joins while a shot flies has no flight for it and lets it go: the
 * host's next state brings what it did.
 *
 * **What a ball does, in order along its path.** It carries its punch (rules/damage.ts `PIERCE`: how much oak it goes
 * through at its speed) and spends it on what it meets, nearest first (damage/meet.ts): through timber thinner than
 * its punch it holes the cell and goes on with that much less, throwing splinters ahead of it among the men; timber it
 * cannot go through stops it, lodged, with fewer splinters; a gun it meets is dismounted; a man is struck (killed or
 * wounded by the table); a spar is wounded and the ball spends its chord through it; a line is cut, a sail holed.
 * Chain reaches lines, sails and spars `CHAIN_BITE` times as far. A ball in by her bow or stern along her length rakes
 * her (N7.5a): it comes through her ends square on and the guns it meets do not stop it, so it travels her deck and
 * counts for several. The flight itself does not slow for what the ball
 * went through (the spent punch is kept instead), so a ball through her goes on to its splash as it was flying.
 *
 * **What damage leads to** (N6.2, `stepAftermath`, each step for each ship): the sea comes in at her holes below the
 * water as she lies (damage/flood.ts; a plugged hole still weeps) against the pumps, and its weight goes to her floating (motion.ts); spars with
 * three wounds in a part, or their weather shrouds or stays gone with the wind on them, fall with all they carry and
 * the men on them, and lie alongside dragging her until cut away (damage/fall.ts); a ball may set her afire, and fire
 * grows, spreads through her ways, is beaten down by the men at hand and, left too long, reaches her powder
 * (damage/fire.ts); a ball through her steering gear leaves her rudder trailing. What her sails can still draw, her
 * steering, the wreck's drag and the water's weight go to her sailing (sailing.ts) as `SailingDamage`.
 *
 * Seeded per ball and step (the match, the gun, the tick she fired, the ball, the step), so every machine does the same
 * damage. The captain is not in the simulation and is never hit; the `hit` events say where every ball went
 * through her, for the drawing (N6.5: holes, splinters, the captain staggered) and the sound (N6.8).
 */
import { deriveSeed, Rng } from '@futuremagic/core';
import { fallsDue, inDanger, sparOfPart, sparUnder, standingOf, wreckOf, type Standing, type Wreck } from './damage/fall';
import { atHand, burnt, kindled, spaceAt, type Fire } from './damage/fire';
import { flowed, founderTonnes, inflow, loadOf, lyingOf, pumped } from './damage/flood';
import { meetings, nearHer, plankingPlace, type Aboard, type Meeting, type Place, type TimberPart } from './damage/meet';
import { atWork, manAt, type Crew, type Mended } from './crew/crew';
import { brigRoster, type Man } from './crew/roster';
import { battery, dismountGun, gunAt, gunCount, type Battery } from './guns/guns';
import { pathAt, type GunFired, type Shot, type Vec } from './guns/shot';
import {
  ABACK_FALLS, AT_WATERLINE, AWASH_SECONDS, CHAIN_BITE, FIGHT_AT_HAND, FIR_AS_OAK, FIRE_CHANCE, GLANCING, GUN_AS_OAK, HARMS, HOLE_GRID, HURT, LEAST_PUNCH, LODGED_SPLINTERS,
  HAMMOCKS, MAN_AS_OAK, PIERCE, PUMP_POST, RAKING, SEEP, SMASHED, SPLINTER_CONE, SPLINTER_REACH, SPLINTER_STRIKE, STOVE_IN, TIMBER, WAD_RANGE, WASH, WEEP, type Harm, type HurtBy,
} from './rules/damage';
import { SHOT, type ShotKind } from './rules/guns';
import { LOAD_WATERLINE, type GunKind } from './rules/ships';
import { surfaceAt, seaSample, type SeaState } from './sea/sea';
import { toShip, toWorld, UNBURDENED, type Burden, type ShipPose } from './ship/motion';
import { shipPlan, type Cell } from './ship/plan';
import { rigPlan } from './ship/rig';
import { apparentAt, MASTS, sailsStanding, UNDAMAGED, type Sailing, type SailingDamage } from './ship/sailing';
import { sailShare, type SailSetting } from './ship/sails';
import { beaufortForce } from './rules/beaufort';
import { STEP_SECONDS, STEPS_PER_SECOND } from './units';
import type { Wind } from './wind';

/** What has been done to a ship (her `SimShip.damage`; changed only here). Plain whole numbers, kept small for the state. */
export interface Damage {
  /** Every hole in her timber, one whole number each (`holeAt` reads one): its cell, where in it, the ball and whether it lodged there. */
  readonly holes: readonly number[];
  /** Her lines shot away (rig plan places), ascending. */
  readonly cut: readonly number[];
  /** One entry for each wound to a part of a spar (`sparParts` places), ascending. */
  readonly wounds: readonly number[];
  /** The shot holes in each sail (rig plan order): chain tears as many as `CHAIN_BITE` balls. */
  readonly rent: readonly number[];
  /** Her men hurt, one whole number each (man × HARMS.length + how badly), ascending by man. */
  readonly hurt: readonly number[];
  /** The water in her, t: in her larboard and starboard halves (damage/flood.ts). */
  readonly flooded: readonly [larboard: number, starboard: number];
  /** Where her spars have broken (`sparParts` places), ascending: each with all it carried is down (damage/fall.ts `standingOf`). */
  readonly fallen: readonly number[];
  /** What fell and lies alongside dragging her until it is cut away: part × 2, + 1 on her starboard side (`wreckOf`). */
  readonly alongside: readonly number[];
  /** The fires burning in her, by space (damage/fire.ts). */
  readonly fires: readonly Fire[];
  /** Whether she still answers her helm (false: her steering gear is shot away). */
  readonly steering: boolean;
  /** Her magazine has gone up. */
  readonly blownUp: boolean;
  /** The holes the carpenter's crew has plugged (their `holes` numbers), ascending: the sea only weeps in at them (rules/damage.ts `WEEP`). */
  readonly plugged: readonly number[];
  /**
   * Her spars in danger (damage/fall.ts `inDanger`: stays gone, aback), each as the part it would break at and the tick
   * it came into danger, ascending by part: one still so `ABACK_FALLS` later falls.
   */
  readonly danger: readonly (readonly [part: number, since: number])[];
}

/** A shot on its way: the ship and gun (battery place) that fired it and the tick, and how much of its punch each ball has spent (mm of oak; `GONE` once it is stopped or in the sea). */
export interface Flying {
  readonly by: number;
  readonly gun: number;
  readonly tick: number;
  readonly spent: readonly number[];
}
/** A ball's `spent` once it is stopped, lodged or in the sea. */
export const GONE = -1;
/** Millimetres in a metre (a ball's spent punch is kept in whole mm). */
const MM = 1000;

/** What a ball did to a ship, as a step's event: the drawing (N6.5) and the sound (N6.8) show and play it where it happened. */
export interface Hit {
  readonly kind: 'hit';
  readonly tick: number;
  /** The ship struck, and the ship and gun whose shot it was. */
  readonly ship: number;
  readonly by: number;
  readonly gun: number;
  /** A hole through her timber, a ball lodged in it, splinters flying, a gun dismounted, a man struck, a spar wounded, a line cut, a sail holed, her steering shot away, a fire started. */
  readonly what: 'hole' | 'lodged' | 'splinters' | 'gun' | 'man' | 'spar' | 'line' | 'sail' | 'steering' | 'fire';
  /** Where in her (along, across, height above her base, m). */
  readonly at: Place;
  /** The cell (-1: none kept there), gun, man, spar part, line, sail or space (a fire's: the plan's place). */
  readonly id: number;
  /** A hole's or a lodged ball's timber; a man's hurt and what struck him. */
  readonly part?: TimberPart;
  readonly harm?: Harm;
  readonly cause?: HurtBy;
}

/** What followed from her damage in a step, as an event (N6.2): a spar came into danger (its stays gone, aback: the master cries it) or fell (with all it carried, over a side), a man aloft was thrown down with it, fire spread to a space or was put out in one, her magazine went up. */
export interface Aftermath {
  readonly kind: 'aftermath';
  readonly tick: number;
  readonly ship: number;
  readonly what: 'danger' | 'fell' | 'man' | 'fire' | 'out' | 'blew up';
  /** The part a spar broke at or would break at (`sparParts` place), the man, the space (the plan's place); -1 for her magazine. */
  readonly id: number;
  /** The side a spar went over (-1 larboard, 1 starboard). */
  readonly side?: -1 | 1;
  readonly harm?: Harm;
}

/** A ship as nothing has struck her yet. */
export function startDamage(): Damage {
  return {
    holes: [], cut: [], wounds: [], rent: rigPlan().sails.map(() => 0), hurt: [],
    flooded: [0, 0], fallen: [], alongside: [], fires: [], steering: true, blownUp: false, plugged: [], danger: [],
  };
}

/** How a ship stands lost when a match begins so (`?end=`, N6.7): her water at what founders her; fire in three spaces below; her magazine gone up. */
export type LostAtStart = 'sunk' | 'burnt' | 'blew up';

/** The spaces a ship lost by fire begins with alight, and how far (over `BURNT.size`, rules/end.ts). */
const ALIGHT = { spaces: ['messdeck', 'cockpit', 'hold'], size: 0.6 } as const;

/** A ship lost already (`how`): the stand-in start that lets her end be looked at without fighting a match first (N6.7). */
export function lostAtStart(d: Damage, how: LostAtStart): Damage {
  if (how === 'sunk') return { ...d, flooded: [founderTonnes() / 2, founderTonnes() / 2] };
  if (how === 'blew up') return { ...d, blownUp: true };
  const spaces = shipPlan().spaces;
  return { ...d, fires: ALIGHT.spaces.map((id) => ({ space: spaces.findIndex((s) => s.id === id), size: ALIGHT.size })).sort((p, q) => p.space - q.space) };
}

// ---- Reading what has been done ----

/** The shots and guns a hole can be from, in the order a hole's mark keeps them. */
const BALLS: readonly (readonly [ShotKind, GunKind])[] = [['round', 'carronade'], ['round', 'long6'], ['chain', 'carronade'], ['chain', 'long6'], ['grape', 'carronade'], ['grape', 'long6']];
/** The places a hole's spot in its cell can take along each of the cell's two ways (`HOLE_GRID` apart: well over a cell's metre). */
const HOLE_SPAN = 64;
const MARKS = BALLS.length * 2;

/** A hole read out: its cell (plan id), where in it (m along the cell's two ways, to `HOLE_GRID`), the ball that made it, and whether it lodged there. */
export interface Hole {
  readonly cell: number;
  readonly u: number;
  readonly v: number;
  readonly shot: ShotKind;
  readonly gun: GunKind;
  readonly lodged: boolean;
}

/** A hole as `Damage.holes` keeps it (`holeAt` reads it back). */
export function holeCode(cell: number, u: number, v: number, shot: ShotKind, gun: GunKind, lodged: boolean): number {
  const grid = (x: number) => Math.max(0, Math.min(HOLE_SPAN - 1, Math.round(x / HOLE_GRID)));
  const ball = BALLS.findIndex(([s, g]) => s === shot && g === gun);
  return ((cell * HOLE_SPAN + grid(u)) * HOLE_SPAN + grid(v)) * MARKS + ball * 2 + (lodged ? 1 : 0);
}

/** A hole of `Damage.holes` read out. */
export function holeAt(code: number): Hole {
  const mark = code % MARKS, rest = Math.floor(code / MARKS), v = rest % HOLE_SPAN, u = Math.floor(rest / HOLE_SPAN) % HOLE_SPAN;
  const [shot, gun] = BALLS[Math.floor(mark / 2)]!;
  return { cell: Math.floor(rest / HOLE_SPAN / HOLE_SPAN), u: u * HOLE_GRID, v: v * HOLE_GRID, shot, gun, lodged: mark % 2 === 1 };
}

/** The holes in one cell. */
export const holesIn = (d: Damage, cell: number): Hole[] => d.holes.map(holeAt).filter((h) => h.cell === cell);

/** How a cell stands: sound, holed, or (with STOVE_IN holes a panel, SMASHED a bulwark section) stove in. */
export function cellState(d: Damage, cell: Cell): 'sound' | 'holed' | 'stove in' {
  const n = holesIn(d, cell.id).length;
  return n === 0 ? 'sound' : n >= (cell.kind === 'bulwark' ? SMASHED : STOVE_IN) ? 'stove in' : 'holed';
}

/** Whether a line (rig plan place) is shot away. */
export const isCut = (d: Damage, line: number): boolean => d.cut.includes(line);
/** The wounds to a part of a spar (damage/meet.ts `sparParts` place). */
export const woundsTo = (d: Damage, part: number): number => d.wounds.filter((w) => w === part).length;
/** How badly a man (roster place) is hurt, or null. */
export function harmOf(d: Damage, man: number): Harm | null {
  const code = d.hurt.find((h) => Math.floor(h / HARMS.length) === man);
  return code === undefined ? null : HARMS[code % HARMS.length]!;
}

// ---- What a ball goes through ----

/** How much oak a ball goes through at a speed, m (rules/damage.ts `PIERCE`). */
export function punchAt(shot: ShotKind, gun: GunKind, speed: number): number {
  const row = PIERCE[shot][gun], [v0, p0] = row.slow, [v1, p1] = row.fast;
  return Math.min(row.most, Math.max(0, p0 + ((p1 - p0) * (speed * speed - v0 * v0)) / (v1 * v1 - v0 * v0)));
}

/** How far a ball reaches to a line, sail or spar it passes, m: its radius, or chain's whirl. */
export const reachOf = (shot: ShotKind, gun: GunKind): number => (SHOT[shot].diameter[gun] / 2) * (shot === 'chain' ? CHAIN_BITE : 1);

// ---- Shots in flight ----

/** Each shot's whole flight, by the gun and tick that fired it (beside the state: worked out once, when fired). */
const flights = new Map<string, Shot>();
const flightKey = (by: number, gun: number, tick: number): string => `${by}|${gun}|${tick}`;

/** The shots in flight with a gun's shot just fired added (N5.3 calls this with each `GunFired` of a step). */
export function launch(flying: readonly Flying[], fired: GunFired): Flying[] {
  flights.set(flightKey(fired.ship, fired.gun, fired.tick), fired.fired);
  return [...flying, { by: fired.ship, gun: fired.gun, tick: fired.tick, spent: fired.fired.balls.map(() => 0) }];
}

/** A world point as a place in a ship lying at `pose`. */
function placeIn(pose: ShipPose, p: Vec): Place {
  const [x, y, z] = toShip(pose, p[0], p[1], p[2]);
  return [-z, x, y + LOAD_WATERLINE];
}

// ---- The routine ----

/** What `stepHits` works on: the match's seed, the step's tick, the shots in flight and each ship's pose, crew, canvas, guns and damage. */
export interface HitsIn {
  readonly seed: number;
  readonly tick: number;
  readonly flying: readonly Flying[];
  readonly ships: readonly HitShip[];
}
export interface HitShip {
  readonly pose: ShipPose;
  readonly crew: Crew;
  readonly canvas: readonly SailSetting[];
  readonly guns: Battery;
  readonly damage: Damage;
  /** Whether she is at quarters, her hammocks stowed in the waist's nettings. Left out: she is not. */
  readonly quarters?: boolean;
}
export interface HitsOut {
  readonly flying: Flying[];
  /** Each ship's guns and damage after the step (the same values where nothing struck her). */
  readonly guns: Battery[];
  readonly damage: Damage[];
  readonly events: Hit[];
}

/** One ship's damage while a step's hits are worked out: grown in place, then frozen into the state. */
interface Working {
  holes: number[];
  cut: Set<number>;
  wounds: number[];
  rent: number[];
  hurt: Map<number, number>;
  fires: Fire[];
  steering: boolean;
  battery: Battery;
  aboard: Aboard | null;
  touched: boolean;
}

/** A ship's damage and guns opened up for change. */
function opened(s: HitShip): Working {
  const d = s.damage;
  return {
    holes: [...d.holes], cut: new Set(d.cut), wounds: [...d.wounds], rent: [...d.rent],
    hurt: new Map(d.hurt.map((h) => [Math.floor(h / HARMS.length), h % HARMS.length])), fires: [...d.fires], steering: d.steering,
    battery: s.guns, aboard: null, touched: false,
  };
}

/** What of a ship can be met now (her men's places, her mounted guns, how far each sail is set), worked out when a ball first comes near her. */
function aboardOf(s: HitShip, w: Working, roster: readonly Man[]): Aboard {
  if (w.aboard) return w.aboard;
  const men = s.crew.men.map((hand, i) => {
    if (w.hurt.get(i) === HARMS.indexOf('killed')) return null;
    const { spot, height } = manAt(hand, roster[i]!.home);
    return [spot.along, spot.across, height] as Place;
  });
  const mounted = Array.from({ length: gunCount(w.battery) }, (_, i) => !gunAt(w.battery, i).dismounted);
  const standing = standingNow(s.damage);
  w.aboard = {
    men, mounted, sails: s.canvas.map((c, i) => (standing.sailDown[i] ? 0 : sailShare(c))), down: standing.down, gone: standing.gone, steering: w.steering,
    hammocks: s.quarters === true,
  };
  return w.aboard;
}

/** How a man struck is hurt: a draw on the table's shares for what struck him. */
function harmBy(cause: HurtBy, rng: Rng): number {
  const shares = HURT[cause], r = rng.float();
  let sum = 0;
  for (let k = 0; k < shares.length; k++) { sum += shares[k]!; if (r < sum) return k; }
  return shares.length - 1;
}

/**
 * One step of every shot in flight: each ball's piece of path for this step traced through every ship but the one that
 * fired it, as she lies now, and what it meets done in order while its punch lasts. The shots whose balls are all spent
 * or in the sea are let go.
 */
export function stepHits(input: HitsIn, roster: readonly Man[] = brigRoster()): HitsOut {
  const events: Hit[] = [];
  // A ship's damage is opened up for change only when a ball first comes near her this step.
  const work: (Working | null)[] = input.ships.map(() => null);
  const flying: Flying[] = [];
  for (const f of input.flying) {
    const key = flightKey(f.by, f.gun, f.tick), shot = flights.get(key);
    // This step's piece of each ball's flight: from the step before this tick to this tick (a shot fired in a step is first traced in the next).
    const to = (input.tick - f.tick) * STEP_SECONDS, from = Math.max(0, to - STEP_SECONDS);
    if (!shot) continue;
    const kind = battery()[f.gun]!.gun;
    const spent = f.spent.map((sp, b) => {
      const ball = shot.balls[b]!;
      if (sp === GONE || from >= ball.ends) return GONE;
      if (to <= 0) return sp;
      const left = traceBall(input, work, roster, f, b, shot.shot, kind, ball.path, ball.ends, from, to, sp / MM, events);
      return left <= 0 ? GONE : Math.round((punchLeftFrom(shot.shot, kind, ball.path, ball.ends, from) - left) * MM);
    });
    if (spent.every((sp) => sp === GONE)) { flights.delete(key); continue; }
    flying.push({ ...f, spent });
  }
  return {
    flying,
    guns: work.map((w, i) => w?.battery ?? input.ships[i]!.guns),
    damage: work.map((w, i) => (w?.touched ? freeze(w, input.ships[i]!.damage) : input.ships[i]!.damage)),
    events,
  };
}

/** A ball's punch at the start of a piece of its path from its speed there (before what it has spent). */
function punchLeftFrom(shot: ShotKind, gun: GunKind, path: readonly Vec[], ends: number, from: number): number {
  const a = pathAt(path, ends, from), b = pathAt(path, ends, from + STEP_SECONDS / 2);
  const speed = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / (Math.min(from + STEP_SECONDS / 2, ends) - from || STEP_SECONDS);
  return punchAt(shot, gun, speed);
}

/** One ball's piece of path this step through every ship it can strike: its punch left after (0 or less: it is stopped). */
function traceBall(
  input: HitsIn, work: (Working | null)[], roster: readonly Man[], f: Flying, b: number, shot: ShotKind, gun: GunKind,
  path: readonly Vec[], ends: number, from: number, to: number, spentM: number, events: Hit[],
): number {
  let punch = punchLeftFrom(shot, gun, path, ends, from) - spentM;
  if (punch <= 0) return 0;
  const a = pathAt(path, ends, from), e = pathAt(path, ends, to), reach = reachOf(shot, gun);
  const rng = new Rng(deriveSeed(input.seed, 'hit', f.by, f.gun, f.tick, b, input.tick));
  // Whether it sets her afire is drawn apart, so the rest of what it does is drawn alike with or without fire.
  const fireRng = new Rng(deriveSeed(input.seed, 'fire', f.by, f.gun, f.tick, b, input.tick));
  const range = Math.hypot(a[0] - path[0]![0], a[1] - path[0]![1], a[2] - path[0]![2]);
  input.ships.forEach((s, j) => {
    if (j === f.by || punch <= 0) return;
    const pa = placeIn(s.pose, a), pe = placeIn(s.pose, e);
    if (!nearHer(pa, pe)) return;
    const w = (work[j] ??= opened(s)), aboard = aboardOf(s, w, roster);
    const d: Place = [pe[0] - pa[0], pe[1] - pa[1], pe[2] - pa[2]];
    // In by her bow or stern along her length, it rakes her (rules/damage.ts `RAKING`).
    const times = Math.abs(d[0]) >= Math.cos(RAKING.within) * Math.hypot(...d) ? RAKING.times : 1;
    for (const m of meetings(pa, pe, reach, aboard)) {
      if (punch <= 0) break;
      const event = { kind: 'hit', tick: input.tick, ship: j, by: f.by, gun: f.gun, at: m.at } as const;
      punch = meet(m, punch, { shot, gun, rng, fireRng, range, w, d, times, events, event });
    }
  });
  return punch;
}

/** What a meeting is done with. */
interface MeetWith {
  readonly shot: ShotKind;
  readonly gun: GunKind;
  readonly rng: Rng;
  readonly fireRng: Rng;
  /** How far the ball has flown from the muzzle, m (burning wads reach her only close). */
  readonly range: number;
  readonly w: Working;
  readonly d: Place;
  /** Raking her: `RAKING.times` (a gun spends 1 / times of a gun's iron), else 1. */
  readonly times: number;
  readonly events: Hit[];
  readonly event: Pick<Hit, 'kind' | 'tick' | 'ship' | 'by' | 'gun' | 'at'>;
}

/** One meeting done: its effect on her, and the ball's punch after it. */
function meet(m: Meeting, punch: number, c: MeetWith): number {
  const { w, events, event } = c;
  switch (m.kind) {
    case 'timber': {
      // Raking, it meets her light stern or bow timbers square on, not glancing along her side.
      const thick = TIMBER[m.part] / (c.times > 1 ? 1 : Math.max(m.cos, GLANCING)), through = punch > thick;
      w.touched = true;
      if (m.cell) w.holes.push(holeCode(m.cell.id, m.u, m.v, c.shot, c.gun, !through));
      events.push({ ...event, what: through ? 'hole' : 'lodged', id: m.cell?.id ?? GONE, part: m.part });
      splinters(m.at, c, through ? 1 : LODGED_SPLINTERS);
      kindle(m.at, c);
      return through ? punch - thick : 0;
    }
    case 'gun':
      if (punch >= LEAST_PUNCH.gun && w.aboard?.mounted[m.gun]) {
        w.battery = dismountGun(w.battery, m.gun);
        (w.aboard.mounted as boolean[])[m.gun] = false;
        w.touched = true;
        events.push({ ...event, what: 'gun', id: m.gun });
        kindle(m.at, c);
      }
      return punch - GUN_AS_OAK / c.times;
    case 'man':
      strike(m.man, c.shot, c);
      return punch - MAN_AS_OAK;
    case 'spar':
      if (punch < LEAST_PUNCH.spar) return punch;
      w.wounds.push(m.part);
      w.touched = true;
      events.push({ ...event, what: 'spar', id: m.part });
      return punch - m.chord * FIR_AS_OAK;
    case 'line':
      if (punch >= LEAST_PUNCH.line && !w.cut.has(m.line)) {
        w.cut.add(m.line);
        w.touched = true;
        events.push({ ...event, what: 'line', id: m.line });
      }
      return punch;
    case 'sail':
      if (punch >= LEAST_PUNCH.sail) {
        w.rent[m.sail] = w.rent[m.sail]! + (c.shot === 'chain' ? CHAIN_BITE : 1);
        w.touched = true;
        events.push({ ...event, what: 'sail', id: m.sail });
      }
      return punch;
    case 'hammocks': {
      // Grape is held by them as by the old bulwark; round and chain go through as if they were not there.
      if (!HAMMOCKS.stops.includes(c.shot)) return punch;
      const thick = HAMMOCKS.thick / Math.max(m.cos, GLANCING);
      return punch > thick ? punch - thick : 0;
    }
    case 'steering':
      if (punch >= LEAST_PUNCH.line && w.steering) {
        w.steering = false;
        if (w.aboard) w.aboard = { ...w.aboard, steering: false };
        w.touched = true;
        events.push({ ...event, what: 'steering', id: GONE });
      }
      return punch;
  }
}

/** A ball that came through her timber or struck a gun may set her afire where it struck (rules/damage.ts `FIRE_CHANCE`). */
function kindle(at: Place, c: MeetWith): void {
  if (c.fireRng.float() >= (c.range <= WAD_RANGE ? FIRE_CHANCE.wad : FIRE_CHANCE.ball)) return;
  const space = spaceAt(at);
  if (space < 0) return;
  c.w.fires = kindled(c.w.fires, space);
  c.w.touched = true;
  c.events.push({ ...c.event, what: 'fire', id: space });
}

/** A man struck by a ball or splinters: hurt by the table, never less than he was; a man killed is met no more. */
function strike(man: number, cause: HurtBy, c: MeetWith): void {
  const { w } = c, was = w.hurt.get(man), harm = Math.max(was ?? 0, harmBy(cause, c.rng));
  w.hurt.set(man, harm);
  w.touched = true;
  if (HARMS[harm] === 'killed' && w.aboard) (w.aboard.men as (Place | null)[])[man] = null;
  c.events.push({ ...c.event, what: 'man', id: man, harm: HARMS[harm]!, cause });
}

/** Splinters thrown ahead of the ball from where it came through her timber (`share` of a full throw): each man in their cone and reach struck by chance. */
function splinters(at: Place, c: MeetWith, share: number): void {
  const strength = PIERCE[c.shot][c.gun].splinters * share;
  if (!(strength > 0) || !c.w.aboard) return;
  c.events.push({ ...c.event, what: 'splinters', id: GONE });
  const length = Math.hypot(...c.d), cone = Math.cos(SPLINTER_CONE);
  c.w.aboard.men.forEach((m, i) => {
    if (!m) return;
    // Toward his middle.
    const to: Place = [m[0] - at[0], m[1] - at[1], m[2] + MAN_MIDDLE - at[2]], far = Math.hypot(...to);
    if (far > SPLINTER_REACH || far === 0) return;
    const ahead = (to[0] * c.d[0] + to[1] * c.d[1] + to[2] * c.d[2]) / (far * length);
    if (ahead < cone) return;
    if (c.rng.float() < SPLINTER_STRIKE * (1 - far / SPLINTER_REACH) * strength) strike(i, 'splinter', c);
  });
}
/** A man's middle above his feet, m (where splinters are aimed at him). */
const MAN_MIDDLE = 1;

/** One ship's working damage as plain data for the state (what a hit does not change kept from `d`). */
function freeze(w: Working, d: Damage): Damage {
  return {
    ...d,
    fires: w.fires,
    steering: w.steering,
    holes: w.holes,
    cut: [...w.cut].sort((p, q) => p - q),
    wounds: [...w.wounds].sort((p, q) => p - q),
    rent: w.rent,
    hurt: [...w.hurt].sort((p, q) => p[0] - q[0]).map(([man, harm]) => man * HARMS.length + harm),
  };
}

// ---- What damage leads to (N6.2) ----

/** What `stepAftermath` works on for one ship: the match's seed, the step, the ship, how she lies, the sea, her crew, her sailing and the true wind at her place. */
export interface AftermathIn {
  readonly seed: number;
  readonly tick: number;
  readonly t: number;
  readonly ship: number;
  readonly pose: ShipPose;
  readonly sea: SeaState;
  readonly crew: Crew;
  readonly sailing: Sailing;
  readonly wind: Wind;
  /** The repairs her crew finished this step (crew.ts), mended first. */
  readonly mended?: readonly Mended[];
  /** She is lost blown up or burnt out (end.ts; N6.7): her bottom gone, the sea pours in as it does over a foundered ship. */
  readonly breaking?: boolean;
}
/** Her damage one step on, what followed, and what it does to her sailing (sailing.ts) and her floating (motion.ts: the water's weight). */
export interface AftermathOut {
  readonly damage: Damage;
  readonly events: Aftermath[];
  readonly sailing: SailingDamage;
  readonly load: Burden;
}

/** A hole the sea can come in at: its `holes` number, where (the plan's place), and the ball whose opening it is (a lodged ball plugs its hole; holes above her deck let in no sea). */
export interface Leak {
  readonly code: number;
  readonly at: Place;
  readonly shot: ShotKind;
  readonly gun: GunKind;
}
/** Each ship's leaks, by her holes (worked out again only when a hole is added). */
const leaksOf = new WeakMap<readonly number[], readonly Leak[]>();
function leaks(holes: readonly number[]): readonly Leak[] {
  let out = leaksOf.get(holes);
  if (out) return out;
  const cells = shipPlan().cells;
  out = holes.flatMap((code) => {
    const h = holeAt(code);
    return !h.lodged && cells[h.cell]!.kind === 'planking' ? [{ code, at: plankingPlace(cells[h.cell]!, h.u, h.v), shot: h.shot, gun: h.gun }] : [];
  });
  leaksOf.set(holes, out);
  return out;
}

/** The holes in her planking the sea can come in at (not lodged, not plugged), wherever they lie; the same list while nothing changes. */
const openOf = new WeakMap<readonly number[], { readonly plugged: readonly number[]; readonly open: readonly Leak[] }>();
export function openHoles(d: Damage): readonly Leak[] {
  const was = openOf.get(d.holes);
  if (was && was.plugged === d.plugged) return was.open;
  const plugged = new Set(d.plugged), open = d.plugged.length === 0 ? leaks(d.holes) : leaks(d.holes).filter((h) => !plugged.has(h.code));
  openOf.set(d.holes, { plugged: d.plugged, open });
  return open;
}

/** What of her rig stands now (damage/fall.ts `standingOf` of what she has had broken, cut and holed). */
export const standingNow = (d: Damage): Standing => standingOf(d.fallen, d.cut, d.rent);

/** The men out of the quarter bill: badly hurt or killed (roster places); the same set while nothing changes. */
const outs = new WeakMap<readonly number[], ReadonlySet<number>>();
export function outOf(d: Damage): ReadonlySet<number> {
  let out = outs.get(d.hurt);
  if (!out) {
    out = new Set(d.hurt.flatMap((h) => (h % HARMS.length >= HARMS.indexOf('badly') ? [Math.floor(h / HARMS.length)] : [])));
    outs.set(d.hurt, out);
  }
  return out;
}

/** Without one entry of `x` (a list kept ascending). */
const lessOne = (list: readonly number[], x: number): readonly number[] => {
  const k = list.indexOf(x);
  return k < 0 ? list : [...list.slice(0, k), ...list.slice(k + 1)];
};

/**
 * The repairs her crew finished, done to her (N6.3, design decisions for N6): a hole plugged only weeps, a
 * spar fished has one wound less, a line spliced is whole again, the relieving tackles give her her steering back, the
 * wreckage cut away drags her no more. The pumps, the fire parties and the wounded carried below change nothing here.
 */
export function mend(d: Damage, mended: readonly Mended[]): Damage {
  let next = d;
  for (const m of mended) {
    switch (m.job) {
      case 'plug':
        if (next.holes.includes(m.on) && !next.plugged.includes(m.on)) next = { ...next, plugged: [...next.plugged, m.on].sort((p, q) => p - q) };
        break;
      case 'fish': next = { ...next, wounds: lessOne(next.wounds, m.on) }; break;
      case 'splice': next = { ...next, cut: lessOne(next.cut, m.on) }; break;
      case 'tackle': next = next.steering ? next : { ...next, steering: true }; break;
      case 'cut': next = { ...next, alongside: lessOne(next.alongside, m.on) }; break;
      default: break;
    }
  }
  return next;
}

/** Each ship's drag alongside, by her `alongside` (worked out again only when something more falls or is cut away). */
const wrecksOf = new WeakMap<readonly number[], readonly Wreck[]>();
const wrecks = (alongside: readonly number[]): readonly Wreck[] => {
  let out = wrecksOf.get(alongside);
  if (!out) wrecksOf.set(alongside, (out = alongside.map(wreckOf)));
  return out;
};

/** The men of the quarter bill at the pumps (roster places). */
let pumpMen: readonly number[] | null = null;
const water = seaSample();
const holeWorld: [number, number, number] = [0, 0, 0];

/**
 * One step of what her damage leads to (design decisions for N6): the sea in at her holes against the pumps and running
 * across her as she heels; spars falling that are due (damage/fall.ts) with the men on them; fires growing, spreading,
 * fought by the men at hand and reaching her powder. Her damage is the same value where nothing changed.
 */
export function stepAftermath(was: Damage, input: AftermathIn, roster: readonly Man[] = brigRoster()): AftermathOut {
  const events: Aftermath[] = [], { tick, ship } = input;
  const d = input.mended && input.mended.length > 0 ? mend(was, input.mended) : was;
  let next = d;

  // The sea coming in, and the pumps.
  const holes = leaks(d.holes), [larboard, starboard] = d.flooded;
  if (holes.length > 0 || larboard + starboard > 0 || input.breaking) {
    const roll = input.pose.roll, level = lyingOf(larboard + starboard).level, plugged = d.plugged;
    let inL = 0, inS = 0;
    for (const h of holes) {
      toWorld(input.pose, h.at[1], h.at[2] - LOAD_WATERLINE, -h.at[0], holeWorld);
      const depth = surfaceAt(input.sea, holeWorld[0], holeWorld[2], input.t, water).height - holeWorld[1] + WASH;
      // The water inside stands over the hole by its level there (the surface lies level in the world as she heels); every hole seeps.
      const under = depth > 0 ? inflow(h.shot, h.gun, depth, level + h.at[1] * roll - h.at[2]) : 0;
      const q = Math.max(under, SEEP * inflow(h.shot, h.gun, AT_WATERLINE)) * (plugged.length > 0 && plugged.includes(h.code) ? WEEP : 1);
      if (h.at[1] < 0) inL += q; else inS += q;
    }
    // Foundered, or lost blown up or burnt out, the sea pours in over her side.
    if (larboard + starboard >= founderTonnes() || input.breaking) { const pour = founderTonnes() / AWASH_SECONDS / 2; inL += pour; inS += pour; }
    const flooded = flowed(larboard, starboard, inL, inS, pumped(pumpHands(input.crew, d, roster), larboard + starboard), roll);
    if (flooded[0] !== larboard || flooded[1] !== starboard) next = { ...next, flooded };
  }

  // Spars in danger, and falling.
  let standing: Standing | null = null;
  if (d.wounds.length > 0 || d.cut.length > 0) {
    standing = standingNow(d);
    const { ay } = apparentAt(input.sailing, input.wind);
    let aback: boolean[] | null = null;
    const rigWind = { across: ay, aback: (mast: number) => (aback ??= abackMasts(input.sailing, input.wind, standing!))[mast]! };
    const was = new Map(d.danger), limit = Math.round(abackFalls(input.wind.speed) * STEPS_PER_SECOND);
    const danger = inDanger(standing, rigWind).map((f) => [f.part, was.get(f.part) ?? tick] as const);
    // One cry for a mast: its lowest spar newly in danger (a topmast's stays go with the lower mast's).
    const cried = new Set<string>();
    for (const [part, since] of danger) {
      const mast = rigPlan().spars[sparOfPart(part)]!.mast;
      if (since === tick && !cried.has(mast)) { cried.add(mast); events.push({ kind: 'aftermath', tick, ship, what: 'danger', id: part }); }
    }
    const overdue = danger.flatMap(([part, since]) => (tick - since >= limit ? [part] : []));
    const falls = fallsDue(standing, d.wounds, rigWind, overdue);
    if (falls.length > 0) {
      const fallen = [...d.fallen, ...falls.map((f) => f.part)].sort((p, q) => p - q);
      const alongside = [...d.alongside, ...falls.map((f) => f.part * 2 + (f.side > 0 ? 1 : 0))].sort((p, q) => p - q);
      for (const f of falls) events.push({ kind: 'aftermath', tick, ship, what: 'fell', id: f.part, side: f.side });
      const after = standingOf(fallen, d.cut, d.rent);
      const hurt = thrownDown(d, standing, after, input, roster, events);
      next = { ...next, fallen, alongside, hurt };
      standing = after;
    }
    const standingDanger = danger.filter(([part]) => !standing!.down[sparOfPart(part)]);
    if (!sameDanger(standingDanger, d.danger)) next = { ...next, danger: standingDanger };
  } else if (d.danger.length > 0) next = { ...next, danger: [] };

  // Fire.
  if (d.fires.length > 0 && !d.blownUp) {
    const fighting = menBySpace(input.crew, d, roster);
    // A fire party at the fire fights it; until one comes, the men at hand beat at it.
    const b = burnt(d.fires, (space) => atWork(input.crew, 'fight', space) || Math.min(FIGHT_AT_HAND, atHand(space).reduce((n, s) => n + (fighting.get(s) ?? 0), 0)));
    for (const space of b.spread) events.push({ kind: 'aftermath', tick, ship, what: 'fire', id: space });
    for (const space of b.out) events.push({ kind: 'aftermath', tick, ship, what: 'out', id: space });
    if (b.magazine) events.push({ kind: 'aftermath', tick, ship, what: 'blew up', id: GONE });
    next = { ...next, fires: b.fires, blownUp: b.magazine };
  }

  const [l, s] = next.flooded;
  return {
    damage: next,
    events,
    load: l + s > 0 ? loadOf(l, s) : UNBURDENED,
    sailing: sailingDamage(next, standing),
  };
}

/** What her damage does to her sailing: what each sail can still draw, her steering, the wreck alongside and the water's weight. */
function sailingDamage(d: Damage, standing: Standing | null): SailingDamage {
  const intact = d.steering && d.alongside.length === 0 && d.fallen.length === 0 && d.cut.length === 0 && d.flooded[0] + d.flooded[1] === 0 && d.rent.every((r) => r === 0);
  if (intact) return UNDAMAGED;
  const st = standing ?? standingNow(d);
  return { draws: st.draws, steered: d.steering, wrecks: wrecks(d.alongside), flooded: d.flooded[0] + d.flooded[1] };
}

/** How long a spar in danger stands, s, in a wind of `speed` m/s (rules/damage.ts `ABACK_FALLS`). */
function abackFalls(speed: number): number {
  const { seconds, force } = ABACK_FALLS;
  const u = Math.min(1, Math.max(0, (beaufortForce(speed) - force[0]) / (force[1] - force[0])));
  return seconds[0] + (seconds[1] - seconds[0]) * u;
}

/** Whether two lists of spars in danger are the same. */
const sameDanger = (a: Damage['danger'], b: Damage['danger']): boolean =>
  a.length === b.length && a.every(([part, since], k) => part === b[k]![0] && since === b[k]![1]);

/** Whether each mast's square sails are aback now (fore, main). */
function abackMasts(sailing: Sailing, wind: Wind, standing: Standing): boolean[] {
  const rig = rigPlan(), stood = sailsStanding(sailing, wind, { ...UNDAMAGED, draws: standing.draws });
  return MASTS.map((mast) => rig.sails.some((sail, i) => sail.mast === mast && sail.kind === 'square' && stood[i]!.aback));
}

/** Whether a man can still work (not badly hurt, not killed). */
const fit = (d: Damage, man: number): boolean => {
  const h = harmOf(d, man);
  return h === null || h === 'wounded';
};

/** The men at the pumps and fit to work them: the quarter bill's men there with nothing else to do, and the hands sent to them (N6.3). */
function pumpHands(crew: Crew, d: Damage, roster: readonly Man[]): number {
  pumpMen ??= roster.flatMap((m, i) => (m.post === PUMP_POST ? [i] : []));
  const atPost = pumpMen.filter((i) => { const h = crew.men[i]; return h && !h.going && !h.stands && fit(d, i); }).length;
  return atPost + atWork(crew, 'pump', 0);
}

/** The fit men in each space (the plan's places) where they are now. */
function menBySpace(crew: Crew, d: Damage, roster: readonly Man[]): Map<number, number> {
  const index = new Map(shipPlan().spaces.map((s, i) => [s.id, i])), out = new Map<number, number>();
  crew.men.forEach((hand, i) => {
    if (!fit(d, i)) return;
    const space = index.get(manAt(hand, roster[i]!.home).spot.space);
    if (space !== undefined) out.set(space, (out.get(space) ?? 0) + 1);
  });
  return out;
}

/** The men aloft on what has just come down, thrown down with it (rules/damage.ts `HURT.fall`): her men hurt after. */
function thrownDown(d: Damage, before: Standing, after: Standing, input: AftermathIn, roster: readonly Man[], events: Aftermath[]): readonly number[] {
  const hurt = new Map(d.hurt.map((h) => [Math.floor(h / HARMS.length), h % HARMS.length]));
  const rng = new Rng(deriveSeed(input.seed, 'fall', input.ship, input.tick));
  input.crew.men.forEach((hand, i) => {
    if (hurt.get(i) === HARMS.indexOf('killed')) return;
    const s = sparUnder(manAt(hand, roster[i]!.home).spot.space);
    if (s < 0 || before.down[s] || !after.down[s]) return;
    const harm = Math.max(hurt.get(i) ?? 0, harmBy('fall', rng));
    hurt.set(i, harm);
    events.push({ kind: 'aftermath', tick: input.tick, ship: input.ship, what: 'man', id: i, harm: HARMS[harm]! });
  });
  return [...hurt].sort((p, q) => p[0] - q[0]).map(([man, harm]) => man * HARMS.length + harm);
}
