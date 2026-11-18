/**
 * The first match on the page (implementation plan N7.4): the first lieutenant's lessons (lessons.ts) said in his
 * bubbles, the man to tap marked on the view with a brass ring (at the screen's edge with his rank when he is out of
 * view), the fan's order to choose and the large "Fire!" marked in brass, the other captain woken when the lessons say,
 * and a small "Skip the lessons" that ends them (the fight goes on). Started by the menu's "Your first command".
 *
 * The marker is still: no animation runs over the view (ui-style.md "Cost"); it moves only with the man.
 */
import { angleDiff } from '@futuremagic/core';
import type { DuelSession } from '../net/duel';
import type { Spot } from '../sim/ship/plan';
import { make } from './dom';
import { makeButton } from './button';
import { manOnScreen, RANK_WORDS, type ManOnScreen } from './fanOrders';
import { Lessons, type Guide, type Hands, type Tap } from './lessons';
import type { OrderFan } from './orderFan';
import type { Speech } from './speaking';
import type { WordKey } from './words';

/** The ring round the man to tap, px across: about a man's chest and shoulders at a few metres. */
const RING = 76;
/** The mark at the screen's edge for a man out of view: this far from the edge, px, at this share of the height. */
const EDGE = 14;
const EDGE_AT = 0.5;
/** The body's class while the mouse is taken for looking (the PC controls). */
const MOUSE_TAKEN = 'mouse-taken';

/** What the page lends the first match. */
export interface FirstPage {
  readonly speech: Speech;
  readonly fan: OrderFan | null;
  /** Her ship in the match. */
  myShip(): number;
  /** Where the drawn officers are on the view. */
  officersSeen(): readonly ManOnScreen[];
  /** Where the captain stands on her (null: not known). */
  captain(): Spot | null;
  /** The look's turn about the vertical, rad. */
  yaw(): number;
  /** Whether the glass is at his eye. */
  glassUp(): boolean;
  readonly glassButton: HTMLElement;
  wording(): Readonly<Record<WordKey, string>>;
}

export class FirstCommand {
  private lessons: Lessons | null = null;
  private session: DuelSession | null = null;
  private stopHearing: (() => void) | null = null;
  private guide: Guide | null = null;
  private looked = 0;
  private lastYaw: number | null = null;
  private glassRaised = false;
  /** How he plays now: as his last touch of the view was (a finger or a mouse); at first as the device's pointer is. */
  private hands: Hands = window.matchMedia('(pointer: fine)').matches ? 'mouse' : 'touch';
  private readonly ring = make('div', 'nt-lesson-ring');
  private readonly edge = make('div', 'nt-pill nt-lesson-edge');
  private readonly skip: HTMLButtonElement;

  constructor(private readonly page: FirstPage) {
    this.skip = makeButton('', () => this.skipLessons());
    this.skip.className = 'nt-link nt-lesson-skip';
    for (const el of [this.ring, this.edge, this.skip]) { el.hidden = true; document.body.append(el); }
    window.addEventListener('pointerdown', (e) => { this.hands = e.pointerType === 'mouse' ? 'mouse' : 'touch'; }, { capture: true, passive: true });
  }

  /** The lessons of a first match begin in `session` (its computer captain waiting, `foeWaits`). */
  start(session: DuelSession): void {
    this.stop();
    this.session = session;
    this.lessons = new Lessons();
    this.looked = 0;
    this.lastYaw = null;
    this.glassRaised = false;
    this.skip.textContent = this.page.wording().skipLessons;
    this.skip.hidden = false;
    this.stopHearing = this.page.speech.onHeard((heard, state) => {
      const lessons = this.lessons;
      if (!lessons || state.matchSeed !== session.state.matchSeed) return;
      const g = lessons.guideFor({ state, ship: this.page.myShip(), heard, looked: this.looked, glass: this.glassRaised, at: this.page.captain(), hands: this.handsNow() });
      if (g.wake) session.wakeFoe();
      for (const order of g.gives) session.give(order);
      this.page.speech.speak(g.says);
      this.show(g);
    });
  }

  /** How he plays now; with the mouse taken for looking (the PC controls' `mouse-taken` on the body), by the dot. */
  private handsNow(): Hands {
    return this.hands === 'mouse' && document.body.classList.contains(MOUSE_TAKEN) ? 'dot' : this.hands;
  }

  /** No lessons any more (another match, or the menu). */
  stop(): void {
    this.stopHearing?.();
    this.stopHearing = null;
    this.lessons = null;
    this.session = null;
    this.show(null);
    this.skip.hidden = true;
  }

  /** The captain skipped the lessons: none is said or marked from now on, and the other captain fights now. */
  private skipLessons(): void {
    this.lessons?.silence();
    this.session?.wakeFoe();
    this.show(null);
    this.skip.hidden = true;
  }

  /** Once a frame, after the camera is placed: how far he has looked about, whether the glass came up, the marker over its man. */
  frame(): void {
    if (!this.lessons) return;
    const yaw = this.page.yaw();
    if (this.lastYaw !== null) this.looked += Math.abs(angleDiff(this.lastYaw, yaw));
    this.lastYaw = yaw;
    if (this.page.glassUp()) this.glassRaised = true;
    this.place(this.guide?.tap ?? null);
  }

  private show(g: Guide | null): void {
    const before = this.guide;
    this.guide = g;
    if (before?.now === g?.now && before?.tap === g?.tap) return;
    const man = g?.tap && g.tap !== 'glass' && g.tap !== 'fire' ? g.tap : null;
    this.page.fan?.guide(g?.items ?? [], g?.tap === 'fire', man);
    this.page.glassButton.classList.toggle('lesson', g?.tap === 'glass');
    this.place(g?.tap ?? null);
  }

  /** The ring round the man to tap, or his rank at the screen's edge on his side; nothing for the glass and "Fire!" (their own tags carry the mark). */
  private place(tap: Tap | null): void {
    const man = tap && tap !== 'glass' && tap !== 'fire' ? manOnScreen(this.page.officersSeen(), tap) : undefined;
    this.ring.hidden = !man?.seen;
    this.edge.hidden = !man || man.seen;
    if (!man) return;
    if (man.seen) {
      this.ring.style.transform = `translate(${Math.round(man.x - RING / 2)}px, ${Math.round(man.y - RING / 2)}px)`;
      return;
    }
    const left = man.left ?? false, rank = this.page.wording()[RANK_WORDS[man.who]];
    this.edge.textContent = left ? `‹ ${rank}` : `${rank} ›`;
    this.edge.style.left = left ? `${EDGE}px` : '';
    this.edge.style.right = left ? '' : `${EDGE}px`;
    this.edge.style.top = `${Math.round(window.innerHeight * EDGE_AT)}px`;
  }
}
