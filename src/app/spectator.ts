/**
 * Watching a battle (implementation plan N7.8): the spectator's controls on the page. The viewer flies a free eye
 * (freeCam.ts) with the walking thumb or keys (the same stick the captain walks by), looks with the other thumb or
 * the mouse (lookInput.ts), climbs and descends with two arrows at the right or the keys beside the walking ones, and
 * has a row of buttons at the foot that glide the eye to the British ship, the French ship, or a place to see both,
 * or leave it where it is. While the eye keeps company with a ship (the default: both) it is carried along as she
 * sails, so the battle does not sail out of the picture.
 *
 * No order is given from here, and nothing of the captain's is shown: the page asks `active` before drawing him.
 */
import { make } from './dom';
import { makeButton } from './button';
import type { Look } from './look';
import type { Standpoint } from './standpoints';
import { FreeCam, camps, foeHull, vantageOf, vantageOfAll, vantageOver, type Hull, type Vec3 } from './freeCam';
import type { Push } from './thumbs';
import type { WordKey } from './words';
import type { Offered } from '../sim/rules/captain';

const SKILL_WORDS: Readonly<Record<Offered, WordKey>> = { green: 'skillGreen', seasoned: 'skillSeasoned', master: 'skillMaster' };

/** Who fights in a battle watched, for the caption at the top of the view: each navy with its captain's skill. */
export const watchCaption = (say: Readonly<Record<WordKey, string>>, british: Offered, french: Offered): string =>
  `${say.british} · ${say[SKILL_WORDS[british]]}  —  ${say.french} · ${say[SKILL_WORDS[french]]}`;

/** What the eye keeps company with. */
export type Company = 'british' | 'both' | 'french' | 'stay';

/** The keys that climb and descend and the one that goes faster (their `code`s); the walking keys come from the player's settings. */
const CLIMB_KEYS = ['Space', 'KeyE', 'PageUp'] as const;
const DESCEND_KEYS = ['KeyC', 'PageDown'] as const;
const BOOST_KEYS = ['ShiftLeft', 'ShiftRight'] as const;
/** Where the eye is before the first battle begins, m up (it is placed at once by `begin`). */
const START_HEIGHT = 60;
/** How long the hint at the top of the view stays, ms. */
const HINT_MS = 12000;
/** A ship's middle stands this high over the water for the distance to her, m: the eye's nearness is to her hull, not her waterline. */
const SHIP_MIDDLE = 8;
/** The eye is nearer the other ship than the one it was nearest to only when it is this share of the distance to her: no flicker midway between the two. */
const NEARER_SHARE = 0.8;
/** The words the controls speak with, by key. */
type Say = Readonly<Record<WordKey, string>>;

/** What the controls ask of the page. */
export interface SpectatorPage {
  /** The words now (the language chosen). */
  readonly spoken: () => Say;
  /** What the walking thumb and the walking keys push now. */
  readonly push: () => Push;
  /** Where the ships lie now (the match as it stands, not as the last frame drew it). */
  readonly hulls: () => readonly Hull[];
  /** Whether the pointing device is a desk's (keys and mouse) rather than a finger. */
  readonly desk: () => boolean;
  /** Whether a key (its `code`) is one of the player's order keys: a watcher gives no order, so it is held back from the order fan. */
  readonly orderKey: (code: string) => boolean;
}

export class Spectator {
  private readonly cam = new FreeCam([0, START_HEIGHT, 0]);
  private on = false;
  private company: Company = 'both';
  private held = new Set<string>();
  private buttonClimb = 0;
  private hulls: readonly Hull[] = [];
  private readonly bar = make('nav', 'nt-watch-bar');
  private readonly arrows = make('div', 'nt-watch-arrows');
  private readonly hint = make('p', 'nt-watch-hint');
  private readonly caption = make('p', 'nt-watch-caption');
  private readonly buttons = new Map<Company, HTMLButtonElement>();
  private up!: HTMLButtonElement;
  private down!: HTMLButtonElement;
  private hintTimer = 0;
  private nearest = 0;
  /** The opening shot is set again from where the ships are at the first frame (the page's poses are those of the last frame when it begins). */
  private opening = false;
  /** For the browser checks: a push, a climb and the boost held in place of the thumb and keys (null: the thumb and keys). */
  forced: { readonly push: Push; readonly climb: number; readonly boost: boolean } | null = null;

  constructor(private readonly page: SpectatorPage) {
    const hide = (el: HTMLElement) => { el.hidden = true; document.body.append(el); };
    hide(this.bar); hide(this.arrows); hide(this.hint); hide(this.caption);
    // Before every other listener (capture): the order keys do nothing while a battle is watched.
    window.addEventListener('keydown', (e) => this.onKey(e, true), true);
    window.addEventListener('keyup', (e) => this.onKey(e, false), true);
    window.addEventListener('blur', () => { this.held.clear(); this.buttonClimb = 0; });
    this.relabel();
  }

  /** Where the eye is now (world metres). */
  get eye(): Vec3 {
    return this.cam.at;
  }

  /** Which ship (her place in the match) the eye is nearest to: the one whose men are drawn as full characters. */
  get nearestShip(): number {
    return this.nearest;
  }

  /** Whether a battle is being watched now: the page draws no captain and takes no orders while it is. */
  get watching(): boolean {
    return this.on;
  }

  /**
   * Begins watching: the eye over the British ship's shoulder, looking out to the French on the horizon (keeping company with her),
   * the look to take. `caption`: who fights
   * (shown small at the top of the view). Call `end` when the match is left.
   */
  begin(ships: readonly Hull[], caption: string): Look {
    this.on = true;
    this.company = 'british';
    this.hulls = ships;
    this.nearest = 0;
    this.opening = true;
    this.held.clear();
    this.cam.parted();
    const v = ships.length > 1 ? vantageOver(ships[0]!, foeHull(ships)!) : vantageOf(ships[0]!);
    this.cam.x = v.at[0]; this.cam.y = v.at[1]; this.cam.z = v.at[2];
    this.caption.textContent = caption;
    for (const el of [this.bar, this.arrows, this.caption]) el.hidden = false;
    document.body.classList.add('watching');
    this.relabel();
    clearTimeout(this.hintTimer);
    this.hint.hidden = false;
    this.hintTimer = window.setTimeout(() => { this.hint.hidden = true; }, HINT_MS);
    return v.look;
  }

  /** The match is left: the controls go away. */
  leaveBattle(): void {
    this.on = false;
    for (const el of [this.bar, this.arrows, this.hint, this.caption]) el.hidden = true;
    document.body.classList.remove('watching');
    clearTimeout(this.hintTimer);
  }

  /** The words are drawn again (a change of language, a change of device): buttons, hint. */
  relabel(): void {
    const say = this.page.spoken();
    const companyButton = (name: Company, label: string) => {
      const b = makeButton(label, () => this.keepCompanyWith(name));
      b.classList.toggle('on', name === this.company);
      this.buttons.set(name, b);
      return b;
    };
    this.bar.replaceChildren(companyButton('british', say.british), companyButton('both', say.watchBoth), companyButton('french', say.french), companyButton('stay', say.watchStay));
    const hold = (label: string, title: string, sign: 1 | -1) => {
      const b = make('button', 'nt-watch-arrow', label);
      b.type = 'button';
      b.title = title;
      b.setAttribute('aria-label', title);
      const release = () => { if (this.buttonClimb === sign) this.buttonClimb = 0; b.classList.remove('on'); };
      b.addEventListener('pointerdown', () => { this.buttonClimb = sign; b.classList.add('on'); });
      b.addEventListener('pointerup', release);
      b.addEventListener('pointercancel', release);
      b.addEventListener('pointerleave', release);
      return b;
    };
    this.up = hold('▲', say.watchUp, 1);
    this.down = hold('▼', say.watchDown, -1);
    this.arrows.replaceChildren(this.up, this.down);
    this.hint.textContent = this.page.desk() ? say.watchHintDesk : say.watchHintTouch;
  }

  /** A button chosen (or the key beside it): where the eye keeps company, and gliding there for a ship or both. */
  keepCompanyWith(to: Company): void {
    this.company = to;
    this.cam.parted();
    for (const [name, b] of this.buttons) b.classList.toggle('on', name === to);
    if (to === 'stay') return;
    this.hulls = this.page.hulls();
    const group = this.group(to);
    if (group.length === 0) return;
    this.cam.glideTo(to === 'both' ? vantageOfAll(group) : vantageOf(group[0]!));
  }

  /** The ships a company keeps: 'british' the first one's side, 'french' the other sides, 'both' every ship. */
  private group(to: Company): readonly Hull[] {
    if (this.hulls.length === 0) return [];
    const { first, others } = camps(this.hulls);
    return to === 'british' ? first : to === 'french' ? others : this.hulls;
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (!this.on || (e.target instanceof HTMLInputElement)) return;
    const watched = [...CLIMB_KEYS, ...DESCEND_KEYS, ...BOOST_KEYS] as readonly string[];
    // A sheet open (the settings, with a key being chosen) has the keyboard.
    const sheet = document.querySelector('.nt-backdrop') !== null;
    if (down && !sheet && this.page.orderKey(e.code)) e.stopImmediatePropagation();
    if (!watched.includes(e.code)) return;
    if (down) { if (!sheet) { this.held.add(e.code); e.preventDefault(); } } else this.held.delete(e.code);
  }

  /** The place the eye keeps company with now: the middle of the ships it keeps, or none. */
  private companyNow(): { x: number; z: number } | null {
    if (this.hulls.length === 0 || this.company === 'stay') return null;
    const group = this.group(this.company);
    return { x: group.reduce((s, h) => s + h.x, 0) / group.length, z: group.reduce((s, h) => s + h.z, 0) / group.length };
  }

  /**
   * One frame: the eye flown by what the viewer asks, carried with the ships; returns where it stands (the standpoint
   * the ship's view draws from) and the look. `water`: the surface's height at a place.
   */
  eyeFor(dt: number, look: Look, ships: readonly Hull[], water: (x: number, z: number) => number): { readonly where: Standpoint; readonly look: Look } {
    this.hulls = ships;
    const c = this.cam;
    let opened: Look | null = null;
    if (this.opening && ships.length > 1) {
      this.opening = false;
      const v = vantageOver(ships[0]!, foeHull(ships)!);
      [c.x, c.y, c.z] = v.at;
      c.parted();
      opened = v.look;
    }
    const apart = ships.map((s) => Math.hypot(s.x - c.x, SHIP_MIDDLE - c.y, s.z - c.z)), near = Math.min(Infinity, ...apart);
    const closest = apart.indexOf(near);
    if (closest >= 0 && closest !== this.nearest && near < (apart[this.nearest] ?? Infinity) * NEARER_SHARE) this.nearest = closest;
    const pressed = (keys: readonly string[]) => keys.some((k) => this.held.has(k));
    const climb = (pressed(CLIMB_KEYS) ? 1 : 0) - (pressed(DESCEND_KEYS) ? 1 : 0) + this.buttonClimb;
    const f = this.forced, ask = { push: f?.push ?? this.page.push(), climb: f?.climb ?? Math.max(-1, Math.min(1, climb)), boost: f?.boost ?? pressed(BOOST_KEYS) };
    const turned = c.onward(dt, opened ?? look, { ...ask, near, water: water(c.x, c.z) }, this.companyNow());
    const eye: Vec3 = c.at;
    return { where: { name: 'watch', eye, look: turned, off: true, world: true }, look: turned };
  }
}
