/**
 * The crew's character pack (`npm run packs`, plan N4.0): downloads the Actors release's packs once (cached in
 * node_modules/.cache/actors/<version>) and copies what the crew wears and plays into public/packs/human: the body, its
 * morph targets, and the garments, hairstyles and clips listed in src/app/crewLooks.ts (PACK_GARMENTS, PACK_HAIR,
 * PACK_CLIPS). The whole archive is about 460 MB (the CMU motion library, 200 garments, 70 hairstyles); the crew's
 * share is a small part of it, and the page fetches only what a man wears (Actors loads garments, hair and clips on
 * first use). public/packs is not kept in git: the Pages build runs this before `vite build`.
 *
 * Runs again only when the Actors version or the selection changes; `--force` copies anew. The same selection is
 * made by MasterWorld's tools/packs/actors.mjs for its town; a selection option in Actors' own `actors-packs` would
 * let both drop theirs (noted for the design thread).
 */
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const version = JSON.parse(readFileSync(join(root, 'node_modules/@actors/generator/package.json'), 'utf8')).version;
// What the crew wears and plays, read from the source so the selection lives in one place.
const looks = readFileSync(join(root, 'src/app/crewLooks.ts'), 'utf8');
const list = (name) => {
  const m = looks.match(new RegExp(`export const ${name}[^=]*=\\s*\\[([^\\]]*)\\]`));
  if (!m) throw new Error(`no ${name} list in src/app/crewLooks.ts`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
};
const keep = { garment: new Set(list('PACK_GARMENTS')), hair: new Set(list('PACK_HAIR')), clips: new Set(list('PACK_CLIPS')), mocap: new Set(list('PACK_MOCAP')) };

const dest = join(root, 'public/packs/human');
const stamp = join(dest, '.selection');
const want = JSON.stringify({ version, keep: Object.fromEntries(Object.entries(keep).map(([k, v]) => [k, [...v].sort()])) });
if (!process.argv.includes('--force') && existsSync(stamp) && readFileSync(stamp, 'utf8') === want) {
  console.log(`public/packs/human already has the crew's Actors ${version} selection`);
  process.exit(0);
}

const cache = join(root, 'node_modules/.cache/actors', version);
// The library's files the crew's motion capture is (clip 'cmu 80_19' is file 80_19.bin).
const cmuFile = (id) => `${id.replace(/^cmu /, '')}.bin`;
const cmuDir = join(cache, 'packs/human/clips/cmu');
const cmuWanted = ['index.json', ...[...keep.mocap].map(cmuFile)];
const haveBody = existsSync(join(cache, 'packs/human/manifest.json')), haveCmu = cmuWanted.every((f) => existsSync(join(cmuDir, f)));
if (!haveBody || !haveCmu) {
  mkdirSync(cache, { recursive: true });
  const url = `https://github.com/ArndRosemeier/Actors/releases/download/v${version}/actors-packs-${version}.tar.gz`;
  console.log(`downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${url}: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(join(cache, 'packs.tar.gz')));
  // The human pack without the CMU library (most of the archive), then the few motions the crew plays from it. Run
  // inside the cache with a relative name: GNU tar reads `C:\...` as a remote host, and Windows' own tar has no --force-local.
  if (!haveBody) execFileSync('tar', ['xzf', 'packs.tar.gz', '--exclude=packs/human/clips/cmu', 'packs/human'], { stdio: 'inherit', cwd: cache });
  execFileSync('tar', ['xzf', 'packs.tar.gz', ...cmuWanted.map((f) => `packs/human/clips/cmu/${f}`)], { stdio: 'inherit', cwd: cache });
  rmSync(join(cache, 'packs.tar.gz'));
}

const src = join(cache, 'packs/human');
const manifest = JSON.parse(readFileSync(join(src, 'manifest.json'), 'utf8'));
const role = new Map(manifest.meshes.map((m) => [m.name, m.role]));
const missing = [...keep.garment, ...keep.hair].filter((n) => !role.has(n)).concat([...keep.clips].filter((n) => !manifest.clips.some((c) => c.name === n)));
const library = JSON.parse(readFileSync(join(cmuDir, 'index.json'), 'utf8'));
missing.push(...[...keep.mocap].filter((n) => !library.clips.some((c) => c.name === n)));
if (missing.length) throw new Error(`not in the Actors ${version} pack: ${missing.join(', ')}`);
// A garment or hairstyle the crew does not wear (its mesh and its fitting proxy share the name); brows and lashes stay.
const dropped = (name) => {
  const r = role.get(name);
  return (r === 'garment' || r === 'hair') && !name.startsWith('brows-') && name !== 'eyelashes' && !keep[r].has(name);
};
// The files a part of the manifest names.
const refs = (o) => JSON.stringify(o).match(/"[a-z]+\/[^"]+\.(?:bin|png|jpg)"/g)?.map((s) => s.slice(1, -1)) ?? [];
const files = new Set([manifest.blob ?? 'base.bin']);
for (const m of [...manifest.meshes, ...manifest.proxies]) if (!dropped(m.name)) for (const f of refs(m)) files.add(f);
for (const c of manifest.clips) if (keep.clips.has(c.name)) files.add(c.file);
for (const t of manifest.targets) files.add(t.file);
const { meshes: _m, proxies: _p, clips: _c, targets: _t, clipLibraries: _l, ...rest } = manifest;
for (const f of refs(rest)) files.add(f);

rmSync(dest, { recursive: true, force: true });
let bytes = 0;
for (const f of files) {
  mkdirSync(dirname(join(dest, f)), { recursive: true });
  copyFileSync(join(src, f), join(dest, f));
  bytes += statSync(join(dest, f)).size;
}
// The CMU library cut to the crew's motions: their files and an index of only them (the library's rigs kept).
const cmu = (manifest.clipLibraries ?? []).find((l) => l.name === 'cmu');
const cut = { ...library, clips: library.clips.filter((c) => keep.mocap.has(c.name)) };
mkdirSync(join(dest, 'clips/cmu'), { recursive: true });
for (const c of cut.clips) copyFileSync(join(cmuDir, c.file), join(dest, 'clips/cmu', c.file));
writeFileSync(join(dest, 'clips/cmu/index.json'), JSON.stringify(cut));
// The manifest as shipped, with that library; the page narrows its catalog to what was copied (src/app/crewLooks.ts
// `packCatalog`), so nothing asks for a file left out.
writeFileSync(join(dest, 'manifest.json'), JSON.stringify({ ...manifest, clipLibraries: cmu ? [{ ...cmu, count: cut.clips.length }] : [] }));
writeFileSync(stamp, want);
console.log(`public/packs/human: ${files.size} files, ${(bytes / 1e6).toFixed(0)} MB on disk (Actors ${version}); the page fetches what the crew wears`);
