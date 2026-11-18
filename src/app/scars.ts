/**
 * A stand-in for a fight's damage (`?scars=3`, plan N6.5): her timber and canvas shot about, seeded, as a broadside or
 * two at close range would leave her, so the damage drawn can be looked at without fighting a match first. It is made
 * as the simulation keeps damage (damage.ts `holeCode`, `startDamage`) and only drawn: no match ever holds it.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import { holeCode, startDamage, type Damage } from '../sim/damage';
import { SMASHED, STOVE_IN } from '../sim/rules/damage';
import { shipPlan, type Cell } from '../sim/ship/plan';
import { rigPlan } from '../sim/ship/rig';
import type { ShotKind } from '../sim/rules/guns';
import type { GunKind } from '../sim/rules/ships';

/** How many of each: single holes in her side, her bulwarks and her weather deck; bulwark sections smashed out; panels stove in. */
const SCARS = { side: 24, bulwark: 8, deck: 6, smashed: 2, stove: 1 } as const;
/** Her side's holes lie in planking panels starting above this share of her girth (the part of her side a broadside strikes). */
const SIDE_FROM = 0.45;
/** Shot holes in a sail, at most, and the sail split by its holes (enough of them). */
const SAIL_HOLES = 5;
const SPLIT_HOLES = 30;
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
  return { ...startDamage(), holes: [...new Set(holes)].sort((a, b) => a - b), rent };
}
