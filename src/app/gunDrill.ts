/**
 * The gun crews' drill as it is seen (implementation plan N5.4b): what each man at a gun does with his hands and what
 * his face shows, read out of the gun's state. The drill decides it all (sim/guns/guns.ts); this only reads. A man's
 * place in his gun's crew sets his part: her captain behind her, the two at her muzzle who sponge, load and ram, and the
 * two at her tackles who run her out and in. Pure.
 *
 * - **Hands:** `GUN_CLIPS` is the table from the drill's step and the man's part to the motion he plays (crewLooks.ts
 *   `PACK_CLIPS`). A gun whose crew is too short to work her (rules/guns.ts `FEWEST_AT_GUN`, the pair's whole crew
 *   counting when it serves both her guns) or that is dismounted stands to: nothing moves, so nobody pulls.
 * - **Faces** (app/faces.ts): the men strain at the work that takes their strength; when she fires, her captain cries the
 *   word and the rest flinch at the report, by the seconds since she fired.
 */
import { FEWEST_AT_GUN, type DrillStep } from '../sim/rules/guns';
import type { SimShip } from '../sim/state';
import type { Man } from '../sim/crew/roster';
import { outOf } from '../sim/damage';
import { battery, drillSeconds, gunAt, gunRow, handsAtGuns, servedBy } from '../sim/guns/guns';
import { pairHands } from '../sim/guns/gunnery';

/** A man's part in a gun's crew: her captain (place 1), the two at her muzzle (2, 3) and the two at her tackles (4, 5). */
export type Part = 'captain' | 'muzzle' | 'tackles';

/** The part of the `place`-th man of a gun's crew. */
export const partOf = (place: number): Part => (place <= LAST_CAPTAIN ? 'captain' : place <= LAST_MUZZLE ? 'muzzle' : 'tackles');
const LAST_CAPTAIN = 1;
const LAST_MUZZLE = 3;

/**
 * What each part plays in each step of the drill: the captain crouches behind her to lay her once she is run out, the
 * muzzle men sponge, hand the cartridge and ram, the tackle men heave her out and haul her in again. Everyone else
 * stands to (null).
 */
export const GUN_CLIPS: Readonly<Record<DrillStep, Readonly<Record<Part, string | null>>>> = {
  housed: { captain: null, muzzle: null, tackles: null },
  loading: { captain: null, muzzle: 'pick up', tackles: 'interact' },
  ramming: { captain: null, muzzle: 'push', tackles: null },
  loaded: { captain: null, muzzle: null, tackles: null },
  'running-out': { captain: 'interact', muzzle: 'push', tackles: 'push' },
  ready: { captain: 'crouch', muzzle: null, tackles: null },
  recoil: { captain: null, muzzle: null, tackles: null },
  'running-in': { captain: 'interact', muzzle: 'pick up', tackles: 'pick up' },
  sponging: { captain: null, muzzle: 'interact', tackles: null },
};

/** Every motion the drill plays, for the crowd figures to bake. */
export const GUN_CLIP_NAMES: readonly string[] = [...new Set(Object.values(GUN_CLIPS).flatMap((c) => Object.values(c)).filter((c): c is string => c !== null))];

/** The steps that take the men's strength (a gun's weight run out and in, the rammer): their faces strain. */
const STRAINING: ReadonlySet<DrillStep> = new Set(['ramming', 'running-out', 'running-in']);

/** A man at his gun as the drill has her now. */
export interface GunWork {
  /** The gun (her place in the battery), and the man's part in her crew. */
  readonly gun: number;
  readonly part: Part;
  readonly step: DrillStep;
  /** Her crew is enough to work her: the drill is going on. */
  readonly working: boolean;
  /** Seconds since she fired (the recoil's time gone); Infinity when she has not just fired. */
  readonly sinceFired: number;
}

/** A ship's crew counts at her guns, once for the state (the states are kept whole between steps, so frames reuse it). */
const counted = new WeakMap<SimShip, readonly number[]>();

/** The hands working each gun of `ship`: the men at her, or her pair's whole crew while it serves both guns (gunnery.ts `pairHands`). */
function handsOf(ship: SimShip): readonly number[] {
  let men = counted.get(ship);
  if (!men) counted.set(ship, men = pairHands(handsAtGuns(ship.crew, undefined, outOf(ship.damage))).men);
  return men;
}

/** What man `man` (home place `m.home`) of `ship` is doing at a gun, or null: he is on his way, or at none. */
export function gunWork(ship: SimShip, man: number, m: Man): GunWork | null {
  const served = servedBy(ship.crew.men[man]!, m.home);
  if (!served) return null;
  const g = gunAt(ship.guns, served.gun), row = gunRow(battery()[served.gun]!.gun);
  return {
    gun: served.gun,
    part: partOf(served.place),
    step: g.drill,
    working: !g.dismounted && handsOf(ship)[served.gun]! >= FEWEST_AT_GUN,
    sinceFired: g.drill === 'recoil' ? row.recoil - drillSeconds(g) : Infinity,
  };
}

/** The motion a man at a gun plays: his part's in her step while the drill goes on; null when his part has none then, and he stands to (standBy.ts `standToClip`). The recoil goes on without the men. */
export const gunClip = (w: GunWork): string | null => GUN_CLIPS[w.working || w.step === 'recoil' ? w.step : 'housed'][w.part];

/** Whether the man's work takes his strength now: ramming, running her out and in. */
export const gunStrains = (w: GunWork): boolean => w.working && STRAINING.has(w.step);
