/**
 * The service worker's file list and the worker itself, made when the game is built (plan N7.6). After vite has
 * written `dist`, `offlinePlugin` lists every file in it (`listBuild`: its path, the hash of its bytes, its size),
 * bundles `src/offline/sw.ts` with that list put in, and writes `dist/sw.js`. The rules (what is kept, what is
 * fetched late) are src/offline/plan.ts's.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { build, type Plugin } from 'vite';
import { REV_ALGORITHM, WORKER_PATH, isKept, revOf, type Precached } from '../../src/offline/plan';
import { readVersion } from '../version/version';

/** The worker's source, from the game's folder. */
const WORKER_SOURCE = 'src/offline/sw.ts';
/** Node's name for the hash `REV_ALGORITHM` names. */
const NODE_ALGORITHM = REV_ALGORITHM.replace('-', '').toLowerCase();

/** Every file under `dir` the worker keeps, by path from `dir` with `/` between folders, in path order. */
export function listBuild(dir: string): Precached[] {
  const files: Precached[] = [];
  const walk = (folder: string, prefix: string) => {
    for (const entry of readdirSync(folder, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const place = path.join(folder, entry.name), name = prefix + entry.name;
      if (entry.isDirectory()) { walk(place, `${name}/`); continue; }
      if (!isKept(name)) continue;
      const bytes = readFileSync(place);
      files.push({ path: name, rev: revOf(createHash(NODE_ALGORITHM).update(bytes).digest()), bytes: statSync(place).size });
    }
  };
  walk(dir, '');
  return files;
}

/** Writes `dir/sw.js`: the worker with the list of what `dir` holds and the version it is. */
export async function writeWorker(dir: string, version: string, root = process.cwd()): Promise<Precached[]> {
  const files = listBuild(dir);
  await build({
    root,
    configFile: false,
    publicDir: false,
    logLevel: 'silent',
    define: { NAUTA_PRECACHE: JSON.stringify(files), NAUTA_VERSION: JSON.stringify(version) },
    build: {
      outDir: dir,
      emptyOutDir: false,
      reportCompressedSize: false,
      target: 'es2022',
      minify: true,
      // A classic script: Safari runs those everywhere a module worker may not be allowed.
      lib: { entry: path.join(root, WORKER_SOURCE), formats: ['iife'], name: 'nautaWorker', fileName: () => WORKER_PATH },
    },
  });
  return files;
}

/** Makes `sw.js` after every build (not the dev server: there the page does not register it). */
export function offlinePlugin(): Plugin {
  let dir = '', root = '';
  return {
    name: 'nauta-offline',
    apply: 'build',
    enforce: 'post',
    configResolved(config) { root = config.root; dir = path.resolve(config.root, config.build.outDir); },
    async closeBundle() {
      // The worker's own build comes through here too (it has no plugins, but a nested config could): once is enough.
      if (this.environment?.name !== 'client') return;
      await writeWorker(dir, readVersion(root).version, root);
    },
  };
}
