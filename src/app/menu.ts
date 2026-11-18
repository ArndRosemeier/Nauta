/**
 * From the title to the deck (implementation plan N7.2, docs/design/menu.md): the main screen over the live view
 * from her quarterdeck, the match setup, the waiting room and joining a duel, the captain's pause in a match and the
 * end card, in the brass-and-lacquer look (ui-style.md). The plain address is the game: the title, one tap, then
 * this. Every match is a `DuelSession` the page's `PageMatch` runs (`use`); the menu only chooses which, and sets
 * the sky and the pause through its hooks. A choice whose game is not built yet stands in its place, dimmed, with a
 * line saying what is coming (menu.md, "What is not here yet").
 */
import type { AudioEngine } from '@futuremagic/audio/web';
import { DuelSession, type DuelHub } from '../net/duel';
import { MOST_PLAYERS, roomTerms, type RoomTerms } from '../net/wire';
import { SKILLS, type Offered } from '../sim/rules/captain';
import { MEETINGS, WIND_CHOICE_NAMES, type Meeting, type WindChoice } from '../sim/start';
import { HOURS_PER_DAY, MINUTES_PER_HOUR, SECONDS_PER_MINUTE } from '../sim/units';
import { beginOnTap, handOver, titleTheme } from '../title/title';
import { make } from './dom';
import { makeButton } from './button';
import { hubProblem, openHub } from './hub';
import type { PageMatch } from './pageMatch';
import type { Params } from './params';
import { CODE_LENGTH, shareRow, waitingRooms } from './roomPanel';
import { openSheet, rose, type Sheet } from './sheet';
import type { SettingsMenu } from './settingsPanel';
import { choiceRow, row } from './settingsPanel';
import type { SettingsStore } from './settingsStore';
import { endCard, Tally, type Ending } from './tally';
import type { LostHow } from '../sim/end';
import { FIRST_HOUR, FIRST_MATCH } from './lessons';
import {
  HOUR_AT, HOURS, hourOf, LENGTHS, MATCH_DAY_MINUTES, matchMinutes, NAVIES, newSeed, NO_LIMIT, otherNavy, readSeed, readTerms, startTerms,
  type HourChoice, type MatchTerms, type Navy,
} from './terms';
import { openWhatsNew, unseenVersion, versionLabel } from './whatsNew';
import { openControls, showControlsOnce } from './controlsCard';
import { words, type WordKey } from './words';
import { LANGUAGES } from './settings';
import { oneOf } from './kept';
import type { Offline } from '../offline/register';

/** How a captain is named to the other player. */
const CAPTAIN = 'Captain';
/** The sea behind the main screen: always the same quiet morning, her alone, hove to (menu.md). */
const QUIET_SEED = 1805;
/** The hour of that quiet morning, as the sky's clock reads. */
const QUIET_HOUR = 8;
/** The quiet sea runs on as long as the menu is open: a day's minutes, never reached. */
const QUIET_MINUTES = HOURS_PER_DAY * MINUTES_PER_HOUR;
/** After the fight ends, the quiet moment on deck before the end card, ms (menu.md: after N6.7's moment). */
const END_QUIET_MS = 8000;
/** Leaving a duel of two: the strike sent, then the room left this long after, ms (the orders on their way first). */
const STRIKE_LEAVE_MS = 1000;
/** Digits of seconds on the end card's clock. */
const CLOCK_DIGITS = 2;
/** The longest seed typed: ten digits (2³²−1). */
const SEED_DIGITS = 10;

type Say = Readonly<Record<WordKey, string>>;

const SKILL_WORDS: Readonly<Record<Offered, WordKey>> = { green: 'skillGreen', seasoned: 'skillSeasoned', master: 'skillMaster' };
const NAVY_WORDS: Readonly<Record<Navy, WordKey>> = { british: 'british', french: 'french' };
const WIND_WORDS: Readonly<Record<WindChoice, WordKey>> = { drawn: 'asItComes', light: 'windLight', fresh: 'windFresh', strong: 'windStrong' };
const HOUR_WORDS: Readonly<Record<HourChoice, WordKey>> = { drawn: 'asItComes', dawn: 'dawn', day: 'day', dusk: 'dusk', moon: 'moonlight' };
const MEET_WORDS: Readonly<Record<Meeting, WordKey>> = { even: 'meetEven', weather: 'meetWeather', lee: 'meetLee' };
const ENDING_WORDS: Readonly<Record<'she' | 'me', Readonly<Record<LostHow, WordKey>>>> = {
  she: { struck: 'sheStruck', sunk: 'sheSank', burnt: 'sheBurnt', 'blew up': 'sheBlewUp', 'broke off': 'sheBrokeOff' },
  me: { struck: 'youStruck', sunk: 'youSank', burnt: 'youBurnt', 'blew up': 'youBlewUp', 'broke off': 'youBrokeOff' },
};

/** What the page lends the menu. */
export interface MenuHooks {
  readonly params: Params;
  /** This build's version (a room is joined only by its own build). */
  readonly build: string;
  readonly settings: SettingsStore;
  readonly settingsMenu: SettingsMenu;
  /** The page's match: the session it runs now, and the one to run instead. */
  readonly match: PageMatch;
  /** The clock every session runs by: the match's, which the pause stops. */
  readonly now: () => number;
  /** The page's sound (the theme under the menu). */
  readonly engine: AudioEngine;
  /** The game kept for use without a network: a newer version waiting is offered on the main screen. */
  readonly offline: Offline;
  /** The sky set: the hour it stands at, and real minutes a whole day takes. */
  sky(hour: number, dayMinutes: number): void;
  /** The match's clock stopped (the pause, alone) or running on. */
  pause(on: boolean): void;
  /** The first lieutenant's lessons (plan N7.4) begin in this session, or end (null: any other match). */
  firstCommand(session: DuelSession | null): void;
}

/** What is played now. */
type Playing =
  | { readonly kind: 'quiet' }
  | { readonly kind: 'walk' }
  | { readonly kind: 'first' }
  | { readonly kind: 'alone'; readonly terms: MatchTerms; readonly seed: number }
  | { readonly kind: 'duel'; readonly session: DuelSession };

export class Menu {
  private readonly screen = make('div', 'nt-menu');
  private sheet: Sheet | null = null;
  private playing: Playing = { kind: 'quiet' };
  private readonly tally = new Tally();
  private seeds = 0;
  private endTimer = 0;
  /** The room being entered (opened or joined) and not yet left. */
  private pendingRoom: DuelSession | null = null;
  private themeOn = true;
  /** Draws the screen shown now again (a change of language). */
  private redraw: () => void = () => {};

  constructor(private readonly h: MenuHooks) {
    h.match.on('events', (events) => {
      this.tally.count(events);
      if (events.some((e) => e.kind === 'end')) this.fightOver();
    });
    h.settings.watch((now, before) => { if (before && before.language !== now.language) this.redraw(); });
    // The main screen is the one place a newer version is offered: it shows the offer once the worker has finished installing.
    h.offline.whenChanged(() => { if (!this.screen.hidden) this.redraw(); });
    document.body.append(this.screen);
    this.screen.hidden = true;
    document.body.classList.add('in-menu');
    this.quiet();
  }

  /** The game is ready behind the title: one tap, then the main screen (or, from a room's link, that room). */
  ready(): void {
    beginOnTap(() => {
      handOver(false, true);
      const join = this.h.params.join;
      if (join) void this.joinRoom(join);
      else this.main();
    });
  }

  private get wordsNow(): Say {
    return words(this.h.settings.now.language);
  }

  private get terms(): MatchTerms {
    return this.h.settings.now.match;
  }

  private setTerms(to: Partial<MatchTerms>): void {
    this.h.settings.change({ match: readTerms({ ...this.terms, ...to }) });
  }

  // ---- what runs behind ----

  /**
   * Runs `s` from now on: the session before closed if it was a room's, the end card's count started afresh. `firstNavy`:
   * the first ship's navy (mine alone or hosting; the host's when I joined).
   */
  private run(s: DuelSession, playing: Playing, firstNavy: Navy = this.terms.navy): void {
    const before = this.h.match.session;
    if (before !== s && before.role !== 'solo') before.close();
    clearTimeout(this.endTimer);
    this.h.pause(false);
    this.tally.reset();
    this.playing = playing;
    this.h.match.useSession(s, firstNavy);
    this.h.firstCommand(playing.kind === 'first' ? s : null);
  }

  /** Her alone at sea on a quiet morning, hove to: the sea behind the main screen. */
  private quiet(): void {
    const s = new DuelSession({ build: this.h.build, now: this.h.now, seed: QUIET_SEED, alone: true, terms: { wind: 'light' }, minutes: QUIET_MINUTES });
    s.give({ kind: 'heave', ship: 0 });
    this.run(s, { kind: 'quiet' });
    this.h.sky(QUIET_HOUR, MATCH_DAY_MINUTES);
  }

  private theme(on: boolean): void {
    if (on !== this.themeOn) titleTheme(this.h.engine, on);
    this.themeOn = on;
  }

  // ---- the screens ----

  private closeSheet(): void {
    const s = this.sheet;
    this.sheet = null;
    s?.shut();
  }

  /** Opens a sheet of the menu's (one at a time); `back` runs when it is closed by its ✕, a tap beside it or Escape. */
  private open(kind: string, title: string, back: () => void): Sheet {
    this.closeSheet();
    const sheet = openSheet(`menu-sheet ${kind}`, title, this.wordsNow.close, () => { if (this.sheet === sheet) { this.sheet = null; back(); } });
    this.sheet = sheet;
    return sheet;
  }

  /** The main screen over the live view: the name, the four choices, and in the corners the version and the language. */
  private main(): void {
    this.closeSheet();
    if (this.playing.kind !== 'quiet') this.quiet();
    this.theme(true);
    this.h.settingsMenu.rose = null;
    document.body.classList.add('in-menu');
    this.screen.hidden = false;
    const drawScreen = () => {
      const say = this.wordsNow;
      const plate = make('div', 'title-plate menu-plate');
      plate.append(rose(), make('h1', '', 'NAUTA'));
      const choices = make('nav', 'menu-choices');
      const choice = (name: WordKey, help: WordKey, go: () => void, first = false) => {
        const b = menuButton(first ? 'menu-choice first' : 'menu-choice', say[name], go);
        b.append(make('small', '', say[help]));
        choices.append(b);
      };
      choice('firstCommand', 'firstCommandHelp', () => this.first());
      choice('fightAlone', 'fightAloneHelp', () => this.setup('alone'), true);
      choice('hostDuel', 'hostDuelHelp', () => this.setup('host'));
      choice('joinDuel', 'joinDuelHelp', () => this.joinScreen());
      choice('walkShip', 'walkShipHelp', () => this.sail('walk'));
      const news = menuButton(unseenVersion() ? 'nt-link fresh' : 'nt-link', `Nauta ${versionLabel} · ${say.whatsNew}`, () => openWhatsNew(say, () => news.classList.remove('fresh')));
      // A newer version of the game is installed and waits: one tap restarts on it (offline/register.ts), never in the middle of a match.
      const update = this.h.offline.updateReady ? menuButton('nt-link fresh', say.updateReady, () => this.h.offline.restart()) : null;
      const lang = make('div', 'nt-choice menu-language');
      for (const l of LANGUAGES) {
        const b = menuButton(l === this.h.settings.now.language ? 'on' : '', say[l === 'en' ? 'english' : 'german'], () => this.h.settings.change({ language: l }));
        lang.append(b);
      }
      const foot = make('footer', 'menu-foot');
      foot.append(news, ...(update ? [update] : []), lang);
      this.screen.replaceChildren(plate, choices, foot);
    };
    this.redraw = drawScreen;
    drawScreen();
  }

  /** The match setup (alone or hosting): every line with its default, one tap on the button at its foot starts. */
  private setup(kind: 'alone' | 'host'): void {
    this.screen.hidden = true;
    const drawScreen = () => {
      const say = this.wordsNow, t = this.terms;
      const sheet = this.open('menu-setup', say.theMatch, () => this.main());
      const pick = <T extends string | number>(name: WordKey, help: WordKey | null, of: readonly T[], label: (v: T) => string, now: T, set: (v: T) => void) =>
        choiceRow(say[name], help ? say[help] : null, of.map(label), of.indexOf(now), (i) => set(of[i]!));
      const navy = pick('yourNavy', 'navyHelp', NAVIES, (n) => say[NAVY_WORDS[n]], t.navy, (navy) => this.setTerms({ navy }));
      const seed = make('input', 'menu-seed');
      seed.inputMode = 'numeric';
      seed.maxLength = SEED_DIGITS;
      seed.placeholder = say.newEach;
      seed.value = t.seed === null ? '' : String(t.seed);
      seed.addEventListener('change', () => { this.setTerms({ seed: readSeed(seed.value) }); seed.value = this.terms.seed === null ? '' : String(this.terms.seed); });
      sheet.body.append(
        navy,
        ...(kind === 'alone' ? [pick('otherCaptain', null, SKILLS, (s) => say[SKILL_WORDS[s]], t.foe, (foe) => this.setTerms({ foe }))] : []),
        pick('wind', 'windHelp', WIND_CHOICE_NAMES, (w) => say[WIND_WORDS[w]], t.wind, (wind) => this.setTerms({ wind })),
        pick('hour', 'hourHelp', HOURS, (h) => say[HOUR_WORDS[h]], t.hour, (hour) => this.setTerms({ hour })),
        pick('meet', 'meetHelp', MEETINGS, (m) => say[MEET_WORDS[m]], t.meet, (meet) => this.setTerms({ meet })),
        pick('matchLength', 'matchLengthHelp', LENGTHS, (m) => lengthWords(m, say), t.minutes, (minutes) => this.setTerms({ minutes })),
        row(say.seed, say.seedHelp, seed),
      );
      const go = menuButton('nt-button menu-go', kind === 'alone' ? say.beatToQuarters : say.openTheRoom, () => { this.setTerms({ seed: readSeed(seed.value) }); if (kind === 'alone') this.sail('alone'); else void this.host(); });
      const back = menuButton('nt-link', say.back, () => this.main());
      const foot = make('div', 'menu-sheet-foot');
      foot.append(back, go);
      sheet.body.append(foot);
    };
    this.redraw = drawScreen;
    drawScreen();
  }

  /** Into the match: the menu off the view, the rose opens the captain's pause. */
  private aboard(): void {
    this.closeSheet();
    this.screen.hidden = true;
    document.body.classList.remove('in-menu');
    this.theme(false);
    this.h.settingsMenu.rose = () => this.pauseScreen();
    this.redraw = () => {};
    // How to play, once on a device, at the start of its first match (the guided first match teaches it its own way);
    // played alone, the match waits while it is read.
    const p = this.playing.kind, alone = p !== 'duel';
    if ((p === 'alone' || p === 'walk' || p === 'duel') && showControlsOnce(this.h.settings, () => { if (alone) this.h.pause(false); }) && alone) this.h.pause(true);
  }

  /**
   * A match played alone from the terms (the seed typed, or a new one; `fresh`: a new one all the same): against a computer captain, or (`walk`) her
   * alone at sea with the terms' wind and hour, no enemy and no limit.
   */
  private sail(kind: 'alone' | 'walk', fresh = false): void {
    const t = this.terms, seed = (fresh ? null : t.seed) ?? newSeed(Date.now(), this.seeds++);
    const s = kind === 'alone'
      ? new DuelSession({ build: this.h.build, now: this.h.now, seed, terms: startTerms(t), foe: t.foe, minutes: matchMinutes(t) })
      : new DuelSession({ build: this.h.build, now: this.h.now, seed, alone: true, terms: startTerms(t), minutes: QUIET_MINUTES });
    this.run(s, kind === 'alone' ? { kind, terms: t, seed } : { kind });
    this.h.sky(hourOf(t.hour, seed), MATCH_DAY_MINUTES);
    this.aboard();
  }

  /** Your first command (plan N7.4): always the same match, the first lieutenant leading, a green captain waiting hove to. */
  private first(): void {
    const s = new DuelSession({ ...FIRST_MATCH, build: this.h.build, now: this.h.now });
    this.run(s, { kind: 'first' });
    this.h.sky(FIRST_HOUR, MATCH_DAY_MINUTES);
    this.aboard();
  }

  // ---- two captains ----

  /** Hosts a room with the terms: its match runs from the moment it is open (both tapping Ready is still to come). */
  private async host(): Promise<void> {
    const t = this.terms, hour = hourOf(t.hour, newSeed(Date.now(), this.seeds++));
    const shown: RoomTerms = { wind: t.wind, hour, meet: t.meet, minutes: t.minutes, navy: t.navy };
    const s = new DuelSession({ hub: this.connect(), build: this.h.build, now: this.h.now, terms: startTerms(t), minutes: matchMinutes(t) });
    await this.enterRoom(s, '', () => s.create(CAPTAIN, shown));
  }

  /** Joins the room `code`: its waiting room, then her deck once both captains are aboard. */
  private async joinRoom(code: string): Promise<void> {
    const s = new DuelSession({ hub: this.connect(), build: this.h.build, now: this.h.now });
    await this.enterRoom(s, code, () => s.join(code));
  }

  /**
   * Into a room by `how` (open or join), its waiting room shown at once: once in, the page runs its match under the
   * host's sky; refused or unreachable, the waiting room says why. Left before it answered, nothing more happens.
   */
  private async enterRoom(s: DuelSession, code: string, how: () => Promise<unknown>): Promise<void> {
    this.pendingRoom = s;
    this.waitingRoom(s, null, code);
    try {
      await how();
      if (s.role === 'refused') throw new Error(s.problem);
      if (this.pendingRoom !== s) { s.close(); return; }
      const terms = s.roomTerms;
      this.run(s, { kind: 'duel', session: s }, terms ? oneOf(terms.navy, NAVIES, this.terms.navy) : this.terms.navy);
      this.watchRounds(s);
      if (terms) this.h.sky(terms.hour, MATCH_DAY_MINUTES);
      this.waitingRoom(s, null, code);
    } catch (err) {
      s.close();
      if (this.pendingRoom === s) this.waitingRoom(s, hubProblem(err), code);
    }
  }

  /** Each new round of the room's match (both captains ready, menu.md): its count afresh, and onto her deck. */
  private watchRounds(s: DuelSession): void {
    let round = s.round;
    const off = s.on('change', () => {
      if (this.playing.kind !== 'duel' || this.playing.session !== s) { off(); return; }
      if (s.round === round) return;
      round = s.round;
      clearTimeout(this.endTimer);
      this.tally.reset();
      this.aboard();
    });
  }

  private connect(): DuelHub {
    return openHub(this.h.params, CAPTAIN);
  }


  /** Joining: a code to type, and the rooms waiting with what their hosts chose. */
  private joinScreen(): void {
    this.screen.hidden = true;
    let leaveLobby: (() => void) | null = null;
    const drawScreen = () => {
      leaveLobby?.();
      const say = this.wordsNow;
      const sheet = this.open('menu-join', say.joinDuel, () => { leaveLobby?.(); this.main(); });
      const code = make('input', 'room-code');
      code.placeholder = say.code;
      code.maxLength = CODE_LENGTH;
      code.autocapitalize = 'characters';
      const join = menuButton('nt-button', say.join, () => { leaveLobby?.(); void this.joinRoom(code.value); });
      const byCode = make('div', 'room-row');
      byCode.append(code, join);
      const lobby = this.connect();
      const rooms = waitingRooms(lobby, this.h.build, say, (c) => { leaveLobby?.(); void this.joinRoom(c); }, (r) => termsLine(roomTerms(r.meta), say));
      leaveLobby = () => { rooms.stop(); lobby.close(); leaveLobby = null; };
      const unreachable = make('p', 'room-say room-problem');
      lobby.ready.catch((err: unknown) => { unreachable.textContent = hubProblem(err); });
      sheet.body.append(make('div', 'nt-section', say.roomCode), byCode, make('div', 'nt-section', say.roomsWaiting), rooms.el, unreachable);
    };
    this.redraw = drawScreen;
    drawScreen();
  }

  /** The waiting room: the code large, the link to share, the terms, the captains; it gives way to the deck once both are aboard. */
  private waitingRoom(s: DuelSession, problem: string | null, joining = ''): void {
    this.screen.hidden = true;
    let off: (() => void) | null = null;
    const leave = () => { off?.(); this.pendingRoom = null; s.close(); this.main(); };
    const drawScreen = () => {
      off?.();
      const say = this.wordsNow, code = s.code || joining;
      const sheet = this.open('menu-room', s.role === 'host' || (!joining && s.role === 'joining') ? say.waitingRoom : say.roomJoined, leave);
      const captains = make('p', 'room-say');
      const ready = menuButton('nt-button menu-go', say.ready, () => { s.ready(); look(); });
      const out = menuButton('nt-link', say.leaveTheRoom, leave);
      const terms = s.roomTerms;
      const mine = terms ? (s.role === 'host' ? terms.navy : otherNavy(terms.navy as Navy)) : null;
      sheet.body.append(make('p', 'room-big', code || '…'));
      if (problem) sheet.body.append(make('p', 'room-say room-problem', problem));
      if (s.code) sheet.body.append(shareRow(s.code, say), make('p', 'room-say', say.shareHelp));
      if (terms) sheet.body.append(make('div', 'nt-section', s.role === 'host' ? say.theMatch : say.asChosen), make('p', '', termsLine(terms, say)), ...(mine ? [make('p', 'room-say', `${say.yourNavy}: ${say[NAVY_WORDS[mine as Navy] ?? 'british']}`)] : []));
      const row = make('div', 'room-row');
      row.append(ready, make('small', 'room-say', say.readyHelp));
      sheet.body.append(captains, row, out);
      const look = () => {
        if (this.sheet !== sheet) { off?.(); return; }
        const seated = s.shipCaptains.filter((c) => c !== null).length;
        const iAm = s.readyPlayers.includes(s.me), sheIs = s.readyPlayers.some((p) => p !== s.me);
        captains.textContent = seated < MOST_PLAYERS ? `${seated}/${MOST_PLAYERS} ${say.captainsOf}` : sheIs ? say.herReady : say.otherAboard;
        ready.disabled = iAm || s.role === 'refused' || !s.started;
        ready.textContent = iAm ? say.readyWaiting : say.ready;
        ready.classList.toggle('on', iAm);
      };
      off = s.on('change', look);
      look();
    };
    this.redraw = drawScreen;
    drawScreen();
  }

  // ---- in the match ----

  /** The captain's pause: resume, the settings, leave (asked twice). Alone the fight stands still while it is open. */
  private pauseScreen(): void {
    const p = this.playing, alone = p.kind !== 'duel';
    if (alone) this.h.pause(true);
    const drawScreen = () => {
      const say = this.wordsNow;
      const sheet = this.open('menu-pause', say.pauseTitle, () => { this.h.pause(false); this.redraw = () => {}; });
      const resume = menuButton('nt-button menu-go', say.resume, () => { this.closeSheet(); this.h.pause(false); this.redraw = () => {}; });
      const settings = menuButton('nt-button', say.settings, () => this.h.settingsMenu.open());
      const controls = menuButton('nt-button', say.controlsShow, () => openControls(this.h.settings));
      let asked = p.kind === 'walk';
      const leave = menuButton('nt-button', p.kind === 'walk' ? say.leaveWalk : say.leaveMatch, () => {
        if (!asked) { asked = true; leave.textContent = say.leaveSure; leave.classList.add('on'); return; }
        this.leaveMatch();
      });
      sheet.body.append(make('p', 'room-say', alone ? say.standsStill : say.goesOn), resume, settings, controls, leave);
    };
    this.redraw = drawScreen;
    drawScreen();
  }

  /** Leaves the match for the main screen; a duel of two still going strikes her colours first (menu.md). */
  private leaveMatch(): void {
    const p = this.playing;
    if (p.kind === 'duel' && !this.h.match.state.fight.end) {
      // Asked twice by the order itself: given twice at once, she strikes in that step.
      const ship = this.h.match.ship;
      p.session.give({ kind: 'strike', ship });
      p.session.give({ kind: 'strike', ship });
      setTimeout(() => p.session.close(), STRIKE_LEAVE_MS);
      this.playing = { kind: 'quiet' };
    }
    this.main();
  }

  /** The fight is over: after the quiet moment on deck, the end card. */
  private fightOver(): void {
    const p = this.playing;
    // A room's match before both captains were ready (round 0) is not theirs to end.
    if (p.kind === 'quiet' || p.kind === 'walk' || (p.kind === 'duel' && p.session.round === 0)) return;
    clearTimeout(this.endTimer);
    this.endTimer = window.setTimeout(() => this.endScreen(), END_QUIET_MS);
  }

  /** The end card: how it ended, how long it lasted, a few numbers for each ship; again, or back. */
  private endScreen(): void {
    const p = this.playing, found = endCard(this.h.match.state, this.h.match.ship, this.tally);
    if (!found || p.kind === 'quiet' || p.kind === 'walk') return;
    const card = found;
    const drawScreen = () => {
      const say = this.wordsNow;
      const sheet = this.open('menu-end', say[resultWord(card.ending)], () => { this.redraw = () => {}; });
      const table = make('table', 'menu-numbers');
      const head = make('tr', '');
      head.append(make('th', '', ''), make('th', '', say.yours), ...(card.ships.length > 1 ? [make('th', '', say.hers)] : []));
      table.append(head);
      const line = (name: WordKey, of: (n: (typeof card.ships)[number]) => number) => {
        const tr = make('tr', '');
        tr.append(make('td', '', say[name]), ...card.ships.map((n) => make('td', 'nt-value', String(of(n)))));
        table.append(tr);
      };
      line('gunsFired', (n) => n.fired);
      line('shotStruck', (n) => n.struck);
      line('menLost', (n) => n.men);
      line('sparsDown', (n) => n.spars);
      const her = make('p', 'room-say');
      const again = menuButton('nt-button menu-go', say.again, () => {
        if (p.kind === 'alone') this.sail('alone', true);
        else if (p.kind === 'first') this.first();
        else if (p.kind === 'duel') { p.session.ready(); look(); }
      });
      const look = () => {
        if (p.kind !== 'duel') return;
        const s = p.session, iAm = s.readyPlayers.includes(s.me), gone = s.shipCaptains.some((c) => c === null);
        her.textContent = gone ? say.herGone : s.readyPlayers.some((r) => r !== s.me) ? say.herAgain : say.againTwoHelp;
        again.disabled = iAm || gone;
        again.textContent = iAm ? say.againWaiting : say.again;
      };
      if (p.kind === 'duel') {
        const off = p.session.on('change', () => { if (this.sheet === sheet) look(); else off(); });
        look();
      }
      const back = menuButton('nt-button', say.back, () => this.main());
      const foot = make('div', 'menu-sheet-foot');
      foot.append(back, again);
      sheet.body.append(
        make('p', 'menu-ending', endingWords(card.ending, say)),
        make('p', 'room-say', `${say.foughtFor} ${minutesAndSeconds(card.seconds)}${p.kind === 'alone' ? ` · ${say.seed} ${p.seed}` : ''}`),
        table,
        ...(p.kind === 'duel' ? [her] : []),
        foot,
      );
    };
    this.redraw = drawScreen;
    drawScreen();
  }
}

/** A length on a button: minutes, or no limit. */
const lengthWords = (m: number, say: Say): string => (m === NO_LIMIT ? say.noLimit : `${m} ${say.minutes}`);

/** The host's choices in one line: wind · hour · how they meet · length. */
function termsLine(t: RoomTerms | null, say: Say): string {
  if (!t) return '';
  const named = (Object.keys(HOUR_AT) as Exclude<HourChoice, 'drawn'>[]).find((h) => HOUR_AT[h] === t.hour);
  const hour = named ? say[HOUR_WORDS[named]] : `${Math.floor(t.hour)}:${String(Math.round((t.hour % 1) * MINUTES_PER_HOUR)).padStart(CLOCK_DIGITS, '0')}`;
  return [say[WIND_WORDS[t.wind as WindChoice] ?? 'asItComes'], hour, say[MEET_WORDS[t.meet as Meeting] ?? 'meetEven'], lengthWords(t.minutes, say)].join(' · ');
}

/** The end card's title: victory, defeat or drawn. */
function resultWord(e: Ending): WordKey {
  return e.who === 'she' ? 'victory' : e.who === 'me' ? 'defeat' : 'drawn';
}

/** How it ended, in words. */
function endingWords(e: Ending, say: Say): string {
  if (e.who === 'none') return e.apart ? say.sailedApart : say.parted;
  return say[ENDING_WORDS[e.who][e.how] ?? 'parted'];
}

/** Seconds as `m:ss`. */
function minutesAndSeconds(seconds: number): string {
  const m = Math.floor(seconds / SECONDS_PER_MINUTE), s = Math.floor(seconds % SECONDS_PER_MINUTE);
  return `${m}:${String(s).padStart(CLOCK_DIGITS, '0')}`;
}

/** A button of the menu's: its class, its words, and what a tap does. */
function menuButton(className: string, label: string, pressed: () => void = () => {}): HTMLButtonElement {
  const b = makeButton(label, pressed);
  b.className = className;
  return b;
}
