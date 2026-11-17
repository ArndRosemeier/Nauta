import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fallbackNote, formatVersion, NOT_A_BUILD, NOTES_DIR, noteLines, readBuilds, readNotes, versionInfo, versionLabel, type Build } from '../tools/version/version';

const build = (hash: string, subject = `change ${hash}`): Build => ({ hash, date: '2026-11-17T20:00:00+01:00', subject, body: '' });

test('versions count up by 0.001 from 0.001', () => {
  assert.equal(formatVersion(1), '0.001');
  assert.equal(formatVersion(12), '0.012');
  assert.equal(formatVersion(999), '0.999');
  assert.equal(formatVersion(1000), '1.000');
  assert.equal(formatVersion(1005), '1.005');
});

test('each build is one version, newest first, its notes from the files it added', () => {
  const info = versionInfo([build('a'), build('b'), build('c', 'N1.1 Waves: a sea (#4)')], [
    { file: 'whatsnew/x.txt', text: '- Look around.\n\n* The sky.\n', addedIn: 'a' },
    { file: 'whatsnew/y.txt', text: 'Wind.', addedIn: 'b' },
  ], false);
  assert.equal(info.version, '0.003');
  assert.equal(versionLabel(info), '0.003');
  assert.deepEqual(info.history.map((r) => [r.version, r.date, r.notes]), [
    ['0.003', '2026-11-17', ['N1.1 Waves: a sea']],
    ['0.002', '2026-11-17', ['Wind.']],
    ['0.001', '2026-11-17', ['Look around.', 'The sky.']],
  ]);
});

test('a note not yet committed is the next version, on a desk only', () => {
  const notes = [{ file: 'whatsnew/new.txt', text: 'Soon.' }];
  const info = versionInfo([build('a')], notes, true);
  assert.equal(versionLabel(info), '0.002 dev');
  assert.deepEqual(info.history[0]!.notes, ['Soon.']);
  assert.throws(() => versionInfo([build('a')], notes, false), /new\.txt/);
});

test('a build without a note shows its subject, and a merge its pull request title', () => {
  assert.equal(fallbackNote('N0.5 Device probe (#1)', ''), 'N0.5 Device probe');
  assert.equal(fallbackNote('Merge pull request #3 from x/y', '\nN1.6 Wind\n\nPLAN: N1.6'), 'N1.6 Wind');
  assert.deepEqual(noteLines(' a \n\n- b'), ['a', 'b']);
});

test('git: builds are main\'s commits past the docs, and a note gets the build that added it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nauta-version-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).trim();
  const write = (file: string, text: string) => { mkdirSync(join(dir, file, '..'), { recursive: true }); writeFileSync(join(dir, file), text); };
  const commit = (message: string) => { git('add', '-A'); git('commit', '-q', '-m', message); return git('rev-parse', 'HEAD'); };
  git('init', '-q', '-b', 'main');
  write('src/a.ts', '1'); const before = commit('before versioning');
  write('src/a.ts', '2'); write(`${NOTES_DIR}/one.txt`, 'One.'); commit('first build');
  write('docs/plan.md', 'plan'); write('README.md', 'read me'); commit('docs only: no build');
  git('checkout', '-q', '-b', 'side');
  write('src/b.ts', '1'); write(`${NOTES_DIR}/two.txt`, 'Two.'); commit('side work');
  write('src/b.ts', '2'); commit('more side work');
  git('checkout', '-q', 'main');
  git('merge', '-q', '--no-ff', '-m', 'Merge pull request #2 from me/side', '-m', 'Side work', 'side');
  write(`${NOTES_DIR}/three.txt`, 'Three.');
  const info = versionInfo(readBuilds(dir, before), readNotes(dir, before), true);
  assert.deepEqual(info.history.map((r) => [r.version, r.notes]), [['0.003', ['Three.']], ['0.002', ['Two.']], ['0.001', ['One.']]]);
});

test('the deploy skips exactly the paths that are no build', () => {
  const pages = readFileSync('.github/workflows/pages.yml', 'utf8');
  const block = /paths-ignore:\n((?:\s+- .+\n)+)/.exec(pages);
  assert.ok(block, 'pages.yml has no paths-ignore');
  assert.deepEqual([...block[1]!.matchAll(/- '([^']+)'/g)].map((m) => m[1]), NOT_A_BUILD);
});

test('every file in the notes folder is a note with text, or its guide', () => {
  for (const f of readdirSync(NOTES_DIR)) {
    if (f === 'README.md') continue;
    assert.match(f, /\.txt$/, `${NOTES_DIR}/${f}: a note is a .txt file`);
    assert.ok(noteLines(readFileSync(join(NOTES_DIR, f), 'utf8')).length, `${NOTES_DIR}/${f} is empty`);
  }
});
