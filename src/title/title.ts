/**
 * The title while the game prepares (plan N7.7), on the page: it puts the title's canvas under the name, has the
 * picture drawn in a worker (titleWorker.ts; on the page itself where the browser cannot hand a canvas to a worker),
 * passes the finger on, starts the theme with the first tap (Safari plays no sound before one) and plays the guns
 * a tap on the brig fires. `handOver` fades it into the deck once the game has drawn its first frame.
 *
 * Small on purpose: it and its picture are evaluated first (boot.ts), before three.js and the game.
 */
import type { AudioEngine } from '@futuremagic/audio/web';
import { FramePace, TitleScene } from './scene';
import { EXCHANGE, exchange, onBrig, sunFromFinger } from './titleLook';
import { MS_PER_SECOND } from '../sim/units';
import { SettingsStore } from '../app/settingsStore';
import { words, type WordKey } from '../app/words';

/** What the page tells the worker that draws the title. */
export type ToTitle =
  | { kind: 'start'; canvas: OffscreenCanvas; w: number; h: number; fps: number }
  | { kind: 'size'; w: number; h: number }
  | { kind: 'aim'; x: number; height: number }
  | { kind: 'fire'; n: number }
  | { kind: 'stop' };

/** The theme's id in the sound index (tools/sound/sounds.json). */
export const THEME = 'music/title';
/** The most pixels the title draws (it is soft and scaled up past that): about an iPad Air's screen at 1.5 times. */
const MOST_PIXELS = 2_400_000;
/** The most pictures a second the title draws: a 120 Hz screen gets every other frame (the picture moves slowly). */
const MOST_FPS = 60;
/** How long the title takes to fade into the deck, ms (the game's quality chooser waits this long: quality.ts START_SETTLE_MS). */
export const HAND_OVER_MS = 1000;
/** How long the theme takes to fade out once the deck is shown, s. */
const THEME_FADE = 14;
/** A tap moves less than this far (px) to count as a tap, not a drag. */
const TAP_REACH = 12;
/** The guns heard: how far behind the flash her own gun's sound comes (about 200 m off), and the other brig's (about a mile), s. */
const HER_SOUND = 0.6;
const FOE_SOUND = 2.8;
/** The other brig's ball falling short by her, heard this long after it splashes, s. */
const SPLASH_SOUND = 0.3;
/** How loud the guns and the splash are on the title. */
const GUN_GAIN = 0.8;
const FOE_GAIN = 0.45;
const SPLASH_GAIN = 0.5;
/** How long the second hint stays, ms. */
const HINT_MS = 9000;

/** Draws the scene: in a worker, or on the page. */
interface Drawer { size(w: number, h: number): void; aim(x: number, height: number): void; fire(n: number): void; stop(): void }

let shown: Title | null = null;

export class Title {
  private readonly drawer: Drawer;
  private scale = 1;
  private fired = 0;
  private down: { x: number; y: number; id: number } | null = null;
  private tapped = false;
  private gone = false;
  /** Once the game is ready behind it with the menu to come (plan N7.2): what the next tap does. */
  private begin: (() => void) | null = null;
  /** The hint's words in the player's language (the settings). */
  private readonly said: Readonly<Record<WordKey, string>>;

  /**
   * `root`: the title's element (#loading), holding its canvas (`.title-view`) and hint (`.title-hint`); `engine`:
   * the page's sound, whose first press opens it. `onDrawn`: called with the time the first picture was drawn (ms on
   * the page's clock) once the page hears of it.
   */
  constructor(private readonly root: HTMLElement, private readonly engine: AudioEngine, onDrawn: (at: number) => void) {
    const canvas = root.querySelector<HTMLCanvasElement>('.title-view')!;
    // The still of the title's first picture is shown until then (nauta.css #loading); the drawn title fades in over it
    // once the page hears it is drawn, so a busy page only keeps the still up longer.
    const drawn = (at: number) => { canvas.classList.add('drawn'); onDrawn(at); };
    this.drawer = typeof canvas.transferControlToOffscreen === 'function' && typeof Worker === 'function' ? workerDrawer(canvas, this.pixels(), MOST_FPS, drawn) : pageDrawer(canvas, this.pixels(), MOST_FPS, drawn);
    addEventListener('resize', () => { const [w, h] = this.pixels(); this.drawer.size(w, h); });
    root.addEventListener('pointerdown', (e) => this.onPress(e));
    root.addEventListener('pointermove', (e) => this.onMove(e));
    root.addEventListener('pointerup', (e) => this.onLift(e));
    root.addEventListener('pointercancel', () => { this.down = null; });
    const settings = new SettingsStore().now;
    this.said = words(settings.language);
    const hint = root.querySelector<HTMLElement>('.title-hint');
    if (hint) hint.textContent = this.said.titleTap;
    // The player's own level for the whole sound (the game sets it again, and each part's, once it runs).
    engine.setVolume('master', settings.sound.all);
    engine.music(THEME, 1);
    engine.preload(['gun/far', 'shot/splash']);
  }

  /** The canvas's size in px: the screen's, at the device's sharpness up to `MOST_PIXELS`. */
  private pixels(): [number, number] {
    const w = Math.max(1, this.root.clientWidth), h = Math.max(1, this.root.clientHeight);
    this.scale = Math.min(devicePixelRatio || 1, Math.sqrt(MOST_PIXELS / (w * h)));
    return [w * this.scale, h * this.scale];
  }

  private onPress(e: PointerEvent): void {
    if (this.gone) return;
    if (this.begin) { const begin = this.begin; this.begin = null; begin(); return; }
    this.down = { x: e.clientX, y: e.clientY, id: e.pointerId };
    if (!this.tapped) this.firstTap();
    const w = this.root.clientWidth, h = this.root.clientHeight;
    if (onBrig(e.clientX, e.clientY, w, h)) this.fire();
    else this.aim(e);
  }

  private onMove(e: PointerEvent): void {
    if (this.down?.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > TAP_REACH) this.aim(e);
  }

  private onLift(e: PointerEvent): void {
    if (this.down?.id === e.pointerId) this.down = null;
  }

  private aim(e: PointerEvent): void {
    const sun = sunFromFinger(e.clientX, e.clientY, this.root.clientWidth, this.root.clientHeight);
    this.drawer.aim(sun.x * this.scale, sun.height);
  }

  /** The first tap: the theme starts (the engine opens on this press), and the hint says what else a finger can do. */
  private firstTap(): void {
    this.tapped = true;
    const hint = this.root.querySelector<HTMLElement>('.title-hint');
    if (!hint || this.begin) return;
    hint.textContent = this.said.titleThen;
    setTimeout(() => { if (!this.begin) hint.classList.add('gone'); }, HINT_MS);
  }

  /** A tap on the brig: she fires, the other brig answers, and both are heard as far off as they are. */
  private fire(): void {
    const n = this.fired++, plan = exchange(n), e = this.engine;
    this.drawer.fire(n);
    e.play('gun/far', { delay: HER_SOUND, gain: GUN_GAIN, bus: 'ui', late: HER_SOUND });
    e.play('gun/far', { delay: plan.answer + FOE_SOUND, gain: FOE_GAIN, bus: 'ui', late: plan.answer });
    e.play('shot/splash', { delay: plan.answer + EXCHANGE.flight + SPLASH_SOUND, gain: SPLASH_GAIN, bus: 'ui', late: plan.answer });
  }

  /** The game is ready behind the title and the menu comes next (plan N7.2): the hint asks for a tap, and the next tap anywhere calls `begin`. */
  awaitBegin(begin: () => void): void {
    this.begin = begin;
    const note = this.root.querySelector<HTMLElement>('.title-note');
    if (note) note.textContent = '';
    const hint = this.root.querySelector<HTMLElement>('.title-hint');
    if (!hint) return;
    hint.textContent = this.said.titleBegin;
    hint.classList.remove('gone');
    hint.classList.add('begin');
  }

  /** Fades the title into what is drawn behind it, then stops drawing it; the theme fades under the deck's sound, or plays on under the menu (`keepTheme`). */
  leave(atOnce: boolean, keepTheme = false): void {
    if (this.gone) return;
    this.gone = true;
    this.root.style.pointerEvents = 'none';
    this.root.style.opacity = '0';
    if (!keepTheme) this.engine.music(null, atOnce ? 1 : THEME_FADE);
    setTimeout(() => { this.drawer.stop(); this.root.remove(); }, atOnce ? 0 : HAND_OVER_MS);
  }
}

/** The title drawn in a worker, from a canvas handed to it. */
function workerDrawer(canvas: HTMLCanvasElement, [w, h]: [number, number], fps: number, drawn: (at: number) => void): Drawer {
  const worker = new Worker(new URL('./titleWorker.ts', import.meta.url), { type: 'module' });
  const send = (m: ToTitle, moved: Transferable[] = []) => worker.postMessage(m, moved);
  const off = canvas.transferControlToOffscreen();
  // The worker says when, on the clock all pages share; the page's own clock starts at its `timeOrigin`.
  worker.onmessage = (e: MessageEvent<{ at: number }>) => drawn(e.data.at - performance.timeOrigin);
  send({ kind: 'start', canvas: off, w, h, fps }, [off]);
  return {
    size: (sw, sh) => send({ kind: 'size', w: sw, h: sh }),
    aim: (x, height) => send({ kind: 'aim', x, height }),
    fire: (n) => send({ kind: 'fire', n }),
    stop: () => { send({ kind: 'stop' }); worker.terminate(); },
  };
}

/** The title drawn on the page, where the browser cannot hand a canvas to a worker. */
function pageDrawer(canvas: HTMLCanvasElement, [w, h]: [number, number], fps: number, drawn: (at: number) => void): Drawer {
  const canvasOf = (cw: number, ch: number) => Object.assign(document.createElement('canvas'), { width: cw, height: ch });
  const scene = new TitleScene(canvas, canvasOf);
  scene.resize(w, h);
  let running = true, first = true;
  const pace = new FramePace(fps);
  const tick = (now: number) => {
    if (!running) return;
    if (pace.due(now)) scene.frame(now / MS_PER_SECOND);
    if (first) { first = false; drawn(performance.now()); }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return { size: (sw, sh) => scene.resize(sw, sh), aim: (x, height) => scene.aim(x, height), fire: (n) => scene.fire(n), stop: () => { running = false; } };
}

/** Shows the title in #loading (once). */
export function showTitle(engine: AudioEngine, onDrawn: (at: number) => void = () => undefined): Title | null {
  const root = document.getElementById('loading');
  if (!root || shown) return shown;
  shown = new Title(root, engine, onDrawn);
  return shown;
}

/**
 * The game has drawn its first frame (or failed: `atOnce`): the title fades into it. Without a title (the probe, the
 * network check) the loading screen just goes.
 */
export function handOver(atOnce = false, keepTheme = false): void {
  if (shown) shown.leave(atOnce, keepTheme);
  else document.getElementById('loading')?.remove();
}

/**
 * The game is ready and the menu comes next (plan N7.2, menu.md: "one tap begins"): the title asks for a tap and
 * `begin` runs on it; without a title, at once.
 */
export function beginOnTap(begin: () => void): void {
  if (shown && document.getElementById('loading')) shown.awaitBegin(begin);
  else begin();
}

/** The title theme played again (back at the menu) or faded out (a match begins). */
export function titleTheme(engine: AudioEngine, on: boolean): void {
  engine.music(on ? THEME : null, THEME_FADE);
}
