/**
 * The order fan on the page (implementation plan N4.4, docs/design/orders.md; its look: ui-style.md "The order fan").
 * Three ways to give an order: tap or press a man in sight and his orders open round the finger (he is hailed); tap
 * the midshipman, choose whom the message is for, then the order (he runs with it, and it is given when he gets
 * there); or press a key (hailed when the man is in reach of the captain's voice, by the midshipman when not). "Steer
 * there" raises the captain's arm: he looks where she is to go and gives it. The game never pauses.
 *
 * Slide the finger onto an order and lift, or lift on the man and tap the order: both work; lifting outside the fan
 * gives nothing. Nothing is written about what follows: the men answer in their bubbles (N4.5, from the match's
 * events), and what they do is seen. The fan's contents are fanOrders.ts (pure); this file is the DOM and the input.
 */
import type { Order } from '../sim/orders';
import type { Closures } from '../sim/crew/closures';
import type { Spot } from '../sim/ship/plan';
import { make } from './dom';
import { makeButton } from './button';
import { FAN_MOST, KEY_ORDERS, RANK_WORDS, fanItems, fanSlots, manAt, slotAt, slotPlaces, type FanItem, type FanSlot, type ManOnScreen } from './fanOrders';
import { inVoice, postOf, type Officer, type Taker } from './officers';
import type { Midshipman, Message } from './midshipman';
import type { OrderSession } from './orderReport';
import { KEY_ACTIONS, type KeyAction, type Settings } from './settings';
import type { WordKey } from './words';

/** The fan's ring round the finger, px (ui-style.md: tags 96 px across on a ring 132 px out). */
const RING = 132;
const TAG = 96;
/** A finger finds a man this near him on the screen, px; a key finds the man looked at this near the middle. */
const MAN_REACH = 64;
const MIDDLE_REACH = 140;
/** A lift this near the hub after this little movement is a tap on the man: the fan stays open for the next tap. */
const HUB_REACH = 48;
/** The fan's dim and ringed orders are judged anew at most this often, ms (a panel's words change at most four times a second). */
const JUDGE_EVERY_MS = 250;
/** The fan keeps this far inside the screen's edge, px. */
const EDGE = 8;
/** A tap: lifted within this long and this near where it went down, ms and px. */
const TAP_MS = 300;
const TAP_SLOP = 12;
/** The captain's arm points this long after a "steer there" given by key, s. */
const POINT_AFTER = 1.5;
/** He lifts his hand to his mouth this long for a hail, s. */
const HAIL_SECONDS = 1;

/** How an order reaches its man. */
export type Via = 'hail' | 'midshipman' | 'key';

/** What the speech bubbles (N4.5) hear: an order spoken to a man, or the lookout asked what he sees. */
export interface Sent {
  readonly kind: 'sent';
  readonly voice: Taker;
  /** The captain's ship (the match's place of hers). */
  readonly ship: number;
  readonly order: Order | null;
  readonly ask: 'look out' | null;
  readonly via: Via;
  /** Whether the midshipman carries it (a key's order goes by him when the man is out of voice). */
  readonly runner: boolean;
}

/** What the fan needs from the page. */
export interface FanPage {
  readonly session: OrderSession;
  /** Where the men are on the view now (empty: none drawn). */
  men(): readonly ManOnScreen[];
  /** Where the captain stands on her (null: not aboard, or no body). */
  captain(): Spot | null;
  /** The compass bearing he looks along, rad. */
  bearingLooked(): number;
  /** Her heel now (rad, + starboard down), and what is shut, for the midshipman's way. */
  heel(): number;
  closures(): Closures;
  readonly midshipman: Midshipman;
  /** The man looks at the captain (he has been spoken to). */
  addressed(who: Officer): void;
  /** A finger on the walking thumb's half of the view: a man there opens his fan on a tap, not a press (the thumb walks). */
  thumb(e: PointerEvent): boolean;
  settings(): Settings;
  wording(): Readonly<Record<WordKey, string>>;
}

/** The fan open now: whose, its items as shown, where its hub is, and how the order will travel. */
interface Open {
  readonly who: Officer;
  /** The man the orders are for (the midshipman's choice of whom, once made). */
  readonly to: Taker | null;
  readonly items: readonly FanItem[];
  readonly hubWord: WordKey;
  readonly x: number;
  readonly y: number;
  readonly runner: boolean;
  /** Inside a ring: the fan it came from (the hub goes back to it). */
  readonly back: Open | null;
}

export class OrderFan {
  private readonly root = make('div', 'nt-fan');
  private readonly steer = make('div', 'nt-steer');
  private readonly mark = make('div', 'nt-steer-mark');
  private open: Open | null = null;
  private slots: FanSlot[] = [];
  private tags: HTMLButtonElement[] = [];
  private hub: HTMLButtonElement | null = null;
  /** The pointer the fan holds (it is not for looking), where it went down, and whether it has left the hub. */
  private finger: number | null = null;
  private under = -1;
  /** The finger held went down on the open fan (a tap on its hub closes it), not on the man. */
  private onFan = false;
  private judged = -Infinity;
  /** A finger down on the walking thumb's half: where and when (a tap there opens a man's fan). */
  private tap: { id: number; x: number; y: number; t: number } | null = null;
  /** Steer there: who will be told, and how. */
  private pointing: { runner: boolean } | null = null;
  private pointFor = 0;
  private hailFor = 0;
  private readonly heard = new Set<(s: Sent) => void>();

  constructor(private readonly view: HTMLElement, private readonly page: FanPage) {
    document.body.append(this.root, this.steer, this.mark);
    this.root.style.display = 'none';
    this.showSteer(false);
    // Before the look's own listener (capture): a finger on a man opens his fan instead of turning the look.
    view.addEventListener('pointerdown', (e) => this.down(e), { capture: true });
    this.root.addEventListener('pointerdown', (e) => this.downOnFan(e));
    window.addEventListener('pointermove', (e) => this.move(e));
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', (e) => { if (e.pointerId === this.finger) this.finger = null; });
    window.addEventListener('keydown', (e) => this.key(e));
  }

  /** The speech bubbles hear each order spoken (and the lookout asked) here. */
  onSent(fn: (s: Sent) => void): void {
    this.heard.add(fn);
  }

  /** Whether a pointer is the fan's (the look leaves it alone). */
  owns(e: PointerEvent): boolean {
    return e.pointerId === this.finger;
  }

  /** Whether the captain's arm is up, pointing where he looks (steer there), and whether his hand is at his mouth (a hail). */
  get arm(): { readonly pointing: boolean; readonly hailing: boolean } {
    return { pointing: this.pointing !== null || this.pointFor > 0, hailing: this.hailFor > 0 };
  }

  /** Once a frame: the midshipman goes on (and gives what he carries when he arrives), the fan's orders judged anew. */
  onFrame(now: number, dt: number): void {
    this.pointFor = Math.max(0, this.pointFor - dt);
    this.hailFor = Math.max(0, this.hailFor - dt);
    const p = this.page, delivered = p.midshipman.step(dt, p.captain(), p.heel(), p.closures());
    if (delivered) this.delivered(delivered);
    if (this.open && now - this.judged >= JUDGE_EVERY_MS) { this.judged = now; this.judge(); }
  }

  /**
   * For the browser checks (`__nautaFan`): opens the fan of `who` where he is on the view (the middle when he is not
   * in view), and, given an item's id, chooses it as a finger would (a ring opens, an order is given). Answers the ids
   * shown then, or why not.
   */
  openForCheck(who: Officer, choose: readonly string[] = []): string {
    const r = this.view.getBoundingClientRect(), man = this.page.men().find((m) => m.who === who);
    const x = man?.seen ? r.left + man.x : window.innerWidth / 2, y = man?.seen ? r.top + man.y : window.innerHeight / 2;
    this.close();
    if (!this.openFor(who, x, y)) return `the ${who} has no orders now`;
    for (const id of choose) {
      const i = this.slots.findIndex((s) => s.item.id === id);
      if (i < 0) return `no ${id} in the fan of the ${who}`;
      this.choose(this.slots[i]!.item);
    }
    return this.open ? this.slots.map((s) => `${s.item.id}${s.dim ? ' (dim)' : ''}${s.on ? ' (on)' : ''}`).join(', ') : 'closed';
  }

  /** For the checks: the tag of an item shown as under the finger. */
  lightUp(id: string): void {
    const i = this.slots.findIndex((s) => s.item.id === id);
    this.tags[this.under]?.classList.remove('under');
    this.under = i;
    this.tags[i]?.classList.add('under');
  }

  // ---------- Opening and choosing ----------

  /** A finger or a click on the view: on a man, his fan opens round it and the finger is the fan's. */
  private down(e: PointerEvent): void {
    if (this.pointing) return;
    if (this.open) { this.close(); return; }
    if (this.page.thumb(e)) { this.tap = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp }; return; }
    const r = this.view.getBoundingClientRect();
    const who = manAt(this.page.men(), e.clientX - r.left, e.clientY - r.top, MAN_REACH);
    if (!who || !this.openFor(who, e.clientX, e.clientY)) return;
    this.hold(e);
    e.stopImmediatePropagation();
  }

  /** A finger on the open fan (a tap on a tag or the hub): the fan holds it until it lifts. */
  private downOnFan(e: PointerEvent): void {
    this.hold(e, true);
    this.move(e);
    e.stopPropagation();
  }

  private hold(e: PointerEvent, onFan = false): void {
    this.finger = e.pointerId;
    this.onFan = onFan;
    this.under = -1;
  }

  private move(e: PointerEvent): void {
    if (e.pointerId !== this.finger || !this.open) return;
    const i = this.slotUnder(e.clientX, e.clientY);
    if (i === this.under) return;
    this.tags[this.under]?.classList.remove('under');
    this.under = i;
    this.tags[i]?.classList.add('under');
  }

  private up(e: PointerEvent): void {
    const tap = this.tap;
    if (tap && tap.id === e.pointerId) {
      this.tap = null;
      if (e.timeStamp - tap.t <= TAP_MS && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) <= TAP_SLOP) {
        const r = this.view.getBoundingClientRect(), who = manAt(this.page.men(), e.clientX - r.left, e.clientY - r.top, MAN_REACH);
        if (who) this.openFor(who, e.clientX, e.clientY);
      }
      return;
    }
    if (e.pointerId !== this.finger || !this.open) return;
    this.finger = null;
    const i = this.slotUnder(e.clientX, e.clientY), o = this.open;
    if (i >= 0) { this.choose(this.slots[i]!.item); return; }
    // On the hub: a tap on the man (the fan stays for the next tap), or inside a ring, back to the fan it came from.
    if (Math.hypot(e.clientX - o.x, e.clientY - o.y) <= HUB_REACH) {
      if (o.back) this.layOut(o.back);
      else if (this.onFan) this.close();
      return;
    }
    this.close();
  }

  private slotUnder(x: number, y: number): number {
    const o = this.open!;
    return slotAt(slotPlaces(this.slots.length, RING).map(([px, py]) => [o.x + px, o.y + py] as const), x, y, TAG / 2);
  }

  /** The fan of `who` round a point on the screen; false when he has no orders now. */
  private openFor(who: Officer, x: number, y: number, runner = false): boolean {
    const items = fanItems(who, this.page.session.state, this.page.session.ship);
    if (items.length === 0) return false;
    const to = who === 'midshipman' ? null : who;
    this.page.addressed(who);
    this.layOut({ who, to, items, hubWord: RANK_WORDS[who], x, y, runner: runner || who === 'midshipman', back: null });
    return true;
  }

  private choose(item: FanItem): void {
    const o = this.open!, a = item.act;
    switch (a.kind) {
      case 'ring': this.layOut({ ...o, items: a.items, hubWord: item.word, back: o }); return;
      case 'to': {
        const items = fanItems(a.who, this.page.session.state, this.page.session.ship);
        this.layOut({ who: a.who, to: a.who, items, hubWord: RANK_WORDS[a.who], x: o.x, y: o.y, runner: true, back: null });
        return;
      }
      case 'steer there': this.close(); this.startPointing(o.runner); return;
      case 'look out': this.close(); this.speak(o.to ?? 'lookout', { ask: 'look out' }, o.runner ? 'midshipman' : 'hail', o.runner); return;
      case 'order': this.close(); this.speak(o.to ?? 'master', { order: a.order }, o.runner ? 'midshipman' : 'hail', o.runner);
    }
  }

  /**
   * The captain speaks: hailed, the man takes it now; by the midshipman, he runs with it and it is given when he
   * arrives (a key's order goes by him when the man is out of the captain's voice).
   */
  private speak(to: Taker, what: { order: Order } | { ask: 'look out' }, via: Via, runner: boolean): void {
    const p = this.page, order = 'order' in what ? { ...what.order, ship: p.session.ship } : null;
    const message: Message = order ? { to, order } : { to, ask: 'look out' };
    if (runner) {
      p.addressed('midshipman');
      if (!p.midshipman.send(message, p.heel(), p.closures())) return;
    } else {
      this.hailFor = HAIL_SECONDS;
      p.addressed(to);
      if (order) p.session.give(order);
    }
    for (const fn of this.heard) fn({ kind: 'sent', voice: to, ship: p.session.ship, order, ask: order ? null : 'look out', via, runner });
  }

  /** The midshipman has given his message: the man takes it on the spot. */
  private delivered(m: Message): void {
    this.page.addressed(m.to);
    if ('order' in m) this.page.session.give(m.order);
  }

  // ---------- Steer there ----------

  private startPointing(runner: boolean): void {
    this.pointing = { runner };
    this.showSteer(true);
  }

  private steerNow(runner: boolean, via: Via): void {
    const order: Order = { kind: 'steer', ship: 0, heading: this.page.bearingLooked() };
    this.pointFor = POINT_AFTER;
    this.speak('master', { order }, via, runner);
  }

  private stopPointing(): void {
    this.pointing = null;
    this.showSteer(false);
  }

  /** The "Steer there" tag by the thumb and the mark in the middle of the view, while the captain points. */
  private showSteer(on: boolean): void {
    this.steer.style.display = on ? 'flex' : 'none';
    this.mark.style.display = on ? 'block' : 'none';
    if (!on) return;
    const say = this.page.wording();
    this.steer.replaceChildren();
    const give = makeButton(say.steerGive, () => { const p = this.pointing; this.stopPointing(); if (p) this.steerNow(p.runner, p.runner ? 'midshipman' : 'hail'); });
    const cancel = makeButton(say.steerCancel, () => this.stopPointing());
    give.className = 'nt-steer-give'; cancel.className = 'nt-link';
    this.steer.append(make('span', 'nt-steer-help', say.steerHelp), give, cancel);
  }

  // ---------- Keys ----------

  private key(e: KeyboardEvent): void {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') || document.querySelector('.nt-backdrop')) return;
    if (e.key === 'Escape') { this.close(); this.stopPointing(); return; }
    const keys = this.page.settings().keys, action = KEY_ACTIONS.find((a) => keys[a] === e.code);
    if (action) this.byKey(action);
  }

  private byKey(action: KeyAction): void {
    const w = window.innerWidth / 2, h = window.innerHeight / 2;
    if (action === 'fan') {
      const r = this.view.getBoundingClientRect(), who = manAt(this.page.men(), w - r.left, h - r.top, MIDDLE_REACH);
      if (who) { this.close(); this.openFor(who, w, h); }
      return;
    }
    if (action === 'midshipman') { this.close(); this.openFor('midshipman', w, h, true); return; }
    const what = KEY_ORDERS[action];
    if (!what) return;
    if (what === 'steer there') {
      // While pointing, the key gives it; otherwise at once, where he looks.
      const runner = this.pointing?.runner ?? !this.inVoice('master');
      this.stopPointing();
      this.steerNow(runner, 'key');
      return;
    }
    const to = keyTaker(what);
    this.speak(to, { order: what }, 'key', !this.inVoice(to));
  }

  private inVoice(who: Taker): boolean {
    return inVoice(this.page.captain(), postOf(who));
  }

  // ---------- Drawing ----------

  /** Shows a fan (or a ring of it) round its hub, kept inside the screen. */
  private layOut(o: Open): void {
    const most = RING + TAG / 2 + EDGE;
    const x = Math.min(window.innerWidth - most, Math.max(most, o.x)), y = Math.min(window.innerHeight - most, Math.max(most, o.y));
    this.open = { ...o, x, y };
    const say = this.page.wording();
    this.root.replaceChildren();
    this.root.style.display = 'block';
    this.root.style.left = `${x}px`;
    this.root.style.top = `${y}px`;
    this.root.append(make('div', 'nt-fan-ring'));
    this.hub = make('button', 'nt-fan-hub', say[o.hubWord]);
    this.hub.type = 'button';
    this.root.append(this.hub);
    const shown = o.items.slice(0, FAN_MOST), places = slotPlaces(shown.length, RING);
    this.tags = shown.map((item, i) => {
      const tag = make('button', 'nt-fan-tag');
      tag.type = 'button';
      tag.append(make('span', '', say[item.word]));
      if (item.detail) tag.append(make('small', '', say[item.detail]));
      tag.style.left = `${places[i]![0]}px`;
      tag.style.top = `${places[i]![1]}px`;
      this.root.append(tag);
      return tag;
    });
    this.under = -1;
    this.judged = -Infinity;
    this.judge();
  }

  /** Dim and ringed, as the match stands now. */
  private judge(): void {
    const o = this.open!, s = this.page.session;
    this.slots = fanSlots(o.items.slice(0, FAN_MOST), s.state, s.ship);
    this.slots.forEach((slot, i) => {
      this.tags[i]?.classList.toggle('dim', slot.dim);
      this.tags[i]?.classList.toggle('on', slot.on);
    });
  }

  private close(): void {
    this.open = null;
    this.finger = null;
    this.root.style.display = 'none';
    this.root.replaceChildren();
    this.tags = [];
    this.hub = null;
  }
}

/** The man a key's order goes to (fanOrders.ts KEY_ORDERS are all the master's or the first lieutenant's). */
function keyTaker(order: Order): Taker {
  return order.kind === 'sail' || order.kind === 'shorten' ? 'first lieutenant' : 'master';
}
