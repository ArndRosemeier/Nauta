/**
 * A stand-in for GameHub on this machine, for the network check (tools/net/room.mjs) where the real server cannot be
 * reached (the cloud container, a CI run without the game's key). It speaks the wire protocol of gameserver
 * docs/PROTOCOL.md over a WebSocket of its own (no dependency): hello, lobby, create, join, leave, state, delta, msg;
 * the room's latest snapshot and the deltas after it replayed to a joiner; on the host's leaving the player with the
 * lowest id made host. Any app key is taken. Left out: binary frames, rate limits, access modes, keeping empty rooms.
 *
 *   node tools/net/standin.mjs [port]     (or import { startStandin } and call it)
 */
import http from 'node:http';
import crypto from 'node:crypto';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Frames of one WebSocket: text messages in, text messages out. */
function websocket(socket, onText, onClose) {
  let buf = Buffer.alloc(0), parts = [];
  const send = (op, payload) => {
    const n = payload.length;
    const head = n < 126 ? Buffer.from([0x80 | op, n]) : n < 65536 ? Buffer.from([0x80 | op, 126, n >> 8, n & 255]) : Buffer.concat([Buffer.from([0x80 | op, 127]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b; })()]);
    if (!socket.destroyed) socket.write(Buffer.concat([head, payload]));
  };
  socket.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      if (buf.length < 2) return;
      const op = buf[0] & 15, fin = buf[0] & 128, masked = buf[1] & 128;
      let len = buf[1] & 127, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const mask = masked ? buf.subarray(off, off + 4) : null;
      if (masked) off += 4;
      if (buf.length < off + len) return;
      const payload = Buffer.from(buf.subarray(off, off + len));
      if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      buf = buf.subarray(off + len);
      if (op === 8) { send(8, Buffer.alloc(0)); socket.end(); return; }
      if (op === 9) { send(10, payload); continue; }
      if (op === 1 || op === 2 || op === 0) {
        parts.push(payload);
        if (fin) { const whole = Buffer.concat(parts); parts = []; if (op !== 2) onText(whole.toString('utf8')); }
      }
    }
  });
  socket.on('close', onClose);
  socket.on('error', () => socket.destroy());
  return { send: (text) => send(1, Buffer.from(text, 'utf8')), close: () => { send(8, Buffer.alloc(0)); socket.end(); } };
}

/** Starts the stand-in on `port` (0: any free one); resolves to its url and a `close`. */
export function startStandin(port = 0) {
  let nextId = 1;
  const rooms = new Map(), watchers = new Set();
  const summary = (r) => ({ id: r.id, name: r.name, public: r.public, players: r.players.size, maxPlayers: r.maxPlayers, meta: r.meta, host: r.host, createdAt: r.createdAt });
  const lobbyRooms = () => [...rooms.values()].filter((r) => r.public && r.players.size).map(summary);
  const toLobby = (m) => { for (const w of watchers) w.out(m); };

  function leave(c) {
    const r = c.room;
    if (!r) return;
    r.players.delete(c.id);
    c.room = null;
    for (const p of r.players.values()) p.out({ t: 'player-', id: c.id });
    if (!r.players.size) { rooms.delete(r.id); toLobby({ t: 'room-', id: r.id }); return; }
    if (r.host === c.id) {
      r.host = Math.min(...r.players.keys());
      for (const p of r.players.values()) p.out({ t: 'host', id: r.host });
    }
    toLobby({ t: 'room+', room: summary(r) });
  }

  function enter(c, r, req) {
    r.players.set(c.id, c);
    c.room = r;
    for (const p of r.players.values()) if (p !== c) p.out({ t: 'player+', player: { id: c.id, name: c.name } });
    c.out({
      t: 'joined', req, room: summary(r), you: c.id, host: r.host, players: [...r.players.values()].map((p) => ({ id: p.id, name: p.name })),
      state: { seq: r.seq, snapshotSeq: r.snapshot?.seq ?? 0, snapshot: r.snapshot?.data ?? null, deltas: r.deltas, complete: true },
    });
    toLobby({ t: 'room+', room: summary(r) });
  }

  function handle(c, m) {
    const { req } = m, err = (code) => c.out({ t: 'error', code, req });
    switch (m.t) {
      case 'hello': c.name = String(m.name ?? '').slice(0, 32); c.out({ t: 'welcome', you: c.id, name: c.name, app: c.app }); return;
      case 'lobby': if (m.on) { watchers.add(c); c.out({ t: 'rooms', rooms: lobbyRooms(), req }); } else watchers.delete(c); return;
      case 'create': {
        if (c.room) return err('already_in_room');
        let id;
        do id = Array.from({ length: 6 }, () => CODE_LETTERS[crypto.randomInt(CODE_LETTERS.length)]).join(''); while (rooms.has(id));
        const o = m.room ?? {};
        const r = { id, name: String(o.name ?? 'room'), public: o.public !== false, maxPlayers: o.maxPlayers ?? 16, meta: o.meta ?? null, host: c.id, createdAt: Date.now(), players: new Map(), snapshot: null, deltas: [], seq: 0 };
        rooms.set(id, r);
        return enter(c, r, req);
      }
      case 'join': {
        if (c.room) return err('already_in_room');
        const r = rooms.get(String(m.id ?? '').toUpperCase());
        if (!r) return err('no_such_room');
        if (r.players.size >= r.maxPlayers) return err('room_full');
        return enter(c, r, req);
      }
      case 'leave': leave(c); c.out({ t: 'left', req }); return;
      case 'state': case 'delta': {
        const r = c.room;
        if (!r) return err('not_in_room');
        if (r.host !== c.id) return err('not_host');
        const entry = { seq: ++r.seq, data: m.data };
        if (m.t === 'state') { r.snapshot = entry; r.deltas = []; } else r.deltas.push(entry);
        for (const p of r.players.values()) if (p !== c) p.out({ t: m.t, seq: entry.seq, data: m.data });
        return;
      }
      case 'msg': {
        const r = c.room;
        if (!r) return err('not_in_room');
        for (const p of r.players.values()) if (p !== c && (m.to === undefined || p.id === m.to)) p.out({ t: 'msg', from: c.id, data: m.data });
        return;
      }
      default: err('unknown_type');
    }
  }

  const server = http.createServer((req, res) => {
    const rooms = /^\/v1\/apps\/[^/]+\/rooms/.test(req.url ?? '');
    res.writeHead(rooms ? 200 : 404, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify(rooms ? { rooms: lobbyRooms() } : { error: 'not_found' }));
  });
  server.on('upgrade', (req, socket) => {
    const match = /^\/v1\/apps\/([^/]+)\/ws/.exec(req.url ?? '');
    if (!match) { socket.destroy(); return; }
    const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + WS_GUID).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const c = { id: nextId++, name: 'player', app: match[1], room: null };
    const ws = websocket(socket, (text) => {
      let m;
      try { m = JSON.parse(text); } catch { c.out({ t: 'error', code: 'bad_json' }); return; }
      if (m && typeof m === 'object') handle(c, m);
    }, () => { watchers.delete(c); leave(c); });
    c.out = (msg) => ws.send(JSON.stringify(msg));
    c.out({ t: 'welcome', you: c.id, name: c.name, app: c.app });
  });
  return new Promise((done) => server.listen(port, '127.0.0.1', () => {
    const { port: p } = server.address();
    done({ url: `http://127.0.0.1:${p}`, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }) });
  }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = await startStandin(Number(process.argv[2] ?? 8787));
  console.log(`GameHub stand-in at ${s.url}`);
}
