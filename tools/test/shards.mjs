/** The shards of `npm test` (tools/test/run.mjs) and the times its reporter writes (tools/test/reporter.mjs). */
import { readFileSync } from 'node:fs';

/**
 * `files` (sorted) dealt into `count` shards in turn: the same list always gives the same shards, each in the list's
 * order. Dealing in turn spreads the files of one area (whose names sort together and whose costs are alike) over
 * every shard.
 */
export function shardsOf(files, count) {
  const shards = Array.from({ length: Math.min(count, files.length) }, () => []);
  files.forEach((f, i) => shards[i % shards.length].push(f));
  return shards;
}

/** The reporter's lines: `{ start }` when a test starts, `{ file, name, seconds, ok }` when it ends. */
function lines(file) {
  try { return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; }
}

/** Every finished test of a run: `{ file, name, seconds, ok }`. */
export const readTimes = (file) => lines(file).filter((l) => !l.start);

/** The last test that started and did not end (a shard stopped in it), or null. */
export function unfinished(file) {
  const open = [];
  for (const l of lines(file)) {
    if (l.start) open.push(l.start);
    else { const i = open.findLastIndex((o) => o.file === l.file && o.name === l.name); if (i >= 0) open.splice(i, 1); }
  }
  return open.at(-1) ?? null;
}
