/**
 * Which bubbles are on the view, and for how long (implementation plan N4.5, docs/design/orders.md "Bubbles and the
 * phrase book"). Pure: the bubble layer (app/bubbleLayer.ts) puts each over its man. The rules:
 *
 * - Never more than four at once (`MOST_SHOWN`), and at most three for one order (`MOST_OF_ONE_ORDER`).
 * - A man says one thing at a time. A new answer or a cry of his takes the place of what he was saying; anything else
 *   waits until he is done.
 * - Waiting, a cry goes first, then the newest order's answer, then the order passed down, then reports, oldest first.
 *   A cry may take the place of a bubble already shown (the oldest that is no cry), and an answer that of a report read
 *   long enough. Whatever has waited past its time is dropped, never shown late.
 * - A report or cry is not said again while the same man said it lately (`REPEAT_SECONDS`): a broadside's holes are one cry.
 * - Each shows as long as it takes to read (`readSeconds`); a cry a little longer.
 * - Its words are a variant of the phrase book's line, chosen by the match's seed and never the same twice running.
 */
import { deriveSeed } from '@futuremagic/core';
import type { Language } from '../settings';
import type { Navy } from '../crewLooks';
import { phraseWords, RANKS, type Line } from './phrases';
import type { Say, SayKind } from './reports';

/** At most this many bubbles on the view at once. */
export const MOST_SHOWN = 4;
/** At most this many bubbles of one order (its answer and the men passing it down) on the view at once. */
export const MOST_OF_ONE_ORDER = 3;
/** Reading a bubble: a moment to find it, and a time a word, s; never shorter or longer than these. */
const READ_FIND = 1.2;
const READ_PER_WORD = 0.32;
export const READ_LEAST = 2.2;
const READ_MOST = 6;
/** A cry stays this much longer, s. */
const CRY_MORE = 1;
/** How long a bubble may wait to be shown, s, by its kind: an answer late is no answer; a report keeps a while. */
const STALE: Readonly<Record<SayKind, number>> = { answer: 3, pass: 3, report: 8, cry: 5 };
/** Seconds within which the same man does not say the same report or cry again. */
export const REPEAT_SECONDS = 25;
/** The order bubbles wait in when several are due: a cry first, then answers (newest first), passes, reports. */
const RANK_OF_KIND: Readonly<Record<SayKind, number>> = { cry: 0, answer: 1, pass: 2, report: 3 };

/** A bubble on the view. */
export interface Bubble {
  readonly id: number;
  readonly say: Say;
  /** The man's rank and his words, in the player's language. */
  readonly rank: string;
  readonly words: string;
  /** Seconds (the queue's clock) it showed at and shows until. */
  readonly from: number;
  readonly until: number;
}

/** What changed at an update: the bubbles now shown, those that came and those that went. */
export interface BubbleChange {
  readonly shown: readonly Bubble[];
  readonly came: readonly Bubble[];
  readonly went: readonly Bubble[];
}

interface Waiting {
  readonly say: Say;
  readonly chain: number;
  readonly seq: number;
  readonly due: number;
  readonly stale: number;
}

/** The seconds a bubble of `words` shows, a cry's longer. */
export function readSeconds(words: string, cry: boolean): number {
  const n = words.split(/\s+/).filter(Boolean).length;
  return Math.min(READ_MOST, Math.max(READ_LEAST, READ_FIND + n * READ_PER_WORD)) + (cry ? CRY_MORE : 0);
}

/** The bubbles of one crew: what is said is added as it is raised, and each frame's `viewAt` says what is on the view. */
export class BubbleQueue {
  private waiting: Waiting[] = [];
  private shown: Bubble[] = [];
  private readonly chainOf = new Map<number, number>();
  private readonly said = new Map<string, number>();
  private readonly turns = new Map<Line, number>();
  private chains = 0;
  private seq = 0;
  private ids = 0;

  /** `seed`: the match's (the variants); `language` and `navy`: the words' (the settings; her navy). */
  constructor(private readonly seed: number, public language: Language, public navy: Navy) {}

  /** What one event has the men say (reports.ts `saysOf`), at `now` s: one chain, the answer first. */
  add(says: readonly Say[], now: number): void {
    if (says.length === 0) return;
    const chain = ++this.chains;
    for (const say of says) {
      const key = `${say.ship}|${say.voice}|${say.line}`;
      if (say.kind === 'report' || say.kind === 'cry') {
        const last = this.said.get(key);
        if (last !== undefined && now - last < REPEAT_SECONDS) continue;
        this.said.set(key, now);
      }
      const due = now + (say.delay ?? 0);
      this.waiting.push({ say, chain, seq: ++this.seq, due, stale: due + STALE[say.kind] });
    }
  }

  /** The view at `now` s. */
  viewAt(now: number): BubbleChange {
    const went: Bubble[] = [], came: Bubble[] = [];
    const takeOff = (b: Bubble) => {
      went.push(b);
      this.shown = this.shown.filter((s) => s !== b);
    };
    for (const b of this.shown.filter((s) => now >= s.until)) takeOff(b);
    this.waiting = this.waiting.filter((w) => now <= w.stale);
    const due = this.waiting.filter((w) => w.due <= now).sort(order);
    for (const w of due) {
      if (this.shown.filter((b) => this.chainOf.get(b.id) === w.chain).length >= MOST_OF_ONE_ORDER) continue;
      const urgent = w.say.kind === 'cry' || w.say.kind === 'answer';
      const his = this.shown.find((b) => b.say.voice === w.say.voice && b.say.ship === w.say.ship);
      if (his) {
        if (!urgent) continue;
        takeOff(his);
      } else if (this.shown.length >= MOST_SHOWN) {
        const victim = this.victimFor(w.say.kind, now);
        if (!victim) continue;
        takeOff(victim);
      }
      const b = this.showBubble(w, now);
      came.push(b);
      this.waiting = this.waiting.filter((x) => x !== w);
    }
    for (const b of went) this.chainOf.delete(b.id);
    return { shown: this.shown, came, went };
  }

  /** Everything on the view and waiting gone (a new match). */
  clear(): Bubble[] {
    const gone = this.shown;
    this.shown = [];
    this.waiting = [];
    return gone;
  }

  /** The bubble a new one of `kind` may take the place of on a full view: a cry the oldest that is no cry; an answer the oldest report read long enough. */
  private victimFor(kind: SayKind, now: number): Bubble | null {
    if (kind === 'cry') return this.shown.find((b) => b.say.kind !== 'cry') ?? null;
    if (kind === 'answer') return this.shown.find((b) => b.say.kind === 'report' && now - b.from >= READ_LEAST) ?? null;
    return null;
  }

  private showBubble(w: Waiting, now: number): Bubble {
    const { say } = w, turn = this.turns.get(say.line) ?? deriveSeed(this.seed, say.line);
    this.turns.set(say.line, turn + 1);
    const words = phraseWords(say.line, this.language, this.navy, turn, say.terms);
    const b: Bubble = { id: ++this.ids, say, rank: RANKS[say.voice][this.language], words, from: now, until: now + readSeconds(words, say.kind === 'cry') };
    this.shown.push(b);
    this.chainOf.set(b.id, w.chain);
    return b;
  }
}

/** The order due bubbles are tried in: by kind, answers newest first, the rest oldest first. */
function order(a: Waiting, b: Waiting): number {
  const k = RANK_OF_KIND[a.say.kind] - RANK_OF_KIND[b.say.kind];
  if (k !== 0) return k;
  return a.say.kind === 'answer' ? b.seq - a.seq : a.seq - b.seq;
}
