/**
 * The test reporter of `npm test` (tools/test/run.mjs): one line per failure with its message, nothing for a pass,
 * and every test's start and end, with its time, written as it happens to the file named by NAUTA_TEST_TIMES (one JSON
 * line each, tools/test/shards.mjs), for the budgets and to name the test a stopped shard was in.
 */
import { appendFileSync } from 'node:fs';
import path from 'node:path';

const record = (line) => { if (process.env.NAUTA_TEST_TIMES) appendFileSync(process.env.NAUTA_TEST_TIMES, JSON.stringify(line) + '\n'); };
const fileOf = (d) => (d.file ? path.relative(process.cwd(), d.file).split(path.sep).join('/') : '?');
// A file run as its own process reports itself as a test too: its tests are counted, not their sum twice.
const counted = (d) => !(d.details?.type === 'suite' || (d.nesting === 0 && d.name === d.file));

export default async function* reporter(source) {
  let count = 0, failed = 0;
  for await (const event of source) {
    const d = event.data;
    if (event.type === 'test:start' && !(d.nesting === 0 && d.name === d.file)) record({ start: { file: fileOf(d), name: d.name } });
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
    if (!counted(d)) continue;
    const file = fileOf(d), ok = event.type === 'test:pass';
    record({ file, name: d.name, seconds: (d.details?.duration_ms ?? 0) / 1000, ok });
    count++;
    if (!ok) {
      failed++;
      const err = d.details?.error, cause = err?.cause ?? err;
      yield `not ok: ${file}: ${d.name}\n${String(cause?.stack ?? cause?.message ?? cause ?? '').split('\n').map((l) => '    ' + l).join('\n')}\n`;
    }
  }
  yield `${count} tests, ${failed} failed\n`;
}
