/**
 * `npm test`: every test file under Node's test runner, held to the time budgets of tools/test/budgets.json
 * (docs/CHECKS.md). A test, a file or the whole suite past its limit fails the run (a file is stopped at its limit),
 * here as in CI. `npm test -- test/look.test.ts` runs the files given (the suite budget still holds).
 */
import { spawn } from 'node:child_process';
import { globSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { judge } from './judge.mjs';

const PATTERNS = ['test/**/*.test.ts', 'tools/**/*.test.mjs'];
const budgets = JSON.parse(readFileSync('tools/test/budgets.json', 'utf8'));
const given = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const files = [...new Set((given.length ? given : PATTERNS).flatMap((p) => globSync(p)))].filter((f) => !f.includes('node_modules')).sort();
if (!files.length) { console.error('no test files'); process.exit(2); }

const tmp = mkdtempSync(path.join(os.tmpdir(), 'nauta-test-'));
const times = path.join(tmp, 'times.json');
const t0 = performance.now();
const code = await new Promise((done) => spawn(process.execPath, [
  '--import', 'tsx', '--test', `--test-timeout=${budgets.file * 1000}`,
  '--test-reporter=./tools/test/reporter.mjs', '--test-reporter-destination=stdout', ...files,
], { stdio: 'inherit', env: { ...process.env, NAUTA_TEST_TIMES: times } }).on('close', done));
const wall = (performance.now() - t0) / 1000;

let tests = [];
try { tests = JSON.parse(readFileSync(times, 'utf8')); } catch { /* the runner died before its report */ }
rmSync(tmp, { recursive: true, force: true });
const { lines, failures, warnings } = judge(tests, wall, budgets);
for (const l of lines) console.log(l);
for (const w of warnings) console.log(process.env.GITHUB_ACTIONS ? `::warning title=Slow tests::${w}. See docs/CHECKS.md.` : `WARNING: ${w}`);
for (const f of failures) console.log(process.env.GITHUB_ACTIONS ? `::error title=Tests over budget::${f}. See docs/CHECKS.md.` : `OVER BUDGET: ${f}`);
process.exit(code !== 0 ? code ?? 1 : failures.length ? 1 : 0);
