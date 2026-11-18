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
import type { MastName } from './rules/rig';
import { CLOSE_HAULED, type CanvasName } from './rules/sailing';
import { rigPlan } from './ship/rig';
import { canvasFor, layAback, MASTS, setSail, steerTo, type Sailing, type SailingEvent } from './ship/sailing';
import type { SailSetting } from './ship/sails';
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
/** An order to one ship, named by her place in `SimState.ships`. Plain data, sent between machines as it is. */
export type Order = SteerOrder | PlainOrder | SailOrder | BackOrder;
export type OrderKind = Order['kind'];

/** One word of the vocabulary: who takes it (docs/design/orders.md), what it does, and what more it names. */
export interface OrderWord {
  readonly kind: OrderKind;
  readonly to: 'master' | 'first lieutenant';
  readonly what: string;
  readonly takes: 'heading' | 'canvas' | 'mast' | null;
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
  readonly order: Order;
  readonly tick: number;
}

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
}

/** A ship's orders at the start: steering her heading under the canvas she starts with, nothing aback, nothing to do. */
export function startOrders(heading: number, canvas: CanvasName): ShipOrders {
  return { helm: { heading: wrapBearing(heading), by: 0 }, canvas, hove: false, backed: MASTS.map(() => false), acts: [], given: [], serial: 0 };
}

/** What giving an order comes to: what she has now been told, and the answer in words ('' when simply taken). */
export interface OrderAnswer {
  readonly told: ShipOrders;
  readonly reason: string;
}

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

/**
 * An order taken: the changes to what she is told, its acts (replacing the pending acts for the same work, and every
 * pending sail act when `resail`), and the orders left with nothing to do dropped (replaced).
 */
function tell(told: ShipOrders, order: Order, tick: number, changes: Changes, acts: readonly NewAct[], resail: boolean, reason = ''): OrderAnswer {
  const id = told.serial;
  const added = acts.map((a, k) => ({ ...a, id: id + 1 + k, of: id }) as Act);
  const kept = told.acts.filter((p) => !(resail && p.kind === 'sail') && !added.some((a) => sameWork(a, p)));
  const all = [...kept, ...added];
  const given = told.given.filter((g) => all.some((a) => a.of === g.id));
  // An order that leaves nothing to do (it only stops work under way) is carried out at once.
  const now = added.length > 0 ? [...given, { id, order, tick }] : given;
  return { told: { ...told, ...changes, acts: all, given: now, serial: id + 1 + acts.length }, reason };
}

const refuse = (told: ShipOrders, reason: string): OrderAnswer => ({ told, reason });

/**
 * The helm told to steer `heading` (compass bearing, rad): the short way on the tack she is on, by wearing onto the
 * other, and then the master answers "wearing round" (taken, with words). Closer than close-hauled, the master answers
 * that she will not lie it and steers full and by on the nearer tack instead (design decisions for N3).
 */
function steer(told: ShipOrders, s: Sailing, order: Order, heading: number, now: OrderMoment): OrderAnswer {
  const from = now.wind.from, tack = tackOf(s.heading, from, s.sides[0]!), to = tackOf(heading, from, tack);
  const turn = to === tack ? 0 : -tack;
  if (Math.abs(angleDiff(heading, from)) < CLOSE_HAULED - BY_FOLLOW) {
    const by = closeHauled(to, from);
    const reason = `she will not lie ${headingWords(heading)}: full and by on the ${TACK_NAMES[to]} tack, ${headingWords(by)}${turn ? ', wearing round' : ''}`;
    return tell(told, order, now.tick, { helm: { heading: 0, by: to } }, [{ kind: 'helm', heading: by, turn }], false, reason);
  }
  // Wearing for a course she can lie, the master says so too (design decision for N3), so the long way round is never a surprise.
  const wearing = turn ? `wearing round, sir: ${headingWords(heading)} lies on the other tack` : '';
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
  const changed = target.map((_, i) => i).filter((i) => target[i]!.set !== now[i]!.set || target[i]!.reefs !== now[i]!.reefs);
  const order = [...changed.filter((i) => !target[i]!.set).reverse(), ...changed.filter((i) => target[i]!.set)];
  return order.map((i) => ({ kind: 'sail', sail: i, set: target[i]!.set, reefs: target[i]!.reefs }));
}

/** One step shorter in sail (docs/design/orders.md: "Shorten" is one step down). */
const SHORTER: Readonly<Record<CanvasName, CanvasName | null>> = { all: 'plain', plain: 'battle', battle: 'bare', bare: null };

/** A canvas ordered: sail by sail from how her sails stand now, refused when nothing would change. */
function makeSail(told: ShipOrders, s: Sailing, order: Order, canvas: CanvasName, now: OrderMoment): OrderAnswer {
  const acts = sailActs(s.canvas, canvasTarget(canvas, now.force, told.hove));
  const pending = told.acts.some((a) => a.kind === 'sail');
  if (acts.length === 0 && !pending) return refuse(told, `in this wind ${canvas === 'bare' ? 'bare poles are' : `${canvas} sail is`} what she carries already`);
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
    case 'up': case 'away': case 'by': case 'tack': case 'wear': case 'heave': case 'shorten': case 'fill': return '';
    default: return `there is no order "${(order as { kind: string }).kind}"`;
  }
}

/**
 * An order given to a ship that has been told `told` and sails as `s`: what she is told now, and the answer in words
 * ('' when simply taken; refused, `told` comes back unchanged; a course she will not lie is answered and changed).
 */
export function giveOrder(told: ShipOrders, s: Sailing, order: Order, now: OrderMoment): OrderAnswer {
  const bad = malformed(order);
  if (bad) return refuse(told, bad);
  const from = now.wind.from, tack = tackOf(s.heading, from, s.sides[0]!), base = toldHeading(told.helm, from);
  const baseTack = tackOf(base, from, tack);
  switch (order.kind) {
    case 'steer': return steer(told, s, order, order.heading, now);
    case 'up':
      if (told.helm.by) return refuse(told, 'she is full and by: as close to the wind as she will lie');
      return steer(told, s, order, base + baseTack * POINT, now);
    case 'away': return steer(told, s, order, base - baseTack * POINT, now);
    case 'by':
      if (told.helm.by === tack) return refuse(told, `she is full and by on the ${TACK_NAMES[tack]} tack already`);
      return tell(told, order, now.tick, { helm: { heading: 0, by: tack } }, [{ kind: 'helm', heading: closeHauled(tack, from), turn: 0 }], false);
    case 'tack': {
      if (s.ahead < NO_WAY) return refuse(told, 'she has no way on her');
      if (inStays(told, s, from)) return refuse(told, 'she is in stays: not until she is round');
      return tell(told, order, now.tick, { helm: { heading: 0, by: -tack } }, [{ kind: 'helm', heading: closeHauled(-tack, from), turn: tack }], false);
    }
    case 'wear': {
      if (s.ahead < NO_WAY) return refuse(told, 'she has no way on her');
      const mirror = wrapBearing(2 * from - base), close = Math.abs(angleDiff(mirror, from)) < CLOSE_HAULED || told.helm.by !== 0;
      const helm = close ? { heading: 0, by: -tack } : { heading: mirror, by: 0 };
      return tell(told, order, now.tick, { helm }, [{ kind: 'helm', heading: toldHeading(helm, from), turn: -tack }], false);
    }
    case 'heave': {
      if (told.hove) return refuse(told, 'she is hove to already');
      const mast = MASTS.indexOf(HOVE_TO_MAST), heading = closeHauled(tack, from);
      const acts: NewAct[] = [
        { kind: 'helm', heading, turn: 0 },
        { kind: 'yards', mast, aback: true },
        { kind: 'yards', mast: MASTS.indexOf(HOVE_TO_CHECK), aback: true },
        ...sailActs(s.canvas, canvasTarget(told.canvas, now.force, true)),
      ];
      return tell(told, order, now.tick, { helm: { heading: 0, by: tack }, hove: true, backed: told.backed.map((b, m) => b || m === mast) }, acts, true);
    }
    case 'sail': return told.canvas === order.canvas ? refuse(told, `she is under ${order.canvas} sail already`) : makeSail(told, s, order, order.canvas, now);
    case 'shorten': {
      const next = SHORTER[told.canvas];
      return next ? makeSail(told, s, order, next, now) : refuse(told, 'she is under bare poles');
    }
    case 'back': {
      const mast = MASTS.indexOf(order.mast);
      if (told.backed[mast]) return refuse(told, `the ${order.mast} topsail is aback already`);
      return tell(told, order, now.tick, { backed: told.backed.map((b, m) => b || m === mast) }, [{ kind: 'yards', mast, aback: true }], false);
    }
    case 'fill': {
      const aback = MASTS.map((_, m) => told.backed[m]! || s.backed[m]!);
      if (!told.hove && !aback.some(Boolean)) return refuse(told, 'every sail is drawing');
      const acts: NewAct[] = aback.flatMap((b, mast) => (b ? [{ kind: 'yards' as const, mast, aback: false }] : []));
      if (!told.hove) return tell(told, order, now.tick, { backed: told.backed.map(() => false) }, acts, false);
      // Hove to: her canvas made again as ordered, and full and by on the tack she lies on.
      acts.push({ kind: 'helm', heading: closeHauled(tack, from), turn: 0 });
      acts.push(...sailActs(s.canvas, canvasTarget(told.canvas, now.force, false)));
      return tell(told, order, now.tick, { hove: false, backed: told.backed.map(() => false), helm: { heading: 0, by: tack } }, acts, true);
    }
  }
}

/** One step of carrying out: what she is still told, how she sails after the acts done now, and the orders now done. */
export interface CarriedOut {
  readonly told: ShipOrders;
  readonly sailing: Sailing;
  readonly done: readonly Order[];
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
  const done: Order[] = [];
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
