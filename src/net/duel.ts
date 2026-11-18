/**
 * The match as the page runs it (implementation plan N3.7): one duel, stepped 30 times a second, alone or with a
 * second captain through GameHub. No DOM, no three.js: the page calls `pump` each frame (and from a timer, so a host
 * in a hidden tab keeps the match going), and tests drive it with a fake clock and the fake hub.
 *
 * GameHub's model (gameserver docs/PATTERNS.md), as the design adopted it:
 * - **The host steps the match.** It gives each step the orders that came in for it, its own and the guests', in the
 *   order they came (the host's list is the truth), sends what it stepped every few steps (`Delta`) and its whole state
 *   every second (`Snapshot`). Offline the page is its own host and sends nothing.
 * - **Guests send orders** (`Intent`) and run the match on through the host's orders (sim/replay.ts), a little behind
 *   the host's clock so they always have the steps they draw. Each step a guest makes it makes itself, so it gets the
 *   same events (an order refused with its reason, an order done) as the host. Machines agree to the bit within one
 *   engine only (Safari and Chrome may differ in the last bit of a sine), so at every snapshot a guest compares its
 *   hash with the host's, and on a difference the host's state wins (`drifts` counts them).
 * - **The sea and the wind** are worked out from the match's seed and its clock (the tick) on every machine; nothing
 *   of them is sent beyond the state.
 * - **The host leaving passes hosting on.** GameHub makes the next player host; it runs on through every order the
 *   old host passed on, so nothing it stepped is lost, frees the ship of whoever left, and goes on stepping from there.
 *   Orders a captain gave that no host has stepped yet (numbered, `GivenOrder.seq`) are sent again to the new host,
 *   which steps each once (`acks`).
 *
 * Players are captains, one ship each: the room's first player has the first ship, the next the second.
 *
 * **Rounds** (menu.md, the waiting room and the end card): a room's match runs from the moment it is open (round 0).
 * Once every ship has her captain and each has said he is ready (`ready`), the host begins a fresh match from the
 * room's terms (the next round): the first when both tapped Ready in the waiting room, another when both tapped Again
 * on the end card. Every message the host sends names its round; a guest takes the first snapshot of a later round as
 * it is and passes over what is left of an earlier one.
 */
import { deriveSeed, hashString } from '@futuremagic/core';
import type { GameHub, RoomSummary } from '../../vendor/gamehub/gamehub';
import { captainOrders } from '../sim/captain/captain';
import type { Order } from '../sim/orders';
import type { Skill } from '../sim/rules/captain';
import { poseBetween, type ShipPose } from '../sim/ship/motion';
import type { LoggedOrders } from '../sim/replay';
import { aloneStart, duelStart, type StartTerms } from '../sim/start';
import { hashState, startMatch, type MatchSetup, type SimState } from '../sim/state';
import { step, type SimEvent } from '../sim/step';
import { STEPS_PER_SECOND } from '../sim/units';
import {
  cleanOrder, GAME, makeSnapshot, MOST_ORDERS, MOST_PLAYERS, PROTOCOL, roomRefusal, roomTerms, snapshotState,
  type Ack, type Captains, type Delta, type GivenOrder, type Intent, type RoomMeta, type RoomTerms, type Snapshot,
} from './wire';

/** The hub as the duel uses it: GameHub's client (vendor/gamehub) or the fake one in the tests. */
export type DuelHub = GameHub<Snapshot, Delta, Intent>;

/** Steps between the host's deltas: 10 a second, well inside GameHub's 60 messages a second per player. */
export const DELTA_STEPS = 3;
/** Steps between the hashes in the host's deltas: one a second, each guest checks itself against it. */
export const HASH_STEPS = STEPS_PER_SECOND;
/**
 * Steps between the host's snapshots: every five seconds, for late joiners and a change of host (GameHub keeps the
 * latest and the deltas after it), and at once when a guest's hash differed. Guests run the match themselves, so the
 * whole state need not go often: a duel's is about 5 KB, and crews at work make it larger (N4.1).
 */
export const SNAPSHOT_STEPS = 5 * STEPS_PER_SECOND;
/** The fewest steps between two snapshots a guest asked for. */
const RESYNC_STEPS = STEPS_PER_SECOND;
/** How far behind the host's clock a guest runs the match, steps: more than the gap between deltas, for the network's jitter. */
export const PLAYOUT_STEPS = 5;
/** The most steps one pump makes; a machine further behind jumps to a snapshot (a guest) or lets the match run late (a host). */
export const MOST_STEPS = 2 * STEPS_PER_SECOND;
/** How fast a guest's idea of the host's clock follows deltas that come later than it expected (per delta). */
const CLOCK_EASE = 0.05;
/** The seed of a match played alone when the page names none. */
export const SOLO_SEED = 1805;
/** The ship a computer captain commands in a match played alone: the other one. */
const FOE_SHIP = 1;
/** The player id a match played alone gives its one captain. */
const SOLO_PLAYER = 0;

/** What this machine is in the match. */
export type DuelRole = 'solo' | 'joining' | 'host' | 'guest' | 'refused';

export interface DuelOptions {
  /** The hub to play through; none: the match is played alone. */
  readonly hub?: DuelHub;
  /** This build's version: a guest joins only a room of its own build (one build steps the match one way). */
  readonly build: string;
  /** The seed of a match played alone (a room's match takes its seed from the room's code). */
  readonly seed?: number;
  /** A match played alone from this setup instead of the duel's start from `seed` (tests, a chosen start). */
  readonly setup?: MatchSetup;
  /** The wind's force of a match played alone, over its start's (the page's `?wind=`); none: the start's own. */
  readonly windForce?: number;
  /** The clock, s (the page's `performance.now() / 1000`; tests give a fake one). */
  readonly now: () => number;
  /** A match played alone: the other ship commanded by a computer captain at this skill (plan N7.1); none: she sails on as she started. */
  readonly foe?: Skill;
  /** How long a match this machine starts may last before it is drawn, minutes (the match setup, menu.md); none: the rules' own. */
  readonly minutes?: number;
  /** The wind and how the ships meet in a match this machine starts (alone, or as a room's host; menu.md); none: the duel's own. */
  readonly terms?: StartTerms;
  /** A match played alone with her alone at sea, no enemy (menu.md, "Walk the ship"). */
  readonly alone?: boolean;
  /**
   * A match played alone against `foe`: his ship lies hove to and he gives no orders until `wakeFoe()`; then she fills
   * and he commands her (the first match, plan N7.4: she waits while the first lieutenant teaches sailing).
   */
  readonly foeWaits?: boolean;
}

/** Where the computer captain of a match played alone stands: to heave to (and wait), waiting hove to, to fill, or commanding. */
type FoeState = 'heave' | 'hove' | 'fill' | 'awake';

/** What the page draws: her pose between two steps, `f` of the way from `from` to `to`, at the match's time `time` (s). */
export interface Drawn {
  readonly from: SimState;
  readonly to: SimState;
  readonly f: number;
  readonly time: number;
}

type Events = { events: (events: readonly SimEvent[]) => void; change: () => void };

/** The seed of a room's match, from its code: both machines know the code, and GameHub drew it. */
export function roomSeed(code: string): number {
  return hashString(code.toUpperCase());
}

/** The seed of a room's match in round `round`: the room's own for the first two (the one running and the first begun), then another each round. */
export function roundSeed(code: string, round: number): number {
  return round <= 1 ? roomSeed(code) : deriveSeed(roomSeed(code), 'round', round) >>> 0;
}

/** The round a message of the host's names (none: an older build's, round 0). */
const roundOf = (m: { readonly round?: unknown }): number => (Number.isInteger(m.round) ? (m.round as number) : 0);

export class DuelSession {
  /** This machine's part in the match. */
  role: DuelRole;
  /** Why it is refused or what went wrong last, in words ('' when all is well). */
  problem = '';
  /** Times a guest's own state disagreed with the host's snapshot and took the host's. */
  drifts = 0;
  /** Steps this machine has made itself. */
  stepsMade = 0;
  /** The room's match this is: 0 the one running since the room opened, then one more each time both captains were ready. */
  round = 0;

  private readonly hub: DuelHub | null;
  private readonly now: () => number;
  private readonly build: string;
  /** The computer captain of the other ship of a match played alone, or null. */
  private readonly foe: Skill | null;
  private foeState: FoeState;
  /** The length of a match this machine starts, minutes, or undefined for the rules' own. */
  private readonly minutes: number | undefined;
  /** The wind and the meeting of a match this machine starts. */
  private readonly terms: StartTerms;
  private readonly listeners: { [K in keyof Events]: Set<Events[K]> } = { events: new Set(), change: new Set() };
  private known: SimState | null = null;
  private previous: SimState | null = null;
  private captains: (number | null)[] = [];
  /** The players ready for the next round, as the host counts them (a guest hears them in the host's messages). */
  private readyFor: number[] = [];
  private readonly acks = new Map<number, number>();
  // The host's: the orders waiting for the next step, those stepped since the last delta, and the clock it steps by.
  private queue: { player: number; seq: number; order: Order }[] = [];
  private stepped: LoggedOrders[] = [];
  private baseTick = 0;
  private baseTime = 0;
  // A guest's: the host's orders not yet stepped, the snapshots not yet reached, the host's last tick and clock.
  private log: LoggedOrders[] = [];
  private snapshots: Snapshot[] = [];
  private hostTick = 0;
  private offset: number | null = null;
  /** The next snapshot is taken as it is, whatever its tick (after a change of host, or a history the server cut). */
  private rebase = false;
  // A captain's orders: his last number, and those no host has stepped yet.
  private seq = 0;
  private unstepped: GivenOrder[] = [];

  constructor(options: DuelOptions) {
    this.hub = options.hub ?? null;
    this.now = options.now;
    this.build = options.build;
    this.foe = options.foe ?? null;
    this.foeState = options.foeWaits ? 'heave' : 'awake';
    this.minutes = options.minutes;
    this.terms = options.terms ?? {};
    if (!this.hub) {
      this.role = 'solo';
      const seed = options.seed ?? SOLO_SEED;
      const start = options.setup ?? this.timed(options.alone ? aloneStart(seed, this.terms) : duelStart(seed, this.terms));
      this.begin(startMatch(options.windForce === undefined ? start : { ...start, windForce: options.windForce }), [SOLO_PLAYER, null]);
      return;
    }
    this.role = 'joining';
    this.listen(this.hub);
  }

  /** The room's code ('' alone or before a room). */
  get code(): string {
    return this.hub?.room?.id ?? '';
  }

  /** My player id (the hub's; alone, 0). */
  get me(): number {
    return this.hub ? this.hub.you ?? -1 : SOLO_PLAYER;
  }

  /** My ship (the one I captain), by her place in the state's ships; -1 while I have none. */
  get mine(): number {
    return this.captains.indexOf(this.me);
  }

  /** Whether the match is there to draw. */
  get started(): boolean {
    return this.known !== null;
  }

  /** The match as this machine last stepped it (after the step whose events were last handed out). */
  get state(): SimState {
    if (!this.known) throw new Error('the match has not started');
    return this.known;
  }

  /** Each ship's captain, a player id or null. */
  get shipCaptains(): Captains {
    return this.captains;
  }

  /** The players who said they are ready for the next round. */
  get readyPlayers(): readonly number[] {
    return this.readyFor;
  }

  /** My orders sent and not yet stepped by a host. */
  get pending(): readonly Order[] {
    return this.unstepped.map((g) => g.order as Order);
  }

  /** `events`: what each step this machine makes gave (refused, done, tacked...); `change`: role, players or problem changed. */
  on<K extends keyof Events>(kind: K, fn: Events[K]): () => void {
    this.listeners[kind].add(fn);
    return () => { this.listeners[kind].delete(fn); };
  }

  /** The host's choices for this room's match (menu.md), or null alone or before a room. */
  get roomTerms(): RoomTerms | null {
    return roomTerms(this.hub?.room?.meta);
  }

  /** Makes a room and hosts its match, showing `terms` (the host's choices) to who looks; its code is `code` once it resolves. */
  async create(name: string, terms?: RoomTerms): Promise<RoomSummary> {
    const meta: RoomMeta = { game: GAME, protocol: PROTOCOL, build: this.build, ...(terms ? { terms } : {}) };
    // Connected first: the client drops what is sent before its socket is open.
    await this.need().ready;
    return this.need().create({ name, public: true, maxPlayers: MOST_PLAYERS, meta });
  }

  /** Joins the room with this code (six letters, any case). */
  async join(code: string): Promise<RoomSummary> {
    await this.need().ready;
    return this.need().join(code.trim().toUpperCase());
  }

  /** Leaves the room and closes the connection. */
  close(): void {
    this.hub?.close();
  }

  /**
   * An order for my own ship, by the captain: stepped at once by a host, sent to the host by a guest. A guest the host
   * has not seated yet (he started from the room's state of before he came) still sends it: the host names every
   * guest's order to the ship it gives him.
   */
  give(order: Order): void {
    const ship = this.mine;
    if (this.role === 'refused' || (ship < 0 && this.role !== 'guest')) return;
    const given: GivenOrder = { seq: ++this.seq, order: cleanOrder(order, Math.max(0, ship)) };
    if (this.hosting) this.queue.push({ player: this.me, seq: given.seq, order: given.order as Order });
    else {
      this.unstepped.push(given);
      this.sendOrders([given]);
    }
  }

  /** The computer captain who waits (`foeWaits`) fills and fights from the next step on; nothing when he is awake already. */
  wakeFoe(): void {
    if (this.foeState === 'heave') this.foeState = 'awake';
    else if (this.foeState === 'hove') this.foeState = 'fill';
  }

  /** Whether the computer captain still waits for `wakeFoe`. */
  get foeWaiting(): boolean {
    return this.foeState === 'heave' || this.foeState === 'hove';
  }

  /**
   * I am ready for the next round (the first match, or another after the end): the host counts me at once, a guest
   * tells the host. Once every ship has her captain and all are ready, the host begins it. Alone, nothing happens.
   */
  ready(): void {
    if (this.role === 'host') this.readyHost(this.me);
    else if (this.role === 'guest' && this.hub && this.hub.host !== null) {
      if (!this.readyFor.includes(this.me)) this.readyFor = [...this.readyFor, this.me];
      this.hub.send({ kind: 'ready', round: this.round }, this.hub.host);
      this.emit('change');
    }
  }

  /** Runs the match up to the clock: a host steps it, a guest runs on through the host's orders. Call it every frame. */
  pump(): void {
    if (!this.known) return;
    if (this.hosting) this.pumpHost();
    else if (this.role === 'guest') this.pumpGuest();
  }

  /** What to draw now: one step behind the clock, between the last two steps. */
  drawn(): Drawn {
    const to = this.state, from = this.previous ?? to;
    const f = Math.min(1, Math.max(0, this.clock() - to.tick));
    return { from, to, f, time: (from === to ? to.tick : from.tick + f) / STEPS_PER_SECOND };
  }

  /** A ship's pose as drawn now (`drawn()` once a frame, passed in), between her last two steps; null: no such ship. */
  pose(ship: number, d: Drawn = this.drawn()): ShipPose | null {
    const a = d.from.ships[ship], b = d.to.ships[ship];
    return a && b ? poseBetween(a.motion.pose, b.motion.pose, d.f) : null;
  }

  /** A line for the HUD: role, room, players, the tick and drifts. */
  line(): string {
    const players = this.hub?.players.length ?? 1;
    return `${this.role}${this.code ? ` · room ${this.code}` : ''} · ${players} player${players === 1 ? '' : 's'} · ship ${this.mine + 1} · tick ${this.known?.tick ?? '-'} · drifts ${this.drifts}${this.problem ? ` · ${this.problem}` : ''}`;
  }

  private get hosting(): boolean {
    return this.role === 'solo' || this.role === 'host';
  }

  private need(): DuelHub {
    if (!this.hub) throw new Error('a match played alone has no room');
    return this.hub;
  }

  private emit<K extends keyof Events>(kind: K, ...args: Parameters<Events[K]>): void {
    for (const fn of this.listeners[kind]) (fn as (...a: Parameters<Events[K]>) => void)(...args);
  }

  /** The tick the clock is at now, with its fraction: the host's own clock, or a guest's idea of it less the playout. */
  private clock(): number {
    const t = this.now() * STEPS_PER_SECOND;
    if (this.hosting) return this.baseTick + (t - this.baseTime * STEPS_PER_SECOND);
    return this.offset === null ? this.state.tick : t + this.offset - PLAYOUT_STEPS;
  }

  private begin(state: SimState, captains: Captains): void {
    this.known = state;
    this.previous = null;
    this.captains = [...captains];
    this.baseTick = state.tick;
    this.baseTime = this.now();
  }

  /** One step of the match, with these orders: the state moves on and its events go out. */
  private advance(orders: readonly Order[]): void {
    const result = step(this.state, orders);
    this.previous = this.known;
    this.known = result.state;
    this.stepsMade++;
    this.emit('events', result.events);
  }

  // ---- the host ----

  private pumpHost(): void {
    const target = Math.floor(this.clock());
    let n = 0;
    while (this.state.tick < target && n++ < MOST_STEPS) this.hostStep();
    // Far behind (a tab that slept): the match runs late from here instead of racing to catch up.
    if (this.state.tick < target) { this.baseTick = this.state.tick; this.baseTime = this.now(); }
  }

  /** The computer captain's orders for this step: hove to and waiting first when he waits (`foeWaits`), then his own. */
  private foeOrders(foe: Skill): Order[] {
    switch (this.foeState) {
      case 'heave': this.foeState = 'hove'; return [{ kind: 'heave', ship: FOE_SHIP }];
      case 'hove': return [];
      case 'fill': this.foeState = 'awake'; return [{ kind: 'fill', ship: FOE_SHIP }];
      case 'awake': return captainOrders(this.state, FOE_SHIP, foe);
    }
  }

  /** The tick of the host's last snapshot. */
  private snapshotTick = -Infinity;
  /** A guest's: the host's hashes not yet reached, by tick; whether it has asked for the host's state. */
  private checks = new Map<number, string>();
  private resyncing = false;

  private hostStep(): void {
    const tick = this.state.tick, taken = this.queue;
    this.queue = [];
    for (const t of taken) this.acks.set(t.player, Math.max(t.seq, this.acks.get(t.player) ?? 0));
    const orders = taken.map((t) => t.order);
    // Played alone against a computer captain, his orders are stepped with the player's (sim/captain).
    if (this.foe && this.role === 'solo') orders.push(...this.foeOrders(this.foe));
    if (orders.length) this.stepped.push({ tick, orders });
    this.advance(orders);
    if (!this.hub) { this.stepped = []; return; }
    if (this.state.tick % DELTA_STEPS === 0) this.sendDelta();
    if (this.state.tick % SNAPSHOT_STEPS === 0) this.sendSnapshot();
  }

  private sendDelta(): void {
    const tick = this.state.tick;
    const delta: Delta = {
      tick, log: this.stepped, captains: [...this.captains], acks: this.ackList(), round: this.round, ready: [...this.readyFor],
      ...(tick % HASH_STEPS === 0 ? { hash: hashState(this.state) } : {}),
    };
    this.stepped = [];
    this.hub?.sendDelta(delta);
  }

  private sendSnapshot(): void {
    if (this.stepped.length) this.sendDelta();
    this.snapshotTick = this.state.tick;
    this.hub?.setState(makeSnapshot(this.state, this.captains, this.ackList(), this.round, this.readyFor));
  }

  private ackList(): Ack[] {
    return [...this.acks].sort((a, b) => a[0] - b[0]);
  }

  /** A guest's orders, taken into the next step for the ship he commands; each number once. */
  private heedIntent(intent: Intent, from: number): void {
    const ship = this.captains.indexOf(from);
    if (ship < 0 || !intent) return;
    if (intent.kind === 'ready') {
      if (intent.round === this.round) this.readyHost(from);
      return;
    }
    if (intent.kind === 'resync') {
      if (this.state.tick - this.snapshotTick >= RESYNC_STEPS) this.sendSnapshot();
      return;
    }
    if (intent.kind !== 'orders' || !Array.isArray(intent.orders)) return;
    let last = Math.max(this.acks.get(from) ?? 0, ...this.queue.filter((q) => q.player === from).map((q) => q.seq));
    for (const g of intent.orders.slice(0, MOST_ORDERS)) {
      if (!g || !Number.isInteger(g.seq) || g.seq <= last) continue;
      last = g.seq;
      this.queue.push({ player: from, seq: g.seq, order: cleanOrder(g.order, ship) });
    }
  }

  /** Counts `player` ready for the next round, and begins it once every ship's captain is. */
  private readyHost(player: number): void {
    if (!this.readyFor.includes(player)) this.readyFor = [...this.readyFor, player];
    if (this.captains.every((c) => c !== null && this.readyFor.includes(c))) this.nextRound();
    else this.sendDelta();
    this.emit('change');
  }

  /** The host begins the next round: a fresh match from the room's terms, its own seed, the same captains. */
  private nextRound(): void {
    // Orders waiting for the old match are passed over, but counted as stepped, so no one sends them again.
    for (const t of this.queue) this.acks.set(t.player, Math.max(t.seq, this.acks.get(t.player) ?? 0));
    this.queue = [];
    this.stepped = [];
    this.round++;
    this.readyFor = [];
    this.begin(startMatch(this.timed(duelStart(roundSeed(this.code, this.round), this.terms))), this.captains);
    this.sendSnapshot();
  }

  /** A start this machine begins, with the player's match length when there is one. */
  private timed(setup: MatchSetup): MatchSetup {
    return this.minutes === undefined ? setup : { ...setup, minutes: this.minutes };
  }

  /** Hosting from here: run on through what the old host passed on, seat who is here, and go on stepping. */
  private host(): void {
    const hub = this.need();
    if (!this.known) {
      const latest = this.snapshots.at(-1);
      if (latest) this.adopt(latest);
      else this.begin(startMatch(this.timed(duelStart(roundSeed(this.code, this.round), this.terms))), [hub.you, null]);
    }
    this.jumpIfFar(this.hostTick);
    this.catchUp(this.hostTick, Infinity);
    this.log = [];
    this.snapshots = [];
    this.role = 'host';
    this.rebase = false;
    this.offset = null;
    this.baseTick = this.state.tick;
    this.baseTime = this.now();
    const here = new Set(hub.players.map((p) => p.id));
    this.captains = this.captains.map((c) => (c !== null && here.has(c) ? c : null));
    for (const p of hub.players) this.seat(p.id);
    // My own orders no host has stepped yet go into the first step of mine.
    for (const g of this.unstepped) if (g.seq > (this.acks.get(this.me) ?? 0)) this.queue.push({ player: this.me, seq: g.seq, order: g.order as Order });
    this.unstepped = [];
    this.stepped = [];
    this.sendSnapshot();
    this.emit('change');
  }

  /** Gives a player who has no ship the first ship without a captain. */
  private seat(player: number): void {
    if (this.captains.includes(player)) return;
    const free = this.captains.indexOf(null);
    if (free >= 0) this.captains[free] = player;
  }

  // ---- a guest ----

  private pumpGuest(): void {
    const target = Math.min(Math.floor(this.clock()), this.hostTick);
    this.jumpIfFar(target);
    this.catchUp(target, MOST_STEPS);
  }

  /** Far behind `target` (a tab that slept): jump to the latest snapshot that is not past it. */
  private jumpIfFar(target: number): void {
    if (target - this.state.tick <= MOST_STEPS) return;
    const jump = this.snapshots.filter((s) => s.tick <= target && s.tick > this.state.tick).at(-1);
    if (jump) this.adopt(jump);
  }

  /** Steps on through the host's orders up to `target`, at most `most` steps, checking each snapshot reached. */
  private catchUp(target: number, most: number): void {
    let n = 0;
    while (this.state.tick < target && n++ < most) {
      const entry = this.log[0];
      const orders = entry && entry.tick === this.state.tick ? (this.log.shift(), entry.orders) : [];
      this.advance(orders);
      this.check();
    }
  }

  /** At a tick the host hashed: the same hash, or ask for its state; at a snapshot's tick: the same hash, or the host's state wins. */
  private check(): void {
    const tick = this.state.tick, hash = this.checks.get(tick);
    if (hash !== undefined) {
      this.checks.delete(tick);
      if (!this.resyncing && hashState(this.state) !== hash) {
        this.drifts++;
        this.resyncing = true;
        if (this.hub && this.hub.host !== null) this.hub.send({ kind: 'resync' }, this.hub.host);
      }
    }
    while (this.snapshots.length && this.snapshots[0]!.tick < tick) this.snapshots.shift();
    const s = this.snapshots[0];
    if (!s || s.tick !== tick) return;
    this.snapshots.shift();
    if (!this.resyncing && hashState(this.state) === s.hash) return;
    if (!this.resyncing) this.drifts++;
    this.resyncing = false;
    const previous = this.previous;
    this.adopt(s);
    this.previous = previous;
  }

  /** Takes the host's state as it is. */
  private adopt(s: Snapshot): void {
    try {
      this.known = snapshotState(s);
    } catch {
      this.problem = 'the host sent a state this page cannot read';
      return;
    }
    this.previous = null;
    for (const t of this.checks.keys()) if (t <= s.tick) this.checks.delete(t);
    while (this.log.length && this.log[0]!.tick < s.tick) this.log.shift();
    this.snapshots = this.snapshots.filter((x) => x.tick > s.tick);
    this.hostTick = Math.max(this.hostTick, s.tick);
    this.roster(s.captains, s.acks, s.ready);
  }

  private roster(captains: Captains, acks: readonly Ack[], ready: readonly number[] | undefined): void {
    const was = this.mine, wasReady = this.readyFor.join();
    if (Array.isArray(captains)) this.captains = captains.map((c) => (Number.isInteger(c) ? c : null));
    if (Array.isArray(ready)) this.readyFor = ready.filter((p) => Number.isInteger(p));
    if (this.mine !== was || this.readyFor.join() !== wasReady) this.emit('change');
    if (!Array.isArray(acks)) return;
    for (const a of acks) if (Array.isArray(a) && Number.isInteger(a[0]) && Number.isInteger(a[1])) this.acks.set(a[0], a[1]);
    const mine = this.acks.get(this.me) ?? 0;
    this.unstepped = this.unstepped.filter((g) => g.seq > mine);
  }

  /** A guest's idea of the host's clock: the latest delta's tick less the time now, taken at once when the host is ahead of it, followed slowly when behind. */
  private heard(tick: number): void {
    const sample = tick - this.now() * STEPS_PER_SECOND;
    this.offset = this.offset === null || sample > this.offset ? sample : this.offset + (sample - this.offset) * CLOCK_EASE;
  }

  private onSnapshot(s: Snapshot): void {
    if (!s || s.protocol !== PROTOCOL || !Number.isInteger(s.tick)) return;
    const round = roundOf(s);
    if (round < this.round) return;
    if (!this.known || this.rebase || round > this.round) {
      this.round = round;
      this.checks.clear();
      this.resyncing = false;
      this.rebase = false;
      this.log = [];
      this.snapshots = [];
      this.adopt(s);
      this.hostTick = s.tick;
      this.offset = null;
      this.heard(s.tick);
      this.emit('change');
      return;
    }
    if (s.tick < this.state.tick) {
      // Asked for after a difference and already passed: the host's state wins even a little back.
      if (this.resyncing) { this.resyncing = false; this.adopt(s); }
      return;
    }
    this.snapshots.push(s);
    this.roster(s.captains, s.acks, s.ready);
    this.hostTick = Math.max(this.hostTick, s.tick);
    if (s.tick === this.state.tick) this.check();
  }

  private onDelta(d: Delta): void {
    if (!d || !Number.isInteger(d.tick) || !Array.isArray(d.log) || this.rebase || !this.known || roundOf(d) !== this.round || d.tick <= this.hostTick) return;
    for (const entry of d.log) if (entry.tick >= this.state.tick) this.log.push(entry);
    if (typeof d.hash === 'string' && d.tick > this.state.tick) this.checks.set(d.tick, d.hash);
    this.hostTick = d.tick;
    this.roster(d.captains, d.acks, d.ready);
    this.heard(d.tick);
  }

  private sendOrders(orders: readonly GivenOrder[]): void {
    const hub = this.hub;
    if (hub && hub.host !== null && orders.length) hub.send({ kind: 'orders', orders }, hub.host);
  }

  // ---- the hub ----

  private listen(hub: DuelHub): void {
    hub.on('joined', (room) => {
      const refusal = hub.isHost ? '' : roomRefusal(room.meta, this.build);
      if (refusal) {
        this.role = 'refused';
        this.problem = refusal;
        void hub.leave().catch(() => {});
        this.emit('change');
        return;
      }
      this.role = hub.isHost ? 'joining' : 'guest';
      // The room's history (its last snapshot and the deltas after it) comes right after this; a host decides once it has.
      if (hub.isHost) queueMicrotask(() => this.host());
      else this.emit('change');
    });
    hub.on('state', (s) => { if (this.role === 'guest' || this.role === 'joining') this.onSnapshot(s); });
    hub.on('delta', (d) => { if (this.role === 'guest' || this.role === 'joining') this.onDelta(d); });
    hub.on('msg', (intent, from) => { if (this.role === 'host') this.heedIntent(intent, from); });
    hub.on('player+', (p) => {
      if (this.role === 'host') { this.seat(p.id); this.sendSnapshot(); }
      this.emit('change');
    });
    hub.on('player-', (id) => {
      this.readyFor = this.readyFor.filter((p) => p !== id);
      if (this.role === 'host') { this.captains = this.captains.map((c) => (c === id ? null : c)); this.sendDelta(); }
      this.emit('change');
    });
    hub.on('host', (id) => {
      if (this.role === 'refused') return;
      if (id === hub.you) { this.host(); return; }
      // Another machine hosts now: take its state when it comes, and send it my orders no host has stepped.
      this.role = 'guest';
      this.rebase = true;
      this.sendOrders(this.unstepped);
      this.emit('change');
    });
    hub.on('need-snapshot', () => { if (this.role === 'host' && this.known) this.sendSnapshot(); });
    hub.on('incomplete', () => { this.rebase = true; });
    hub.on('error', (e) => { this.problem = `the server says ${e.code}`; this.emit('change'); });
    hub.on('close', () => { this.problem = 'the connection to the server closed'; this.emit('change'); });
  }
}
