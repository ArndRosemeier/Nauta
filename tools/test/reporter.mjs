/**
 * The test reporter of `npm test` (tools/test/run.mjs): one line per failure with its message, nothing for a pass,
 * and at the end every test's time written to the file named by NAUTA_TEST_TIMES, for the budgets.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';

export default async function* reporter(source) {
  const tests = [];
  let failed = 0;
  for await (const event of source) {
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
    const d = event.data;
    // A file run as its own process reports itself as a test too: its tests are counted, not their sum twice.
    if (d.details?.type === 'suite' || (d.nesting === 0 && d.name === d.file)) continue;
    const file = d.file ? path.relative(process.cwd(), d.file).split(path.sep).join('/') : '?';
    tests.push({ file, name: d.name, seconds: (d.details?.duration_ms ?? 0) / 1000, ok: event.type === 'test:pass' });
    if (event.type === 'test:fail') {
      failed++;
      const err = d.details?.error, cause = err?.cause ?? err;
      yield `not ok: ${file}: ${d.name}\n${String(cause?.stack ?? cause?.message ?? cause ?? '').split('\n').map((l) => '    ' + l).join('\n')}\n`;
    }
  }
  if (process.env.NAUTA_TEST_TIMES) writeFileSync(process.env.NAUTA_TEST_TIMES, JSON.stringify(tests));
  yield `${tests.length} tests, ${failed} failed\n`;
}
