/**
 * A stand-in for a fight's damage (`?scars=3`, plan N6.5): her timber and canvas shot about, seeded, as a broadside or
 * two at close range would leave her, a spar gone over the side and a fire, so the damage drawn can be looked at without fighting a match first. It is made
 * as the simulation keeps damage (damage.ts `holeCode`, `startDamage`) and only drawn: no match ever holds it.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import { holeCode, startDamage, type Damage } from '../sim/damage';
import { FALLS_AT_PART, SMASHED, STOVE_IN } from '../sim/rules/damage';
import { sparParts } from '../sim/damage/meet';
import { shipPlan, type Cell } from '../sim/ship/plan';
import { rigPlan } from '../sim/ship/rig';
import type { ShotKind } from '../sim/rules/guns';
import type { GunKind } from '../sim/rules/ships';
import { toWorld, type ShipPose } from '../sim/ship/motion';

/** How many of each: single holes in her side, her bulwarks and her weather deck; bulwark sections smashed out; panels stove in. */
const SCARS = { side: 24, bulwark: 8, deck: 6, smashed: 2, stove: 1 } as const;
/** Her side's holes lie in planking panels starting above this share of her girth (the part of her side a broadside strikes). */
const SIDE_FROM = 0.45;
/** Shot holes in a sail, at most, and the sail split by its holes (enough of them). */
const SAIL_HOLES = 5;
const SPLIT_HOLES = 30;
/** The spar each ship has lost over her starboard side, still lying alongside: her own the fore topmast, the other's her mainmast. */
const LOST = ['fore-topmast', 'main-mast'] as const;
/** A fire in each: hers in the messdeck holding most of it (flames out at the fore hatch), the other's young in her cabin. */
const BURNING = [['messdeck', 0.6], ['cabin', 0.25]] as const;
/** Water in each, t larboard and starboard: hers a quarter of a metre over her hold's floor (under the eye there), more to starboard; the other's under her floors. */
const FLOODED: readonly (readonly [number, number])[] = [[25, 35], [10, 12]];
/** One hole in this many lodged. */
const LODGED_ONE_IN = 5;
/** The balls the holes are made by, in turn. */
const BALLS: readonly (readonly [ShotKind, GunKind])[] = [['round', 'carronade'], ['round', 'long6'], ['grape', 'carronade']];

/** Ship `ship`'s stand-in damage for seed `seed`. */
export function scarsOf(seed: number, ship: number): Damage {
  const rng = new Rng(deriveSeed(seed, 'scars', ship)), cells = shipPlan().cells;
  const pick = (list: readonly Cell[]): Cell => list[Math.floor(rng.float() * list.length)]!;
  const holes: number[] = [];
  const hole = (c: Cell, k: number) => {
    const [shot, gun] = BALLS[k % BALLS.length]!;
    holes.push(holeCode(c.id, rng.float() * (c.fore - c.aft), rng.float() * (c.to - c.from), shot, gun, rng.float() * LODGED_ONE_IN < 1));
  };
  // Her starboard side, the one the standpoints off her look at.
  const side = 1;
  const planking = cells.filter((c) => c.kind === 'planking' && c.side === side);
  const upper = planking.filter((c) => c.from >= Math.max(...planking.map((p) => p.to)) * SIDE_FROM);
  const bulwarks = cells.filter((c) => c.kind === 'bulwark' && c.side === side);
  const decks = cells.filter((c) => c.kind === 'deck' && c.level === 'weather');
  for (let k = 0; k < SCARS.side; k++) hole(pick(upper.length ? upper : planking), k);
  for (let k = 0; k < SCARS.bulwark; k++) hole(pick(bulwarks), k);
  for (let k = 0; k < SCARS.deck; k++) hole(pick(decks), k);
  for (let s = 0; s < SCARS.smashed; s++) { const c = pick(bulwarks); for (let k = 0; k < SMASHED; k++) hole(c, 0); }
  for (let s = 0; s < SCARS.stove; s++) { const c = pick(upper.length ? upper : planking); for (let k = 0; k < STOVE_IN; k++) hole(c, 0); }
  const sails = rigPlan().sails, split = Math.floor(rng.float() * sails.length);
  const rent = sails.map((_, i) => (i === split ? SPLIT_HOLES : Math.floor(rng.float() * (SAIL_HOLES + 1))));
  // Broken where a spar pulled over breaks, lying alongside on her starboard side (part × 2 + 1, damage.ts `alongside`).
  const part = sparParts().findIndex((p) => p.spar === LOST[ship % LOST.length]) + FALLS_AT_PART;
  const [space, size] = BURNING[ship % BURNING.length]!;
  const fires = [{ space: shipPlan().spaces.findIndex((s) => s.id === space), size }];
  return { ...startDamage(), holes: [...new Set(holes)].sort((a, b) => a - b), rent, fallen: [part], alongside: [part * 2 + 1], fires, flooded: FLOODED[ship % FLOODED.length]! };
}

/** Going down (`?down`): she lies this far off her starboard beam, m; settles at this most, m/s, reached over this long, s, and goes down by the head this much, rad/s, to this most, rad. */
const SINKS = { off: 90, most: 0.3, gathers: 30, byHead: 0.004, mostByHead: 0.2 } as const;

/**
 * A stand-in for the other ship foundered and going down (`?sail&down`, plan N6.5): lying off her starboard beam
 * (`mine`, her pose; `hers`, the other's as the match has her, for her motion), settling ever faster and going down
 * by the head, `since` s after she began. Only drawn: the match never holds it.
 */
export function goingDown(mine: ShipPose, hers: ShipPose, since: number): ShipPose {
  const s = Math.max(0, since), gathered = Math.min(s, SINKS.gathers), at = toWorld(mine, SINKS.off, 0, 0);
  const fallen = (SINKS.most * gathered * gathered) / (2 * SINKS.gathers) + SINKS.most * (s - gathered);
  return { ...hers, x: at[0], z: at[2], heading: mine.heading, heave: hers.heave - fallen, pitch: hers.pitch - Math.min(SINKS.mostByHead, SINKS.byHead * s) };
}
