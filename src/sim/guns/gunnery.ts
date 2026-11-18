/**
 * The gunnery orders carried out (pure, implementation plan N5.3a): each step, what every gun crew of a ship is to do
 * from what she has been told (orders.ts: at quarters, the shot, the aim, how she fires, the captain's word) and where
 * the enemy lies, and which guns fire. The one place that decides when a gun fires; guns.ts steps and fires the guns
 * (it owns them), shot.ts makes each shot's flight.
 *
 * - **Not at quarters** the guns stand as they are told by nobody: run in, loaded or not, laid square and level. A ship
 *   not at quarters never fires.
 * - **At quarters** every mounted gun loads the shot ordered (one loaded already keeps what she holds) and runs out.
 *   A gun whose side faces the enemy, with her within the gun's training, is laid on her by its gun captain (`layOn`,
 *   at the part of her the aim names, rules/guns.ts `AIM_HEIGHT`); the others stand square and level.
 * - **Fire as they bear:** a ready gun laid as her captain wants fires when the roll brings her bore onto his
 *   elevation (`bears`), with his timing error; then she reloads and fires again. **Held for the captain's word**, the
 *   ready guns that bear on her fire at his word, at his moment (no timing error), rippling down her side; the word is
 *   spent when every one of them has fired. **Cease firing:** the guns load and stand ready.
 * - At most `RIPPLE` guns of a ship fire in a step, in battery order: a broadside ripples over a few steps.
 *
 * - **The gun crews at quarters** (orders.md): one crew serves a pair of guns. The side that bears on the enemy
 *   (`engagedSide`) is told to the crew (crew.ts), whose gun crews cross the deck to that side's guns on the walk
 *   graph; while neither side bears they stay where they stand. A pair whose men stand at both its guns (both sides
 *   bear, or she made ready before either did and they stand at their posts in the quarter bill) is split: each gun is
 *   worked by the whole crew at `SPLIT_SHARE` of its pace (`pairHands`).
 *
 * Not built yet: shifting a long six to her chase port; her steady heel in the laying (laid as if she lay upright).
 */
import { AIM_HEIGHT, GUNS, LAID_WITHIN, RIPPLE, SHOT, SPLIT_SHARE, type ShotKind } from '../rules/guns';
import { LOAD_WATERLINE } from '../rules/ships';
import type { ShipOrders } from '../orders';
import type { SeaState } from '../sea/sea';
import { hullHalfBreadth } from '../ship/hull';
import { toWorld, type ShipPose } from '../ship/motion';
import type { GunPlace } from '../ship/plan';
import type { Sailing } from '../ship/sailing';
import type { Crew, Engaged } from '../crew/crew';
import { pairOf } from '../crew/roster';
import { battery, cannotFire, fireGun, gunAt, gunCount, handsAtGuns, laidAt, stepGuns, type Battery, type GunWant } from './guns';
import { bears, elevationFor, fireShot, layOn, muzzleAt, trainTo, type GunFired, type Lay, type Vec } from './shot';

/** What a ship's guns are worked from in a step. */
export interface GunneryDeck {
  /** The match's seed, the ship (her place in the match), the step's tick and its time, s. */
  readonly seed: number;
  readonly ship: number;
  readonly tick: number;
  readonly t: number;
  readonly guns: Battery;
  readonly told: ShipOrders;
  /** Her crew after this step's work (who stands at the guns), her sailing (her way, added to her shot) and her pose. */
  readonly crew: Crew;
  /** The men out of the quarter bill (damage.ts `outOf`): not counted at their guns. */
  readonly out?: ReadonlySet<number>;
  readonly sailing: Sailing;
  readonly pose: ShipPose;
  /** The enemy's pose, or null when there is none to fire at. */
  readonly enemy: ShipPose | null;
  readonly sea: SeaState | null;
}

/** A step of the guns: the battery after it, the guns fired (the step's events), and whether the captain's word is spent. */
export interface Gunnery {
  readonly guns: Battery;
  readonly fired: readonly GunFired[];
  readonly spent: boolean;
}

/** What a gun crew wants with nobody at quarters: run in, nothing loaded, square and level. */
const SECURED: GunWant = { load: null, runOut: false, train: 0, elevation: 0 };

/** Whether every gun stands as she does with nobody at quarters (run in, idle, square and level): then a step changes nothing. */
function secured(guns: Battery): boolean {
  for (let i = 0; i < gunCount(guns); i++) {
    const g = gunAt(guns, i);
    if (!g.dismounted && ((g.drill !== 'housed' && g.drill !== 'loaded') || g.trained !== 0 || g.elevated !== 0)) return false;
  }
  return true;
}

/** The point on the enemy the gun captains lay on: her side toward `from`, at her middle, `AIM_HEIGHT` up for the aim. */
export function aimPoint(enemy: ShipPose, from: ShipPose, aim: ShipOrders['aim']): Vec {
  const dx = from.x - enemy.x, dz = from.z - enemy.z, d = Math.hypot(dx, dz) || 1;
  const half = hullHalfBreadth(0, LOAD_WATERLINE);
  return [enemy.x + (dx / d) * half, enemy.heave + AIM_HEIGHT[aim], enemy.z + (dz / d) * half];
}

/** Whether a point lies off a gun's side of her (starboard +1, larboard -1) as she lies at `pose`. */
function offSide(pose: ShipPose, side: number, muzzle: Vec, target: Vec): boolean {
  const out = toWorld(pose, side * (Math.abs(muzzle[0]) + 1), muzzle[1], muzzle[2]), at = toWorld(pose, muzzle[0], muzzle[1], muzzle[2]);
  return (out[0] - at[0]) * (target[0] - at[0]) + (out[2] - at[2]) * (target[2] - at[2]) > 0;
}

/** Whether a gun at `place` bears on `target` as she lies at `pose`: it lies off her side, within the gun's training. */
function bearsOn(pose: ShipPose, place: GunPlace, target: Vec): boolean {
  return offSide(pose, place.side, muzzleAt(place), target) && Math.abs(trainTo(place, pose, target).train) <= GUNS[place.gun].train;
}

/**
 * The side a ship at quarters fights on, for her gun crews (crew.ts): the side (+1 starboard, -1 larboard) whose guns
 * bear on the enemy (some gun of it, as the gun captains lay: `aimPoint`), 'both' when guns of both sides bear on
 * enemies, 'none' when no gun bears on any (no enemy, or none off either side within training).
 */
export function engagedSide(pose: ShipPose, enemies: readonly ShipPose[], aim: ShipOrders['aim']): Engaged {
  const bearing = new Set<number>();
  for (const enemy of enemies) {
    const target = aimPoint(enemy, pose, aim);
    for (const place of battery()) if (!bearing.has(place.side) && bearsOn(pose, place, target)) bearing.add(place.side);
  }
  if (bearing.size === 0) return 'none';
  return bearing.size > 1 ? 'both' : [...bearing][0]!;
}

/**
 * The hands that work each gun and the share of their pace it gets: a pair whose men stand at both its guns is split,
 * so each gun is worked by the pair's whole crew (counted at both) at `SPLIT_SHARE`; otherwise a gun has the men at
 * her, at her full pace (`stepGun`).
 */
export function pairHands(atGuns: readonly number[]): { men: number[]; shares: number[] } {
  const places = battery(), men = [...atGuns], shares = places.map(() => 1);
  places.forEach((place, i) => {
    const j = places.findIndex((o, k) => k !== i && pairOf(o.id) === pairOf(place.id));
    if (j < 0 || atGuns[i] === 0 || atGuns[j] === 0) return;
    men[i] = atGuns[i]! + atGuns[j]!;
    shares[i] = SPLIT_SHARE;
  });
  return { men, shares };
}

/** A step of a ship's guns at the orders she has been told, firing at the enemy where they bear (see the file's head). */
export function stepGunnery(d: GunneryDeck): Gunnery {
  const told = d.told;
  if (!told.quarters && secured(d.guns)) return { guns: d.guns, fired: [], spent: false };
  const places = battery(), { men, shares } = pairHands(handsAtGuns(d.crew, undefined, d.out ?? null));
  const target = d.enemy && told.quarters ? aimPoint(d.enemy, d.pose, told.aim) : null;
  const lays: (Lay | null)[] = places.map(() => null);
  const wants = places.map((place, i): GunWant => {
    if (!told.quarters) return SECURED;
    const g = gunAt(d.guns, i), want: GunWant = { load: told.shot, runOut: true, train: 0, elevation: 0 };
    if (!target || g.dismounted || !offSide(d.pose, place.side, muzzleAt(place), target)) return want;
    const lay = layOn({ seed: d.seed, ship: d.ship, gun: i, tick: d.tick, place, pose: d.pose, shot: g.loadedWith ?? told.shot, heel: 0 }, target);
    if (Math.abs(lay.train) > GUNS[place.gun].train) return want;
    lays[i] = lay;
    return { ...want, train: lay.train, elevation: lay.laid };
  });
  let guns = stepGuns(d.guns, men, wants, shares);
  const fired: GunFired[] = [];
  const word = told.firing === 'hold' && told.word;
  let left = 0;
  if (told.quarters && (told.firing === 'bear' || word)) {
    for (let i = 0; i < places.length; i++) {
      const lay = lays[i], g = gunAt(guns, i), place = places[i]!;
      if (!lay || g.drill !== 'ready' || cannotFire(g, men[i]!)) continue;
      const laid = laidAt(g);
      if (!word) {
        const near = Math.abs(laid.elevation - lay.laid) <= LAID_WITHIN && Math.abs(laid.train - lay.train) <= LAID_WITHIN;
        if (!near || !bears(place, laid.train, laid.elevation, d.pose, lay.elevation)) continue;
      }
      if (fired.length === RIPPLE) { left++; continue; }
      const shot = fireGun(guns, i, men[i]!);
      if (!shot.firing) continue;
      guns = shot.guns;
      const fire = { seed: d.seed, ship: d.ship, gun: i, tick: d.tick, place, firing: shot.firing, pose: d.pose, men: men[i]!, sea: d.sea, t: d.t };
      fired.push({ kind: 'fired', tick: d.tick, ship: d.ship, gun: i, fired: fireShot({ ...fire, going: { ahead: d.sailing.ahead, leeway: d.sailing.leeway }, asTheyBear: !word }) });
    }
  }
  return { guns, fired, spent: word && left === 0 };
}

/** The drum beats while she goes to quarters: told to, and a mounted gun not yet loaded (housed or loading). */
export function beatingToQuarters(told: ShipOrders, guns: Battery): boolean {
  if (!told.quarters) return false;
  return battery().some((_, i) => { const g = gunAt(guns, i); return !g.dismounted && (g.drill === 'housed' || g.drill === 'loading'); });
}

/** Builds every gun's laying table for every shot (about 40 ms each the first time): called while the page loads, so no step pays for it. */
export function warmGunnery(): void {
  for (const kind of new Set(battery().map((p) => p.gun))) for (const shot of Object.keys(SHOT) as ShotKind[]) elevationFor(shot, kind, 1, 0);
}
