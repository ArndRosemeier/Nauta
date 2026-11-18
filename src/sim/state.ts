/**
 * The match as one value (implementation plan N3.1): everything the simulation knows, as plain data that can be sent,
 * saved, compared and hashed. No simulation state lives anywhere else; what a module keeps beside it (the wind's
 * derived field, the ship's body) is a cache of a pure function of it. `step` (step.ts) moves it on. Pure.
 *
 * The clock is a whole count of steps (`tick`), so every machine agrees on the time to the bit: the time in seconds
 * is worked out from it, never added up step by step.
 */
import { deriveSeed } from '@futuremagic/core';
import { decode, encode, hashBytes } from './codec';
import { startSea, type SeaState } from './sea/sea';
import { startOrders, type ShipOrders } from './orders';
import { openShip, type Closures } from './crew/closures';
import { startCrew, type Crew } from './crew/crew';
import { startGuns, type Battery } from './guns/guns';
import { startDamage, type Damage, type Flying } from './damage';
import { startFight, type Fight } from './end';
import { startMotion, type ShipMotion } from './ship/motion';
import { startSailing, type Sailing } from './ship/sailing';
import { START_CANVAS, type CanvasName } from './rules/sailing';
import { STEPS_PER_SECOND } from './units';
import { makeWind, meanWind, windAt, type WindState } from './wind';

/** One ship of the match: how she lies on the water (motion.ts owns it), how she sails (sailing.ts), what she has been told (orders.ts), her crew at work (crew/crew.ts), what is shut aboard her (crew/closures.ts), her guns (guns/guns.ts) and what shot has done to her (damage.ts). */
export interface SimShip {
  /** The side she fights for: ships of one side are friends, those of every other side her enemies (foes.ts). Made once by `startMatch`. */
  readonly side: number;
  readonly motion: ShipMotion;
  /** Her heading, way, helm, canvas and yards: the sailing model's state. */
  readonly sailing: Sailing;
  /** What she has been told to do and what of it the crew has still to do (orders.ts owns it). */
  readonly told: ShipOrders;
  /** Every man's task and where he is (crew/crew.ts owns it). */
  readonly crew: Crew;
  /** The ways through her that are shut (crew/closures.ts owns it). */
  readonly closures: Closures;
  /** Her guns through their drill, packed in battery order (guns/guns.ts owns them; `gunAt` reads one). */
  readonly guns: Battery;
  /** Her holes, lines cut, spars wounded, sails holed and men hurt (damage.ts owns it). */
  readonly damage: Damage;
  /** How well her gun crews are drilled: their pace at the guns, set at the start (`ShipStart.drill`) and never changed. */
  readonly drill: number;
  /** The powder smoke about her as her gun captains see it, 0 clear to 1 thick (guns/smoke.ts owns it). */
  readonly smoke: number;
}

/** The whole match. Changed only by `step` (and made by `startMatch`); rules.json `owners` names each field's owner. */
export interface SimState {
  /** The seed every random number of the match comes from. */
  readonly matchSeed: number;
  /** Steps since the match began (30 a second); the shared clock is `simTime`. */
  readonly tick: number;
  /** The true wind over the fight (wind.ts); fixed for the match, its swings and gusts are a function of time. */
  readonly wind: WindState;
  /** The sea (sea/sea.ts): it follows the wind's mean, taking a new wave set now and then. */
  readonly sea: SeaState;
  /** The ships, each known by its place in this list (orders name a ship by it). */
  readonly ships: readonly SimShip[];
  /** The shots on their way: which gun fired each and when, and what each ball has spent (damage.ts owns them). */
  readonly flying: readonly Flying[];
  /** How the fight stands: when the light fails, who is beaten, and its end once over (end.ts owns it). */
  readonly fight: Fight;
  /** The game minute of the day (0 to 1,439) at tick 0 in the sandbox, whose crew keeps the day's watches (day.ts), or null: a fight or duel has no day clock. */
  readonly dayStart: number | null;
}

/**
 * Where a ship is put on the water at the start: her centre (x, z, m) and her heading (compass bearing, rad); her way
 * ahead (m/s, still if not given) and her canvas (battle sail if not given).
 */
export interface ShipStart {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  readonly speed?: number;
  readonly canvas?: CanvasName;
  /** How well her gun crews are drilled, their pace at the guns (1 if not given: a player's crew; a computer captain's by his skill, captain.ts `crewedBy`). */
  readonly drill?: number;
  /** The side she fights for (any whole number; ships of one are friends); her place in the list if not given, so every ship is her own side and a duel is two sides. */
  readonly side?: number;
}

/** What a match starts from. How the ships are placed (distance, who has the wind) is the caller's: an open design question. */
export interface MatchSetup {
  readonly seed: number;
  /** The wind's force on the Beaufort scale (a row of rules/wind.ts) and the bearing it blows from, rad. */
  readonly windForce: number;
  readonly windFrom: number;
  readonly ships: readonly ShipStart[];
  /** How long the match may last before it is drawn, minutes (a match setting; rules/end.ts `MATCH_MINUTES` if not given). */
  readonly minutes?: number;
  /** The sandbox's day clock: the game minute of the day the match starts at (day.ts); none: a fight, with no day clock. */
  readonly dayStart?: number;
}

/** The shared clock of a state, s: the time the next step starts at. */
export function simTime(state: SimState): number {
  return state.tick / STEPS_PER_SECOND;
}

/** A match at its first moment: the wind made from the seed, the sea already up under it, each ship still on her line. */
export function startMatch(setup: MatchSetup): SimState {
  const seed = setup.seed >>> 0;
  const wind = makeWind(deriveSeed(seed, 'wind'), setup.windForce, setup.windFrom);
  const { speed, toward } = meanWind(wind, 0);
  return {
    matchSeed: seed,
    tick: 0,
    wind,
    sea: startSea(deriveSeed(seed, 'sea'), { speed, toward }, 0),
    ships: setup.ships.map((s, i) => ({
      side: s.side ?? i,
      motion: startMotion(s.x, s.z, s.heading),
      sailing: startSailing(s, windAt(wind, s.x, s.z, 0), setup.windForce),
      told: startOrders(s.heading, s.canvas ?? START_CANVAS),
      crew: startCrew(),
      closures: openShip(),
      guns: startGuns(),
      damage: startDamage(),
      drill: s.drill ?? 1,
      smoke: 0,
    })),
    flying: [],
    fight: startFight(setup.ships.length, setup.minutes),
    dayStart: setup.dayStart ?? null,
  };
}

/** A state as bytes (codec.ts): what the host sends and a save holds. */
export function encodeState(state: SimState): Uint8Array {
  return encode(state);
}

/** Bytes back to the state they were made from, bit for bit; fails on bytes that are not a state. */
export function decodeState(bytes: Uint8Array): SimState {
  const value = decode(bytes) as Partial<SimState> | null;
  if (!value || typeof value !== 'object' || typeof value.tick !== 'number' || !Array.isArray(value.ships) || !value.sea || !value.wind) {
    throw new TypeError('the bytes do not hold a simulation state');
  }
  return value as SimState;
}

/** The state's hash (64 bits as 16 hex digits): two machines with the same hash have the same state. */
export function hashState(state: SimState): string {
  return hashBytes(encodeState(state));
}
