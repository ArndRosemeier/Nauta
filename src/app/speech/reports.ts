/**
 * The reports table (implementation plan N4.5, docs/design/orders.md "How an order travels" and "What you are told
 * without asking"): who says what, raised by the simulation's events and by what her officers notice (sim/notices.ts),
 * never by a rule of the interface. Pure. Each event of my ship (or of her, as my lookout sees her) becomes the lines
 * the men say: the man addressed answers an order and the boatswain passes it down; the master, the lookout, the first
 * lieutenant, the gunner and the carpenter report; a cry in danger is said larger and may interrupt. The words are the
 * phrase book's (phrases.ts); the bubbles (bubbles.ts) decide when each is seen.
 */
import { angleDiff } from '@futuremagic/core';
import { sparParts } from '../../sim/damage/meet';
import type { LostHow } from '../../sim/end';
import { foeOf } from '../../sim/foes';
import { founderTonnes } from '../../sim/damage/flood';
import { WATER_MARKS, type Notice } from '../../sim/notices';
import type { Order } from '../../sim/orders';
import { POINT } from '../../sim/rules/orders';
import { LOAD_WATERLINE } from '../../sim/rules/ships';
import { rigPlan } from '../../sim/ship/rig';
import type { SimEvent } from '../../sim/step';
import type { SimState } from '../../sim/state';
import { bearingTo } from '../../sim/units';
import { takerOf } from '../officers';
import type { Line, Term } from './phrases';
import type { Voice } from './speakers';

/**
 * What kind of thing is said: an answer to the captain's order, the order passed down the chain, a report, a cry
 * in danger (larger, with a sound, the only kind that may interrupt another bubble), or the first lieutenant teaching
 * a new captain in his first match (plan N7.4, app/lessons.ts: read longer, never dropped as soon as a report).
 */
export type SayKind = 'answer' | 'pass' | 'lesson' | 'report' | 'cry';

/** One thing a man says. */
export interface Say {
  readonly voice: Voice;
  /** His ship. */
  readonly ship: number;
  readonly line: Line;
  readonly kind: SayKind;
  /** The terms filled into the line (`{side}`, `{mast}`, `{where}`, `{who}`). */
  readonly terms?: Readonly<Record<string, Term>>;
  /** Seconds after the event that it is said: the order passed down comes after the answer. */
  readonly delay?: number;
}

/**
 * The captain's word as the order fan (N4.4) sends it: an order, or the lookout asked what he sees (`ask`). `runner`:
 * the midshipman carries it (his "Aye aye, sir" before he runs; the officer answers when he arrives, `taken`).
 */
export interface Sent {
  readonly kind: 'sent';
  /** The officer the order is for. */
  readonly voice: Voice;
  readonly ship: number;
  readonly order: Order | null;
  readonly ask: 'look out' | null;
  readonly via: 'hail' | 'midshipman' | 'key';
  readonly runner: boolean;
}

/** Seconds after the answer that the boatswain passes an order down: the answer is read first. */
export const PASS_DELAY = 1.4;

/** The order kinds the boatswain passes down, and his line for each. */
const PASSED: Partial<Record<Order['kind'], Line>> = {
  tack: 'pass.tack', wear: 'pass.wear', heave: 'pass.heave', sail: 'pass.sail', shorten: 'pass.shorten', back: 'pass.back',
  fill: 'pass.fill', quarters: 'pass.quarters', stand: 'pass.stand',
};

/** The answer to an order taken as given: its own line where the phrase book has one, the plain "Aye aye, sir" else. */
function ayeLine(order: Order): Line {
  switch (order.kind) {
    case 'sail': return `aye.sail.${order.canvas}`;
    case 'shot': return `aye.shot.${order.shot}`;
    case 'aim': return `aye.aim.${order.at}`;
    default: return `aye.${order.kind}` as Line;
  }
}

/** The terms an order names (a mast). */
const orderTerms = (order: Order): Readonly<Record<string, Term>> | undefined => (order.kind === 'back' ? { mast: order.mast } : undefined);

/** The mast a spar stands on (fore or main), or null (the bowsprit's). */
function mastOfSpar(id: string): Term | null {
  const mast = rigPlan().spars.find((s) => s.id === id)?.mast;
  return mast === 'fore' || mast === 'main' ? mast : null;
}
/** The mast of a spar's part (damage/meet.ts `sparParts`), or null. */
const mastOfPart = (part: number): Term | null => {
  const p = sparParts()[part];
  return p ? mastOfSpar(p.spar) : null;
};

/** Her bearing off the bow, as the lookout names it: dead ahead, on a bow, on a beam, on a quarter, right astern (rad, + starboard). */
const AHEAD_WITHIN = POINT;
const BOW_WITHIN = 6 * POINT;
const BEAM_WITHIN = 10 * POINT;
const QUARTER_WITHIN = 15 * POINT;
export function whereTerm(off: number): Term {
  const a = Math.abs(off), side = off >= 0 ? 'starboard' : 'larboard';
  if (a < AHEAD_WITHIN) return 'ahead';
  if (a < BOW_WITHIN) return `${side} bow`;
  if (a < BEAM_WITHIN) return `${side} beam`;
  if (a < QUARTER_WITHIN) return `${side} quarter`;
  return 'astern';
}

const sideTerm = (side: number): Term => (side > 0 ? 'starboard' : 'larboard');
const report = (voice: Voice, ship: number, line: Line, terms?: Readonly<Record<string, Term>>): Say => (terms ? { voice, ship, line, kind: 'report', terms } : { voice, ship, line, kind: 'report' });
const cry = (voice: Voice, ship: number, line: Line, terms?: Readonly<Record<string, Term>>): Say => ({ ...report(voice, ship, line, terms), kind: 'cry' });

/** The carpenter's answer to "Sound the well" by the water in her, t: below the first of the water marks he reports (notices.ts `WATER_MARKS`) near dry, then by each mark passed. */
export function soundingLine(water: number): Line {
  const full = founderTonnes(), passed = WATER_MARKS.filter((m) => water > m * full).length;
  return `sounded ${passed}` as Line;
}

/** The water mark from which the carpenter cries out (sim/notices.ts `WATER_MARKS`: she is settling). */
const WATER_CRY = 2;

/** The lookout's line for the other ship's end. */
const HER_END: Readonly<Record<LostHow, Line>> = { struck: 'her struck', sunk: 'her sinking', burnt: 'her burning', 'blew up': 'her blew up', 'broke off': 'her broke off' };

/** What the men of my ship `ship` say for an event of a step, a thing her officers noticed, or the midshipman sent: in the order it is said. */
export function saysOf(e: SimEvent | Notice | Sent, ship: number): Say[] {
  const mine = 'ship' in e && e.ship === ship, hers = 'ship' in e && e.ship !== ship;
  switch (e.kind) {
    // ---- Orders: the answer, and the order passed down ----
    case 'taken': {
      if (!mine) return [];
      const terms = orderTerms(e.order), pass = PASSED[e.order.kind];
      const answer: Say = { voice: takerOf(e.order), ship, line: ayeLine(e.order), kind: 'answer', ...(terms ? { terms } : {}) };
      return pass ? [answer, { voice: 'boatswain', ship, line: pass, kind: 'pass', delay: PASS_DELAY, ...(terms ? { terms } : {}) }] : [answer];
    }
    case 'answered': return mine ? [{ voice: takerOf(e.order), ship, line: e.code === 'sounded' ? soundingLine(e.amount ?? 0) : e.code, kind: 'answer' }] : [];
    case 'refused':
      if (e.order.ship !== ship || e.code === 'no such order' || e.code === 'no ship') return [];
      return [{ voice: takerOf(e.order), ship, line: e.code, kind: 'answer' }];
    case 'sent': return e.ship === ship && e.runner && e.voice !== 'midshipman' ? [{ voice: 'midshipman', ship, line: 'midshipman off', kind: 'answer', terms: { who: `to ${e.voice as Exclude<Voice, 'midshipman'>}` } }] : [];
    // ---- Her sailing, and hers as the lookout sees her ----
    case 'tacked': case 'wore': case 'missed stays':
      if (mine) return [e.kind === 'missed stays' ? cry('master', ship, e.kind) : report('master', ship, e.kind)];
      return hers ? [report('lookout', ship, `her ${e.kind}`)] : [];
    // The helmsman bore away a point: the master says it once (his own ship only; the lookout does not see a helm).
    case 'bore away': return mine ? [report('master', ship, e.kind)] : [];
    case 'done':
      if (!hers) return [];
      if (e.order.kind === 'sail') return [report('lookout', ship, 'her makes sail')];
      return e.order.kind === 'shorten' ? [report('lookout', ship, 'her shortens')] : [];
    case 'watch': return [];
    case 'short-handed': return mine ? [report('first lieutenant', ship, 'short-handed')] : [];
    // ---- What shot does to her, and what follows ----
    case 'hit':
      if (!mine) return [];
      switch (e.what) {
        case 'gun': return [report('gunner', ship, 'gun dismounted')];
        case 'hole': return e.at[2] < LOAD_WATERLINE ? [cry('carpenter', ship, 'holed')] : [];
        case 'spar': { const mast = mastOfPart(e.id); return mast ? [report('carpenter', ship, 'spar wounded', { mast })] : []; }
        case 'steering': return [cry('master', ship, 'steering')];
        case 'fire': return [cry('first lieutenant', ship, 'fire')];
        default: return [];
      }
    case 'aftermath': {
      const mast = e.what === 'fell' ? mastOfPart(e.id) : null;
      if (hers) return mast ? [report('lookout', ship, 'her mast', { mast })] : [];
      if (!mine) return [];
      if (mast) return [cry('boatswain', ship, 'mast fell', { mast })];
      if (e.what === 'danger') { const named = mastOfPart(e.id); return named ? [cry('master', ship, 'stay gone', { mast: named })] : []; }
      if (e.what === 'fire') return [cry('first lieutenant', ship, 'fire')];
      return e.what === 'out' ? [report('first lieutenant', ship, 'fire out')] : [];
    }
    case 'struck': return mine ? [cry('master', ship, 'struck her')] : [];
    case 'fouled': return mine || e.other === ship ? [report('boatswain', ship, 'fouled')] : [];
    case 'fired': return [];
    // ---- The fight ----
    case 'beaten': return mine ? [report('first lieutenant', ship, 'beaten')] : [];
    case 'light': return [report('master', ship, 'light')];
    case 'losing': return [report('master', ship, 'losing')];
    case 'end': {
      if (e.lost.every((l) => l === null)) return [report('master', ship, e.apart ? 'apart' : 'nightfall')];
      const her = e.lost.find((l, i) => i !== ship && l !== null);
      return her ? [cry('lookout', ship, HER_END[her])] : [];
    }
    // ---- What her officers notice ----
    case 'sighted': return mine ? [report('lookout', ship, 'sighted', { where: whereTerm(e.off) })] : [];
    case 'ports': return mine ? [report('lookout', ship, 'her ports')] : [];
    case 'side ready': return mine ? [report('gunner', ship, 'side ready', { side: sideTerm(e.side) })] : [];
    case 'guns bear': return mine ? [report('gunner', ship, 'guns bear', { side: sideTerm(e.side) })] : [];
    case 'water': {
      if (!mine) return [];
      const line = `water ${e.mark}` as Line;
      return [e.mark >= WATER_CRY ? cry('carpenter', ship, line) : report('carpenter', ship, line)];
    }
    case 'wind': return [report('master', ship, `wind ${e.how}`)];
    case 'off beam': return mine ? [report('master', ship, `her ${e.how} of the beam`)] : [];
  }
}

/** Her heading against the line from her to us, rad: within this she stands toward us, beyond its opposite away. */
const TOWARD_WITHIN = 4 * POINT;

/**
 * The lookout asked "What do you see?" (orders.md): her bearing, whether she stands toward us, away or across, her sail,
 * and her ports if they are open. Nothing when there is no other ship.
 */
export function lookoutSays(state: SimState, ship: number): Say[] {
  const foe = foeOf(state.ships, ship), mine = state.ships[ship], her = foe === null ? undefined : state.ships[foe];
  if (!mine || !her) return [];
  const me = mine.motion.pose, she = her.motion.pose;
  const off = angleDiff(mine.sailing.heading, bearingTo(me, she));
  const towardUs = Math.abs(angleDiff(her.sailing.heading, bearingTo(she, me)));
  const how: Term = towardUs < TOWARD_WITHIN ? 'closing' : towardUs > Math.PI - TOWARD_WITHIN ? 'opening' : 'crossing';
  const seen = report('lookout', ship, 'look out', { where: whereTerm(off), how, canvas: `under ${her.told.canvas}` as Term });
  return her.told.quarters ? [seen, report('lookout', ship, 'look out ports')] : [seen];
}
