/**
 * What the order fan offers (implementation plan N4.4, docs/design/orders.md "The order fan"): for each man, at most
 * six orders round the finger, those that make sense for him at this moment, with at most one more ring ("About"
 * opens tack and wear, "Make sail" the settings of sail). An order he cannot carry out now is offered dim (chosen, the
 * match refuses it and he says why, N4.5); the order he is carrying out carries a ring. The midshipman's fan offers
 * first whom the message is for, then that man's own fan. Also: which drawn man a finger points at, and the order
 * keys. Pure: the fan on the page is orderFan.ts.
 */
import type { GunsOrder, KeepOrder, LifeOrder, Order, PlainOrder, SoundOrder } from '../sim/orders';
import type { SimState } from '../sim/state';
import { MASTS } from '../sim/ship/sailing';
import { isStanding, wouldRefuse } from './orderReport';
import type { KeyAction } from './settings';
import type { WordKey } from './words';
import { OFFICERS, TAKERS, inVoice, postOf, type Officer, type Taker } from './officers';
import type { Spot } from '../sim/ship/plan';

/** What choosing an item does. */
export type FanAct =
  /** Gives an order (made for ship 0; the fan puts in the captain's ship). */
  | { readonly kind: 'order'; readonly order: Order }
  /** Opens one more ring. */
  | { readonly kind: 'ring'; readonly items: readonly FanItem[] }
  /** Steer there: the captain points his arm where she is to go, and gives it where he looks. */
  | { readonly kind: 'steer there' }
  /** The lookout is asked what he sees (his report is a bubble, N4.5). */
  | { readonly kind: 'look out' }
  /** The midshipman: the message is for this man; his fan opens. */
  | { readonly kind: 'to'; readonly who: Taker };

/** One round tag of the fan: its words (a second line in small italic), and what it does. */
export interface FanItem {
  readonly id: string;
  readonly word: WordKey;
  readonly detail: WordKey | null;
  readonly act: FanAct;
}

/** An item as shown now: dim (he would refuse it now), ringed (it is what he is carrying out). */
export interface FanSlot {
  readonly item: FanItem;
  readonly dim: boolean;
  readonly on: boolean;
}

/** The most orders a fan offers, and the most rings deep it goes (orders.md). */
export const FAN_MOST = 6;
export const FAN_DEPTH = 2;

const order = (id: string, word: WordKey, o: Order, detail: WordKey | null = null): FanItem => ({ id, word, detail, act: { kind: 'order', order: o } });
const plain = (kind: PlainOrder['kind'] | GunsOrder['kind'] | LifeOrder['kind'] | KeepOrder['kind'] | SoundOrder['kind']): Order => ({ kind, ship: 0 } as Order);

/** The master's ring "Keep her": his standing helm orders (orders.md "The fans as built"). */
const KEEP: readonly FanItem[] = [order('by', 'fanBy', plain('by')), order('follow', 'fanFollow', plain('follow')), order('abeam', 'fanAbeam', plain('abeam'))];
/** The master's ring "About": through the wind, or round before it. */
const ABOUT: readonly FanItem[] = [order('tack', 'fanTack', plain('tack')), order('wear', 'fanWear', plain('wear'))];
/** The first lieutenant's ring "Make sail": the three settings of sail. */
const SETTINGS: readonly FanItem[] = [
  order('sail-battle', 'fanBattle', { kind: 'sail', ship: 0, canvas: 'battle' }),
  order('sail-plain', 'fanPlain', { kind: 'sail', ship: 0, canvas: 'plain' }),
  order('sail-all', 'fanAll', { kind: 'sail', ship: 0, canvas: 'all' }),
];
/** Back the main topsail (orders.md names the main; the fore stays an order of the panel). */
const BACK: Order = { kind: 'back', ship: 0, mast: 'main' };
/** The first lieutenant's ring "Her life": men from the guns to the pumps, against fire, to cut the wreckage away. */
const LIFE: readonly FanItem[] = [
  order('pumps', 'fanPumps', plain('pumps')),
  order('fires', 'fanFires', plain('fires')),
  order('wreckage', 'fanWreckage', plain('wreckage')),
];
/** The gunner's rings: the shot of the next loading, and where the guns are laid on her. */
const SHOTS: readonly FanItem[] = [
  order('shot-round', 'fanRound', { kind: 'shot', ship: 0, shot: 'round' }),
  order('shot-chain', 'fanChain', { kind: 'shot', ship: 0, shot: 'chain' }),
  order('shot-grape', 'fanGrape', { kind: 'shot', ship: 0, shot: 'grape' }),
];
const AIMS: readonly FanItem[] = [
  order('aim-hull', 'fanHull', { kind: 'aim', ship: 0, at: 'hull' }),
  order('aim-rigging', 'fanRigging', { kind: 'aim', ship: 0, at: 'rigging' }),
  order('aim-deck', 'fanDeck', { kind: 'aim', ship: 0, at: 'deck' }),
];

/** Whether she has a mast aback or is hove to: then the first lieutenant offers "Fill" where he offered "Back". */
function backed(state: SimState, ship: number): boolean {
  const told = state.ships[ship]?.told;
  return !!told && (told.hove || MASTS.some((_, m) => told.backed[m]));
}

/** Whether she is at quarters: the first lieutenant offers "Stand down" where he offered "Beat to quarters". */
const atQuarters = (state: SimState, ship: number): boolean => state.ships[ship]?.told.quarters ?? false;

/**
 * Whether her guns wait for the captain's word now (held at quarters, the word not yet given): the one order with no
 * walk and no fan, a large "Fire!" by the thumb wherever he stands (orders.md).
 */
export function waitingForWord(state: SimState, ship: number): boolean {
  const told = state.ships[ship]?.told;
  return !!told && told.quarters && told.firing === 'hold' && !told.word;
}

/** The orders a man takes, as offered now (the midshipman's are the men he can carry a message to). */
export function fanItems(who: Officer, state: SimState, ship: number): readonly FanItem[] {
  switch (who) {
    case 'master': return [
      { id: 'steer', word: 'fanSteer', detail: null, act: { kind: 'steer there' } },
      order('up', 'fanUp', plain('up'), 'fanPoint'),
      order('away', 'fanAway', plain('away'), 'fanPoint'),
      { id: 'about', word: 'fanAbout', detail: 'fanAboutDetail', act: { kind: 'ring', items: ABOUT } },
      { id: 'keep', word: 'fanKeep', detail: 'fanKeepDetail', act: { kind: 'ring', items: KEEP } },
      order('heave', 'fanHeave', plain('heave')),
    ];
    case 'first lieutenant': return [
      { id: 'sail', word: 'fanSail', detail: null, act: { kind: 'ring', items: SETTINGS } },
      order('shorten', 'fanShorten', plain('shorten')),
      backed(state, ship) ? order('fill', 'fanFill', plain('fill'), 'fanFillDetail') : order('back', 'fanBack', BACK, 'fanBackDetail'),
      atQuarters(state, ship) ? order('stand', 'fanStand', plain('stand')) : order('quarters', 'fanQuarters', plain('quarters')),
      { id: 'life', word: 'fanLife', detail: 'fanLifeDetail', act: { kind: 'ring', items: LIFE } },
      order('strike', 'fanStrike', plain('strike'), 'fanStrikeDetail'),
    ];
    case 'gunner': return [
      { id: 'shot', word: 'fanShot', detail: null, act: { kind: 'ring', items: SHOTS } },
      { id: 'aim', word: 'fanAim', detail: null, act: { kind: 'ring', items: AIMS } },
      order('bear', 'fanBear', plain('bear')),
      order('hold', 'fanHold', plain('hold'), 'fanHoldDetail'),
      order('cease', 'fanCease', plain('cease')),
    ];
    case 'carpenter': return [order('sound', 'fanSound', plain('sound')), order('plug', 'fanPlug', plain('plug')), order('pumping', 'fanPumping', plain('pumping'))];
    case 'lookout': return [{ id: 'look-out', word: 'fanLookOut', detail: null, act: { kind: 'look out' } }];
    case 'midshipman': return TAKERS.filter((t) => fanItems(t, state, ship).length > 0).map((t) => ({ id: `to-${t}`, word: RANK_WORDS[t], detail: null, act: { kind: 'to', who: t } }));
  }
}

/** Each man's rank in words (the fan's hub, the midshipman's choice). */
export const RANK_WORDS: Readonly<Record<Officer, WordKey>> = {
  master: 'rankMaster', 'first lieutenant': 'rankFirst', gunner: 'rankGunner', carpenter: 'rankCarpenter', lookout: 'rankLookout', midshipman: 'rankMidshipman',
};

/** What each man is for, in a few words (the officer row's line under his rank). */
export const ROLE_WORDS: Readonly<Record<Officer, WordKey>> = {
  master: 'roleMaster', 'first lieutenant': 'roleFirst', gunner: 'roleGunner', carpenter: 'roleCarpenter', lookout: 'roleLookout', midshipman: 'roleMidshipman',
};

/** One man of the officer row: who, and whether his orders go by the midshipman now (the captain's voice does not reach him). */
export interface OfficerCard {
  readonly who: Officer;
  readonly rank: WordKey;
  readonly role: WordKey;
  readonly far: boolean;
}

/**
 * Everyone the captain can command, each as a card of the officer row (Arnd 2026-11-18: "give me everybody that I can
 * command as an icon with a small description below"), in the order the midshipman offers them. A man out of the
 * captain's voice is `far`: his orders go by the midshipman (the midshipman himself is always at hand).
 */
export function officerCards(captain: Spot | null): OfficerCard[] {
  return OFFICERS.map((who) => ({ who, rank: RANK_WORDS[who], role: ROLE_WORDS[who], far: who !== 'midshipman' && !inVoice(captain, postOf(who)) }));
}

/** The orders an item gives, itself or through its ring. */
function ordersOf(item: FanItem, ship: number): Order[] {
  const a = item.act;
  if (a.kind === 'order') return [{ ...a.order, ship }];
  return a.kind === 'ring' ? a.items.flatMap((i) => ordersOf(i, ship)) : [];
}

/** The items as shown now: an order dim when the match would refuse it, ringed while standing; a ring dim when all in it are, ringed when one is. */
export function fanSlots(items: readonly FanItem[], state: SimState, ship: number): FanSlot[] {
  const told = state.ships[ship]?.told;
  return items.map((item) => {
    const orders = ordersOf(item, ship);
    if (orders.length === 0) return { item, dim: false, on: item.act.kind === 'steer there' && !!told && isStanding({ kind: 'steer', ship, heading: 0 }, told) };
    return { item, dim: orders.every((o) => wouldRefuse(state, o)), on: !!told && orders.some((o) => isStanding(o, told)) };
  });
}

/** The slot of a fan nearest a point, given the slots' places round the hub (px), within `reach` px of its middle; -1: none. */
export function slotAt(places: readonly (readonly [number, number])[], x: number, y: number, reach: number): number {
  let best = -1, nearest = reach;
  places.forEach(([px, py], i) => {
    const d = Math.hypot(px - x, py - y);
    if (d <= nearest) { nearest = d; best = i; }
  });
  return best;
}

/** Where the slots of a fan of `n` lie round its hub, px from it: the first at the top, then clockwise. */
export function slotPlaces(n: number, radius: number): [number, number][] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * 2 * Math.PI;
    return [radius * Math.sin(a), -radius * Math.cos(a)];
  });
}

/** A drawn man as the view shows him: who, where on the screen (px), and whether he is in view. */
export interface ManOnScreen {
  readonly who: Officer;
  readonly x: number;
  readonly y: number;
  readonly seen: boolean;
  /** Out of view: whether he is to the left of the look (turn left to see him). */
  readonly left?: boolean;
}

/** Officer `who` among the men on the view (undefined: not drawn). */
export const manOnScreen = (men: readonly ManOnScreen[], who: Officer): ManOnScreen | undefined => men.find((m) => m.who === who);

/** The man nearest a point on the screen within `reach` px of him, or null. */
export function manAt(men: readonly ManOnScreen[], x: number, y: number, reach: number): Officer | null {
  const i = slotAt(men.map((m) => (m.seen ? [m.x, m.y] as const : [Infinity, Infinity] as const)), x, y, reach);
  return i < 0 ? null : men[i]!.who;
}

/** What each order key does: an order to its man, steer there where the captain looks, or F: fire as they bear, and while the guns wait for his word, the word (orders.md "Keys"). */
export const KEY_ORDERS: Readonly<Partial<Record<KeyAction, Order | 'steer there' | 'fire'>>> = {
  steer: 'steer there',
  up: plain('up'),
  away: plain('away'),
  tack: plain('tack'),
  wear: plain('wear'),
  heave: plain('heave'),
  battle: { kind: 'sail', ship: 0, canvas: 'battle' },
  plain: { kind: 'sail', ship: 0, canvas: 'plain' },
  all: { kind: 'sail', ship: 0, canvas: 'all' },
  shorten: plain('shorten'),
  quarters: plain('quarters'),
  round: { kind: 'shot', ship: 0, shot: 'round' },
  chain: { kind: 'shot', ship: 0, shot: 'chain' },
  grape: { kind: 'shot', ship: 0, shot: 'grape' },
  fire: 'fire',
  cease: plain('cease'),
};


/** Whether two orders say the same (their every field alike): a fan's order and a key's. */
const sameOrder = (a: Order, b: Order): boolean => {
  const x = a as unknown as Record<string, unknown>, y = b as unknown as Record<string, unknown>;
  return Object.keys(x).length === Object.keys(y).length && Object.keys(x).every((k) => x[k] === y[k]);
};

/**
 * The key that gives what a fan's item gives, or null (a ring, an order with no key): shown on the tag on a desk, so
 * the fan teaches the keys. "Fire as they bear" is F (which, while the guns wait for the word, gives the word).
 */
export function keyOfItem(item: FanItem): KeyAction | null {
  const a = item.act;
  if (a.kind === 'steer there') return 'steer';
  if (a.kind !== 'order') return null;
  if (a.order.kind === 'bear') return 'fire';
  const found = (Object.keys(KEY_ORDERS) as KeyAction[]).find((k) => { const o = KEY_ORDERS[k]; return typeof o === 'object' && sameOrder(o, a.order); });
  return found ?? null;
}
