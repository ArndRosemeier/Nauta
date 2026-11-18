/**
 * Time budgets for CI steps (docs/CHECKS.md), so CI does not creep back to minutes unnoticed. From MasterWorld.
 *
 *   node tools/guards/budget.mjs <warn s> <fail s> -- <command...>
 *
 * Runs the command, then prints how long it took. Past `warn` seconds it adds a GitHub warning (shown on the
 * run's summary page) naming the step; past `fail` seconds it fails, even if the command passed. A failing
 * command fails as before. With BUDGET_LOG=<file> set, it adds the step's seconds and name to that file, a line each.
 *
 *   node tools/guards/budget.mjs --sum <limit s>
 *
 * Prints every step BUDGET_LOG holds and their sum against `limit` (all slow checks together: the CI job's
 * 10 minutes), with a GitHub warning past two thirds of it, as a single step warns at 2 of its 3 minutes; and, with
 * JOB_START=<unix seconds> set, the job's own time so far, setting up included.
 */
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

/** The verdict for a step that took `seconds`: ok, warn or fail. */
export function verdict(seconds, warn, fail) {
  return seconds > fail ? 'fail' : seconds > warn ? 'warn' : 'ok';
}

/** The share of the sum's limit past which it warns, as a step's warning stands at 2 of its 3 minutes. */
const SUM_WARN = 2 / 3;

/** The steps a BUDGET_LOG holds (`<seconds>\t<name>` a line), summed: the lines to print and the verdict. */
export function summary(log, limit) {
  const steps = log.split('\n').filter(Boolean).map((line) => { const [s, ...name] = line.split('\t'); return { s: Number(s), name: name.join('\t') }; });
  const total = steps.reduce((sum, step) => sum + step.s, 0);
  const lines = [...steps.map((step) => `${step.s.toFixed(1).padStart(7)} s  ${step.name}`), `${total.toFixed(1).padStart(7)} s  all slow checks together (warn at ${Math.round(limit * SUM_WARN)} s, the job's limit ${limit} s)`];
  return { total, lines, verdict: verdict(total, limit * SUM_WARN, limit) };
}

function sum(limit) {
  const file = process.env.BUDGET_LOG;
  if (!(limit > 0) || !file) { console.error('usage: BUDGET_LOG=<file> node tools/guards/budget.mjs --sum <limit s>'); process.exit(2); }
  const { total, lines, verdict: v } = summary(existsSync(file) ? readFileSync(file, 'utf8') : '', limit);
  for (const line of lines) console.log(line);
  if (process.env.JOB_START) console.log(`the job so far, setting up included: ${(Date.now() / 1000 - Number(process.env.JOB_START)).toFixed(0)} s of its ${limit} s`);
  if (v !== 'ok') console.log(`::warning title=Slow checks::all slow checks together took ${total.toFixed(0)} s of the job's ${limit} s. See docs/CHECKS.md.`);
}

async function main() {
  if (process.argv[2] === '--sum') return sum(Number(process.argv[3]));
  const at = process.argv.indexOf('--');
  const [warn, fail] = process.argv.slice(2, at).map(Number);
  const cmd = process.argv.slice(at + 1);
  if (at < 0 || !(warn > 0) || !(fail >= warn) || !cmd.length) {
    console.error('usage: node tools/guards/budget.mjs <warn s> <fail s> -- <command...>');
    process.exit(2);
  }
  const t0 = performance.now();
  const code = await new Promise((done) => spawn(cmd[0], cmd.slice(1), { stdio: 'inherit', shell: process.platform === 'win32' }).on('close', done));
  const s = (performance.now() - t0) / 1000, name = cmd.join(' ');
  const v = verdict(s, warn, fail);
  if (process.env.BUDGET_LOG) appendFileSync(process.env.BUDGET_LOG, `${s.toFixed(1)}\t${name}\n`);
  console.log(`budget: \`${name}\` took ${s.toFixed(1)} s (warn at ${warn} s, fail at ${fail} s)`);
  if (v === 'warn') console.log(`::warning title=Slow step::\`${name}\` took ${s.toFixed(0)} s, past its ${warn} s warning (fails at ${fail} s). See docs/CHECKS.md.`);
  if (v === 'fail') console.log(`::error title=Step over budget::\`${name}\` took ${s.toFixed(0)} s, past its ${fail} s budget. See docs/CHECKS.md.`);
  process.exit(code !== 0 ? code ?? 1 : v === 'fail' ? 1 : 0);
}

if (import.meta.main) await main();
