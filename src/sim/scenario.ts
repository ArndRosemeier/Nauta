/**
 * The scenario (Arnd 2026-11-18, "one dialog where everything can be set up"; staged in docs/design/scenarios.md): which
 * ships are in the match, the side each fights for, the navy that dresses her, and who commands her: the player on this
 * machine ("you"), another player who joins a room ("player"), or a computer captain at a skill. Up to eight ships and
 * four sides (design thread 2026-11-18: up to 4 sides, every ship its own side allowed). Pure data and pure edits: the
 * dialog (app/menu.ts) edits it, the room carries it, `fleetStart` (start.ts) places it, and `limitOf` says what the
 * simulation and the page can run of it yet, so lifting a limit is one change in one place.
 */
import { isRecord, oneOf } from './kept';
import { SKILLS, type Offered } from './rules/captain';
import { apartOnWater, wrapBearing } from './units';
import type { Placed } from './start';

/** The most ships a match holds and the most sides they fight for. */
export const MOST_SHIPS = 8;
export const MOST_SIDES = 4;
/** The fewest ships a scenario has: one to fight and one to fight against. */
export const LEAST_SHIPS = 2;

/** The navies (nauta-plan.md, "Which navies?": British against French around 1800, the same hull in two coats): dress and names only. */
export const NAVIES = ['british', 'french'] as const;
export type Navy = (typeof NAVIES)[number];

/** Who commands a ship: you (the player on this machine), a player who joins, or a computer captain. */
export type Command =
  | { readonly kind: 'you' }
  | { readonly kind: 'player' }
  | { readonly kind: 'computer'; readonly skill: Offered };

export interface ScenarioShip {
  /** The side she fights for, 0 up to `MOST_SIDES` - 1. Ships of one side are friends; every other side is the enemy. */
  readonly side: number;
  /** The navy that dresses her when it is not her side's (design thread: set per side, overridable per ship); null: her side's. */
  readonly navy: Navy | null;
  readonly command: Command;
  /** Where the placement map put her, in the wind's frame (start.ts `Placed`); null: where the start puts her. Either every ship has one or none (a change to the ships clears them). */
  readonly at: Placed | null;
}

export interface Scenario {
  /** The navy each side wears unless a ship says otherwise, by side. */
  readonly sideNavies: readonly Navy[];
  /** The ships in the order the match numbers them (ship 0 first); a computer's skill or a player's seat goes with the ship. */
  readonly ships: readonly ScenarioShip[];
}

const computer = (skill: Offered): Command => ({ kind: 'computer', skill });
const ship = (side: number, command: Command): ScenarioShip => ({ side, navy: null, command, at: null });

/** The navy each side wears to start with: the first two sides are the duel's, the others alternate. */
const SIDE_NAVIES: readonly Navy[] = ['british', 'french', 'british', 'french'];

/** You against a computer captain at the middle skill: the default, so one tap starts a match. */
export const DEFAULT_SCENARIO: Scenario = { sideNavies: SIDE_NAVIES, ships: [ship(0, { kind: 'you' }), ship(1, computer('seasoned'))] };

/** The scenarios the dialog offers to start from (the old Fight alone, Host a duel and Watch a battle, and a fleet action). */
export type PresetName = 'alone' | 'room' | 'watch' | 'fleets';
export const PRESET_NAMES: readonly PresetName[] = ['alone', 'room', 'watch', 'fleets'];
export const PRESETS: Readonly<Record<PresetName, Scenario>> = {
  alone: DEFAULT_SCENARIO,
  room: { sideNavies: SIDE_NAVIES, ships: [ship(0, { kind: 'you' }), ship(1, { kind: 'player' })] },
  watch: { sideNavies: SIDE_NAVIES, ships: [ship(0, computer('seasoned')), ship(1, computer('seasoned'))] },
  fleets: {
    sideNavies: SIDE_NAVIES,
    ships: [ship(0, { kind: 'you' }), ship(0, computer('seasoned')), ship(0, computer('green')), ship(1, computer('master')), ship(1, computer('seasoned')), ship(1, computer('seasoned'))],
  },
};

/** The navy that dresses ship `i`. */
export const navyOfShip = (sc: Scenario, i: number): Navy => sc.ships[i]?.navy ?? sc.sideNavies[sc.ships[i]?.side ?? 0] ?? 'british';

/** The sides that have a ship, in the order they first appear: the order the start places them. */
export function sidesIn(sc: Scenario): number[] {
  return [...new Set(sc.ships.map((s) => s.side))];
}

/** The ship the player on this machine commands, or -1. */
export const youShip = (sc: Scenario): number => sc.ships.findIndex((s) => s.command.kind === 'you');
/** The skill of each ship's computer captain in the match's order; null for a ship a person commands (you or a player who joins). */
export const skillsOf = (sc: Scenario): (Offered | null)[] => sc.ships.map((s) => (s.command.kind === 'computer' ? s.command.skill : null));
/** The side of each ship in the match's order. */
export const sidesOfShips = (sc: Scenario): number[] => sc.ships.map((s) => s.side);
/** The ships other players will command. */
export const playerShips = (sc: Scenario): number[] => sc.ships.flatMap((s, i) => (s.command.kind === 'player' ? [i] : []));

// ---- edits (each returns a new scenario) ----

const unplaced = (s: ScenarioShip): ScenarioShip => (s.at === null ? s : { ...s, at: null });

/** A ship added: on the side with the fewest ships, a seasoned computer captain; none past `MOST_SHIPS`. */
export function addShip(sc: Scenario): Scenario {
  if (sc.ships.length >= MOST_SHIPS) return sc;
  const used = sidesIn(sc), counts = used.map((side) => sc.ships.filter((s) => s.side === side).length);
  const side = used.length < 2 ? (used[0] === 0 ? 1 : 0) : used[counts.indexOf(Math.min(...counts))]!;
  return { ...sc, ships: [...sc.ships.map(unplaced), ship(side, computer('seasoned'))] };
}

/** Ship `i` taken out; never below `LEAST_SHIPS`. */
export function removeShip(sc: Scenario, i: number): Scenario {
  return sc.ships.length <= LEAST_SHIPS || !sc.ships[i] ? sc : { ...sc, ships: sc.ships.filter((_, k) => k !== i).map(unplaced) };
}

function edit(sc: Scenario, i: number, to: Partial<ScenarioShip>): Scenario {
  return sc.ships[i] ? { ...sc, ships: sc.ships.map((s, k) => (k === i ? { ...s, ...to } : s)) } : sc;
}

/** Ship `i` goes to side `side`. */
export const setSide = (sc: Scenario, i: number, side: number): Scenario =>
  (side >= 0 && side < MOST_SIDES && sc.ships[i] ? { ...sc, ships: sc.ships.map((s, k) => unplaced(k === i ? { ...s, side } : s)) } : sc);

/** Ship `i` is dressed in `navy`: her side's own clears the override. */
export function setNavy(sc: Scenario, i: number, navy: Navy): Scenario {
  const s = sc.ships[i];
  return s ? edit(sc, i, { navy: sc.sideNavies[s.side] === navy ? null : navy }) : sc;
}

/** Side `side` wears `navy`: every ship of it with no navy of her own follows. */
export function setSideNavy(sc: Scenario, side: number, navy: Navy): Scenario {
  return side >= 0 && side < MOST_SIDES ? { ...sc, sideNavies: sc.sideNavies.map((n, k) => (k === side ? navy : n)) } : sc;
}

/** Ship `i` commanded by `command`; only one ship is yours, so another that was yours becomes a seasoned computer's. */
export function setCommand(sc: Scenario, i: number, command: Command): Scenario {
  if (!sc.ships[i]) return sc;
  const ships = sc.ships.map((s, k) => (k === i ? { ...s, command } : command.kind === 'you' && s.command.kind === 'you' ? { ...s, command: computer('seasoned') } : s));
  return { ...sc, ships };
}

/** The fewest metres two ships may be put apart by hand: a hull's length and a little more, so no match starts with them touching. */
export const LEAST_APART = 60;

/** Ship `i` put at `to`; the first ship put by hand freezes every other ship where `defaults` (the start's own places) has her, so a hand-made layout is whole. */
export function setPlace(sc: Scenario, i: number, to: Placed, defaults: readonly Placed[]): Scenario {
  if (!sc.ships[i]) return sc;
  const whole = (p: Placed | undefined): Placed | null => (p ? { x: Math.round(p.x), z: Math.round(p.z), heading: p.heading } : null);
  const ships = sc.ships.map((s, k) => (k === i ? { ...s, at: to } : { ...s, at: s.at ?? whole(defaults[k]) }));
  return { ...sc, ships };
}

/** Every ship back where the start puts her. */
export const resetPlaces = (sc: Scenario): Scenario => (sc.ships.some((s) => s.at !== null) ? { ...sc, ships: sc.ships.map(unplaced) } : sc);

/** Whether any ship was put by hand. */
export const isPlaced = (sc: Scenario): boolean => sc.ships.some((s) => s.at !== null);

/** The ships' places as the start takes them (by ship, null where she is not put by hand). */
export const placesOf = (sc: Scenario): (Placed | null)[] => sc.ships.map((s) => s.at);

// ---- what runs ----

/** Why a scenario cannot be started yet: forever (`one side`: nobody to fight), or only while a stage is unbuilt. */
export type Limit = 'one side' | 'too close' | 'more ships' | 'same navy' | 'host ship';

/**
 * Why the simulation and the page cannot run this scenario yet, or null when they can. Stage 1 of the scenarios runs
 * what the duel runs: two ships of two sides in the two navies, you or a computer on each, or a player's seat for a
 * room; every later stage lifts one of these (docs/design/scenarios.md).
 */
export function limitOf(sc: Scenario): Limit | null {
  if (sidesIn(sc).length < 2) return 'one side';
  const at = sc.ships.map((s) => s.at);
  for (let i = 0; i < at.length; i++) for (let j = i + 1; j < at.length; j++) if (at[i] && at[j] && apartOnWater(at[i]!, at[j]!) < LEAST_APART) return 'too close';
  if (sc.ships.length > LEAST_SHIPS) return 'more ships';
  if (navyOfShip(sc, 0) === navyOfShip(sc, 1)) return 'same navy';
  if (playerShips(sc).length > 0 && youShip(sc) < 0) return 'host ship';
  return null;
}

/** What starting it means: a match played alone against a computer captain, one watched, a room opened for players. */
export type Play = 'alone' | 'watch' | 'room';
export function playOf(sc: Scenario): Play {
  if (playerShips(sc).length > 0) return 'room';
  return youShip(sc) >= 0 ? 'alone' : 'watch';
}

/** The scenario with the ship you command first (the duel runs the player's ship as ship 0); the others keep their order. */
export function youFirst(sc: Scenario): Scenario {
  const me = youShip(sc);
  return me <= 0 ? sc : { ...sc, ships: [sc.ships[me]!, ...sc.ships.filter((_, k) => k !== me)] };
}

// ---- kept on the device, and in a room ----

const COMMANDS = ['you', 'player', 'computer'] as const;

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** The farthest a ship may be put from the middle, m (the map's edge). */
export const MOST_FAR = 4000;
function readPlaced(k: unknown): Placed | null {
  if (!isRecord(k) || !num(k.x) || !num(k.z) || !num(k.heading) || apartOnWater({ x: k.x, z: k.z }, { x: 0, z: 0 }) > MOST_FAR) return null;
  return { x: k.x, z: k.z, heading: wrapBearing(k.heading) };
}

function readShip(k: unknown): ScenarioShip | null {
  if (!isRecord(k) || !isRecord(k.command)) return null;
  const side = typeof k.side === 'number' && Number.isInteger(k.side) && k.side >= 0 && k.side < MOST_SIDES ? k.side : 0;
  const kind = oneOf(k.command.kind, COMMANDS, 'computer');
  return { side, navy: NAVIES.includes(k.navy as Navy) ? (k.navy as Navy) : null, command: kind === 'computer' ? computer(oneOf(k.command.skill, SKILLS, 'seasoned')) : { kind }, at: readPlaced(k.at) };
}

/** A scenario from whatever was kept (or came in a room's meta): each part wrong falls back to the default; never more than eight ships, always at least two, never two of yours, and ships put by hand all or none. */
export function readScenario(kept: unknown): Scenario {
  const k = isRecord(kept) ? kept : {};
  const ships = (Array.isArray(k.ships) ? k.ships : []).slice(0, MOST_SHIPS).map(readShip).filter((s): s is ScenarioShip => s !== null);
  if (ships.length < LEAST_SHIPS) return DEFAULT_SCENARIO;
  const sideNavies = SIDE_NAVIES.map((d, i) => oneOf(Array.isArray(k.sideNavies) ? k.sideNavies[i] : null, NAVIES, d));
  let mine = false;
  const all = ships.every((s) => s.at !== null);
  return { sideNavies, ships: ships.map((s) => (all ? s : unplaced(s))).map((s) => (s.command.kind !== 'you' ? s : mine ? { ...s, command: computer('seasoned') } : ((mine = true), s))) };
}
