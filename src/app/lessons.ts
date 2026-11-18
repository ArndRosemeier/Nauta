/**
 * The first match (implementation plan N7.4; the script agreed with the design thread on 2026-11-18): a new captain is
 * led through sailing and one fight by his first lieutenant, in bubbles and by what the crew does. Pure: each step of
 * the match the page (app/firstCommand.ts) or the novice of the slow check (tools/sim/first.ts) hands `Lessons` what
 * happened and what the captain did, and gets back what the men say, whom to tap and which of the fan's orders to
 * light, and whether the other captain wakes.
 *
 * The course runs in order, each lesson waiting until it is done and reminded every `REMIND_SECONDS`: welcome; look
 * about; walk to the master; the glass; make sail; full and by; tack; steer for her; she wakes, beat to quarters; hold for the word;
 * close, her on the beam; then the fight. Tips come once each, at the moment they are wanted, and take the marker
 * while their order is still to give: below and aloft, as they bear, the word when the guns first bear, the wreckage,
 * and the end. The pumps and the fire party he sends himself, once, and says so (`HELPS`, even with the lessons
 * skipped). The other captain's ship lies hove to (`foeWaits`) until the course reaches
 * the quarters, or the ships come within `WAKE_RANGE`, or `WAKE_AFTER` has passed; once she is awake and near
 * (`HURRY_RANGE`), sailing lessons not yet done give way to steering for her.
 */
import { angleDiff } from '@futuremagic/core';
import { sideReports } from '../sim/captain/sight';
import { herOff, type Notice } from '../sim/notices';
import type { Order } from '../sim/orders';
import type { Skill } from '../sim/rules/captain';
import { POINT } from '../sim/rules/orders';
import type { Spot } from '../sim/ship/plan';
import type { DuelOptions } from '../net/duel';
import type { SimState } from '../sim/state';
import { orderMoment, type SimEvent } from '../sim/step';
import { HOURS_PER_DAY, MINUTES_PER_HOUR, STEPS_PER_SECOND } from '../sim/units';
import { waitingForWord } from './fanOrders';
import { wouldRefuse } from './orderReport';
import { floorApart, onDecks, postOf, type Officer } from './officers';
import { PHRASES, type Line, type Term } from './speech/phrases';
import { whereTerm, type Say } from './speech/reports';
import type { Voice } from './speech/speakers';

// ---- The match ----

/** The first match is always the same (design thread): this seed, a light breeze, by day, she holding the weather position. */
export const FIRST_SEED = 1797;
/** Its wind, Beaufort: force 3, a gentle breeze in which a brig tacks surely and a gun deck is steady. */
export const FIRST_FORCE = 3;
/** The other captain: the first match's own, a step below green, weaker by his decisions only (design thread, 2026-11-18). */
export const FIRST_FOE: Skill = 'raw';
/** The hour it starts at, as the sky's clock reads: late morning, the sun high. */
export const FIRST_HOUR = 10.5;

/** How long the first match may last, minutes: no limit (a day, never reached), so it is never drawn while he learns. */
export const FIRST_MINUTES = HOURS_PER_DAY * MINUTES_PER_HOUR;

/** The first match as a session plays it alone: the duel from its seed with the new captain to windward, her captain waiting hove to. */
export const FIRST_MATCH = {
  seed: FIRST_SEED, terms: { meet: 'weather' }, windForce: FIRST_FORCE, foe: FIRST_FOE, foeWaits: true, minutes: FIRST_MINUTES,
} as const satisfies Omit<DuelOptions, 'build' | 'now'>;

// ---- The pace of the lessons ----

/** Seconds of the match between reminders of a lesson not yet done. */
export const REMIND_SECONDS = 20;
/** How long the welcome stands before the first lesson, s: its two lines read. */
const WELCOME_SECONDS = 12;
/** How far he must turn his look before the look is learned, rad: a quarter turn. */
const LOOK_TURN = Math.PI / 2;
/** Within this of the master, m, he has walked to him. */
export const NEAR_MAN = 3.5;
/** A lesson the page alone can see done (look, walk, glass) passes on undone after this long, s: it never holds the match up. */
const PAGE_LESSON_MOST = 60;
/** A tip's order passes on undone after this long, s. */
const TIP_MOST = 45;
/** The lieutenant's praise or answer comes this long after a lesson is done, s: the man's own "Aye aye" is read first. */
const WELL_DELAY = 2.5;
/** The first word is asked for only inside this range, m: farther off a broadside is mostly wasted (the gunner still reports the guns bearing). */
const FIRE_RANGE = 500;
/** The tack is left to the master after this long, s, if she will not come round (she may lie in irons a while). */
const TACK_MOST = 240;
/** The other captain wakes once the ships are this close, m, or this long into the match, s, whatever the course has reached. */
const WAKE_RANGE = 1000;
const WAKE_AFTER = 300;
/** Once she is awake and this close, m, the sailing lessons not yet done give way to beating to quarters. */
const HURRY_RANGE = 900;
/** The master is told to lay her on the beam once she is this close, m: inside the green captain's own range (250 m) the broadsides tell. */
const ABEAM_RANGE = 300;

// ---- What a step hands the lessons, and what they give back ----

/** Where the captain is on her: on deck, below, or aloft. */
export type Place = 'deck' | 'below' | 'aloft';

/** Where on her a spot is. */
export const placeOf = (s: Spot): Place => (!onDecks(s) ? 'aloft' : s.space === 'deck' ? 'deck' : 'below');

/** Whether the captain at `s` stands by `who` at his post. */
export const nearMan = (s: Spot | null, who: Exclude<Officer, 'midshipman'>): boolean => !!s && floorApart(s, postOf(who)) <= NEAR_MAN;

/** One step of the match as the lessons see it. */
export interface Seen {
  readonly state: SimState;
  readonly ship: number;
  /** The step's events and what her officers noticed in it (sim/notices.ts). */
  readonly heard: readonly (SimEvent | Notice)[];
  /** How far the captain has turned his look since the lessons began, rad (summed). */
  readonly looked: number;
  /** Whether he has raised the glass since the lessons began. */
  readonly glass: boolean;
  /** Where he stands now (null: not known). */
  readonly at: Spot | null;
  /** How he plays: by finger, or with a mouse and keys (the lessons name the one he uses); touch when not given. */
  readonly hands?: Hands;
}

/** How the captain plays: by finger, with a mouse and keys, or with the mouse taken for looking (a brass dot in the middle of the view). */
export type Hands = 'touch' | 'mouse' | 'dot';

/** What the captain is to touch: a man (his fan opens), the glass's tag, or the large "Fire!". */
export type Tap = Officer | 'glass' | 'fire';
/** What a lesson asks him to do: an order (made for ship 0), or a thing done on the page. */
export type Want = Order | 'look' | 'walk' | 'glass';

/** What the lessons give back each step. */
export interface Guide {
  /** What the men say now (into the bubble queue). */
  readonly says: readonly Say[];
  /** What he is to touch now (marked on the view), or null. */
  readonly tap: Tap | null;
  /** The fan's orders lit on the way to the one wanted (a ring's id, then the order's: fanOrders.ts ids). */
  readonly items: readonly string[];
  /** What is asked of him now (the check's novice does it), or null. */
  readonly wants: Want | null;
  /** The other captain wakes now (once). */
  readonly wake: boolean;
  /** The lesson or tip that holds the marker now ('' none). */
  readonly now: string;
  /** Whether it was asked for in this step (begun, or said again). */
  readonly asked: boolean;
  /** Orders the first lieutenant gives himself in this step (`HELPS`). */
  readonly gives: readonly Order[];
}

// ---- The lessons, as data ----

/** What a lesson remembers while it runs: when it began and was last said, and what of hers was heard since. */
interface Memory {
  readonly began: number;
  readonly heard: ReadonlySet<string>;
}

interface Lesson {
  readonly id: string;
  /** Who speaks it (the first lieutenant unless named). */
  readonly voice?: Voice;
  /** Said as it begins, in turn. */
  readonly says: readonly Line[];
  /** Said again every `REMIND_SECONDS` while it is not done (none: said once). */
  readonly again?: Line;
  /** Said once it is done. */
  readonly well?: readonly Line[];
  readonly tap?: Tap;
  readonly items?: readonly string[];
  readonly wants?: Want;
  /** It may begin now (the course: after the one before is done; a tip: the moment it is wanted). */
  readonly starts?: (s: Seen, m: Memory) => boolean;
  /** It is done (none: done once said). */
  readonly done?: (s: Seen, m: Memory, t: number) => boolean;
  /** It passes on undone after this long, s. */
  readonly most?: number;
  /** What the lieutenant says to a thing of hers heard while it runs (by the heard key). */
  readonly hears?: Readonly<Record<string, Line>>;
  /** The other captain wakes as it begins. */
  readonly wake?: boolean;
  /** Once its order is taken it is not said again until one of these is heard (a tack: she is round, or missed stays). */
  readonly outcomes?: readonly string[];
}

/** What the first lieutenant does for a new captain unasked (design thread, 2026-11-18): an order he gives himself, and says so. */
interface Help {
  readonly id: string;
  readonly says: readonly Line[];
  readonly gives: Order;
  readonly starts: (s: Seen, m: Memory) => boolean;
}

const sailOrder = (canvas: 'plain'): Order => ({ kind: 'sail', ship: 0, canvas });
const plainOrder = (kind: 'by' | 'tack' | 'follow' | 'abeam' | 'quarters' | 'hold' | 'fire' | 'pumps' | 'fires' | 'wreckage'): Order => ({ kind, ship: 0 } as Order);
const told = (s: Seen) => s.state.ships[s.ship]!.told;

/** The two ships' distance, m (Infinity alone): as orders are given against it. */
const shipsApart = (s: Seen): number => orderMoment(s.state, s.ship).enemy ?? Infinity;

/** Whether ready guns of ship `ship` bear on the other ship. */
export function gunsBear(state: SimState, ship: number): boolean {
  const off = herOff(state, ship);
  return off !== null && sideReports(state.ships[ship]!, off, off).some((r) => r.readyBearing > 0);
}

/** Whether ready guns of hers bear on the other ship while they wait for the captain's word. */
const gunsBearForWord = (s: Seen): boolean => shipsApart(s) <= FIRE_RANGE && waitingForWord(s.state, s.ship) && gunsBear(s.state, s.ship);

/** She has come to the course the helm is told (within a point): a tack is asked only from a steady course. */
const steady = (s: Seen): boolean => {
  const sailing = s.state.ships[s.ship]!.sailing;
  return Math.abs(angleDiff(sailing.heading, sailing.steer.heading)) <= POINT;
};

/** The course, in order. */
const COURSE: readonly Lesson[] = [
  { id: 'welcome', says: ['lesson.welcome', 'lesson.orders'], done: (_, m, t) => t - m.began >= WELCOME_SECONDS },
  { id: 'look', says: ['lesson.look'], again: 'lesson.look.again', wants: 'look', done: (s) => s.looked >= LOOK_TURN, most: PAGE_LESSON_MOST },
  {
    id: 'walk', says: ['lesson.walk'], again: 'lesson.walk.again', well: ['lesson.walk.well'], tap: 'master', wants: 'walk',
    done: (s) => nearMan(s.at, 'master'), most: PAGE_LESSON_MOST,
  },
  { id: 'glass', says: ['lesson.glass'], again: 'lesson.glass.again', tap: 'glass', wants: 'glass', done: (s) => s.glass, most: PAGE_LESSON_MOST },
  {
    id: 'sail', says: ['lesson.sail'], again: 'lesson.sail.again', well: ['lesson.sail.well'], tap: 'first lieutenant', items: ['sail', 'sail-plain'],
    wants: sailOrder('plain'), done: (s) => told(s).canvas === 'plain' || told(s).canvas === 'all',
  },
  {
    id: 'by', says: ['lesson.by'], again: 'lesson.by.again', tap: 'master', items: ['keep', 'by'], wants: plainOrder('by'),
    done: (_, m) => m.heard.has('done:by'),
  },
  {
    id: 'tack', starts: steady, says: ['lesson.tack'], again: 'lesson.tack.again', well: ['lesson.tack.well'], tap: 'master', items: ['about', 'tack'], wants: plainOrder('tack'),
    hears: { 'taken:tack': 'lesson.tack.stations', 'missed stays': 'lesson.tack.missed' }, outcomes: ['tacked', 'missed stays'],
    done: (_, m) => m.heard.has('tacked'), most: TACK_MOST,
  },
  {
    id: 'follow', says: ['lesson.follow'], again: 'lesson.follow.again', well: ['lesson.follow.well'], tap: 'master', items: ['keep', 'follow'],
    wants: plainOrder('follow'), done: (s) => told(s).keep?.kind === 'follow',
  },
  {
    id: 'quarters', says: ['lesson.quarters'], again: 'lesson.quarters.again', well: ['lesson.quarters.well'], tap: 'first lieutenant', items: ['quarters'],
    wants: plainOrder('quarters'), done: (s) => told(s).quarters, wake: true,
  },
  {
    id: 'hold', says: ['lesson.hold'], again: 'lesson.hold.again', well: ['lesson.hold.well'], tap: 'gunner', items: ['hold'], wants: plainOrder('hold'),
    done: (s) => told(s).firing === 'hold' || told(s).firing === 'bear',
  },
  {
    id: 'abeam', says: ['lesson.abeam'], again: 'lesson.abeam.again', well: ['lesson.abeam.well'], tap: 'master', items: ['keep', 'abeam'], wants: plainOrder('abeam'),
    starts: (s) => shipsApart(s) <= ABEAM_RANGE, done: (s) => told(s).keep?.kind === 'abeam',
  },
  { id: 'fight', says: ['lesson.fight'], starts: (_, m) => m.heard.has('fired word'), done: () => false },
];

/** The course's lessons a wakened enemy close by cuts short: the sailing ones, up to steering for her. */
const FOLLOW = COURSE.findIndex((l) => l.id === 'follow');

/** The tips: each once, at its moment. */
const TIPS: readonly Lesson[] = [
  { id: 'below', voice: 'midshipman', says: ['lesson.below'], starts: (s) => !!s.at && placeOf(s.at) === 'below' },
  { id: 'dot', says: ['lesson.dot'], starts: (s) => s.hands === 'dot' },
  { id: 'aloft', says: ['lesson.aloft'], starts: (s) => !!s.at && placeOf(s.at) === 'aloft' },
  { id: 'bear', voice: 'gunner', says: ['lesson.bear'], starts: (s, m) => m.heard.has('side ready') && told(s).firing === 'cease' },
  {
    id: 'fire', says: ['lesson.fire'], again: 'lesson.fire.again', well: ['lesson.fire.well'], tap: 'fire', wants: plainOrder('fire'),
    starts: gunsBearForWord, done: (s, m) => told(s).word || m.heard.has('taken:fire') || !waitingForWord(s.state, s.ship), most: TIP_MOST,
  },
  {
    id: 'wreckage', says: ['lesson.wreckage'], tap: 'first lieutenant', items: ['life', 'wreckage'], wants: plainOrder('wreckage'),
    starts: (s, m) => m.heard.has('aftermath:fell') && told(s).wreckage === null, done: (s) => told(s).wreckage !== null, most: TIP_MOST,
  },
  { id: 'won', says: ['lesson.won', 'lesson.next'], starts: (s) => s.state.fight.end?.lost[1 - s.ship] != null && s.state.fight.end.lost[s.ship] === null },
  { id: 'lost', says: ['lesson.lost', 'lesson.next'], starts: (s) => s.state.fight.end?.lost[s.ship] != null },
];

/**
 * In the first match the first lieutenant sends the hands to the pumps and the fire party himself, once, and says so
 * (whether the lessons run or were skipped): a new captain learns what they are for before he must think of them.
 */
const HELPS: readonly Help[] = [
  { id: 'pumps', says: ['lesson.pumps'], gives: plainOrder('pumps'), starts: (s, m) => m.heard.has('water') && told(s).pumps === null },
  { id: 'fires', says: ['lesson.fires'], gives: plainOrder('fires'), starts: (s, m) => (m.heard.has('hit:fire') || m.heard.has('aftermath:fire')) && told(s).fires === null },
];

/** The keys of what of hers a step's events and notices hold, for the lessons' `heard` (her own only; the end for both). */
export function heardKeys(heard: readonly (SimEvent | Notice)[], ship: number): string[] {
  const out: string[] = [];
  for (const e of heard) {
    if ('ship' in e && e.ship !== ship) continue;
    switch (e.kind) {
      case 'taken': case 'answered': out.push(`${e.kind}:${e.order.kind}`); if (e.order.kind === 'fire') out.push('fired word'); break;
      case 'hit': case 'aftermath': out.push(`${e.kind}:${e.what}`); break;
      case 'done': out.push(`done:${e.order.kind}`); break;
      default: out.push(e.kind);
    }
  }
  return out;
}

/** A running lesson. */
interface Running {
  readonly lesson: Lesson;
  readonly began: number;
  said: number;
  readonly heard: Set<string>;
  /** Its order was taken and nothing has come of it yet (`outcomes`): it is not said again meanwhile. */
  waiting: boolean;
}

/** The lessons of one first match. */
export class Lessons {
  private course = 0;
  private running: Running | null = null;
  private readonly tips: Running[] = [];
  private readonly tipped = new Set<string>();
  private readonly helped = new Set<string>();
  /** Everything of hers heard since the lessons began (the tips' triggers). */
  private readonly ever = new Set<string>();
  private awake = false;
  private stopped = false;
  /** The lessons and tips passed on undone (their time ran out), in turn. */
  private readonly passedOn: string[] = [];

  /** The lessons and tips passed on undone so far. */
  get passed(): readonly string[] {
    return this.passedOn;
  }

  /** No more lessons (the captain skipped them): nothing more is said or marked; the other captain wakes if he still waits. */
  silence(): void {
    this.stopped = true;
  }

  get skipped(): boolean {
    return this.stopped;
  }

  /** Whether the course has reached the lesson `id` (it runs now, or is done). */
  taught(id: string): boolean {
    const i = COURSE.findIndex((l) => l.id === id);
    return i >= 0 && this.course >= i && (this.course > i || this.running !== null);
  }

  /** Whether the other captain has been woken. */
  get woken(): boolean {
    return this.awake;
  }

  /** One step of the match. */
  guideFor(s: Seen): Guide {
    const t = s.state.tick / STEPS_PER_SECOND, says: Say[] = [], keys = heardKeys(s.heard, s.ship);
    for (const k of keys) this.ever.add(k);
    const gives: Order[] = [];
    for (const h of HELPS) {
      if (this.helped.has(h.id) || !h.starts(s, { began: t, heard: this.ever })) continue;
      this.helped.add(h.id);
      gives.push({ ...h.gives, ship: s.ship });
      for (const line of h.says) says.push(this.sayOf(null, line, s, 0));
    }
    if (this.stopped) {
      const wake = !this.awake;
      this.awake = true;
      return { says, tap: null, items: [], wants: null, wake, now: '', asked: false, gives };
    }
    for (const r of [this.running, ...this.tips]) {
      if (!r) continue;
      const w = r.lesson.wants;
      for (const k of keys) {
        r.heard.add(k);
        if (w && typeof w === 'object' && k === `taken:${w.kind}` && r.lesson.outcomes) r.waiting = true;
        if (r.lesson.outcomes?.includes(k)) { r.waiting = false; r.said = t; }
      }
    }
    let wake = false;
    const asked = new Set<Lesson>();
    const wakeNow = () => { if (!this.awake) { this.awake = wake = true; } };
    if (t >= WAKE_AFTER || shipsApart(s) <= WAKE_RANGE) wakeNow();
    // Awake and near: the sailing lessons left give way to steering for her (then the quarters).
    if (this.awake && this.course < FOLLOW && shipsApart(s) <= HURRY_RANGE) { this.course = FOLLOW; this.running = null; }

    // The course: the running lesson done (or passed on), the next begun when it may.
    const utter = (lesson: Lesson, lines: readonly Line[], delay = 0) => {
      for (const line of lines) says.push(this.sayOf(lesson, line, s, delay));
    };
    if (this.running) {
      const r = this.running, l = r.lesson;
      for (const k of keys) { const line = l.hears?.[k]; if (line) utter(l, [line]); }
      if (this.isDone(l, s, r, t)) {
        if (l.well) utter(l, l.well, WELL_DELAY);
        this.running = null;
        this.course++;
      } else if (this.remindNow(l, r, s, t)) {
        r.said = t;
        asked.add(l);
        utter(l, [l.again!]);
      }
    }
    const next = COURSE[this.course];
    if (!this.running && next && (next.starts?.(s, { began: t, heard: this.ever }) ?? true)) {
      this.running = { lesson: next, began: t, said: t, heard: new Set(), waiting: false };
      if (next.wake) wakeNow();
      asked.add(next);
      utter(next, next.says);
    }

    // The tips: each once at its moment; those with an order to give run until it is given.
    for (const tip of TIPS) {
      if (this.tipped.has(tip.id) || !tip.starts?.(s, { began: t, heard: this.ever })) continue;
      this.tipped.add(tip.id);
      utter(tip, tip.says);
      asked.add(tip);
      if (tip.done) this.tips.push({ lesson: tip, began: t, said: t, heard: new Set(), waiting: false });
    }
    for (const r of [...this.tips]) {
      const l = r.lesson;
      if (this.isDone(l, s, r, t)) {
        if (l.well) utter(l, l.well, WELL_DELAY);
        this.tips.splice(this.tips.indexOf(r), 1);
      } else if (this.remindNow(l, r, s, t)) {
        r.said = t;
        asked.add(l);
        utter(l, [l.again!]);
      }
    }
    // The marker: a tip with an order to give first, else the course's lesson.
    const holder = [...this.tips, this.running].find((r) => r && (r.lesson.tap || r.lesson.wants))?.lesson ?? null;
    return { says, tap: holder?.tap ?? null, items: holder?.items ?? [], wants: holder?.wants ?? null, wake, now: holder?.id ?? '', asked: !!holder && asked.has(holder), gives };
  }

  /** A lesson not done is said again after `REMIND_SECONDS`, but not while its order could not be taken now (she is in stays, it is under way). */
  private remindNow(l: Lesson, r: Running, s: Seen, t: number): boolean {
    if (!l.again || r.waiting || t - r.said < REMIND_SECONDS) return false;
    const w = l.wants;
    return !(w && typeof w === 'object' && wouldRefuse(s.state, { ...w, ship: s.ship }));
  }

  private isDone(l: Lesson, s: Seen, r: Running, t: number): boolean {
    if (l.done ? l.done(s, { began: r.began, heard: r.heard }, t) : true) return true;
    const over = l.most !== undefined && t - r.began >= l.most;
    if (over) this.passedOn.push(l.id);
    return over;
  }

  /**
   * A line of a lesson as the bubbles take it: its mouse-and-keys wording where he plays so and it has one, "tap" or
   * "click" filled in, and the glass's line naming where she lies.
   */
  private sayOf(lesson: Lesson | null, line: Line, s: Seen, delay: number): Say {
    const mouse = s.hands === 'mouse' || s.hands === 'dot', mouseLine = `${line}.mouse`;
    const said = mouse && mouseLine in PHRASES ? mouseLine as Line : line;
    const off = line === 'lesson.glass' ? herOff(s.state, s.ship) : null;
    const terms: Record<string, Term> = { tap: mouse ? 'click' : 'tap', Tap: mouse ? 'Click' : 'Tap', ...(off !== null ? { where: whereTerm(off) } : {}) };
    return { voice: lesson?.voice ?? 'first lieutenant', ship: s.ship, line: said, kind: 'lesson', terms, ...(delay > 0 ? { delay } : {}) };
  }
}
