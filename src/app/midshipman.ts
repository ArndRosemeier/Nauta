/**
 * The captain's midshipman (implementation plan N4.4, docs/design/orders.md "Through your midshipman"; Arnd
 * 2026-11-18: orders from anywhere on the ship go by a midshipman who runs with them). He keeps near the captain on
 * her decks and below them, by the crew's own routes on the one walk graph (sim/crew/going.ts); sent with a message,
 * he runs to the man it is for, gives it when he gets there, and comes back. Aloft and out on the bowsprit the
 * captain hails, so there he waits on deck.
 *
 * Pure, and the page's alone: when the captain speaks is not the match's state, only the order the midshipman
 * delivers is (it goes into the match when he arrives, as an order given on the spot would).
 */
import type { Order } from '../sim/orders';
import { startGoing, goingAt, stepGoings, type Going, type Whereabouts } from '../sim/crew/going';
import { heightAt, routeNetwork } from '../sim/crew/network';
import type { Closures } from '../sim/crew/closures';
import { bareSpot, type Spot } from '../sim/ship/plan';
import { deliverAt, floorApart, onDecks, type Taker } from './officers';

/** He follows once the captain is this far off, m, and stops this near him. */
const FOLLOW_FAR = 3;
const FOLLOW_NEAR = 1.4;
/** Following, he is routed anew when the captain has gone this far from where he was going, m. */
const REROUTE = 2;
/** Further than this from the captain he follows smartly, m; nearer, at a walk. */
const SMARTLY_BEYOND = 10;

/** What he carries: an order for a man, or a question for him (the lookout's report). */
export type Message = { readonly to: Taker; readonly order: Order } | { readonly to: Taker; readonly ask: 'look out' };


export class Midshipman {
  /** Where he stands when not on his way. */
  private spot: Spot;
  private onWay: Going | null = null;
  /** The spot he is going to while following. */
  private toward: Spot | null = null;
  /** The message he is running with, or null. */
  private errand: Message | null = null;
  /** The way he faces standing, in plan (forward, starboard). */
  private facing: readonly [number, number] = [1, 0];

  constructor(start: Spot) {
    this.spot = start;
  }

  /** Whether he is away with a message. */
  get away(): boolean {
    return this.errand !== null;
  }

  /** He runs with a message from where he is (a new one replaces one he still carries). Returns false when no way leads there. */
  send(message: Message, heel: number, closures: Closures): boolean {
    const g = startGoing(this.here(), deliverAt(message.to), 'smart', heel, closures);
    if (!g) return false;
    this.onWay = g; this.toward = null; this.errand = message;
    return true;
  }

  /**
   * One frame: he goes on his way, or follows the captain (`captain`: where he stands, null when not aboard).
   * Returns the message he has just given, or null.
   */
  step(dt: number, captain: Spot | null, heel: number, closures: Closures): Message | null {
    if (!this.errand) this.followCaptain(captain, heel, closures);
    if (!this.onWay) return null;
    const was = this.onWay, { goings, arrived } = stepGoings([was], { heel, closures, captain: null, standing: [] }, dt);
    this.onWay = goings[0] ?? null;
    if (arrived.length > 0 || !this.onWay) { this.spot = bareSpot(was.path.to); this.onWay = null; return this.arrive(); }
    if (!this.errand && captain && floorApart(goingAt(this.onWay), captain) < FOLLOW_NEAR) this.halt();
    return null;
  }

  /** Where he is and which way he faces, for drawing. */
  where(): Whereabouts {
    if (this.onWay) return goingAt(this.onWay);
    return { ...this.spot, height: heightAt(routeNetwork(), this.spot), way: null, share: 0, facing: this.facing };
  }

  private here(): Spot {
    return bareSpot(this.where());
  }

  private arrive(): Message | null {
    const done = this.errand;
    this.halt();
    this.errand = null;
    return done;
  }

  private halt(): void {
    const w = this.where();
    this.spot = bareSpot(w);
    this.facing = w.facing;
    this.onWay = null; this.toward = null;
  }

  /** Following: routed toward the captain once he is far, anew when the captain has gone on; on deck when he is aloft. */
  private followCaptain(captain: Spot | null, heel: number, closures: Closures): void {
    if (!captain || !onDecks(captain)) return;
    const here = this.here();
    if (this.onWay ? (this.toward && floorApart(this.toward, captain) < REROUTE) : floorApart(here, captain) < FOLLOW_FAR) return;
    const g = startGoing(here, captain, floorApart(here, captain) > SMARTLY_BEYOND ? 'smart' : 'walk', heel, closures);
    if (g) { this.onWay = g; this.toward = captain; }
  }
}
