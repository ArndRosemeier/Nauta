/**
 * Fire (pure, implementation plan N6.2): where in her a fire burns (the plan's spaces), how it grows and spreads
 * through the ways that join her spaces, how the men fighting it put it out, and when it reaches her powder.
 * damage.ts keeps the fires (`Damage.fires`) and calls these; nothing here changes anything.
 *
 * Growth is a fixed factor a step (rules/damage.ts `FIRE.doubling`), built from + and × only, so every machine burns
 * alike.
 */
import { FIRE, MAGAZINE } from '../rules/damage';
import { floorsUnder, shipPlan } from '../ship/plan';
import { STEPS_PER_SECOND, STEP_SECONDS } from '../units';
import type { Place } from './meet';

/** A fire: the space it burns in (the plan's place) and the share of it alight. */
export interface Fire {
  readonly space: number;
  readonly size: number;
}

/** What a fire step did: the fires after it, the spaces it spread to, the fires put out, and whether her powder caught. */
export interface Burnt {
  readonly fires: Fire[];
  readonly spread: number[];
  readonly out: number[];
  readonly magazine: boolean;
}

/** An unfought fire grows by this factor a step: doubling every FIRE.doubling s (1 + ln 2 / steps, near enough). */
const GROWTH = 1 + Math.LN2 / (FIRE.doubling * STEPS_PER_SECOND);

/** The plan's spaces each joined to (by its ways: doors, ladders, openings), and the magazine's place. */
let joins: { readonly next: readonly (readonly number[])[]; readonly magazine: number } | null = null;
function joined(): NonNullable<typeof joins> {
  if (joins) return joins;
  const plan = shipPlan(), index = new Map(plan.spaces.map((s, i) => [s.id, i]));
  const next = plan.spaces.map(() => new Set<number>());
  for (const w of plan.ways) {
    const a = index.get(w.from.space), b = index.get(w.to.space);
    if (a === undefined || b === undefined || a === b) continue;
    next[a]!.add(b);
    next[b]!.add(a);
  }
  joins = { next: next.map((s) => [...s].sort((p, q) => p - q)), magazine: index.get(MAGAZINE)! };
  return joins;
}

/** The space (plan place) a place in her is in: the one whose floor is highest under it; -1 outside them all. */
export function spaceAt(at: Place): number {
  const plan = shipPlan();
  let best: { space: (typeof plan.spaces)[number]; floor: number } | null = null;
  for (const f of floorsUnder(plan, at[0], at[1])) if (f.floor <= at[2] && (!best || f.floor > best.floor)) best = f;
  return best ? plan.spaces.indexOf(best.space) : -1;
}

/** A fire started in a space (or a burning one fed): the fires with it at FIRE.start at least, by space. */
export function kindled(fires: readonly Fire[], space: number): Fire[] {
  const was = fires.find((f) => f.space === space);
  if (was && was.size >= FIRE.start) return [...fires];
  return [...fires.filter((f) => f.space !== space), { space, size: FIRE.start }].sort((p, q) => p.space - q.space);
}

/**
 * The fires one step on: each grows (to the whole space at most) and is beaten down by the men fighting it (`fighting`
 * by space: each puts out FIRE.put a second), goes out below FIRE.out, and at FIRE.spread catches the spaces joined to
 * it; her powder catches when the magazine's fire reaches FIRE.catch.
 */
export function burnt(fires: readonly Fire[], fighting: (space: number) => number): Burnt {
  const j = joined(), sizes = new Map<number, number>(), spread: number[] = [], out: number[] = [];
  for (const f of fires) {
    const size = Math.min(1, f.size * GROWTH) - fighting(f.space) * FIRE.put * STEP_SECONDS;
    if (size < FIRE.out) { out.push(f.space); continue; }
    sizes.set(f.space, size);
  }
  for (const [space, size] of [...sizes]) {
    if (size < FIRE.spread) continue;
    for (const n of j.next[space]!) if (!sizes.has(n)) { sizes.set(n, FIRE.start); spread.push(n); }
  }
  const next = [...sizes].sort((p, q) => p[0] - q[0]).map(([space, size]) => ({ space, size }));
  return { fires: next, spread, out, magazine: (sizes.get(j.magazine) ?? 0) >= FIRE.catch };
}

/** The magazine's space (plan place). */
export const magazineSpace = (): number => joined().magazine;

/** A space and the spaces joined to it (plan places): where the men at hand to a fire there are. */
export const atHand = (space: number): readonly number[] => [space, ...joined().next[space]!];
