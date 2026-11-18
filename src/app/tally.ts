/**
 * What the end card tells of a match (implementation plan N7.2, docs/design/menu.md "The end"): how it ended, seen
 * from my ship, how long it lasted, and a few numbers for each ship: guns fired and shot that struck (counted from the
 * steps' events as this machine makes them), men out of the fight and spars brought down (read from her damage). Pure.
 */
import { outOf } from '../sim/damage';
import { winner, type LostHow } from '../sim/end';
import type { SimState } from '../sim/state';
import type { SimEvent } from '../sim/step';
import { STEPS_PER_SECOND } from '../sim/units';

/** How a match ended for me: she (the other ship) or I lost, and how; or drawn (nightfall, or both lost at once). */
export type Ending = { readonly who: 'she' | 'me'; readonly how: LostHow } | { readonly who: 'none' };

/** One ship's numbers on the card. */
export interface ShipNumbers {
  readonly fired: number;
  readonly struck: number;
  readonly men: number;
  readonly spars: number;
}

export interface EndCard {
  readonly ending: Ending;
  /** How long the fight lasted, s. */
  readonly seconds: number;
  /** Mine first, then hers. */
  readonly ships: readonly ShipNumbers[];
}

/** The guns each ship fired and the balls of hers that struck the other, from the events of the steps made. */
export class Tally {
  private readonly fired: number[] = [];
  private readonly struck: number[] = [];
  /** The balls already counted as striking (one ball makes several hits: a hole, splinters, a man). */
  private readonly balls = new Set<string>();

  /** Counting starts afresh (a new match). */
  reset(): void {
    this.fired.length = 0;
    this.struck.length = 0;
    this.balls.clear();
  }

  count(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.kind === 'fired') this.fired[e.ship] = (this.fired[e.ship] ?? 0) + 1;
      else if (e.kind === 'hit') {
        const ball = `${e.tick}:${e.by}:${e.gun}:${e.ship}`;
        if (this.balls.has(ball)) continue;
        this.balls.add(ball);
        this.struck[e.by] = (this.struck[e.by] ?? 0) + 1;
      }
    }
  }

  /** Ship `ship`'s guns fired and shot that struck. */
  of(ship: number): { fired: number; struck: number } {
    return { fired: this.fired[ship] ?? 0, struck: this.struck[ship] ?? 0 };
  }
}

/** The end card of an ended match, seen from my ship `mine`; null while the fight goes on. */
export function endCard(state: SimState, mine: number, tally: Tally): EndCard | null {
  const end = state.fight.end;
  if (!end) return null;
  const won = winner(state.fight), hers = 1 - mine;
  const ending: Ending = won === null ? { who: 'none' } : won === mine ? { who: 'she', how: end.lost[hers]! } : { who: 'me', how: end.lost[mine]! };
  const order = state.ships.length > 1 ? [mine, hers] : [mine];
  const ships = order.map((i) => {
    const d = state.ships[i]!.damage;
    return { ...tally.of(i), men: outOf(d).size, spars: d.fallen.length };
  });
  return { ending, seconds: end.tick / STEPS_PER_SECOND, ships };
}
