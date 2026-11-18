/**
 * The settings on the page (plan N7.3): the compass rose in the top left corner opens them on a sheet (sheet.ts), an
 * index of pages on the left and the page on the right, every control a finger can hit. Each change goes to the
 * store at once (settingsStore.ts), which keeps it and tells the page, so it works mid-match. The version and what's
 * new stand at the sheet's foot; a version not yet seen marks the rose.
 */
import { MOTION_STEPS } from '../sim/rules/body';
import { make } from './dom';
import { rose, openSheet, type Sheet } from './sheet';
import {
  DEFAULT_SETTINGS, KEY_ACTIONS, LANGUAGES, MATCH_LEAST, MATCH_MOST, MATCH_STEP, QUALITY_CHOICES, SPEED_LEAST, SPEED_MOST,
  THUMB_SIDES, VIOLENCE_LEVELS, withKey, type KeyAction, type Settings, type SoundPart,
} from './settings';
import type { SettingsStore } from './settingsStore';
import { openWhatsNew, unseenVersion, versionLabel } from './whatsNew';
import { words, type WordKey } from './words';

/** What the panel shows of the page beside the settings. */
export interface SettingsHooks {
  /** The quality level drawn now and why, in words (the chooser's reason). */
  qualityNow(): string;
}

/** The pages, in the order of the index, with their names' words. */
const PAGES = ['picture', 'sound', 'view', 'controls', 'fight', 'language'] as const;
type Page = (typeof PAGES)[number];
const PAGE_WORDS: Readonly<Record<Page, WordKey>> = { picture: 'pagePicture', sound: 'pageSound', view: 'pageView', controls: 'pageControls', fight: 'pageFight', language: 'pageLanguage' };
/** How often the picture page writes the level drawn now anew while it is open, ms. */
const QUALITY_EVERY_MS = 1000;
/** A slider's step for the look speeds, times the natural. */
const SPEED_STEP = 0.05;
/** Percent in a whole: the sound levels are shown and slid in percent. */
const PERCENT = 100;
/** Digits after the point of a look speed on screen. */
const SPEED_DIGITS = 2;

type Say = Readonly<Record<WordKey, string>>;

const QUALITY_WORDS: Readonly<Record<string, WordKey>> = { auto: 'auto', high: 'high', medium: 'medium', low: 'low', lowest: 'lowest' };
const MOTION_WORDS: readonly WordKey[] = ['motionFull', 'motionHalf', 'motionCalm'];
const THUMB_WORDS: readonly WordKey[] = ['left', 'right'];
const VIOLENCE_WORDS: readonly WordKey[] = ['violenceMild', 'violencePlain', 'violenceUnsparing'];
const LANGUAGE_WORDS: readonly WordKey[] = ['english', 'german'];
const KEY_WORDS: Readonly<Record<KeyAction, WordKey>> = {
  forward: 'keyForward', back: 'keyBack', left: 'keyLeft', right: 'keyRight', glass: 'keyGlass',
  steer: 'keySteer', up: 'fanUp', away: 'fanAway', tack: 'fanTack', wear: 'fanWear', heave: 'fanHeave',
  battle: 'fanBattle', plain: 'fanPlain', all: 'fanAll', shorten: 'fanShorten',
  quarters: 'fanQuarters', round: 'fanRound', chain: 'fanChain', grape: 'fanGrape', fire: 'keyFire', cease: 'fanCease', fan: 'keyFan', midshipman: 'keyMidshipman',
  reports: 'keyReports',
};
/** The first order key: the keys page starts a section "Orders" there. */
const FIRST_ORDER_KEY: KeyAction = 'steer';
const SOUND_WORDS: Readonly<Record<SoundPart, readonly [WordKey, WordKey | null]>> = {
  all: ['soundAll', null], sea: ['soundSea', null], ship: ['soundShip', 'soundShipHelp'], crew: ['soundCrew', 'soundCrewHelp'], battle: ['soundBattle', null],
};
/** Keys named as people read them, where the key's code does not say it plainly. */
const KEY_NAMES: Readonly<Record<string, string>> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: '␣' };

/** A key's code (`KeyW`, `Digit1`, `ShiftLeft`) as its cap reads. */
export const keyName = (code: string): string => KEY_NAMES[code] ?? code.replace(/^Key|^Digit/, '').replace(/(Left|Right)$/, ' $1');

export class SettingsMenu {
  private readonly button = make('button', 'nt-pill round', '');
  private sheet: Sheet | null = null;
  private page: Page = 'picture';
  private ticker = 0;
  /** The action waiting for its new key, and how to stop waiting. */
  private capture: (() => void) | null = null;

  constructor(private readonly store: SettingsStore, private readonly hooks: SettingsHooks) {
    this.button.id = 'settings';
    this.button.type = 'button';
    this.button.append(rose());
    this.button.addEventListener('click', () => this.open());
    document.body.append(this.button);
    store.watch((now, before) => {
      const say = words(now.language);
      this.button.setAttribute('aria-label', say.settings);
      this.button.classList.toggle('fresh', unseenVersion());
      if (this.sheet && before && before.language !== now.language) { this.sheet.title.textContent = say.settings; this.sheet.close.setAttribute('aria-label', say.close); this.redraw(); }
    });
  }

  /** Opens the settings at the page shown last. */
  open(): void {
    if (this.sheet) return;
    const say = this.say();
    this.sheet = openSheet('settings', say.settings, say.close, () => { this.sheet = null; this.stopCapture(); clearInterval(this.ticker); });
    this.redraw();
  }

  private say(): Say {
    return words(this.store.now.language);
  }

  /** The sheet's body drawn afresh: the index, the page, the foot. */
  private redraw(): void {
    if (!this.sheet) return;
    this.stopCapture();
    clearInterval(this.ticker);
    const say = this.say(), body = make('div', 'settings-body'), index = make('nav', 'settings-tabs'), page = make('div', 'settings-page');
    for (const p of PAGES) {
      const tab = make('button', p === this.page ? 'nt-tab on' : 'nt-tab', say[PAGE_WORDS[p]]);
      tab.type = 'button';
      tab.addEventListener('click', () => { this.page = p; this.redraw(); });
      index.append(tab);
    }
    this.pageOf(this.page, page, say);
    body.append(index, page);
    const foot = make('footer', 'settings-foot'), news = make('button', unseenVersion() ? 'nt-link fresh' : 'nt-link', say.whatsNew);
    news.type = 'button';
    news.addEventListener('click', () => openWhatsNew(say, () => { news.classList.remove('fresh'); this.button.classList.remove('fresh'); }));
    foot.append(make('span', 'settings-version', `Nauta ${versionLabel}`), news);
    this.sheet.body.replaceChildren(body, foot);
  }

  private pageOf(p: Page, el: HTMLElement, say: Say): void {
    const s = this.store.now;
    const set = (to: Partial<Settings>) => this.store.change(to);
    if (p === 'picture') {
      el.append(choiceRow(say.quality, say.qualityHelp, QUALITY_CHOICES.map((q) => say[QUALITY_WORDS[q] ?? 'auto']), QUALITY_CHOICES.indexOf(s.quality), (i) => { set({ quality: QUALITY_CHOICES[i]! }); }));
      const now = make('p', 'nt-note');
      const tell = () => { now.textContent = `${say.qualityNow}: ${this.hooks.qualityNow()}`; };
      tell();
      this.ticker = window.setInterval(tell, QUALITY_EVERY_MS);
      el.append(now, choiceRow(say.frameTimes, say.frameTimesHelp, [say.off, say.on], s.frameTimes ? 1 : 0, (i) => set({ frameTimes: i === 1 })));
    } else if (p === 'sound') {
      for (const part of Object.keys(SOUND_WORDS) as SoundPart[]) {
        const [name, help] = SOUND_WORDS[part];
        el.append(slideRow(say[name], help ? say[help] : null, s.sound[part] * PERCENT, 0, PERCENT, 1, (v) => `${Math.round(v)}%`,
          (v) => set({ sound: { ...this.store.now.sound, [part]: v / PERCENT } })));
      }
    } else if (p === 'view') {
      el.append(
        choiceRow(say.motion, say.motionHelp, MOTION_WORDS.map((w) => say[w]), MOTION_STEPS.findIndex((m) => m === s.motion), (i) => set({ motion: MOTION_STEPS[i]! })),
        slideRow(say.fingerSpeed, say.fingerSpeedHelp, s.fingerSpeed, SPEED_LEAST, SPEED_MOST, SPEED_STEP, speedText, (v) => set({ fingerSpeed: v })),
        slideRow(say.mouseSpeed, null, s.mouseSpeed, SPEED_LEAST, SPEED_MOST, SPEED_STEP, speedText, (v) => set({ mouseSpeed: v })),
        choiceRow(say.mouseUpDown, null, [say.normal, say.inverted], s.mouseInverted ? 1 : 0, (i) => set({ mouseInverted: i === 1 })),
        choiceRow(say.reportsButton, say.reportsButtonHelp, [say.off, say.on], s.reportsButton ? 1 : 0, (i) => set({ reportsButton: i === 1 })),
      );
    } else if (p === 'controls') {
      el.append(section(say.touch), choiceRow(say.thumb, say.thumbHelp, THUMB_WORDS.map((w) => say[w]), THUMB_SIDES.indexOf(s.thumb), (i) => set({ thumb: THUMB_SIDES[i]! })));
      el.append(section(say.keys), make('p', 'nt-note', say.keysHelp));
      for (const a of KEY_ACTIONS) {
        if (a === FIRST_ORDER_KEY) el.append(section(say.keysOrders));
        const cap = make('button', 'nt-key', keyName(s.keys[a]));
        cap.type = 'button';
        cap.addEventListener('click', () => this.waitForKey(a, cap, say));
        el.append(row(say[KEY_WORDS[a]], null, cap));
      }
      const reset = make('button', 'nt-link', say.resetKeys);
      reset.type = 'button';
      reset.addEventListener('click', () => { set({ keys: DEFAULT_SETTINGS.keys }); this.redraw(); });
      el.append(reset);
    } else if (p === 'fight') {
      el.append(
        choiceRow(say.violence, say.violenceHelp, VIOLENCE_WORDS.map((w) => say[w]), VIOLENCE_LEVELS.indexOf(s.violence), (i) => set({ violence: VIOLENCE_LEVELS[i]! })),
        slideRow(say.matchLength, say.matchLengthHelp, s.matchMinutes, MATCH_LEAST, MATCH_MOST, MATCH_STEP, (v) => `${v} ${say.minutes}`, (v) => set({ matchMinutes: v })),
      );
    } else {
      el.append(choiceRow(say.pageLanguage, null, LANGUAGE_WORDS.map((w) => say[w]), LANGUAGES.indexOf(s.language), (i) => set({ language: LANGUAGES[i]! })));
    }
  }

  /** The key cap waits for the next key pressed, which becomes the action's; Escape keeps the old one. */
  private waitForKey(action: KeyAction, cap: HTMLButtonElement, say: Say): void {
    this.stopCapture();
    cap.textContent = say.pressKey;
    cap.classList.add('on');
    const onKey = (e: KeyboardEvent) => {
      // Caught before the walk and the glass hear it.
      e.preventDefault();
      e.stopImmediatePropagation();
      this.stopCapture();
      if (e.key !== 'Escape') this.store.change(withKey(this.store.now, action, e.code));
      this.redraw();
    };
    window.addEventListener('keydown', onKey, true);
    this.capture = () => { window.removeEventListener('keydown', onKey, true); cap.classList.remove('on'); };
  }

  private stopCapture(): void {
    this.capture?.();
    this.capture = null;
  }
}

const speedText = (v: number): string => `${Number(v.toFixed(SPEED_DIGITS))}×`;

/** A heading inside a page, between two rules. */
function section(name: string): HTMLElement {
  return make('div', 'nt-section', name);
}

/** One setting's row: its name and a line of help, and its control. */
function row(name: string, help: string | null, control: HTMLElement): HTMLElement {
  const r = make('div', 'nt-row'), label = make('div', 'nt-label', name);
  if (help) label.append(make('small', '', help));
  r.append(label, control);
  return r;
}

/** A choice of a few, one line of words with the chosen one marked. */
function choiceRow(name: string, help: string | null, options: readonly string[], chosen: number, picked: (i: number) => void): HTMLElement {
  const box = make('div', 'nt-choice');
  box.setAttribute('role', 'radiogroup');
  box.setAttribute('aria-label', name);
  const buttons = options.map((o, i) => {
    const b = make('button', i === chosen ? 'on' : '', o);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(i === chosen));
    b.addEventListener('click', () => {
      for (const [j, x] of buttons.entries()) { x.classList.toggle('on', j === i); x.setAttribute('aria-checked', String(j === i)); }
      picked(i);
    });
    box.append(b);
    return b;
  });
  return row(name, help, box);
}

/** A slider from `least` to `most` in steps of `step`, its value written beside it by `text`. */
function slideRow(name: string, help: string | null, value: number, least: number, most: number, step: number, text: (v: number) => string, slid: (v: number) => void): HTMLElement {
  const box = make('div', 'nt-slide'), range = make('input', 'nt-range'), shown = make('span', 'nt-value');
  range.type = 'range';
  range.min = String(least); range.max = String(most); range.step = String(step); range.value = String(value);
  range.setAttribute('aria-label', name);
  const mark = () => {
    const v = Number(range.value);
    shown.textContent = text(v);
    range.style.setProperty('--fill', `${((v - least) / (most - least)) * PERCENT}%`);
  };
  range.addEventListener('input', () => { mark(); slid(Number(range.value)); });
  mark();
  box.append(range, shown);
  return row(name, help, box);
}
