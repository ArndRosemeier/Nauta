/**
 * `npm test`: every test file under Node's test runner, held to the time budgets of tools/test/budgets.json
 * (docs/CHECKS.md). A test, a file or the whole suite past its limit fails the run, here as in CI.
 *
 * The files run in `SHARDS` processes side by side, each holding its files one after another in one process
 * (`--experimental-test-isolation=none`): the modules, their tables and the JIT warm up once a shard, not once a file,
 * which was most of the suite's time. Which shard a file runs in depends only on the list of files (`shardsOf`). A test
 * that hangs is stopped by the test timeout (the file's limit); a shard still running at the suite's limit is stopped
 * and named, with the test it was in, while the other shards' results stand.
 *
 *   npm test                         all files, in shards
 *   npm test -- test/look.test.ts    the files given (the suite budget still holds)
 *   npm test -- --isolated           each file in its own process, as before the shards: the slow-checks job runs it
 *                                    to show no test leans on another file's leftovers; only failing tests fail it
 *
 * A Node without test isolation `none` (before 22.8) runs each file in its own process and says so.
 */
import { spawn } from 'node:child_process';
import { globSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { judge } from './judge.mjs';
import { readTimes, shardsOf, unfinished } from './shards.mjs';

const PATTERNS = ['test/**/*.test.ts', 'tools/**/*.test.mjs'];
/** Processes side by side: CI's runner has four cores, one left for the runner and the system. */
const SHARDS = 3;
const budgets = JSON.parse(readFileSync('tools/test/budgets.json', 'utf8'));
const args = process.argv.slice(2);
const given = args.filter((a) => !a.startsWith('--'));
const files = [...new Set((given.length ? given : PATTERNS).flatMap((p) => globSync(p)))].filter((f) => !f.includes('node_modules')).sort();
if (!files.length) { console.error('no test files'); process.exit(2); }

const [major, minor] = process.versions.node.split('.').map(Number);
const canShare = major > 22 || (major === 22 && minor >= 8);
const isolated = args.includes('--isolated') || !canShare;
if (!canShare) console.log(`Node ${process.versions.node} cannot run test files in one process (22.8 or later can): each file runs in its own process, which is slower`);

const tmp = mkdtempSync(path.join(os.tmpdir(), 'nauta-test-'));
const groups = isolated ? [files] : shardsOf(files, SHARDS);
const t0 = performance.now();

/** Runs one group of files; its output is held and printed whole when it ends, so shards do not interleave. */
function runGroup(group, i) {
  const times = path.join(tmp, `times-${i}.jsonl`);
  const child = spawn(process.execPath, [
    '--import', 'tsx', '--test', `--test-timeout=${budgets.file * 1000}`,
    // In one process a test's leftover timer would hold the shard open past its last test.
    ...(isolated ? [] : ['--experimental-test-isolation=none', '--test-force-exit']),
    '--test-reporter=./tools/test/reporter.mjs', '--test-reporter-destination=stdout', ...group,
  ], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NAUTA_TEST_TIMES: times } });
  let out = '', stopped = false;
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  // The suite's limit, and a moment for the shard to report; past that it is stopped (the old way has no shards to stop).
  const limit = isolated ? null : setTimeout(() => { stopped = true; child.kill('SIGKILL'); }, budgets.suiteFail * 1000);
  return new Promise((done) => child.on('close', (code) => {
    clearTimeout(limit);
    process.stdout.write(out);
    const tests = readTimes(times);
    if (stopped) {
      // A test busy without a pause holds the reporter too: then the files that never reported are named.
      const left = unfinished(times), done = new Set(tests.map((t) => t.file));
      const where = left ? `in ${left.file}: "${left.name}"` : `files that did not report: ${group.filter((f) => !done.has(f)).join(', ')}`;
      console.log(`shard ${i + 1} was stopped at the suite's ${budgets.suiteFail} s, ${where}`);
    }
    done({ code: stopped ? 1 : code ?? 1, tests });
  }));
}

const results = await Promise.all(groups.map(runGroup));
const wall = (performance.now() - t0) / 1000;
rmSync(tmp, { recursive: true, force: true });
const tests = results.flatMap((r) => r.tests);
const failed = results.some((r) => r.code !== 0);
console.log(`${tests.length} tests in ${files.length} files, ${isolated ? 'each file in its own process' : `${groups.length} shards`}, ${tests.filter((t) => !t.ok).length} failed`);
const { lines, failures, warnings } = judge(tests, wall, budgets);
for (const l of lines) console.log(l);
// Run the old way on purpose (the slow-checks job), the budgets are not this run's: it shows only that every test passes alone.
const held = args.includes('--isolated') ? [] : failures;
for (const w of args.includes('--isolated') ? [] : warnings) console.log(process.env.GITHUB_ACTIONS ? `::warning title=Slow tests::${w}. See docs/CHECKS.md.` : `WARNING: ${w}`);
for (const f of held) console.log(process.env.GITHUB_ACTIONS ? `::error title=Tests over budget::${f}. See docs/CHECKS.md.` : `OVER BUDGET: ${f}`);
process.exit(failed ? 1 : held.length ? 1 : 0);
