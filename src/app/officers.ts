/**
 * The men the captain gives his orders to (implementation plan N4.4, docs/design/orders.md "Who takes which orders"):
 * the master at the wheel, the first lieutenant on the quarterdeck, the gunner in the waist, the carpenter at the
 * pumps, the lookout in the main top, and the midshipman who keeps at the captain's side. Pure: who they are, where
 * each stands in her plan, whom an order goes to, whether the captain's voice reaches them, and where the midshipman
 * delivers a message to each.
 *
 * Their names are the speech bubbles' voices (N4.5, src/app/speech/speakers.ts); each is a man of the roster
 * (`voiceMan`), drawn with the rest of the crew (render/crew/crewView.ts, N4.3) and put into the registry by his voice.
 */
import { VOCABULARY, type Order } from '../sim/orders';
import { brigRoster, crewPlaces, type Man } from '../sim/crew/roster';
import type { Voice } from './speech/speakers';
import { routeNetwork, standable } from '../sim/crew/network';
import { bareSpot, type Spot } from '../sim/ship/plan';

/** The six men the captain addresses, in the order the midshipman offers them. */
export const OFFICERS = ['master', 'first lieutenant', 'gunner', 'carpenter', 'lookout', 'midshipman'] as const;
export type Officer = (typeof OFFICERS)[number];
/** The men who take orders (the midshipman only carries them). */
export type Taker = Exclude<Officer, 'midshipman'>;
export const TAKERS: readonly Taker[] = OFFICERS.filter((o): o is Taker => o !== 'midshipman');

/** The weather deck, where every man in the open hears the captain (orders.md: on a 30 m brig, the whole weather deck). */
const WEATHER_DECK = 'deck';

/**
 * Where each man stands: a crew place of her plan or rig (roster.ts `crewPlaces`), shifted m forward and m to
 * starboard off it, and the way he faces (rad about +y as app/crewDrawn.ts: 0 aft, a half turn forward). The first
 * lieutenant stands to larboard of the quarterdeck station, where the captain comes on deck.
 */
const POSTS: Readonly<Record<Taker, { readonly place: string; readonly forward: number; readonly starboard: number }>> = {
  master: { place: 'station-wheel', forward: 0, starboard: 0 },
  'first lieutenant': { place: 'station-quarterdeck', forward: 0.4, starboard: -2.5 },
  gunner: { place: 'station-waist', forward: 0, starboard: 0 },
  carpenter: { place: 'station-pumps', forward: 0, starboard: 0 },
  lookout: { place: 'station-main-top', forward: 0, starboard: 0 },
};
/** The quarterdeck station, where the captain comes on deck (and is taken to stand when he looks from a standpoint aboard). */
export const quarterdeck = (): Spot => bareSpot(crewPlaces().get('station-quarterdeck')!);
/** Where the midshipman waits at first: this far abaft the captain on the quarterdeck and inboard of him, m. */
const MIDSHIPMAN_ABAFT = 1.2;
const MIDSHIPMAN_INBOARD = 0.6;
export const midshipmanStart = (): Spot => { const q = quarterdeck(); return { ...q, along: q.along - MIDSHIPMAN_ABAFT, across: q.across - MIDSHIPMAN_INBOARD }; };
/** Every man faces forward at his post: a half turn from aft. */
export const FACING_FORWARD = Math.PI;

/** Where a man stands at his post, ship plan. */
export function postOf(who: Taker): Spot {
  const p = POSTS[who], place = crewPlaces().get(p.place);
  if (!place) throw new Error(`no crew place ${p.place} for the ${who}`);
  return { space: place.space, along: place.along + p.forward, across: place.across + p.starboard };
}

/**
 * Where the midshipman gives a man his message: a step forward of him, or aft, or beside him, whichever is clear
 * deck; for a man aloft, at the foot of the main shrouds on the weather side, hailing up (he is not sent aloft).
 */
const DELIVER_STEP = 0.9;
const SHROUDS_FOOT: Spot = { space: WEATHER_DECK, along: -0.6, across: 2.6 };

/** The spot the midshipman runs to with a message for `who`. */
export function deliverAt(who: Taker): Spot {
  const post = postOf(who);
  if (!onDecks(post)) return SHROUDS_FOOT;
  const net = routeNetwork();
  for (const [forward, starboard] of [[DELIVER_STEP, 0], [-DELIVER_STEP, 0], [0, DELIVER_STEP], [0, -DELIVER_STEP]] as const) {
    const s = { space: post.space, along: post.along + forward, across: post.across + starboard };
    if (standable(net, s, [])) return s;
  }
  return post;
}

/** How far apart two spots are on one floor, m; another floor or space: Infinity (a route is what joins them). */
export const floorApart = (a: Spot, b: Spot): number => (a.space === b.space ? Math.hypot(a.along - b.along, a.across - b.across) : Infinity);

/** Whether a spot is on her decks (or below them), not aloft or out on the bowsprit. */
export const onDecks = (s: Spot): boolean => !routeNetwork().surfaces.has(s.space);

/** The man an order goes to, and who answers it (orders.md; sim/orders.ts `VOCABULARY`; the first lieutenant for any the vocabulary leaves out). */
export function takerOf(order: Order): Taker {
  return VOCABULARY.find((w) => w.kind === order.kind)?.to ?? 'first lieutenant';
}

/**
 * Whether the captain's voice reaches the man at `post` from `captain` (null: the captain is not aboard her or not
 * known to stand anywhere): both in the open, on the weather deck or aloft. Below deck he sends the midshipman.
 */
export function inVoice(captain: Spot | null, post: Spot): boolean {
  if (!captain) return false;
  const open = (s: Spot) => s.space === WEATHER_DECK || !onDecks(s);
  return open(captain) && open(post);
}

/**
 * The man of the roster (rules/crew.ts ROSTER) each voice is (N4.3: the crew drawn speaks): his rank, and for the
 * lookout the post he keeps (a main topman in the main top). The boatswain and the surgeon speak too (N4.5).
 */
const VOICE_MEN: Readonly<Record<Voice, { readonly rank: string; readonly post?: string }>> = {
  master: { rank: 'master' }, 'first lieutenant': { rank: 'first lieutenant' }, gunner: { rank: 'gunner' }, carpenter: { rank: 'carpenter' },
  lookout: { rank: 'main topman', post: 'top-main-p' }, midshipman: { rank: 'midshipman' }, boatswain: { rank: 'boatswain' }, surgeon: { rank: 'surgeon' },
};
/** The place in the roster of the man who speaks with `voice`. */
export function voiceMan(voice: Voice, roster: readonly Man[] = brigRoster()): number {
  const v = VOICE_MEN[voice], i = roster.findIndex((m) => m.rank === v.rank && (v.post === undefined || m.post === v.post));
  if (i < 0) throw new Error(`no ${v.rank} on the roster for the ${voice}`);
  return i;
}
