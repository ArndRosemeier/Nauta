import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  fileAsked, howMuchKept, isCore, isKept, keyOf, namedByHash, nextFill, offlineMode, revOf, staleKeys, type Precached,
} from '../src/offline/plan';
import { listBuild } from '../tools/offline/precache';

const SCOPE = 'https://example.org/Nauta/';
const file = (path: string, rev = 'a1', bytes = 100): Precached => ({ path, rev, bytes });
const BUILD = [
  file('index.html'), file('assets/index-AbC.js'), file('assets/index-AbC.css'), file('fonts/caslon.woff2'),
  file('sound/bed/sea.mp3', 'b1', 500), file('sound/gun/boom.mp3', 'b2', 200), file('ship/fittings.fmpk', 'c1', 900),
  file('packs/human/base.bin', 'd1', 5000), file('packs/human/hair/a.bin', 'd2', 300),
];
const map = new Map(BUILD.map((f) => [f.path, f]));

test('a hash is sixteen hex digits of the bytes', () => {
  assert.equal(revOf(new Uint8Array([0, 1, 255, 16, 2, 3, 4, 5, 6, 7])), '0001ff1002030405');
  assert.equal(revOf(new Uint8Array(20).fill(171)).length, 16);
});

test('source maps, the worker itself and hidden files are not kept; the rest is', () => {
  assert.equal(isKept('assets/index-AbC.js.map'), false);
  assert.equal(isKept('sw.js'), false);
  assert.equal(isKept('packs/human/.selection'), false);
  assert.equal(isKept('assets/index-AbC.js'), true);
  assert.equal(isKept('sound/index.json'), true);
});

test('the core is what the page needs to start; sounds, the ship and the crew come later', () => {
  assert.deepEqual(BUILD.filter((f) => isCore(f.path)).map((f) => f.path), ['index.html', 'assets/index-AbC.js', 'assets/index-AbC.css', 'fonts/caslon.woff2']);
  assert.equal(namedByHash('assets/index-AbC.js'), true);
  assert.equal(namedByHash('sound/bed/sea.mp3'), false);
});

test('a file is kept under its place and its hash, so a changed file is a new key', () => {
  assert.equal(keyOf(SCOPE, file('sound/a b.mp3', 'ff')), 'https://example.org/Nauta/sound/a%20b.mp3?rev=ff');
  assert.notEqual(keyOf(SCOPE, file('x', '1')), keyOf(SCOPE, file('x', '2')));
});

test('every address of the game is the page; other addresses are their file or none', () => {
  const ask = (address: string, navigating = false) => fileAsked(map, SCOPE, address, navigating)?.path ?? null;
  assert.equal(ask('https://example.org/Nauta/?sail&walk', true), 'index.html');
  assert.equal(ask('https://example.org/Nauta/index.html?title', true), 'index.html');
  assert.equal(ask('https://example.org/Nauta/assets/index-AbC.js'), 'assets/index-AbC.js');
  assert.equal(ask('https://example.org/Nauta/assets/index-AbC.js?v=2'), 'assets/index-AbC.js');
  assert.equal(ask('https://example.org/Nauta/'), null, 'only a navigation asks for the page');
  assert.equal(ask('https://example.org/Nauta/sound/missing.mp3'), null);
  assert.equal(ask('https://example.org/Other/assets/index-AbC.js'), null);
  assert.equal(ask('https://games.futuremagic.de/Nauta/assets/index-AbC.js'), null);
});

test('the fill takes the sounds first, then the ship, then the crew, in batches that stop at their limits', () => {
  const kept = new Set(BUILD.filter((f) => isCore(f.path)).map((f) => keyOf(SCOPE, f)));
  const paths = (files: Precached[]) => files.map((f) => f.path);
  assert.deepEqual(paths(nextFill(BUILD, kept, SCOPE, 10, 1e9)), ['sound/bed/sea.mp3', 'sound/gun/boom.mp3', 'ship/fittings.fmpk', 'packs/human/base.bin', 'packs/human/hair/a.bin']);
  assert.deepEqual(paths(nextFill(BUILD, kept, SCOPE, 2, 1e9)), ['sound/bed/sea.mp3', 'sound/gun/boom.mp3'], 'at most two files');
  assert.deepEqual(paths(nextFill(BUILD, kept, SCOPE, 10, 600)), ['sound/bed/sea.mp3', 'sound/gun/boom.mp3'], 'stops once 600 bytes are in the batch: 500 then 200');
  assert.deepEqual(paths(nextFill(BUILD, kept, SCOPE, 10, 1)), ['sound/bed/sea.mp3'], 'a file larger than the batch still goes, alone');
});

test('a core file that went missing is fetched before anything late', () => {
  const kept = new Set(BUILD.filter((f) => f.path !== 'fonts/caslon.woff2').map((f) => keyOf(SCOPE, f)));
  assert.deepEqual(nextFill(BUILD, kept, SCOPE, 5, 1e9).map((f) => f.path), ['fonts/caslon.woff2']);
  const all = new Set(BUILD.map((f) => keyOf(SCOPE, f)));
  assert.deepEqual(nextFill(BUILD, all, SCOPE, 5, 1e9), [], 'nothing to fetch when all is kept');
});

test('an update keeps the files that did not change and drops the rest', () => {
  const before = BUILD.map((f) => keyOf(SCOPE, f));
  const after = BUILD.map((f) => (f.path === 'assets/index-AbC.js' ? file('assets/index-XyZ.js', 'e9') : f.path === 'sound/gun/boom.mp3' ? file(f.path, 'b9', 200) : f));
  assert.deepEqual(staleKeys(before, after, SCOPE).sort(), [keyOf(SCOPE, BUILD[1]!), keyOf(SCOPE, BUILD[5]!)].sort());
  const missing = nextFill(after, new Set(before), SCOPE, 10, 1e9).map((f) => f.path);
  assert.deepEqual(missing.sort(), ['assets/index-XyZ.js', 'sound/gun/boom.mp3'], 'only the two that changed are fetched');
});

test('how much is kept', () => {
  const kept = new Set(BUILD.slice(0, 5).map((f) => keyOf(SCOPE, f)));
  assert.deepEqual(howMuchKept('0.071', BUILD, kept, SCOPE), { kind: 'kept', version: '0.071', files: 5, total: 9, bytes: 100 * 4 + 500, totalBytes: 400 + 500 + 200 + 900 + 5000 + 300 });
});

test('the deploy uses the worker, other builds only when asked, and ?nosw removes it', () => {
  assert.equal(offlineMode('', true), 'on');
  assert.equal(offlineMode('?sail&walk', true), 'on');
  assert.equal(offlineMode('', false), 'off');
  assert.equal(offlineMode('?title&sw', false), 'on');
  assert.equal(offlineMode('?nosw', true), 'clear');
  assert.equal(offlineMode('?sw&nosw', false), 'clear');
});

test('the build lists its files by path and hash, without maps, the worker and hidden files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nauta-offline-'));
  try {
    mkdirSync(join(dir, 'assets')); mkdirSync(join(dir, 'packs/human'), { recursive: true });
    writeFileSync(join(dir, 'index.html'), 'page');
    writeFileSync(join(dir, 'assets/a.js'), 'script');
    writeFileSync(join(dir, 'assets/a.js.map'), 'map');
    writeFileSync(join(dir, 'sw.js'), 'worker');
    writeFileSync(join(dir, 'packs/human/.selection'), '{}');
    writeFileSync(join(dir, 'packs/human/b.bin'), 'bin');
    const listed = listBuild(dir);
    assert.deepEqual(listed.map((f) => f.path), ['assets/a.js', 'index.html', 'packs/human/b.bin']);
    assert.deepEqual(listed.map((f) => f.bytes), [6, 4, 3]);
    // sha1('page') = 767013ce0ee0f6d7..., as sha1sum says
    assert.equal(listed[1]!.rev, '767013ce0ee0f6d7');
    assert.equal(listBuild(dir)[1]!.rev, listed[1]!.rev, 'the same bytes give the same hash');
    writeFileSync(join(dir, 'index.html'), 'page2');
    assert.notEqual(listBuild(dir)[1]!.rev, listed[1]!.rev);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
