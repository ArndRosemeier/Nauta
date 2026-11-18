/**
 * Two captains in one room, on the page (implementation plan N3.7): a button in the top corner, and on a tap a panel
 * to open a room, join one that is waiting (GameHub's lobby, a finger's tap on the tablet) or one by its code, and in
 * a room its code and the link that brings the other device in. `?room` opens a room at once, `?join=K7Q2ZP` joins one.
 * The match itself is src/net/duel.ts; this file only connects and chooses.
 */
import type { RoomSummary } from '../../vendor/gamehub/gamehub';
import { DuelSession, type DuelHub } from '../net/duel';
import { MOST_PLAYERS, roomRefusal } from '../net/wire';
import { make } from './dom';
import { openSheet } from './sheet';
import type { WordKey } from './words';
import { hubProblem, openHub } from './hub';
import { joinLink, type Params } from './params';

/** How the captain is named to the other player. */
const CAPTAIN = 'Captain';
/** Letters in a room's code (GameHub's). */
export const CODE_LENGTH = 6;
/** How long "Copied" stays on the button, ms. */
const COPIED_MS = 2000;

export class RoomPanel {
  private hub: DuelHub | null = null;
  private pendingSession: DuelSession | null = null;
  private readonly button = make('button', 'nt-pill', '');
  private open: (() => void) | null = null;
  private close: (() => void) | null = null;
  /** What went wrong last, shown in the panel. */
  private problem = '';

  /**
   * `current`: the session the page runs now; `chosen`: a new one to run instead (a room's, or alone again). `say`: the
   * interface's words now; `minutes`: the player's match length, for a match this machine starts.
   */
  constructor(
    private readonly params: Params, private readonly build: string, private readonly now: () => number,
    private readonly current: () => DuelSession, private readonly chosen: (s: DuelSession) => void,
    private readonly say: () => Readonly<Record<WordKey, string>>, private readonly minutes: () => number,
  ) {
    this.button.id = 'room';
    this.button.type = 'button';
    this.button.addEventListener('click', () => this.openRooms());
    document.body.append(this.button);
    this.refresh();
    if (params.join) void this.enter((s) => s.join(params.join!));
    else if (params.room) void this.enter((s) => s.create(CAPTAIN));
  }

  /** The corner button's words for the session now; call it when the session changes. */
  refresh(): void {
    const s = this.current();
    const captains = s.shipCaptains.filter((c) => c !== null).length;
    const say = this.say();
    this.button.textContent = s.role === 'solo' ? say.twoPlayers : `${say.room} ${s.code || '…'} · ${captains}/${MOST_PLAYERS} ${say.captainsOf}`;
    this.open?.();
  }

  /** A session through the hub, connected, then into a room by `how`; the page runs it once it is in. */
  private async enter(how: (s: DuelSession) => Promise<RoomSummary>): Promise<void> {
    const s = this.session();
    try {
      await this.hub!.ready;
      await how(s);
      if (s.role === 'refused') throw new Error(s.problem);
      this.pendingSession = null;
      this.problem = '';
      this.chosen(s);
    } catch (err) {
      // A fresh connection for the next try: this one's session may have left a room of another build.
      s.close();
      this.hub = null;
      this.pendingSession = null;
      this.problem = hubProblem(err);
      if (this.open) this.open(); else this.openRooms();
    }
  }

  private session(): DuelSession {
    if (!this.hub) this.hub = openHub(this.params, CAPTAIN);
    this.pendingSession ??= new DuelSession({ hub: this.hub, build: this.build, now: this.now, minutes: this.minutes() });
    return this.pendingSession;
  }

  /** The panel over the view until it is closed. */
  private openRooms(): void {
    this.close?.();
    const say = this.say();
    const sheet = openSheet('rooms', say.twoCaptains, say.close, () => { stopLobby?.(); this.open = null; this.close = null; });
    const body = sheet.body;
    let stopLobby: (() => void) | null = null;
    const shut = () => sheet.shut();
    this.close = shut;
    const fillRooms = () => {
      body.replaceChildren();
      const s = this.current();
      if (s.role !== 'solo') { this.inRoom(body, s, shut); return; }
      const told = make('p', 'room-say', this.problem);
      const openRoom = make('button', 'nt-button room-wide', say.openRoom);
      openRoom.addEventListener('click', () => { told.textContent = say.opening; void this.enter((x) => x.create(CAPTAIN)); });
      const code = make('input', 'room-code');
      code.placeholder = say.code;
      code.maxLength = CODE_LENGTH;
      code.autocapitalize = 'characters';
      const join = make('button', 'nt-button', say.join);
      join.addEventListener('click', () => { told.textContent = say.joining; void this.enter((x) => x.join(code.value)); });
      const byCode = make('div', 'room-row');
      byCode.append(code, join);
      this.session();
      stopLobby?.();
      const waiting = waitingRooms(this.hub!, this.build, say, (code) => { told.textContent = say.joining; void this.enter((x) => x.join(code)); });
      stopLobby = waiting.stop;
      body.append(openRoom, make('div', 'nt-section', say.roomsWaiting), waiting.el, make('div', 'nt-section', say.joinByCode), byCode, told);
    };
    this.open = fillRooms;
    fillRooms();
  }

  /** In a room: its code, the link for the other device, how it stands, and the way out. */
  private inRoom(body: HTMLElement, s: DuelSession, shut: () => void): void {
    const say = this.say();
    const leave = make('button', 'nt-button room-wide', say.leaveRoom);
    leave.addEventListener('click', () => {
      s.close();
      this.hub = null;
      this.pendingSession = null;
      this.chosen(new DuelSession({ build: this.build, now: this.now, seed: this.params.seed ?? undefined, windForce: this.params.windAsked ? this.params.wind : undefined, minutes: this.minutes() }));
      shut();
    });
    body.append(make('p', 'room-big', s.code), make('p', '', say.otherDevice), shareRow(s.code, say), make('p', 'room-say', s.line()), leave);
  }
}

type Say = Readonly<Record<WordKey, string>>;

/**
 * The rooms waiting for a captain (GameHub's lobby), as buttons kept up to date, each joining its room by `pick`;
 * rooms of another build or full are left out. `aboutRoom` adds a line on a room (the menu shows the host's choices).
 */
export function waitingRooms(hub: DuelHub, build: string, say: Say, pick: (code: string) => void, aboutRoom: (r: RoomSummary) => string = () => ''): { el: HTMLElement; stop: () => void } {
  const el = make('div', 'room-list');
  const stop = hub.watchLobby((rooms) => {
    el.replaceChildren();
    const open = rooms.filter((r) => !roomRefusal(r.meta, build) && r.players < r.maxPlayers);
    if (!open.length) el.append(make('p', 'room-say', say.noneWaiting));
    for (const r of open) {
      const b = make('button', 'nt-button room-wide', `${say.join} ${r.name} · ${r.id}`);
      const line = aboutRoom(r);
      if (line) b.append(make('span', 'room-about', line));
      b.addEventListener('click', () => pick(r.id));
      el.append(b);
    }
  });
  return { el, stop };
}

/** The link that brings another device into the room `code`, with a button that copies it (or shares it, where the device can). */
export function shareRow(code: string, say: Say): HTMLElement {
  const link = joinLink(location.href, code);
  const copy = make('button', 'nt-button', say.copyLink);
  copy.addEventListener('click', () => {
    void navigator.clipboard?.writeText(link).then(() => { copy.textContent = say.copied; setTimeout(() => { copy.textContent = say.copyLink; }, COPIED_MS); });
  });
  const row = make('div', 'room-row');
  row.append(make('span', 'room-link', link), copy);
  return row;
}
