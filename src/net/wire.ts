/**
 * What Nauta's machines say to each other through GameHub (implementation plan N3.7), as plain JSON: the host's full
 * state now and then (`Snapshot`), what it stepped since (`Delta`: the orders of each step), and a captain's orders to
 * the host (`Intent`). The model is GameHub's own (gameserver docs/PATTERNS.md): one host runs the simulation, the
 * others send intents. No DOM, no three.js: it runs in tests, in the page and in a worker alike.
 *
 * The simulation's state goes as the codec's bytes (sim/codec.ts) in base64, never as JSON numbers, so the guests get
 * it bit for bit (JSON loses -0 and NaN). Orders go as JSON; the host passes every order it steps, its own too,
 * through the same JSON first (`cleanOrder`), so every machine steps exactly the values the host stepped.
 */
import type { Order } from '../sim/orders';
import type { LoggedOrders } from '../sim/replay';
import { decodeState, encodeState, hashState, type SimState } from '../sim/state';

/** The game's id on GameHub (registered there by Arnd: `npm run apps -- add nauta`). */
export const GAME = 'nauta';
/** The version of this protocol; a machine never joins a room of another. Raise it when a message changes shape. */
export const PROTOCOL = 2;
/** The most players in a room: two captains, one ship each (Arnd, 2026-11-17: every player is a captain of his own ship). */
export const MOST_PLAYERS = 2;
/** The most orders one message may carry; the rest are dropped (a captain gives a few a minute). */
export const MOST_ORDERS = 16;
/** The longest word an order may carry (its kind, canvas or mast); longer ones are cut, so an order stays small. */
const MOST_WORD = 32;

/** A player's last order the host has stepped: [player id, the order's number]. */
export type Ack = readonly [player: number, seq: number];

/** What each ship's captain is, by her place in `SimState.ships`: a player id, or null while she has none. */
export type Captains = readonly (number | null)[];

/** The host's full state: late joiners start from it, and a guest's own state must agree with it (else the host's wins). */
export interface Snapshot {
  readonly protocol: number;
  /** The state's tick. */
  readonly tick: number;
  /** The state as the codec's bytes, base64. */
  readonly state: string;
  /** Its hash (sim/state.ts `hashState`), so a guest checks without decoding. */
  readonly hash: string;
  readonly captains: Captains;
  readonly acks: readonly Ack[];
  /** The room's match this is (duel.ts, "Rounds"); none: 0. */
  readonly round?: number;
  /** The players ready for the next round. */
  readonly ready?: readonly number[];
}

/** What the host stepped since its last delta: the orders by tick, up to (not including) `tick`, the state it is at now. */
export interface Delta {
  readonly tick: number;
  readonly log: readonly LoggedOrders[];
  readonly captains: Captains;
  readonly acks: readonly Ack[];
  /** Once a second: the hash of the state at `tick`, so a guest checks itself without the whole state being sent. */
  readonly hash?: string;
  /** The room's match this is; none: 0. */
  readonly round?: number;
  /** The players ready for the next round. */
  readonly ready?: readonly number[];
}

/** One order a captain gives, numbered by him (1, 2, 3...), so the host steps each once even across a change of host. */
export interface GivenOrder {
  readonly seq: number;
  readonly order: unknown;
}

/** A captain's orders to the host, a guest whose hash differed asking for the host's whole state, or a captain ready for the round after `round`. */
export type Intent =
  | { readonly kind: 'orders'; readonly orders: readonly GivenOrder[] }
  | { readonly kind: 'resync' }
  | { readonly kind: 'ready'; readonly round: number };

/** What a room says about itself in the lobby; a machine joins only a room of its own protocol and build. */
export interface RoomMeta {
  readonly game: string;
  readonly protocol: number;
  readonly build: string;
  /** What the host chose for the match (menu.md): shown in the list of rooms and in the waiting room. */
  readonly terms?: RoomTerms;
}

/**
 * The host's choices for a room's match, as the page names them (docs/design/menu.md, "Match setup"): the wind, the
 * hour the sky starts at (the guest's page draws the same sky), how the ships meet, the length in minutes (0: no
 * limit) and the host's navy (the guest takes the other). Only the host's machine starts the match from them; the
 * guest takes its state from the host.
 */
export interface RoomTerms {
  readonly wind: string;
  readonly hour: number;
  readonly meet: string;
  readonly minutes: number;
  readonly navy: string;
}

/** The host's choices in a room's meta, or null when it has none (an older build, another game). */
export function roomTerms(meta: unknown): RoomTerms | null {
  const t = (meta as Partial<RoomMeta> | null)?.terms as Partial<RoomTerms> | undefined;
  if (!t || typeof t !== 'object') return null;
  const ok = typeof t.wind === 'string' && typeof t.meet === 'string' && typeof t.navy === 'string' && Number.isFinite(t.hour) && Number.isFinite(t.minutes);
  return ok ? (t as RoomTerms) : null;
}

/** Why a machine of this protocol and build may not join a room, or ''. */
export function roomRefusal(meta: unknown, build: string): string {
  const m = meta as Partial<RoomMeta> | null;
  if (!m || typeof m !== 'object' || m.game !== GAME) return 'that room is not a Nauta match';
  if (m.protocol !== PROTOCOL || m.build !== build) return `that match runs version ${String(m.build)}, this page ${build}: reload both`;
  return '';
}

/** Bytes as base64 text. */
function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text);
}

/** Base64 text back to bytes. */
function fromBase64(text: string): Uint8Array {
  const raw = atob(text), out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** The host's state as a snapshot. */
export function makeSnapshot(state: SimState, captains: Captains, acks: readonly Ack[], round = 0, ready: readonly number[] = []): Snapshot {
  return { protocol: PROTOCOL, tick: state.tick, state: toBase64(encodeState(state)), hash: hashState(state), captains: [...captains], acks: [...acks], round, ready: [...ready] };
}

/** A snapshot's state; fails on one that does not hold a state. */
export function snapshotState(snapshot: Snapshot): SimState {
  return decodeState(fromBase64(snapshot.state));
}

/** A field of an untrusted order kept as the JSON would carry it: a number, or a word cut to length; anything else is null. */
function field(value: unknown): unknown {
  if (typeof value === 'string') return value.slice(0, MOST_WORD);
  return typeof value === 'number' ? value : null;
}

/**
 * An order from anywhere (a guest's message, the captain's own button) made safe to step for `ship`: only an order's
 * fields are kept (its kind, and a heading, canvas or mast), named to her, and passed through JSON as every guest will
 * get it. Anything else (no object, an unknown kind, a heading that is not a number) still becomes an order, which the
 * step then refuses with its reason (orders.ts `malformed`): an order from another machine is refused, never thrown.
 */
export function cleanOrder(raw: unknown, ship: number): Order {
  const o = (raw !== null && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = { kind: typeof o.kind === 'string' ? o.kind.slice(0, MOST_WORD) : '', ship };
  for (const key of ['heading', 'canvas', 'mast'] as const) if (key in o) out[key] = field(o[key]);
  return JSON.parse(JSON.stringify(out)) as Order;
}
