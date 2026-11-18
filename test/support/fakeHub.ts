/**
 * A fake GameHub for tests (implementation plan N3.7): the server's rules as its docs give them (gameserver
 * docs/PROTOCOL.md), in memory, with nothing sent until the test says so. Every message is queued per connection in
 * the order the server would send it and goes through JSON on the way, as on the wire; `deliver()` hands them all out
 * (and what they cause in turn). So tests decide when messages arrive and see exactly what a real room would carry.
 *
 * Kept: rooms with six-letter codes, the creator as host, the room's latest snapshot and the deltas after it replayed
 * to a joiner, messages to one player or everyone else, `not_host` for a guest that sends state, a full room refused,
 * and on the host's leaving the player with the lowest id made host. Left out: the lobby, binary frames, rate limits.
 */
import type {
  CreateRoomOptions, GameHub, HubEvents, PlayerInfo, RoomChanges, RoomSummary,
} from '../../vendor/gamehub/gamehub.ts';

type Handler = (...args: unknown[]) => void;

interface Room {
  summary: RoomSummary;
  players: FakeClient[];
  snapshot: { seq: number; data: unknown } | null;
  deltas: { seq: number; data: unknown }[];
  seq: number;
}

/** What the server would send next to one connection: an event and its arguments, made when the message was sent. */
type Pending = () => void;

/** The letters of a room's code (as the server's: no 0/O or 1/I). */
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
/** The server keeps at most this many deltas after a snapshot before it asks the host for a new one. */
const HISTORY = 1000;

export class FakeServer {
  private nextId = 1;
  private readonly rooms = new Map<string, Room>();
  private readonly queue: Pending[] = [];
  /** Messages sent through the server, by kind, for budget checks. */
  readonly sent = { state: 0, delta: 0, msg: 0, stateBytes: 0, deltaBytes: 0, most: 0 };

  /** A new connection, as `connect({ app, name })` would make. */
  connect<S, D, M>(name: string): FakeClient & GameHub<S, D, M> {
    return new FakeClient(this, this.nextId++, name) as FakeClient & GameHub<S, D, M>;
  }

  /** Hands out every queued message, and those they cause, in order. */
  deliver(): void {
    for (let i = 0; i < this.queue.length; i++) this.queue[i]!();
    this.queue.length = 0;
  }

  /** Puts a message for later; the data goes through JSON as on the wire. */
  post(to: FakeClient, event: string, ...args: unknown[]): void {
    const wire = JSON.parse(JSON.stringify(args)) as unknown[];
    this.queue.push(() => to.receive(event, ...wire));
  }

  makeRoom(host: FakeClient, opts: CreateRoomOptions): Room {
    let code = '', n = this.rooms.size + 1;
    for (let i = 0; i < CODE_LENGTH; i++, n = Math.floor(n / CODE_LETTERS.length)) code += CODE_LETTERS[(n + i * (i + 1)) % CODE_LETTERS.length];
    const room: Room = {
      summary: { id: code, name: opts.name ?? 'room', public: opts.public ?? true, players: 0, maxPlayers: opts.maxPlayers ?? HISTORY, meta: opts.meta ?? null, host: host.id, createdAt: 0 },
      players: [], snapshot: null, deltas: [], seq: 0,
    };
    this.rooms.set(code, room);
    return room;
  }

  room(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  enter(room: Room, c: FakeClient): void {
    room.players.push(c);
    room.summary.players = room.players.length;
    for (const p of room.players) if (p !== c) this.post(p, 'player+', { id: c.id, name: c.name });
    const info = { you: c.id, host: room.summary.host, players: room.players.map((p) => ({ id: p.id, name: p.name })) };
    this.post(c, 'joined', { ...room.summary }, info, room.snapshot, room.deltas);
  }

  leave(c: FakeClient): void {
    const room = c.inRoom;
    if (!room) return;
    room.players = room.players.filter((p) => p !== c);
    room.summary.players = room.players.length;
    c.inRoom = null;
    for (const p of room.players) this.post(p, 'player-', c.id);
    if (room.summary.host === c.id && room.players.length) {
      room.summary.host = Math.min(...room.players.map((p) => p.id));
      for (const p of room.players) this.post(p, 'host', room.summary.host);
    }
  }

  publish(c: FakeClient, kind: 'state' | 'delta', data: unknown): void {
    const room = c.inRoom;
    if (!room) return;
    if (room.summary.host !== c.id) { this.post(c, 'error', { code: 'not_host' }); return; }
    const entry = { seq: ++room.seq, data: JSON.parse(JSON.stringify(data)) as unknown };
    const bytes = JSON.stringify(data).length;
    this.sent[kind]++;
    this.sent.most = Math.max(this.sent.most, bytes);
    if (kind === 'state') { this.sent.stateBytes = Math.max(this.sent.stateBytes, bytes); room.snapshot = entry; room.deltas = []; }
    else {
      this.sent.deltaBytes = Math.max(this.sent.deltaBytes, bytes);
      room.deltas.push(entry);
      if (room.deltas.length > HISTORY) { room.deltas = []; room.snapshot = null; this.post(c, 'need-snapshot'); }
    }
    for (const p of room.players) if (p !== c) this.post(p, kind, entry.data, entry.seq);
  }

  message(c: FakeClient, data: unknown, to?: number): void {
    const room = c.inRoom;
    if (!room) return;
    this.sent.msg++;
    for (const p of room.players) if (p !== c && (to === undefined || p.id === to)) this.post(p, 'msg', data, c.id);
  }
}

/** One connection to the fake server, with GameHub's client API. */
export class FakeClient implements GameHub<unknown, unknown, unknown> {
  readonly ready: Promise<{ you: number; name: string }>;
  inRoom: Room | null = null;
  private readonly handlers = new Map<string, Set<Handler>>();
  private host_: number | null = null;
  private players_ = new Map<number, PlayerInfo>();
  private closed = false;

  constructor(private readonly server: FakeServer, readonly id: number, readonly name: string) {
    this.ready = Promise.resolve({ you: id, name });
  }

  get you(): number | null { return this.closed ? null : this.id; }
  get host(): number | null { return this.host_; }
  get isHost(): boolean { return this.host_ === this.id; }
  get room(): RoomSummary | null { return this.inRoom ? { ...this.inRoom.summary } : null; }
  get players(): PlayerInfo[] { return [...this.players_.values()]; }

  on<E extends keyof HubEvents<unknown, unknown, unknown>>(event: E, fn: HubEvents<unknown, unknown, unknown>[E]): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(fn as Handler);
    return () => { this.handlers.get(event)?.delete(fn as Handler); };
  }

  /** A message from the server arrives: the client's bookkeeping, then the game's handlers (as gamehub.ts does). */
  receive(event: string, ...args: unknown[]): void {
    if (this.closed) return;
    if (event === 'joined') {
      const [room, info, snapshot, deltas] = args as [RoomSummary, { host: number; players: PlayerInfo[] }, { seq: number; data: unknown } | null, { seq: number; data: unknown }[]];
      this.host_ = info.host;
      this.players_ = new Map(info.players.map((p) => [p.id, p]));
      this.emit('joined', room, info);
      if (snapshot) this.emit('state', snapshot.data, snapshot.seq);
      for (const d of deltas) this.emit('delta', d.data, d.seq);
      return;
    }
    if (event === 'player+') { const p = args[0] as PlayerInfo; this.players_.set(p.id, p); }
    if (event === 'player-') this.players_.delete(args[0] as number);
    if (event === 'host') this.host_ = args[0] as number;
    this.emit(event, ...args);
  }

  private emit(event: string, ...args: unknown[]): void {
    for (const fn of this.handlers.get(event) ?? []) fn(...args);
  }

  async listRooms(): Promise<RoomSummary[]> { return []; }
  watchLobby(): () => void { return () => {}; }

  async create(opts: CreateRoomOptions = {}): Promise<RoomSummary> {
    const room = this.server.makeRoom(this, opts);
    this.inRoom = room;
    this.server.enter(room, this);
    return { ...room.summary };
  }

  async join(code: string): Promise<RoomSummary> {
    const room = this.server.room(code);
    if (!room) throw Object.assign(new Error('gamehub: no_such_room'), { code: 'no_such_room' });
    if (room.players.length >= room.summary.maxPlayers) throw Object.assign(new Error('gamehub: room_full'), { code: 'room_full' });
    this.inRoom = room;
    this.server.enter(room, this);
    return { ...room.summary };
  }

  async leave(): Promise<unknown> {
    this.server.leave(this);
    this.host_ = null;
    this.players_.clear();
    return {};
  }

  setState(data: unknown): void { this.server.publish(this, 'state', data); }
  sendDelta(data: unknown): void { this.server.publish(this, 'delta', data); }
  send(data: unknown, to?: number): void { this.server.message(this, data, to); }
  sendBinary(): void {}
  setRoom(changes: RoomChanges): void {
    if (this.inRoom && this.isHost) Object.assign(this.inRoom.summary, changes);
  }

  close(): void {
    this.server.leave(this);
    this.closed = true;
  }
}
