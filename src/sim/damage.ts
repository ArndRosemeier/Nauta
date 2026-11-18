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
 * Chain reaches lines, sails and spars `CHAIN_BITE` times as far. The flight itself does not slow for what the ball
 * went through (the spent punch is kept instead), so a ball through her goes on to its splash as it was flying.
 *
 * Seeded per ball and step (the match, the gun, the tick she fired, the ball, the step), so every machine does the same
 * damage. The captain is not in the simulation and is never hit; the `hit` events say where every ball went
 * through her, for the drawing (N6.5: holes, splinters, the captain staggered) and the sound (N6.8).
 */
import { deriveSeed, Rng } from '@futuremagic/core';
import { meetings, nearHer, type Aboard, type Meeting, type Place, type TimberPart } from './damage/meet';
import { manAt, type Crew } from './crew/crew';
import { brigRoster, type Man } from './crew/roster';
import { battery, dismountGun, gunAt, gunCount, type Battery } from './guns/guns';
import type { GunFired, Shot, Vec } from './guns/shot';
import {
  CHAIN_BITE, FIR_AS_OAK, GLANCING, GUN_AS_OAK, HARMS, HOLE_GRID, HURT, LEAST_PUNCH, LODGED_SPLINTERS, MAN_AS_OAK, PIERCE, SMASHED,
  SPLINTER_CONE, SPLINTER_REACH, SPLINTER_STRIKE, STOVE_IN, TIMBER, type Harm, type HurtBy,
} from './rules/damage';
import { SHOT, PATH_STEP, type ShotKind } from './rules/guns';
import { LOAD_WATERLINE, type GunKind } from './rules/ships';
import { toShip, type ShipPose } from './ship/motion';
import type { Cell } from './ship/plan';
import { rigPlan } from './ship/rig';
import { sailShare, type SailSetting } from './ship/sails';
import { STEP_SECONDS } from './units';

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
  /** A hole through her timber, a ball lodged in it, splinters flying, a gun dismounted, a man struck, a spar wounded, a line cut, a sail holed. */
  readonly what: 'hole' | 'lodged' | 'splinters' | 'gun' | 'man' | 'spar' | 'line' | 'sail';
  /** Where in her (along, across, height above her base, m). */
  readonly at: Place;
  /** The cell (-1: none kept there), gun, man, spar part, line or sail. */
  readonly id: number;
  /** A hole's or a lodged ball's timber; a man's hurt and what struck him. */
  readonly part?: TimberPart;
  readonly harm?: Harm;
  readonly cause?: HurtBy;
}

/** A ship as nothing has struck her yet. */
export function startDamage(): Damage {
  return { holes: [], cut: [], wounds: [], rent: rigPlan().sails.map(() => 0), hurt: [] };
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

function holeCode(cell: number, u: number, v: number, shot: ShotKind, gun: GunKind, lodged: boolean): number {
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

/** A ball's place on its path `time` seconds after firing (straight between its points; the last point is where it ended). */
function pathAt(path: readonly Vec[], ends: number, time: number): Vec {
  const last = path.length - 1, t = Math.min(time, ends), f = t / PATH_STEP, i = Math.min(last - 1, Math.floor(f));
  if (last < 1) return path[0]!;
  const a = path[i]!, b = path[i + 1]!, span = i + 1 === last ? Math.max(ends - i * PATH_STEP, STEP_SECONDS / MM) : PATH_STEP;
  const k = Math.min(1, Math.max(0, (t - i * PATH_STEP) / span));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
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
  battery: Battery;
  aboard: Aboard | null;
  touched: boolean;
}

/** A ship's damage and guns opened up for change. */
function opened(s: HitShip): Working {
  const d = s.damage;
  return {
    holes: [...d.holes], cut: new Set(d.cut), wounds: [...d.wounds], rent: [...d.rent],
    hurt: new Map(d.hurt.map((h) => [Math.floor(h / HARMS.length), h % HARMS.length])), battery: s.guns, aboard: null, touched: false,
  };
}

/** What of a ship can be met now (her men's places, her mounted guns, how far each sail is set), worked out when a ball first comes near her. */
function aboardOf(s: HitShip, w: Working, roster: readonly Man[]): Aboard {
  if (w.aboard) return w.aboard;
  const men = s.crew.men.map((hand, i) => {
    if (w.hurt.get(i) === HARMS.indexOf('killed')) return null;
    const { spot, height } = manAt(hand, roster[i]!.post);
    return [spot.along, spot.across, height] as Place;
  });
  const mounted = Array.from({ length: gunCount(w.battery) }, (_, i) => !gunAt(w.battery, i).dismounted);
  w.aboard = { men, mounted, sails: s.canvas.map(sailShare) };
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
    damage: work.map((w, i) => (w?.touched ? freeze(w) : input.ships[i]!.damage)),
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
  input.ships.forEach((s, j) => {
    if (j === f.by || punch <= 0) return;
    const pa = placeIn(s.pose, a), pe = placeIn(s.pose, e);
    if (!nearHer(pa, pe)) return;
    const w = (work[j] ??= opened(s)), aboard = aboardOf(s, w, roster);
    const d: Place = [pe[0] - pa[0], pe[1] - pa[1], pe[2] - pa[2]];
    for (const m of meetings(pa, pe, reach, aboard)) {
      if (punch <= 0) break;
      const event = { kind: 'hit', tick: input.tick, ship: j, by: f.by, gun: f.gun, at: m.at } as const;
      punch = meet(m, punch, { shot, gun, rng, w, d, events, event });
    }
  });
  return punch;
}

/** What a meeting is done with. */
interface MeetWith {
  readonly shot: ShotKind;
  readonly gun: GunKind;
  readonly rng: Rng;
  readonly w: Working;
  readonly d: Place;
  readonly events: Hit[];
  readonly event: Pick<Hit, 'kind' | 'tick' | 'ship' | 'by' | 'gun' | 'at'>;
}

/** One meeting done: its effect on her, and the ball's punch after it. */
function meet(m: Meeting, punch: number, c: MeetWith): number {
  const { w, events, event } = c;
  switch (m.kind) {
    case 'timber': {
      const thick = TIMBER[m.part] / Math.max(m.cos, GLANCING), through = punch > thick;
      w.touched = true;
      if (m.cell) w.holes.push(holeCode(m.cell.id, m.u, m.v, c.shot, c.gun, !through));
      events.push({ ...event, what: through ? 'hole' : 'lodged', id: m.cell?.id ?? GONE, part: m.part });
      splinters(m.at, c, through ? 1 : LODGED_SPLINTERS);
      return through ? punch - thick : 0;
    }
    case 'gun':
      if (punch >= LEAST_PUNCH.gun && w.aboard?.mounted[m.gun]) {
        w.battery = dismountGun(w.battery, m.gun);
        (w.aboard.mounted as boolean[])[m.gun] = false;
        w.touched = true;
        events.push({ ...event, what: 'gun', id: m.gun });
      }
      return punch - GUN_AS_OAK;
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
  }
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

/** One ship's working damage as plain data for the state. */
function freeze(w: Working): Damage {
  return {
    holes: w.holes,
    cut: [...w.cut].sort((p, q) => p - q),
    wounds: [...w.wounds].sort((p, q) => p - q),
    rent: w.rent,
    hurt: [...w.hurt].sort((p, q) => p[0] - q[0]).map(([man, harm]) => man * HARMS.length + harm),
  };
}
