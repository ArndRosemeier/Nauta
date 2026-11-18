/**
 * The speech bubbles on the view (implementation plan N4.5; the look is docs/design/ui-style.md "Speech bubbles"): each
 * bubble the queue shows (app/speech/bubbles.ts) is a lacquer note in a brass rule over its man's head, its tail to
 * him, his rank over his words. A far man's bubble is smaller and a little faded, never smaller than its least size;
 * a man out of view has his bubble at the screen's edge on his side. While it shows, his mouth moves with its words
 * and he looks at the captain (the `Speaker` the drawing put in `Speakers`).
 *
 * Cost: one element a bubble, made once with its words; each frame only its place changes (a transform), and a bubble's
 * size is measured once when it comes. No animation, no transition, no blur (ui-style.md "Cost").
 */
import { Vector3, type Camera } from 'three';
import { make } from './dom';
import type { Bubble, BubbleQueue } from './speech/bubbles';
import type { Speakers } from './speech/speakers';

/** Beyond this distance from the eye, m, a man's bubble is the far kind: smaller words, a little faded. */
const FAR_METRES = 14;
/** The least room kept between a bubble and the screen's edge, px. */
const EDGE_ROOM = 12;
/** The height of the tail under a bubble, px: its tip is on the man's head. */
const TAIL = 10;
/** Room between two bubbles at the same edge, or nudged apart over the view, px. */
const GAP = 8;
/** Where the first bubble at an edge stands, as a share of the screen's height from the top (under the compass rose). */
const EDGE_TOP = 0.22;

interface Shown {
  readonly bubble: Bubble;
  readonly el: HTMLElement;
  readonly width: number;
  readonly height: number;
}

/** The bubbles over the view. */
export class BubbleLayer {
  private readonly root: HTMLElement;
  private readonly shown = new Map<number, Shown>();
  private readonly head = new Vector3();
  private readonly eye = new Vector3();
  private readonly local = new Vector3();
  private readonly projected = new Vector3();

  constructor(parent: HTMLElement, private readonly queue: BubbleQueue, private readonly speakers: Speakers) {
    this.root = make('div', 'nt-bubbles');
    this.root.id = 'bubbles';
    parent.appendChild(this.root);
  }

  /** Once a frame, after the camera is placed: the queue at `now` s, each bubble put over its man. */
  frame(now: number, camera: Camera): void {
    const change = this.queue.viewAt(now);
    for (const b of change.went) this.remove(b);
    for (const b of change.came) this.addBubble(b);
    if (this.shown.size > 0) this.placeBubbles(camera);
  }

  /** Everything said taken off the view (a new match). */
  clear(): void {
    for (const b of this.queue.clear()) this.remove(b);
  }

  private addBubble(b: Bubble): void {
    const el = make('div', `nt-bubble${b.say.kind === 'cry' ? ' cry' : ''}`);
    el.append(make('div', 'nt-bubble-rank', b.rank), make('div', 'nt-bubble-words', b.words));
    this.root.appendChild(el);
    this.shown.set(b.id, { bubble: b, el, width: el.offsetWidth, height: el.offsetHeight });
    this.speakers.find(b.say.ship, b.say.voice)?.say(b.words, b.until - b.from);
  }

  private remove(b: Bubble): void {
    const s = this.shown.get(b.id);
    if (!s) return;
    s.el.remove();
    this.shown.delete(b.id);
    this.speakers.find(b.say.ship, b.say.voice)?.hush();
  }

  /** Each bubble over its man, or at the edge on his side; those over the view nudged apart. */
  private placeBubbles(camera: Camera): void {
    camera.updateWorldMatrix(true, false);
    const w = this.root.clientWidth, h = this.root.clientHeight, eye = camera.getWorldPosition(this.eye);
    const edges = { left: h * EDGE_TOP, right: h * EDGE_TOP };
    const over: { s: Shown; x: number; y: number }[] = [];
    for (const s of this.shown.values()) {
      const man = this.speakers.find(s.bubble.say.ship, s.bubble.say.voice);
      const seen = man?.head(this.head) ?? false;
      let side: 'left' | 'right' = 'right';
      if (seen) {
        const far = this.head.distanceTo(eye) > FAR_METRES;
        s.el.classList.toggle('far', far);
        const local = this.local.copy(this.head).applyMatrix4(camera.matrixWorldInverse);
        side = local.x < 0 ? 'left' : 'right';
        const p = this.projected.copy(this.head).project(camera);
        const x = ((p.x + 1) / 2) * w, y = ((1 - p.y) / 2) * h;
        if (local.z < 0 && x >= 0 && x <= w && y >= 0 && y <= h) {
          over.push({ s, x, y });
          continue;
        }
      }
      // Out of view (or not drawn): at the screen's edge on his side, his rank on it, no tail.
      s.el.classList.add('edge');
      s.el.classList.remove('far');
      const top = edges[side];
      edges[side] += s.height + GAP;
      const left = side === 'left' ? EDGE_ROOM : w - EDGE_ROOM - s.width;
      s.el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    }
    // Over the view: the tail's tip on his head, the note above it, kept on the screen and clear of the one placed before.
    over.sort((a, b) => b.y - a.y);
    const placed: { left: number; top: number; right: number; bottom: number }[] = [];
    for (const { s, x, y } of over) {
      s.el.classList.remove('edge');
      const left = Math.min(w - EDGE_ROOM - s.width, Math.max(EDGE_ROOM, x - s.width / 2));
      let top = Math.max(EDGE_ROOM, y - TAIL - s.height);
      for (const r of placed) {
        if (left < r.right && left + s.width > r.left && top < r.bottom && top + s.height > r.top) top = r.top - GAP - s.height;
      }
      top = Math.max(EDGE_ROOM, top);
      placed.push({ left, top, right: left + s.width, bottom: top + s.height });
      // The tail points down at his head from wherever the note was moved to.
      s.el.style.setProperty('--tail', `${Math.round(Math.min(s.width - TAIL * 2, Math.max(TAIL * 2, x - left)))}px`);
      s.el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    }
  }
}
