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
import { AIM_HEIGHT, SHOT, type AimName, type ShotKind } from '../sim/rules/guns';
import { CLOSE_HAULED } from '../sim/rules/sailing';
import { gunAt, gunCount, type Battery } from '../sim/guns/guns';
import { rigPlan, sparOf } from '../sim/ship/rig';
import { MASTS } from '../sim/ship/sailing';
import { simTime, type SimState } from '../sim/state';
import type { LostHow } from '../sim/end';
import { orderMoment, type SimEvent } from '../sim/step';
import { DEGREE, KNOT, SECONDS_PER_MINUTE, STEPS_PER_SECOND, wrapBearing } from '../sim/units';
import { meanWind } from '../sim/wind';
import type { Navy } from './terms';

/** A running match as the panel sees it: my ship, the latest state, giving an order, and each step's events (after `state` has moved on to that step). */
export interface OrderSession {
  readonly ship: number;
  /** My ship's navy, when the session knows it (crewLooks.ts `navyOf` otherwise). */
  readonly navy?: Navy;
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

/** Every order of the vocabulary as buttons, a course apart (the compass gives those): a canvas, a mast, a shot and an aim make one button each. */
export function orderButtons(): OrderButton[] {
  return VOCABULARY.flatMap((w): OrderButton[] => {
    const orders: Order[] = w.takes === 'canvas' ? SETTINGS.map((canvas) => ({ kind: 'sail', ship: 0, canvas }))
      : w.takes === 'mast' ? MASTS.map((mast: MastName) => ({ kind: 'back', ship: 0, mast }))
        : w.takes === 'shot' ? (Object.keys(SHOT) as ShotKind[]).map((shot) => ({ kind: 'shot', ship: 0, shot }))
          : w.takes === 'aim' ? (Object.keys(AIM_HEIGHT) as AimName[]).map((at) => ({ kind: 'aim', ship: 0, at }))
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
    gunsLine(s.told, s.guns),
  ];
}

/** How each way of firing reads on the panel. */
const FIRING_WORDS: Readonly<Record<ShipOrders['firing'], string>> = { cease: 'not firing', bear: 'firing as they bear', hold: 'held for your word' };

/** Her guns in a line: secured, or at quarters with the shot, the aim, how they fire and how many stand ready. */
function gunsLine(told: ShipOrders, guns: Battery): string {
  const all = Array.from({ length: gunCount(guns) }, (_, i) => gunAt(guns, i)).filter((g) => !g.dismounted);
  const ready = all.filter((g) => g.drill === 'ready').length;
  if (!told.quarters) return `Guns secured${ready ? `, ${ready} still run out` : ''}`;
  const firing = told.word ? 'firing on your word' : FIRING_WORDS[told.firing];
  return `At quarters · ${told.shot} shot at her ${told.aim} · ${firing} · ${ready} of ${all.length} guns ready`;
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

/** What an event of my ship says on the panel, or null when it is not about her: an order refused is crossed, one taken with words gives the master's answer; the enemy's guns are heard too. */
export function eventWords(e: SimEvent, ship: number): string | null {
  const at = clockWords(e.tick);
  switch (e.kind) {
    case 'refused': return e.order.ship === ship ? `${at} ✗ ${orderWords(e.order)}: ${e.reason}` : null;
    case 'answered': return e.ship === ship ? `${at} ${orderWords(e.order)}: ${e.reason}` : null;
    // An order taken without words: the button pressed is its record (the bubble says "Aye aye, sir", N4.5).
    case 'taken': return null;
    case 'done': return e.ship === ship ? `${at} ✓ ${orderWords(e.order)}: done` : null;
    case 'tacked': return e.ship === ship ? `${at} she has come through the wind` : null;
    case 'wore': return e.ship === ship ? `${at} she has worn round` : null;
    case 'missed stays': return e.ship === ship ? `${at} she missed stays and falls back` : null;
    case 'short-handed': return e.ship === ship ? `${at} ${orderWords(e.order)}: short-handed: ${jobWords(e.job)}` : null;
    // A gun fired, hers or the enemy's: a broadside is a run of the same words (the panel counts them).
    case 'fired': return `${at} ${e.ship === ship ? 'our guns fire' : 'she fires'} ${e.fired.shot} shot`;
    case 'struck': return e.ship === ship ? `${at} she has run foul of the other ship` : null;
    case 'fouled':
      if (e.ship === ship) return `${at} her ${sparOf(rigPlan(), e.spar).name} is foul of the other ship's rigging`;
      return e.other === ship ? `${at} the other ship's ${sparOf(rigPlan(), e.spar).name} is foul of our rigging` : null;
    // What shot does and what follows (a spar falling, fire, water) is shown and heard where it happens (N6.5, N6.8),
    // never written; the men's cries for it ("the wheel's shot away", "fire!") come with the phrase book (N4.5).
    case 'hit':
    case 'aftermath': return null;
    // What the first lieutenant and the master say of the fight, until the phrase book's bubbles (N4.5); and its end.
    case 'beaten': return e.ship === ship ? `${at} we must strike, sir` : null;
    case 'light': return `${at} the light is failing, sir`;
    case 'end': return `${at} the fight is over: ${endWords(e.lost, ship)}`;
  }
}

/** How the panel says a fight ended, for my ship `ship`. */
function endWords(lost: readonly (LostHow | null)[], ship: number): string {
  const how = (l: LostHow, ours: boolean): string => {
    if (l === 'struck') return ours ? 'we have struck' : 'she has struck';
    if (l === 'blew up') return ours ? 'our magazine has gone up' : 'she has blown up';
    return ours ? `we are ${l === 'sunk' ? 'sinking' : 'burnt out'}` : `she is ${l === 'sunk' ? 'sinking' : 'burnt out'}`;
  };
  const words = lost.flatMap((l, i) => (l === null ? [] : [how(l, i === ship)]));
  return words.length === 0 ? 'they part at nightfall, drawn' : words.join(', ');
}

/**
 * Whether a button's order is standing now (the ring of the order fan: "what did I tell him"): the canvas ordered,
 * full and by, hove to, a mast told aback; at quarters or not, the shot, the aim, how her guns fire, the word.
 */
export function isStanding(order: Order, told: ShipOrders): boolean {
  switch (order.kind) {
    case 'sail': return told.canvas === order.canvas;
    case 'by': return told.helm.by !== 0 && !told.keep;
    case 'follow': case 'abeam': return told.keep?.kind === order.kind;
    case 'heave': return told.hove;
    case 'back': return told.backed[MASTS.indexOf(order.mast)] === true;
    case 'quarters': return told.quarters;
    case 'stand': return !told.quarters;
    case 'shot': return told.shot === order.shot;
    case 'aim': return told.aim === order.at;
    case 'bear': case 'hold': case 'cease': return told.quarters && told.firing === order.kind;
    case 'fire': return told.word;
    case 'pumps': case 'fires': case 'wreckage': return told[order.kind] !== null;
    case 'plug': return told.carpenter === 'plug';
    case 'pumping': return told.carpenter === 'pump';
    case 'strike': return told.struck;
    default: return told.given.some((g) => g.order.kind === order.kind);
  }
}

/** Whether my ship would refuse `order` now (the button is shown dim; tapped, it still asks and the reason is shown). */
export function wouldRefuse(state: SimState, order: Order): boolean {
  const s = state.ships[order.ship];
  if (!s) return true;
  const answer = giveOrder(s.told, s.sailing, order, orderMoment(state, order.ship));
  return answer.refused;
}
