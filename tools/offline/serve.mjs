/**
 * A folder served as GitHub Pages serves the game (the offline check, the download measure): the same content types
 * and `Cache-Control: max-age=600`, no compression. The folder can change while it serves (`served.dir` is read
 * on every request); `hits` counts the requests by path.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.map': 'application/json',
};

/** Serves `dir` on a free port under `base` (`/Nauta/`: the folder Pages puts the game in; `/` by default). */
export async function serveDir(dir, base = '/') {
  const hits = new Map();
  const served = { dir };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith(base)) { res.writeHead(404).end(); return; }
    const path = decodeURIComponent(url.pathname.slice(base.length)) || 'index.html';
    hits.set(path, (hits.get(path) ?? 0) + 1);
    try {
      const file = normalize(join(served.dir, path));
      if (!file.startsWith(normalize(served.dir))) throw new Error('outside');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream', 'content-length': body.length, 'cache-control': 'max-age=600' }).end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return Object.assign(served, { base: `${origin}${base}`, origin, hits, close: () => new Promise((done) => server.close(done)) });
}
