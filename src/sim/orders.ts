/**
 * The captain's orders (pure, implementation plan N3.4): the sailing vocabulary as data, and what each ship has been
 * told to do. The one owner of that (rules.json `owners`: `told`); the sailing model (ship/sailing.ts) owns how she
 * actually sails, and this file tells it, through its own calls (`steerTo`, `setSail`, `layAback`), what the crew does
 * and when.
 *
 * The vocabulary is the sailing rows of docs/design/orders.md: steer there, come up or bear away a point, full and by,
 * tack, wear, heave to (the master); battle sail, plain sail, all sail, shorten sail, back a mast's topsail, fill (the
 * first lieutenant). An order is plain data (`Order`), given by its words too (`parseOrder`, `orderWords`) for the
 * typed panel (N3.5) and tests.
 *
 * **Giving an order** (`giveOrder`) answers at once: refused with the reason in words (a tack without way, a tack
 * while in stays), or taken, and then it is what she has been told (`ShipOrders`: the course, the canvas, hove to, the
 * masts aback) and a list of acts for the crew: the helm put over, each sail set or taken in, a mast's yards swung. A course
 * closer than close-hauled is answered and changed (design decision for N3): the master says she will not lie it and
 * steers full and by on the nearer tack. A course order never takes her through the wind's eye: a course on the other
 * tack is reached by wearing; tacking is its own order.
 *
 * **Carrying it out** (`carryOut`, every step): the crew (crew/crew.ts, N4.1) does each act when its men have done
 * its jobs, so an order's time comes from the men; a later order for the same helm, sail or mast replaces what is not
 * yet done. When the last act of an order is done it is reported (`done`). Full and by, the helmsman follows the wind
 * as it shifts. When she misses stays the master bears away on the old tack (`heard`), and that is then her course.
 */
import { angleDiff } from '@futuremagic/core';
import { BY_FOLLOW, HOVE_TO_CHECK, HOVE_TO_IN, HOVE_TO_MAST, NO_WAY, POINT } from './rules/orders';
import { AIM_HEIGHT, SHOT, type AimName, type ShotKind } from './rules/guns';
import type { MastName } from './rules/rig';
import type { OrderTaker } from './rules/crew';
import { CLOSE_HAULED, type CanvasName } from './rules/sailing';
import { rigPlan } from './ship/rig';
import { canvasFor, layAback, MASTS, setSail, steerTo, type Sailing, type SailingEvent } from './ship/sailing';
import { sailShare, type SailSetting } from './ship/sails';
import { wrapBearing } from './units';
import type { Wind } from './wind';

/** The sail settings an order names (docs/design/orders.md): bare poles come only by shortening sail. */
export type SettingName = Exclude<CanvasName, 'bare'>;

/** Steer there: a compass course, rad. */
export interface SteerOrder {
  readonly kind: 'steer';
  readonly ship: number;
  readonly heading: number;
}
/** The orders that name nothing more than the ship: come up a point, bear away a point, full and by, tack, wear, heave to, shorten sail, fill. */
export interface PlainOrder {
  readonly kind: 'up' | 'away' | 'by' | 'tack' | 'wear' | 'heave' | 'shorten' | 'fill';
  readonly ship: number;
}
/** Battle sail, plain sail or all sail. */
export interface SailOrder {
  readonly kind: 'sail';
  readonly ship: number;
  readonly canvas: SettingName;
}
/** Back one mast's topsail (its yards laid aback, to check her way). */
export interface BackOrder {
  readonly kind: 'back';
  readonly ship: number;
  readonly mast: MastName;
}
/** The sailing orders (N3.4): the master's and the first lieutenant's for her course and canvas, carried out by the hands. */
export type SailingOrder = SteerOrder | PlainOrder | SailOrder | BackOrder;
export type SailingKind = SailingOrder['kind'];

/** The gunnery orders that name nothing more: beat to quarters, stand down, fire as they bear, hold for my word, the word (fire), cease firing. */
export interface GunsOrder {
  readonly kind: 'quarters' | 'stand' | 'bear' | 'hold' | 'fire' | 'cease';
  readonly ship: number;
}
/** The shot of the next loading. */
export interface ShotOrder {
  readonly kind: 'shot';
  readonly ship: number;
  readonly shot: ShotKind;
}
/** Where the gun captains lay their guns on her. */
export interface AimOrder {
  readonly kind: 'aim';
  readonly ship: number;
  readonly at: AimName;
}
/** The gunnery orders (N5.3a): the first lieutenant's quarters and the gunner's rows; they take no hands of the sailing drill. */
export type GunneryOrder = GunsOrder | ShotOrder | AimOrder;
export type GunneryKind = GunneryOrder['kind'];

/**
 * The orders for her life (N6.3, design decisions for N6): the first lieutenant's hands to the pumps, fire party and
 * clear the wreckage (men taken from the guns while there is water in her, a fire, wreckage alongside), and the
 * carpenter's plug the shot holes and man the pumps (what his crew does first). They stand once given; crew/repairs.ts
 * has the men do them when there is something to do.
 */
export interface LifeOrder {
  readonly kind: 'pumps' | 'fires' | 'wreckage' | 'plug' | 'pumping';
  readonly ship: number;
}
export type LifeKind = LifeOrder['kind'];

/** An order to one ship, named by her place in `SimState.ships`. Plain data, sent between machines as it is. */
export type Order = SailingOrder | GunneryOrder | LifeOrder;
export type OrderKind = Order['kind'];

/** The kinds of the gunnery orders. */
const GUNNERY_KINDS: readonly OrderKind[] = ['quarters', 'stand', 'shot', 'aim', 'bear', 'hold', 'fire', 'cease'];
/** Whether an order is one of the gunnery orders. */
export const isGunnery = (order: Order): order is GunneryOrder => GUNNERY_KINDS.includes(order.kind);
/** The kinds of the orders for her life. */
const LIFE_KINDS: readonly OrderKind[] = ['pumps', 'fires', 'wreckage', 'plug', 'pumping'];
/** Whether an order is one of the orders for her life. */
export const isLife = (order: Order): order is LifeOrder => LIFE_KINDS.includes(order.kind);

/** One word of the vocabulary: who takes it (docs/design/orders.md), what it does, and what more it names. */
export interface OrderWord {
  readonly kind: OrderKind;
  readonly to: OrderTaker;
  readonly what: string;
  readonly takes: 'heading' | 'canvas' | 'mast' | 'shot' | 'aim' | null;
}

/** The sailing vocabulary, as data: what the panel (N3.5) and the order fan (N4.4) offer. */
export const VOCABULARY: readonly OrderWord[] = [
  { kind: 'steer', to: 'master', what: 'steer a compass course (never closer than close-hauled, never through the wind)', takes: 'heading' },
  { kind: 'up', to: 'master', what: 'come up a point toward the wind; repeated, the points add up', takes: null },
  { kind: 'away', to: 'master', what: 'bear away a point off the wind; repeated, the points add up', takes: null },
  { kind: 'by', to: 'master', what: 'full and by: as close to the wind as she will lie, following it as it shifts', takes: null },
  { kind: 'tack', to: 'master', what: 'through the wind onto the other tack, full and by', takes: null },
  { kind: 'wear', to: 'master', what: 'round before the wind onto the other tack, as far off the wind as she was', takes: null },
  { kind: 'heave', to: 'master', what: 'heave to: courses hauled up, boom sail brailed, main yards aback, helm down; she stops', takes: null },
  { kind: 'sail', to: 'first lieutenant', what: 'battle sail, plain sail or all sail, reefed for the wind', takes: 'canvas' },
  { kind: 'shorten', to: 'first lieutenant', what: 'shorten sail one step: all, plain, battle, bare poles', takes: null },
  { kind: 'back', to: 'first lieutenant', what: "lay one mast's yards aback to check her way", takes: 'mast' },
  { kind: 'fill', to: 'first lieutenant', what: 'let every sail draw again; hove to, she makes her canvas again', takes: null },
  { kind: 'quarters', to: 'first lieutenant', what: 'beat to quarters: the guns cast loose, loaded and run out; a ship not at quarters cannot fire', takes: null },
  { kind: 'stand', to: 'first lieutenant', what: 'stand down: the guns run in, loaded as they are', takes: null },
  { kind: 'shot', to: 'gunner', what: 'the shot of the next loading: round, chain or grape; guns already loaded fire what they hold', takes: 'shot' },
  { kind: 'aim', to: 'gunner', what: 'where the gun captains lay their guns on her: hull, rigging or deck', takes: 'aim' },
  { kind: 'bear', to: 'gunner', what: 'fire as they bear: each gun fires when the roll brings her laying onto the enemy, and keeps firing', takes: null },
  { kind: 'hold', to: 'gunner', what: "hold for my word: the loaded side waits for the captain's word", takes: null },
  { kind: 'fire', to: 'gunner', what: "the captain's word: the held side fires now, rippling down her side", takes: null },
  { kind: 'cease', to: 'gunner', what: 'cease firing: the guns finish loading and stand ready', takes: null },
  { kind: 'pumps', to: 'first lieutenant', what: 'hands to the pumps: eight men from the guns pump while there is water in her, and the carpenter\'s crew plugs', takes: null },
  { kind: 'fires', to: 'first lieutenant', what: 'fire party: eight men from the guns fight each fire, the one nearest the magazine first', takes: null },
  { kind: 'wreckage', to: 'first lieutenant', what: 'clear the wreckage: six forecastle men cut away what lies alongside', takes: null },
  { kind: 'plug', to: 'carpenter', what: 'plug the shot holes: all his crew plugs first, then pumps', takes: null },
  { kind: 'pumping', to: 'carpenter', what: 'man the pumps: all his crew pumps first, and plugs when the pumps are manned by others', takes: null },
];

/** The words each order is given by, the first for each its own (`orderWords`); fixed parts of the order beside them. */
const PHRASES: readonly { readonly words: string; readonly order: Partial<Order> & { readonly kind: OrderKind } }[] = [
  { words: 'steer', order: { kind: 'steer' } },
  { words: 'course', order: { kind: 'steer' } },
  { words: 'come up a point', order: { kind: 'up' } },
  { words: 'luff', order: { kind: 'up' } },
  { words: 'bear away a point', order: { kind: 'away' } },
  { words: 'bear off', order: { kind: 'away' } },
  { words: 'full and by', order: { kind: 'by' } },
  { words: 'tack', order: { kind: 'tack' } },
  { words: 'ready about', order: { kind: 'tack' } },
  { words: 'go about', order: { kind: 'tack' } },
  { words: 'wear', order: { kind: 'wear' } },
  { words: 'heave to', order: { kind: 'heave' } },
  { words: 'battle sail', order: { kind: 'sail', canvas: 'battle' } },
  { words: 'plain sail', order: { kind: 'sail', canvas: 'plain' } },
  { words: 'all sail', order: { kind: 'sail', canvas: 'all' } },
  { words: 'shorten sail', order: { kind: 'shorten' } },
  { words: 'take in sail', order: { kind: 'shorten' } },
  { words: 'back the main topsail', order: { kind: 'back', mast: 'main' } },
  { words: 'back the fore topsail', order: { kind: 'back', mast: 'fore' } },
  { words: 'fill', order: { kind: 'fill' } },
  { words: 'let draw', order: { kind: 'fill' } },
  { words: 'beat to quarters', order: { kind: 'quarters' } },
  { words: 'clear for action', order: { kind: 'quarters' } },
  { words: 'stand down', order: { kind: 'stand' } },
  { words: 'round shot', order: { kind: 'shot', shot: 'round' } },
  { words: 'chain shot', order: { kind: 'shot', shot: 'chain' } },
  { words: 'grape shot', order: { kind: 'shot', shot: 'grape' } },
  { words: 'aim at the hull', order: { kind: 'aim', at: 'hull' } },
  { words: 'aim at the rigging', order: { kind: 'aim', at: 'rigging' } },
  { words: 'aim at the deck', order: { kind: 'aim', at: 'deck' } },
  { words: 'fire as they bear', order: { kind: 'bear' } },
  { words: 'hold for my word', order: { kind: 'hold' } },
  { words: 'fire', order: { kind: 'fire' } },
  { words: 'cease firing', order: { kind: 'cease' } },
  { words: 'cease fire', order: { kind: 'cease' } },
  { words: 'hands to the pumps', order: { kind: 'pumps' } },
  { words: 'fire party', order: { kind: 'fires' } },
  { words: 'clear the wreckage', order: { kind: 'wreckage' } },
  { words: 'cut away the wreckage', order: { kind: 'wreckage' } },
  { words: 'plug the shot holes', order: { kind: 'plug' } },
  { words: 'man the pumps', order: { kind: 'pumping' } },
];

/** Words left out when an order is read ("come up a point, sir" is "come up"; "back the main" is "back main"). */
const FILLER = new Set(['the', 'a', 'an', 'one', 'point', 'sir', 'her', 'ship', 'topsail', 'yards', 'and']);

/** The compass points by name, north first, clockwise; the cardinal points also in full. */
const COMPASS = ['n', 'nne', 'ne', 'ene', 'e', 'ese', 'se', 'sse', 's', 'ssw', 'sw', 'wsw', 'w', 'wnw', 'nw', 'nnw'];
const CARDINAL: Readonly<Record<string, string>> = { north: 'n', east: 'e', south: 's', west: 'w' };
/** Degrees in a full circle, and the digits a compass course is written with (090). */
const FULL_CIRCLE_DEGREES = 360;
const HEADING_DIGITS = 3;

/** An order's words cut to what matters: lower case, no punctuation, no filler. */
function tokens(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim().split(' ').filter((w) => w && !FILLER.has(w));
}

/** A compass course in words (degrees, `090`, or a point by name, `nne`), rad; NaN if it is none. */
function headingOf(word: string): number {
  const named = COMPASS.indexOf(CARDINAL[word] ?? word);
  if (named >= 0) return (named * 2 * Math.PI) / COMPASS.length;
  if (!/^\d+(\.\d+)?$/.test(word)) return Number.NaN;
  const degrees = Number(word);
  return degrees <= FULL_CIRCLE_DEGREES ? wrapBearing((degrees / FULL_CIRCLE_DEGREES) * 2 * Math.PI) : Number.NaN;
}

/** A course as it is spoken and written, three digits of degrees (`090`). */
export function headingWords(heading: number): string {
  const degrees = Math.round((wrapBearing(heading) / (2 * Math.PI)) * FULL_CIRCLE_DEGREES) % FULL_CIRCLE_DEGREES;
  return String(degrees).padStart(HEADING_DIGITS, '0');
}

/** An order for `ship` from its words ("steer 090", "come up a point", "tack", "plain sail", "back the main topsail"), or why the words are none. */
export function parseOrder(text: string, ship: number): Order | string {
  const said = tokens(text);
  let best: (typeof PHRASES)[number] | null = null, bestLength = 0;
  for (const p of PHRASES) {
    const words = tokens(p.words);
    const fits = words.every((w, i) => said[i] === w);
    if (fits && words.length > bestLength) { best = p; bestLength = words.length; }
  }
  if (!best) return `no such order: "${text.trim()}" (${VOCABULARY.map((w) => w.kind).join(', ')})`;
  const rest = said.slice(bestLength);
  if (best.order.kind === 'steer') {
    const course = rest.filter((w) => w !== 'to');
    const heading = course.length === 1 ? headingOf(course[0]!) : Number.NaN;
    return Number.isNaN(heading) ? 'steer which course? (degrees, 090, or a point, nne)' : { kind: 'steer', ship, heading };
  }
  if (rest.length > 0) return `"${best.words}" takes nothing more (not "${rest.join(' ')}")`;
  return { ...best.order, ship } as Order;
}

/** An order in its own words: what `parseOrder` reads back to the same order (a course to the nearest degree). */
export function orderWords(order: Order): string {
  if (order.kind === 'steer') return `steer ${headingWords(order.heading)}`;
  const own = PHRASES.find((p) => p.order.kind === order.kind && Object.entries(p.order).every(([k, v]) => (order as unknown as Record<string, unknown>)[k] === v));
  return own ? own.words : order.kind;
}

/** What the helmsman has been told: a course (`by` 0, `heading` a compass bearing, rad), or full and by on a tack (`by` +1 starboard, -1 larboard). */
export interface Helm {
  readonly heading: number;
  readonly by: number;
}

/** An act of an order: something the crew does (crew/crew.ts), known by its `id`, for the order given as `of` (its `Given.id`). */
interface ActOf {
  readonly id: number;
  readonly of: number;
}
/** The helm put over: the helmsman told a heading and which way to turn (sailing.ts `steerTo`). */
export interface HelmAct extends ActOf {
  readonly kind: 'helm';
  readonly heading: number;
  readonly turn: number;
}
/** One sail (its place in rigPlan().sails) set, with its reefs, or taken in. */
export interface SailAct extends ActOf {
  readonly kind: 'sail';
  readonly sail: number;
  readonly set: boolean;
  readonly reefs: number;
}
/** One mast's yards (its place in `MASTS`) laid aback or filled. */
export interface YardsAct extends ActOf {
  readonly kind: 'yards';
  readonly mast: number;
  readonly aback: boolean;
}
export type Act = HelmAct | SailAct | YardsAct;

/** An order being carried out: as given (or as the master changed it), with the tick it was given in. */
export interface Given {
  readonly id: number;
  readonly order: SailingOrder;
  readonly tick: number;
}

/** How her guns are told to fire (the gunner's rows): not at all ("cease firing"), each as she bears, or held for the captain's word. */
export type FireMode = 'cease' | 'bear' | 'hold';

/** What a ship has been told: plain data in `SimShip.told`, changed only here. Masts are listed fore, main (`MASTS`). */
export interface ShipOrders {
  /** The course or full and by, as told (the helmsman has it once its act is done). */
  readonly helm: Helm;
  /** The canvas ordered (hove to, the sails in `HOVE_TO_IN` stay in until she fills). */
  readonly canvas: CanvasName;
  readonly hove: boolean;
  /** Each mast told to lie aback. */
  readonly backed: readonly boolean[];
  /** What is still to be done, in the order it was told (the crew has it in hand). */
  readonly acts: readonly Act[];
  /** The orders still being carried out. */
  readonly given: readonly Given[];
  /** The id the next order or act gets. */
  readonly serial: number;
  /** At quarters: her guns cast loose, loaded and run out (only then may she fire). */
  readonly quarters: boolean;
  /** The shot of the next loading, where the gun captains lay on her, and how her guns fire. */
  readonly shot: ShotKind;
  readonly aim: AimName;
  readonly firing: FireMode;
  /** The captain's word given, her held side firing down its length until every gun that could has fired (guns/gunnery.ts says when, `wordSpent`). */
  readonly word: boolean;
  /** The first lieutenant's parties for her life: the tick each was ordered, or null (not ordered). */
  readonly pumps: number | null;
  readonly fires: number | null;
  readonly wreckage: number | null;
  /** What the carpenter's crew does first: plug, pump, or as it sees fit (null: the carpenter and his mate plug, the rest pump). */
  readonly carpenter: CarpenterFirst | null;
}

/** What the carpenter's crew is told to do first. */
export type CarpenterFirst = 'plug' | 'pump';

/** What her guns load and lay on until told otherwise: round shot at her hull. */
const START_SHOT: ShotKind = 'round';
const START_AIM: AimName = 'hull';

/** A ship's orders at the start: steering her heading under the canvas she starts with, nothing aback, nothing to do. */
export function startOrders(heading: number, canvas: CanvasName): ShipOrders {
  return {
    helm: { heading: wrapBearing(heading), by: 0 }, canvas, hove: false, backed: MASTS.map(() => false), acts: [], given: [], serial: 0,
    quarters: false, shot: START_SHOT, aim: START_AIM, firing: 'cease', word: false, pumps: null, fires: null, wreckage: null, carpenter: null,
  };
}

/**
 * What the master says of an order he takes but must speak to (docs/design/orders.md, "Answers are events"): a course
 * she will not lie, steered full and by instead, or one she reaches only by wearing. The code is what the phrase book
 * (N4.5) turns into his words; the reason is those words in English for now (the order panel).
 */
export type AnswerCode = 'will not lie' | 'wearing round';

/** Why an order is refused, as a code for the phrase book (N4.5): the reason gives it in English for now. */
export type RefusalCode =
  | 'no such order' | 'no ship' | 'full and by already' | 'no way' | 'in stays' | 'hove to already' | 'canvas already'
  | 'carries it already' | 'bare poles' | 'aback already' | 'drawing' | 'not at quarters' | 'at quarters already'
  | 'loading it already' | 'laid there already' | 'firing so already' | 'not held' | 'word given' | 'not firing'
  | 'sent already' | 'first already';

/**
 * What giving an order comes to: what she has now been told, the answer in words ('' when simply taken) and its code:
 * taken (`code` null, or an `AnswerCode` when taken with words), or refused (`told` comes back unchanged).
 */
export type OrderAnswer =
  | { readonly refused: false; readonly told: ShipOrders; readonly reason: string; readonly code: AnswerCode | null }
  | { readonly refused: true; readonly told: ShipOrders; readonly reason: string; readonly code: RefusalCode };

/** What an order is given against: the tick of the step, the mean wind there (its `from` is what the master judges by) and the match's force. */
export interface OrderMoment {
  readonly tick: number;
  readonly wind: Wind;
  readonly force: number;
}

/** Her tack for a heading in a wind from `from`: +1 the wind on her starboard side, -1 on her larboard; `otherwise` dead ahead or astern. */
function tackOf(heading: number, from: number, otherwise: number): number {
  const d = angleDiff(heading, from);
  return d === 0 || Math.abs(d) === Math.PI ? otherwise : Math.sign(d);
}

/** Close-hauled on a tack (+1 starboard), a compass bearing, rad. */
function closeHauled(tack: number, from: number): number {
  return wrapBearing(from - tack * CLOSE_HAULED);
}

/** The heading she has been told: the course, or close-hauled now. */
function toldHeading(helm: Helm, from: number): number {
  return helm.by ? closeHauled(helm.by, from) : helm.heading;
}

const TACK_NAMES: Readonly<Record<number, string>> = { [1]: 'starboard', [-1]: 'larboard' };

/** Which pending acts a new act replaces: one helm, one act per sail, one per mast's yards. */
function sameWork(a: Act, b: Act): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'sail') return a.sail === (b as SailAct).sail;
  if (a.kind === 'yards') return a.mast === (b as YardsAct).mast;
  return true;
}

type Changes = Partial<Pick<ShipOrders, 'helm' | 'canvas' | 'hove' | 'backed'>>;
type NewAct = Omit<HelmAct, 'id' | 'of'> | Omit<SailAct, 'id' | 'of'> | Omit<YardsAct, 'id' | 'of'>;

/** What the master says as he takes an order: nothing, or a code and its words. */
interface Said {
  readonly reason: string;
  readonly code: AnswerCode | null;
}
const NOTHING_SAID: Said = { reason: '', code: null };

/**
 * An order taken: the changes to what she is told, its acts (replacing the pending acts for the same work, and every
 * pending sail act when `resail`), and the orders left with nothing to do dropped (replaced).
 */
function tell(told: ShipOrders, order: SailingOrder, tick: number, changes: Changes, acts: readonly NewAct[], resail: boolean, said: Said = NOTHING_SAID): OrderAnswer {
  const id = told.serial;
  const added = acts.map((a, k) => ({ ...a, id: id + 1 + k, of: id }) as Act);
  const kept = told.acts.filter((p) => !(resail && p.kind === 'sail') && !added.some((a) => sameWork(a, p)));
  const all = [...kept, ...added];
  const given = told.given.filter((g) => all.some((a) => a.of === g.id));
  // An order that leaves nothing to do (it only stops work under way) is carried out at once.
  const now = added.length > 0 ? [...given, { id, order, tick }] : given;
  return { refused: false, told: { ...told, ...changes, acts: all, given: now, serial: id + 1 + acts.length }, ...said };
}

const refuse = (told: ShipOrders, code: RefusalCode, reason: string): OrderAnswer => ({ refused: true, told, reason, code });

/**
 * The helm told to steer `heading` (compass bearing, rad): the short way on the tack she is on, by wearing onto the
 * other, and then the master answers "wearing round" (taken, with words). Closer than close-hauled, the master answers
 * that she will not lie it and steers full and by on the nearer tack instead (design decisions for N3).
 */
function steer(told: ShipOrders, s: Sailing, order: SailingOrder, heading: number, now: OrderMoment): OrderAnswer {
  const from = now.wind.from, tack = tackOf(s.heading, from, s.sides[0]!), to = tackOf(heading, from, tack);
  const turn = to === tack ? 0 : -tack;
  if (Math.abs(angleDiff(heading, from)) < CLOSE_HAULED - BY_FOLLOW) {
    const by = closeHauled(to, from);
    const reason = `she will not lie ${headingWords(heading)}: full and by on the ${TACK_NAMES[to]} tack, ${headingWords(by)}${turn ? ', wearing round' : ''}`;
    return tell(told, order, now.tick, { helm: { heading: 0, by: to } }, [{ kind: 'helm', heading: by, turn }], false, { reason, code: 'will not lie' });
  }
  // Wearing for a course she can lie, the master says so too (design decision for N3), so the long way round is never a surprise.
  const wearing: Said = turn ? { reason: `wearing round, sir: ${headingWords(heading)} lies on the other tack`, code: 'wearing round' } : NOTHING_SAID;
  return tell(told, order, now.tick, { helm: { heading: wrapBearing(heading), by: 0 } }, [{ kind: 'helm', heading: wrapBearing(heading), turn }], false, wearing);
}

/** The sails the canvas `name` sets in a wind of `force` (hove to: the courses and boom sail kept in). */
function canvasTarget(name: CanvasName, force: number, hove: boolean): SailSetting[] {
  const sails = rigPlan().sails;
  return canvasFor(name, force).map((c, i) => (hove && HOVE_TO_IN.includes(sails[i]!.id) ? { set: false, reefs: 0 } : c));
}

/**
 * The acts that bring her sails from how they stand (`now`) to `target`, one per sail changed: taking in first (aloft
 * down), then setting. The crew mans them in that order, so where hands are short the sails come in before others go
 * up.
 */
function sailActs(now: readonly SailSetting[], target: readonly SailSetting[]): NewAct[] {
  // A sail part way (being set or taken in when a later order came) is changed too: set in full, or taken in.
  const changed = target.map((_, i) => i).filter((i) => target[i]!.set !== now[i]!.set || target[i]!.reefs !== now[i]!.reefs || sailShare(now[i]!) !== sailShare(target[i]!));
  const order = [...changed.filter((i) => !target[i]!.set).reverse(), ...changed.filter((i) => target[i]!.set)];
  return order.map((i) => ({ kind: 'sail', sail: i, set: target[i]!.set, reefs: target[i]!.reefs }));
}

/** One step shorter in sail (docs/design/orders.md: "Shorten" is one step down). */
const SHORTER: Readonly<Record<CanvasName, CanvasName | null>> = { all: 'plain', plain: 'battle', battle: 'bare', bare: null };

/** A canvas ordered: sail by sail from how her sails stand now, refused when nothing would change. */
function makeSail(told: ShipOrders, s: Sailing, order: SailingOrder, canvas: CanvasName, now: OrderMoment): OrderAnswer {
  const acts = sailActs(s.canvas, canvasTarget(canvas, now.force, told.hove));
  const pending = told.acts.some((a) => a.kind === 'sail');
  if (acts.length === 0 && !pending) return refuse(told, 'carries it already', `in this wind ${canvas === 'bare' ? 'bare poles are' : `${canvas} sail is`} what she carries already`);
  return tell(told, order, now.tick, { canvas }, acts, true);
}

/** She is in stays: a tack ordered and not yet put to the helm, or her bow turning up through the wind toward the other tack. */
function inStays(told: ShipOrders, s: Sailing, from: number): boolean {
  if (told.given.some((g) => g.order.kind === 'tack')) return true;
  const tack = tackOf(s.heading, from, s.sides[0]!);
  return s.steer.turn === tack && tackOf(s.steer.heading, from, tack) === -tack;
}

/** Why an order is not one at all (no such kind, a field that is not what it should be), or ''. Untrusted orders come from other machines. */
export function malformed(order: Order): string {
  switch (order.kind) {
    case 'steer': return Number.isFinite(order.heading) ? '' : 'the course is not a number';
    case 'sail': return Object.hasOwn(SHORTER, order.canvas) && (order.canvas as CanvasName) !== 'bare' ? '' : `there is no "${order.canvas} sail" (battle, plain, all)`;
    case 'back': return MASTS.includes(order.mast) ? '' : `there is no mast "${order.mast}" (${MASTS.join(', ')})`;
    case 'shot': return Object.hasOwn(SHOT, order.shot) ? '' : `there is no "${order.shot} shot" (round, chain, grape)`;
    case 'aim': return Object.hasOwn(AIM_HEIGHT, order.at) ? '' : `there is no aiming at her "${order.at}" (hull, rigging, deck)`;
    case 'up': case 'away': case 'by': case 'tack': case 'wear': case 'heave': case 'shorten': case 'fill': return '';
    case 'quarters': case 'stand': case 'bear': case 'hold': case 'fire': case 'cease': return '';
    case 'pumps': case 'fires': case 'wreckage': case 'plug': case 'pumping': return '';
    default: return `there is no order "${(order as { kind: string }).kind}"`;
  }
}

/**
 * An order given to a ship that has been told `told` and sails as `s`: what she is told now, and the answer in words
 * ('' when simply taken; refused, `told` comes back unchanged; taken with words, a `code`: a course she will not lie is
 * answered and changed, one on the other tack answered "wearing round").
 */
export function giveOrder(told: ShipOrders, s: Sailing, order: Order, now: OrderMoment): OrderAnswer {
  const bad = malformed(order);
  if (bad) return refuse(told, 'no such order', bad);
  if (isGunnery(order)) return gunnery(told, order);
  if (isLife(order)) return life(told, order, now.tick);
  const from = now.wind.from, tack = tackOf(s.heading, from, s.sides[0]!), base = toldHeading(told.helm, from);
  const baseTack = tackOf(base, from, tack);
  switch (order.kind) {
    case 'steer': return steer(told, s, order, order.heading, now);
    case 'up':
      if (told.helm.by) return refuse(told, 'full and by already', 'she is full and by: as close to the wind as she will lie');
      return steer(told, s, order, base + baseTack * POINT, now);
    case 'away': return steer(told, s, order, base - baseTack * POINT, now);
    case 'by':
      if (told.helm.by === tack) return refuse(told, 'full and by already', `she is full and by on the ${TACK_NAMES[tack]} tack already`);
      return tell(told, order, now.tick, { helm: { heading: 0, by: tack } }, [{ kind: 'helm', heading: closeHauled(tack, from), turn: 0 }], false);
    case 'tack': {
      if (s.ahead < NO_WAY) return refuse(told, 'no way', 'she has no way on her');
      if (inStays(told, s, from)) return refuse(told, 'in stays', 'she is in stays: not until she is round');
      return tell(told, order, now.tick, { helm: { heading: 0, by: -tack } }, [{ kind: 'helm', heading: closeHauled(-tack, from), turn: tack }], false);
    }
    case 'wear': {
      if (s.ahead < NO_WAY) return refuse(told, 'no way', 'she has no way on her');
      const mirror = wrapBearing(2 * from - base), close = Math.abs(angleDiff(mirror, from)) < CLOSE_HAULED || told.helm.by !== 0;
      const helm = close ? { heading: 0, by: -tack } : { heading: mirror, by: 0 };
      return tell(told, order, now.tick, { helm }, [{ kind: 'helm', heading: toldHeading(helm, from), turn: -tack }], false);
    }
    case 'heave': {
      if (told.hove) return refuse(told, 'hove to already', 'she is hove to already');
      const mast = MASTS.indexOf(HOVE_TO_MAST), heading = closeHauled(tack, from);
      const acts: NewAct[] = [
        { kind: 'helm', heading, turn: 0 },
        { kind: 'yards', mast, aback: true },
        { kind: 'yards', mast: MASTS.indexOf(HOVE_TO_CHECK), aback: true },
        ...sailActs(s.canvas, canvasTarget(told.canvas, now.force, true)),
      ];
      return tell(told, order, now.tick, { helm: { heading: 0, by: tack }, hove: true, backed: told.backed.map((b, m) => b || m === mast) }, acts, true);
    }
    case 'sail': return told.canvas === order.canvas ? refuse(told, 'canvas already', `she is under ${order.canvas} sail already`) : makeSail(told, s, order, order.canvas, now);
    case 'shorten': {
      const next = SHORTER[told.canvas];
      return next ? makeSail(told, s, order, next, now) : refuse(told, 'bare poles', 'she is under bare poles');
    }
    case 'back': {
      const mast = MASTS.indexOf(order.mast);
      if (told.backed[mast]) return refuse(told, 'aback already', `the ${order.mast} topsail is aback already`);
      return tell(told, order, now.tick, { backed: told.backed.map((b, m) => b || m === mast) }, [{ kind: 'yards', mast, aback: true }], false);
    }
    case 'fill': {
      const aback = MASTS.map((_, m) => told.backed[m]! || s.backed[m]!);
      if (!told.hove && !aback.some(Boolean)) return refuse(told, 'drawing', 'every sail is drawing');
      const acts: NewAct[] = aback.flatMap((b, mast) => (b ? [{ kind: 'yards' as const, mast, aback: false }] : []));
      if (!told.hove) return tell(told, order, now.tick, { backed: told.backed.map(() => false) }, acts, false);
      // Hove to: her canvas made again as ordered, and full and by on the tack she lies on.
      acts.push({ kind: 'helm', heading: closeHauled(tack, from), turn: 0 });
      acts.push(...sailActs(s.canvas, canvasTarget(told.canvas, now.force, false)));
      return tell(told, order, now.tick, { hove: false, backed: told.backed.map(() => false), helm: { heading: 0, by: tack } }, acts, true);
    }
  }
}

/** The firing orders need her at quarters (orders.md: "a ship not at quarters cannot fire"). */
const NOT_AT_QUARTERS = 'she is not at quarters';
/** How each way of firing is said when it stands already. */
const FIRING_SO: Readonly<Record<FireMode, string>> = { cease: 'the guns are not firing', bear: 'the guns are firing as they bear already', hold: 'the guns are held for your word already' };

/**
 * A gunnery order (N5.3a): taken at once, as what her guns are told (guns/gunnery.ts has the crews carry it out), or
 * refused. They take none of the sailing drill's hands.
 */
function gunnery(told: ShipOrders, order: GunneryOrder): OrderAnswer {
  const take = (changes: Partial<Pick<ShipOrders, 'quarters' | 'shot' | 'aim' | 'firing' | 'word'>>): OrderAnswer => ({ refused: false, told: { ...told, ...changes }, ...NOTHING_SAID });
  switch (order.kind) {
    case 'quarters': return told.quarters ? refuse(told, 'at quarters already', 'she is at quarters already') : take({ quarters: true });
    case 'stand': return told.quarters ? take({ quarters: false, firing: 'cease', word: false }) : refuse(told, 'not at quarters', NOT_AT_QUARTERS);
    case 'shot': return told.shot === order.shot ? refuse(told, 'loading it already', `the guns load ${order.shot} shot already`) : take({ shot: order.shot });
    case 'aim': return told.aim === order.at ? refuse(told, 'laid there already', `the guns are laid on her ${order.at} already`) : take({ aim: order.at });
    case 'fire':
      if (!told.quarters) return refuse(told, 'not at quarters', NOT_AT_QUARTERS);
      if (told.firing !== 'hold') return refuse(told, 'not held', 'the guns are not held for your word');
      return told.word ? refuse(told, 'word given', 'the broadside is firing') : take({ word: true });
    default: {
      // Fire as they bear, hold for my word, cease firing.
      const mode: FireMode = order.kind;
      if (!told.quarters) return refuse(told, 'not at quarters', NOT_AT_QUARTERS);
      if (told.firing === mode) return refuse(told, mode === 'cease' ? 'not firing' : 'firing so already', FIRING_SO[mode]);
      return take({ firing: mode, word: false });
    }
  }
}

/** The parties each order for her life sends, and how each is said when it is out already. */
const PARTY: Readonly<Record<'pumps' | 'fires' | 'wreckage', string>> = { pumps: 'the hands are at the pumps already', fires: 'the fire party is out already', wreckage: 'the hands are clearing the wreckage already' };
/** What the carpenter's crew does first by his orders. */
const FIRST: Readonly<Record<'plug' | 'pumping', CarpenterFirst>> = { plug: 'plug', pumping: 'pump' };

/** An order for her life (N6.3): it stands from now (crew/repairs.ts has the men do it when there is work), or is refused as given already. */
function life(told: ShipOrders, order: LifeOrder, tick: number): OrderAnswer {
  if (order.kind === 'plug' || order.kind === 'pumping') {
    const first = FIRST[order.kind];
    if (told.carpenter === first) return refuse(told, 'first already', `the carpenter's crew ${first === 'plug' ? 'plugs' : 'pumps'} first already`);
    return { refused: false, told: { ...told, carpenter: first }, ...NOTHING_SAID };
  }
  if (told[order.kind] !== null) return refuse(told, 'sent already', PARTY[order.kind]);
  return { refused: false, told: { ...told, [order.kind]: tick }, ...NOTHING_SAID };
}

/** What she is told once the captain's word has been carried out: every gun that could fire on it has fired (guns/gunnery.ts). */
export function wordSpent(told: ShipOrders): ShipOrders {
  return told.word ? { ...told, word: false } : told;
}

/** One step of carrying out: what she is still told, how she sails after the acts done now, and the orders now done. */
export interface CarriedOut {
  readonly told: ShipOrders;
  readonly sailing: Sailing;
  readonly done: readonly SailingOrder[];
}

/** One act done to her sailing (the sailing model's own calls). */
function act(s: Sailing, a: Act): Sailing {
  switch (a.kind) {
    case 'helm': return steerTo(s, a.heading, a.turn);
    case 'sail': return setSail(s, a.sail, { set: a.set, reefs: a.reefs });
    case 'yards': return layAback(s, MASTS[a.mast]!, a.aback);
  }
}

/**
 * The acts the crew finished this step (`finished`, their ids) done, in the order they were given, and the orders
 * whose last act that was reported done; full and by, the helmsman told the heading close-hauled in the mean wind
 * `wind` as it shifts.
 */
export function carryOut(told: ShipOrders, s: Sailing, finished: readonly number[], wind: Wind): CarriedOut {
  let sailing = s;
  const due = told.acts.filter((a) => finished.includes(a.id));
  let next = told;
  const done: SailingOrder[] = [];
  if (due.length > 0) {
    for (const a of due) sailing = act(sailing, a);
    const acts = told.acts.filter((a) => !finished.includes(a.id));
    const ended = told.given.filter((g) => due.some((a) => a.of === g.id) && !acts.some((a) => a.of === g.id));
    for (const g of ended) done.push(g.order);
    next = { ...told, acts, given: told.given.filter((g) => !ended.includes(g)) };
  }
  if (next.hove && !next.acts.some((a) => a.kind === 'yards')) sailing = keepHove(sailing, next);
  if (next.helm.by && !next.acts.some((a) => a.kind === 'helm') && !next.given.some((g) => g.order.kind === 'tack' || g.order.kind === 'wear')) {
    const heading = closeHauled(next.helm.by, wind.from);
    if (Math.abs(angleDiff(sailing.steer.heading, heading)) > BY_FOLLOW) sailing = steerTo(sailing, heading, sailing.steer.turn);
  }
  return { told: next, sailing, done };
}

/**
 * Hove to, the crew keeps her lying still once the yards are round: the fore yards laid aback to stop her are filled
 * when her way is off, and then the main yards are filled when she gathers sternway and laid aback again when she
 * gathers headway, so she lies within `NO_WAY` of still.
 */
function keepHove(s: Sailing, told: ShipOrders): Sailing {
  const check = MASTS.indexOf(HOVE_TO_CHECK), main = MASTS.indexOf(HOVE_TO_MAST);
  if (s.backed[check] && !told.backed[check] && s.ahead < NO_WAY) return layAback(s, HOVE_TO_CHECK, false);
  if (s.backed[check]) return s;
  if (s.backed[main] && s.ahead < -NO_WAY) return layAback(s, HOVE_TO_MAST, false);
  if (!s.backed[main] && s.ahead > NO_WAY) return layAback(s, HOVE_TO_MAST, true);
  return s;
}

/** What she is told after what happened under sail in a step: missing stays, the master bears away on the old tack, and that is her course now. */
export function heard(told: ShipOrders, events: readonly SailingEvent[], s: Sailing): ShipOrders {
  return events.includes('missed stays') ? { ...told, helm: { heading: s.steer.heading, by: 0 } } : told;
}
