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
import { hubKey, openHub } from './hub';
import { joinLink, type Params } from './params';

/** How the captain is named to the other player. */
const CAPTAIN = 'Captain';
/** Letters in a room's code (GameHub's). */
const CODE_LENGTH = 6;
/** How long "Copied" stays on the button, ms. */
const COPIED_MS = 2000;

export class RoomPanel {
  private hub: DuelHub | null = null;
  private pendingSession: DuelSession | null = null;
  private readonly button = make('button', '', 'Two players');
  private open: (() => void) | null = null;
  /** What went wrong last, shown in the panel. */
  private problem = '';

  /** `current`: the session the page runs now; `chosen`: a new one to run instead (a room's, or alone again). */
  constructor(
    private readonly params: Params, private readonly build: string, private readonly now: () => number,
    private readonly current: () => DuelSession, private readonly chosen: (s: DuelSession) => void,
  ) {
    this.button.id = 'room';
    this.button.type = 'button';
    this.button.addEventListener('click', () => this.openRooms());
    document.body.append(this.button);
    if (params.join) void this.enter((s) => s.join(params.join!));
    else if (params.room) void this.enter((s) => s.create(CAPTAIN));
  }

  /** The corner button's words for the session now; call it when the session changes. */
  refresh(): void {
    const s = this.current();
    const captains = s.shipCaptains.filter((c) => c !== null).length;
    this.button.textContent = s.role === 'solo' ? 'Two players' : `Room ${s.code || '…'} · ${captains} of ${MOST_PLAYERS} captains`;
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
      const why = err instanceof Error ? err.message.replace(/^gamehub: /, '') : String(err);
      this.problem = hubKey(this.params) || this.params.hub ? why : `This build has no GameHub key yet (${why}): add ?key=… to the address`;
      if (this.open) this.open(); else this.openRooms();
    }
  }

  private session(): DuelSession {
    if (!this.hub) this.hub = openHub(this.params, CAPTAIN);
    this.pendingSession ??= new DuelSession({ hub: this.hub, build: this.build, now: this.now });
    return this.pendingSession;
  }

  /** The panel over the view until it is closed. */
  private openRooms(): void {
    document.querySelector('.room-backdrop')?.remove();
    const backdrop = make('div', 'whatsnew-backdrop room-backdrop'), panel = make('section', 'whatsnew-panel');
    panel.setAttribute('role', 'dialog');
    const head = make('header', 'whatsnew-head'), close = make('button', 'whatsnew-close', '✕');
    close.setAttribute('aria-label', 'Close');
    head.append(make('h2', '', 'Two captains'), close);
    const body = make('div', 'whatsnew-list room-body');
    panel.append(head, body);
    backdrop.append(panel);
    let stopLobby: (() => void) | null = null;
    const shut = () => { stopLobby?.(); backdrop.remove(); this.open = null; };
    close.addEventListener('click', shut);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) shut(); });
    const fill = () => {
      body.replaceChildren();
      const s = this.current();
      if (s.role !== 'solo') { this.inRoom(body, s, shut); return; }
      const say = make('p', 'room-say', this.problem);
      const openRoom = make('button', 'room-wide', 'Open a room');
      openRoom.addEventListener('click', () => { say.textContent = 'Opening a room…'; void this.enter((x) => x.create(CAPTAIN)); });
      const code = make('input', 'room-code');
      code.placeholder = 'code';
      code.maxLength = CODE_LENGTH;
      code.autocapitalize = 'characters';
      const join = make('button', '', 'Join');
      join.addEventListener('click', () => { say.textContent = 'Joining…'; void this.enter((x) => x.join(code.value)); });
      const byCode = make('div', 'room-row');
      byCode.append(code, join);
      const waiting = make('div', 'room-list');
      body.append(openRoom, make('h3', '', 'Rooms waiting for a captain'), waiting, make('h3', '', 'Or join by its code'), byCode, say);
      this.session();
      stopLobby?.();
      stopLobby = this.hub!.watchLobby((rooms) => {
        waiting.replaceChildren();
        const open = rooms.filter((r) => !roomRefusal(r.meta, this.build) && r.players < r.maxPlayers);
        if (!open.length) waiting.append(make('p', 'room-say', 'None yet: open one here, or on the other device.'));
        for (const r of open) {
          const b = make('button', 'room-wide', `Join ${r.name} · ${r.id}`);
          b.addEventListener('click', () => { say.textContent = 'Joining…'; void this.enter((x) => x.join(r.id)); });
          waiting.append(b);
        }
      });
    };
    this.open = fill;
    fill();
    document.body.append(backdrop);
  }

  /** In a room: its code, the link for the other device, how it stands, and the way out. */
  private inRoom(body: HTMLElement, s: DuelSession, shut: () => void): void {
    const link = joinLink(location.href, s.code);
    const copy = make('button', '', 'Copy link');
    copy.addEventListener('click', () => {
      void navigator.clipboard?.writeText(link).then(() => { copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy link'; }, COPIED_MS); });
    });
    const leave = make('button', 'room-wide', 'Leave the room and sail alone');
    leave.addEventListener('click', () => {
      s.close();
      this.hub = null;
      this.pendingSession = null;
      this.chosen(new DuelSession({ build: this.build, now: this.now, seed: this.params.seed ?? undefined, windForce: this.params.windAsked ? this.params.wind : undefined }));
      shut();
    });
    const row = make('div', 'room-row');
    row.append(make('span', 'room-link', link), copy);
    body.append(make('p', 'room-big', s.code), make('p', '', 'On the other device open this link, or tap the room in its list of rooms waiting:'), row, make('p', 'room-say', s.line()), leave);
  }
}
