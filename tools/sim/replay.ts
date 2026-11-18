/**
 * Slow check (docs/CHECKS.md, implementation plan N3.1): ten simulated minutes of a duel in the strongest wind, two
 * brigs under a seeded script of orders, run in two separate processes side by side (each with its own fresh module
 * state, as two machines would be), and once more here with a break at five minutes where the state is encoded,
 * decoded and run on from the bytes. All three must agree on the state's hash at every simulated second.
 *
 *   npm run check:replay            the check (exit 0 when all agree)
 *   tsx tools/sim/replay.ts --run   one run, its hashes as JSON on stdout (what the check spawns)
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { replay } from '../../src/sim/replay.ts';
import { decodeState, encodeState, hashState, type SimState } from '../../src/sim/state.ts';
import { STEPS_PER_SECOND } from '../../src/sim/units.ts';
import { duel, orderScript } from '../../test/support/match.ts';

const SEED = 1805;
const MINUTES = 10;
const TICKS = MINUTES * 60 * STEPS_PER_SECOND;
const script = orderScript(SEED, MINUTES * 60);

/** The hash after every simulated second, running on from `start` to the end. */
function run(start: SimState, out: string[] = []): string[] {
  replay(start, script, TICKS, (s) => { if (s.tick % STEPS_PER_SECOND === 0) out.push(hashState(s)); });
  return out;
}

/** One run in a process of its own, its hashes read back from its output. */
function runElsewhere(): Promise<string[]> {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url), '--run'], { stdio: ['ignore', 'pipe', 'inherit'] });
    let text = '';
    child.stdout.on('data', (d) => { text += d; });
    child.on('close', (code) => (code === 0 ? done(JSON.parse(text) as string[]) : fail(new Error(`a run exited with ${code}`))));
  });
}

/** Here: five minutes, the state through bytes and back, then five more from the decoded copy. */
function runWithBreak(): string[] {
  const out: string[] = [];
  const half = replay(duel(SEED), script, TICKS / 2, (s) => { if (s.tick % STEPS_PER_SECOND === 0) out.push(hashState(s)); });
  return run(decodeState(encodeState(half)), out);
}

if (process.argv.includes('--run')) {
  process.stdout.write(JSON.stringify(run(duel(SEED))));
} else {
  const t0 = performance.now();
  const [a, b] = await Promise.all([runElsewhere(), runElsewhere()]);
  const c = runWithBreak();
  const seconds = MINUTES * 60;
  const problems: string[] = [];
  for (const [name, h] of [['second process', b], ['run through bytes at 5 min', c]] as const) {
    if (h.length !== seconds) problems.push(`${name}: ${h.length} hashes, not ${seconds}`);
    const at = h.findIndex((x, i) => x !== a[i]);
    if (at >= 0) problems.push(`${name}: parts from the first at ${at + 1} s (${a[at]} against ${h[at]})`);
  }
  if (a.length !== seconds) problems.push(`first process: ${a.length} hashes, not ${seconds}`);
  if (new Set(a).size !== seconds) problems.push('the state did not change every second');
  console.log(`replay: ${MINUTES} simulated minutes, 2 ships, ${script.length} orders, force 8; final hash ${a.at(-1)}; ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  for (const p of problems) console.log(`MISMATCH: ${p}`);
  process.exit(problems.length ? 1 : 0);
}
