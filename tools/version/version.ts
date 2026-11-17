/**
 * The game's version and its history (Arnd 2026-11-17: "Start with version 0.001 and increase by 0.001 each build,
 * with a what's new button that shows the full history").
 *
 * Nobody writes a version number by hand, so threads that merge side by side never collide on one. The number is
 * worked out from git whenever the game is built: build N is the N-th commit on `main`'s first-parent line, counted
 * from BEFORE_VERSIONING, that changes something besides the docs. Those are exactly the pushes that rebuild and
 * deploy the page (`.github/workflows/pages.yml` skips the paths in NOT_A_BUILD, and a test holds the two together).
 *
 * The notes come from `whatsnew/*.txt`, one file per change (whatsnew/README.md). A note belongs to the build whose
 * commit added its file, so a note is written on a branch without knowing its number and gets it when it lands.
 * A build that added no note shows its commit's subject instead, so the history has every version.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/** The last commit on `main` before versioning began; the first build after it is 0.001. */
export const BEFORE_VERSIONING = 'bde5e667d36c8c01e82401dc9feff142dafbda88';
/** Paths whose changes alone are no build: they do not change the page. The Pages workflow's `paths-ignore` is this list. */
export const NOT_A_BUILD = ['docs/**', 'README.md', 'CLAUDE.md'];
/** The folder of what's-new notes, one file per change. */
export const NOTES_DIR = 'whatsnew';
/** The ending of a note file (whatsnew/README.md is the folder's guide, not a note). */
const NOTE_ENDING = '.txt';
/** Builds per whole version number: each build adds 0.001. */
const BUILDS_PER_WHOLE = 1000;
/** Digits after the point. */
const VERSION_DECIMALS = 3;
/** The length of a date (`2026-11-17`) at the start of an ISO time. */
const DATE_LENGTH = 10;
/** Separators of fields and records in git's output: they never stand in a commit message. */
const FIELD = '\x1f', RECORD = '\x1e';
/** git's output may be long once the history is: room for it, bytes. */
const GIT_OUTPUT_BYTES = 64 * 1024 * 1024;
/** The names the game imports the version and the history by (types in src/version.d.ts). */
export const VERSION_MODULE = 'virtual:nauta/version', HISTORY_MODULE = 'virtual:nauta/history';

/** One version: its number, the day it was built and what it brought, one line each. */
export interface Release {
  readonly version: string;
  readonly date: string;
  readonly notes: readonly string[];
}

export interface VersionInfo {
  /** The version of this build (`0.012`). */
  readonly version: string;
  /** Built on a desk or for a check, not by the deploy: the number is what it would be, and notes not yet committed count. */
  readonly dev: boolean;
  /** Every version, newest first. */
  readonly history: readonly Release[];
}

/** A commit that is a build, as git tells it. */
export interface Build {
  readonly hash: string;
  /** ISO time. */
  readonly date: string;
  readonly subject: string;
  readonly body: string;
}

/** A note file: its path, its text, and the commit that added it (none while it is not committed). */
export interface Note {
  readonly file: string;
  readonly text: string;
  readonly addedIn?: string;
}

/** The version of the n-th build: 1 is `0.001`, 1000 is `1.000`. */
export function formatVersion(build: number): string {
  return `${Math.floor(build / BUILDS_PER_WHOLE)}.${String(build % BUILDS_PER_WHOLE).padStart(VERSION_DECIMALS, '0')}`;
}

/** The version as the game shows it: `0.012`, or `0.012 dev` on a build the deploy did not make. */
export function versionLabel(info: VersionInfo): string {
  return info.dev ? `${info.version} dev` : info.version;
}

/** A note file's lines as items: blank lines dropped, a leading `- ` or `* ` taken off. */
export function noteLines(text: string): string[] {
  return text.split('\n').map((l) => l.trim().replace(/^[-*]\s+/, '')).filter((l) => l !== '');
}

/** What a build without a note says: its commit's subject, without the pull request's number. */
export function fallbackNote(subject: string, body: string): string {
  // A merge commit's subject names the branch; the pull request's title is the first line of its body.
  const line = /^Merge pull request /.test(subject) ? (noteLines(body)[0] ?? subject) : subject;
  return line.replace(/\s*\(#\d+\)$/, '');
}

/**
 * The version and the history from the builds (oldest first) and the note files. A note no build added (not yet
 * committed) belongs to the next build, which only a dev build may show.
 */
export function versionInfo(builds: readonly Build[], notes: readonly Note[], dev: boolean): VersionInfo {
  const index = new Map(builds.map((b, i) => [b.hash, i]));
  const byBuild: string[][] = builds.map(() => []);
  const pending: string[] = [];
  for (const note of [...notes].sort((a, b) => a.file.localeCompare(b.file))) {
    const i = note.addedIn === undefined ? undefined : index.get(note.addedIn);
    (i === undefined ? pending : byBuild[i]!).push(...noteLines(note.text));
  }
  const history: Release[] = builds.map((b, i) => ({
    version: formatVersion(i + 1),
    date: b.date.slice(0, DATE_LENGTH),
    notes: byBuild[i]!.length ? byBuild[i]! : [fallbackNote(b.subject, b.body)],
  }));
  if (pending.length) {
    if (!dev) throw new Error(`what's-new notes no build added: ${notes.filter((n) => !n.addedIn || !index.has(n.addedIn)).map((n) => n.file).join(', ')}`);
    history.push({ version: formatVersion(builds.length + 1), date: 'not yet built', notes: pending });
  }
  return { version: history.length ? history.at(-1)!.version : formatVersion(0), dev, history: history.reverse() };
}

const git = (cwd: string, args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: GIT_OUTPUT_BYTES });

/** The builds since BEFORE_VERSIONING on HEAD's first-parent line, oldest first. */
export function readBuilds(cwd: string, before = BEFORE_VERSIONING): Build[] {
  const out = git(cwd, ['log', '--first-parent', '--reverse', `--format=%H${FIELD}%cI${FIELD}%s${FIELD}%b${RECORD}`,
    `${before}..HEAD`, '--', '.', ...NOT_A_BUILD.map((p) => `:(exclude,glob)${p}`)]);
  return out.split(RECORD).map((r) => r.trim()).filter(Boolean).map((r) => {
    const [hash, date, subject, body] = r.split(FIELD);
    return { hash: hash!, date: date!, subject: subject!, body: body ?? '' };
  });
}

/** The note files with the commit on HEAD's first-parent line that added each. */
export function readNotes(cwd: string, before = BEFORE_VERSIONING): Note[] {
  const dir = path.join(cwd, NOTES_DIR);
  if (!existsSync(dir)) return [];
  const added = new Map<string, string>();
  const log = git(cwd, ['log', '--first-parent', '--reverse', '--no-renames', '--diff-filter=A', '--name-only',
    `--format=${RECORD}%H`, `${before}..HEAD`, '--', `${NOTES_DIR}/`]);
  for (const record of log.split(RECORD).filter((r) => r.trim())) {
    const [hash, ...files] = record.trim().split('\n').map((l) => l.trim()).filter(Boolean);
    for (const f of files) if (!added.has(f)) added.set(f, hash!);
  }
  return readdirSync(dir).filter((f) => f.endsWith(NOTE_ENDING)).map((f) => {
    const file = `${NOTES_DIR}/${f}`;
    return { file, text: readFileSync(path.join(dir, f), 'utf8'), addedIn: added.get(file) };
  });
}

/**
 * The version of the tree at `cwd`. `release` is the deploy's build (NAUTA_RELEASE=1 in pages.yml): it must know its
 * number, so a history git cannot tell (a shallow clone) fails it. Any other build shows what it can.
 */
export function readVersion(cwd = process.cwd(), release = process.env.NAUTA_RELEASE === '1'): VersionInfo {
  try {
    return versionInfo(readBuilds(cwd), readNotes(cwd), !release);
  } catch (err) {
    if (release) throw err;
    console.warn(`nauta version: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
    return { version: '?', dev: true, history: [] };
  }
}

/** Gives the game VERSION_MODULE (`VERSION`, `DEV`, `LABEL`) and HISTORY_MODULE (the history, loaded when it is asked for). */
export function versionPlugin(): Plugin {
  const resolved = (id: string) => `\0${id}`;
  let info: VersionInfo | undefined;
  return {
    name: 'nauta-version',
    buildStart() { info = undefined; },
    resolveId(id) { return id === VERSION_MODULE || id === HISTORY_MODULE ? resolved(id) : undefined; },
    load(id) {
      if (id !== resolved(VERSION_MODULE) && id !== resolved(HISTORY_MODULE)) return undefined;
      info ??= readVersion();
      return id === resolved(VERSION_MODULE)
        ? `export const VERSION = ${JSON.stringify(info.version)};\nexport const DEV = ${info.dev};\nexport const LABEL = ${JSON.stringify(versionLabel(info))};\n`
        : `export default ${JSON.stringify(info.history)};\n`;
    },
  };
}
