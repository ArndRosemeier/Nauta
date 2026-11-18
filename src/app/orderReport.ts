/**
 * The order panel's words (implementation plan N3.5, a working tool until the order fan of N4.4): which orders its
 * buttons give, how the ship answers in words (her heading, way, point of sail, canvas, what the crew is still doing)
 * and what each event of a step says. Pure: no DOM, so it runs in tests; orderPanel.ts puts it on the page.
 *
 * The panel talks to the running match through `OrderSession`, the seam it shares with the two-player session (N3.7):
 * the page's match (app/pageMatch.ts: the two-player session, alone or in a room) gives orders and hands on each step's events.
 */
import { angleDiff } from '@futuremagic/core';
import { giveOrder, headingWords, orderWords, VOCABULARY, type Order, type ShipOrders } from '../sim/orders';
import type { MastName } from '../sim/rules/rig';
import { JOBS } from '../sim/rules/crew';
import { CLOSE_HAULED } from '../sim/rules/sailing';
import { rigPlan } from '../sim/ship/rig';
import { MASTS } from '../sim/ship/sailing';
import { simTime, type SimState } from '../sim/state';
import type { SimEvent } from '../sim/step';
import { DEGREE, KNOT, SECONDS_PER_MINUTE, STEPS_PER_SECOND, wrapBearing } from '../sim/units';
import { meanWind } from '../sim/wind';

/** A running match as the panel sees it: my ship, the latest state, giving an order, and each step's events (after `state` has moved on to that step). */
export interface OrderSession {
  readonly ship: number;
  readonly state: SimState;
  give(order: Order): void;
  on(kind: 'events', fn: (events: readonly SimEvent[]) => void): void;
}

/** One button of the panel: the order it gives (for ship 0; the session's ship is put in when given), its words, who takes it. */
export interface OrderButton {
  readonly order: Order;
  readonly label: string;
  readonly to: string;
}

/** The canvas settings an order names, in the order the buttons show them. */
const SETTINGS = ['battle', 'plain', 'all'] as const;

/** Every order of the vocabulary as buttons, a course apart (the compass gives those): a canvas and a mast make one button each. */
export function orderButtons(): OrderButton[] {
  return VOCABULARY.flatMap((w): OrderButton[] => {
    const orders: Order[] = w.takes === 'canvas' ? SETTINGS.map((canvas) => ({ kind: 'sail', ship: 0, canvas }))
      : w.takes === 'mast' ? MASTS.map((mast: MastName) => ({ kind: 'back', ship: 0, mast }))
        : w.takes === 'heading' ? [] : [{ kind: w.kind, ship: 0 } as Order];
    return orders.map((order) => ({ order, label: orderWords(order), to: w.to }));
  });
}

/** The compass points the panel's "steer" row offers, by name, clockwise from north. */
export const STEER_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
/** The courses of those points, rad. */
export const steerPoint = (i: number): number => (i * 2 * Math.PI) / STEER_POINTS.length;
/** The sixteen points a bearing is named by on the panel. */
const POINT_NAMES = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

/** A bearing as the panel writes it: degrees and the nearest of the sixteen points (`248° WSW`). */
export function bearingWords(bearing: number): string {
  const share = wrapBearing(bearing) / (2 * Math.PI);
  return `${headingWords(bearing)}° ${POINT_NAMES[Math.round(share * POINT_NAMES.length) % POINT_NAMES.length]}`;
}

/**
 * The points of sail by the wind's angle off her bow, rad: up to each angle the name before it. Closer than
 * close-hauled she has no way to make (aback, or in irons); the rest are the seaman's names.
 */
const POINTS_OF_SAIL: readonly (readonly [upTo: number, name: string])[] = [
  [CLOSE_HAULED - 2 * DEGREE, 'head to wind'],
  [CLOSE_HAULED + 8 * DEGREE, 'close-hauled'],
  [80 * DEGREE, 'close reach'],
  [100 * DEGREE, 'wind on the beam'],
  [150 * DEGREE, 'broad reach'],
  [Math.PI + 1, 'running before the wind'],
];

/** Her point of sail and tack, heading `heading` in a wind from `from` (`close-hauled, starboard tack`). */
export function pointOfSail(heading: number, from: number): string {
  const d = angleDiff(heading, from), off = Math.abs(d);
  const name = POINTS_OF_SAIL.find(([upTo]) => off <= upTo)![1];
  return off === 0 || off === Math.PI ? name : `${name}, ${d > 0 ? 'starboard' : 'larboard'} tack`;
}

/** Knots written to a tenth. */
const knots = (metresPerSecond: number): string => `${(metresPerSecond / KNOT).toFixed(1)} kn`;

/** What the helmsman has been told, in words. */
function helmWords(told: ShipOrders): string {
  return told.helm.by ? `full and by, ${told.helm.by > 0 ? 'starboard' : 'larboard'} tack` : `steer ${headingWords(told.helm.heading)}`;
}

/** Her state in a few lines: heading and way, the wind and her point of sail, her canvas and yards. */
export function shipLines(state: SimState, ship: number): string[] {
  const s = state.ships[ship];
  if (!s) return [`there is no ship ${ship}`];
  const sail = s.sailing, wind = meanWind(state.wind, simTime(state));
  const way = sail.ahead < 0 ? `${knots(-sail.ahead)} astern` : knots(sail.ahead);
  const aback = MASTS.filter((_, m) => sail.backed[m]).map((mast) => `${mast} topsail aback`);
  return [
    `Heading ${bearingWords(sail.heading)} · ${way} · told: ${helmWords(s.told)}`,
    `Wind from ${bearingWords(wind.from)}, force ${state.wind.windForce} · ${pointOfSail(sail.heading, wind.from)}`,
    [`${s.told.canvas === 'bare' ? 'bare poles' : `${s.told.canvas} sail`}${s.told.hove ? ', hove to' : ''}`, ...aback].join(' · '),
  ];
}

/** What one timed act of an order is, in words. */
function actWords(act: ShipOrders['acts'][number]): string {
  if (act.kind === 'helm') return 'the helm';
  if (act.kind === 'yards') return `${MASTS[act.mast]} yards ${act.aback ? 'aback' : 'filled'}`;
  return `${act.set ? 'setting' : 'taking in'} the ${rigPlan().sails[act.sail]!.name}`;
}

/** What the crew is still doing: for each order being carried out, the job in hand, its men (on their way or at work) and the seconds of work left. */
export function crewLines(state: SimState, ship: number): string[] {
  const s = state.ships[ship];
  if (!s || s.told.given.length === 0) return ['Crew: standing by'];
  return s.told.given.map((g) => {
    const head = `Crew: ${orderWords(g.order)}`, tasks = s.crew.tasks.filter((t) => t.of === g.id);
    const first = tasks[0];
    if (!first) return `${head}: the word is passed`;
    const act = s.told.acts.find((a) => a.id === first.act);
    const n = first.hands.length;
    const men = n === 0 ? 'waiting for hands' : `${n} ${n === 1 ? 'man' : 'men'} ${first.began === null ? 'on the way' : 'at work'}`;
    const more = tasks.length > 1 ? `, ${tasks.length - 1} more ${tasks.length === 2 ? 'job' : 'jobs'}` : '';
    return `${head}: ${act ? `${actWords(act)}, ` : ''}${jobWords(first.job)}: ${men} (${Math.ceil(first.toDo)} s)${more}`;
  });
}

/** A crew job in words (rules/crew.ts `JOBS`), or its name when it is none of them. */
const jobWords = (job: string): string => (Object.hasOwn(JOBS, job) ? JOBS[job as keyof typeof JOBS].what : job);

/** The match's clock as minutes and seconds (`02:05`). */
export function clockWords(tick: number): string {
  const seconds = Math.floor(tick / STEPS_PER_SECOND);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(seconds / SECONDS_PER_MINUTE))}:${pad(seconds % SECONDS_PER_MINUTE)}`;
}

/** Two orders alike (as given and as kept in `told.given`, perhaps sent between machines). */
const sameOrder = (a: Order, b: Order): boolean => orderWords(a) === orderWords(b) && a.ship === b.ship;

/**
 * What an event of my ship says on the panel, or null when it is not about her. A refused order whose order she
 * kept (`told.given` in `state`, the state after the event's step) was taken with words: the master's answer.
 */
export function eventWords(e: SimEvent, state: SimState, ship: number): string | null {
  const at = clockWords(e.tick);
  switch (e.kind) {
    case 'refused': {
      if (e.order.ship !== ship) return null;
      const taken = state.ships[ship]?.told.given.some((g) => g.tick === e.tick && sameOrder(g.order, e.order));
      return taken ? `${at} ${orderWords(e.order)}: ${e.reason}` : `${at} ✗ ${orderWords(e.order)}: ${e.reason}`;
    }
    case 'done': return e.ship === ship ? `${at} ✓ ${orderWords(e.order)}: done` : null;
    case 'tacked': return e.ship === ship ? `${at} she has come through the wind` : null;
    case 'wore': return e.ship === ship ? `${at} she has worn round` : null;
    case 'missed stays': return e.ship === ship ? `${at} she missed stays and falls back` : null;
    case 'short-handed': return e.ship === ship ? `${at} ${orderWords(e.order)}: short-handed: ${jobWords(e.job)}` : null;
  }
}

/**
 * Whether a button's order is standing now (the ring of the order fan: "what did I tell him"): the canvas ordered,
 * full and by, hove to, a mast told aback.
 */
export function isStanding(order: Order, told: ShipOrders): boolean {
  switch (order.kind) {
    case 'sail': return told.canvas === order.canvas;
    case 'by': return told.helm.by !== 0;
    case 'heave': return told.hove;
    case 'back': return told.backed[MASTS.indexOf(order.mast)] === true;
    default: return told.given.some((g) => g.order.kind === order.kind);
  }
}

/** Whether my ship would refuse `order` now (the button is shown dim; tapped, it still asks and the reason is shown). */
export function wouldRefuse(state: SimState, order: Order): boolean {
  const s = state.ships[order.ship];
  if (!s) return true;
  const answer = giveOrder(s.told, s.sailing, order, { tick: state.tick, wind: meanWind(state.wind, simTime(state)), force: state.wind.windForce });
  return answer.told === s.told;
}
