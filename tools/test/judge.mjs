/** The time budgets of `npm test`, judged from each test's time and the whole run's (tools/test/budgets.json). Pure. */

/**
 * `tests`: { file, name, seconds }[]; `wall`: the whole run, seconds. Returns the lines to print and whether the
 * run is over a budget: a file past its limit, or the suite past its own (one test's limit is the runner's
 * `--test-timeout`, which stops and fails the test itself).
 */
export function judge(tests, wall, budgets) {
  const lines = [], failures = [], warnings = [];
  const perFile = new Map();
  for (const t of tests) perFile.set(t.file, (perFile.get(t.file) ?? 0) + t.seconds);
  const slowest = [...tests].sort((a, b) => b.seconds - a.seconds).slice(0, 5);
  lines.push('slowest tests:');
  for (const t of slowest) lines.push(`  ${t.seconds.toFixed(2)} s  ${t.file}: ${t.name}`);
  for (const [file, s] of [...perFile].sort((a, b) => b[1] - a[1])) {
    if (s > budgets.file) failures.push(`${file} took ${s.toFixed(1)} s, past the ${budgets.file} s a test file may take`);
  }
  if (wall > budgets.suiteFail) failures.push(`the suite took ${wall.toFixed(1)} s, past its ${budgets.suiteFail} s budget`);
  else if (wall > budgets.suiteWarn) warnings.push(`the suite took ${wall.toFixed(1)} s, past its ${budgets.suiteWarn} s warning (it fails at ${budgets.suiteFail} s)`);
  lines.push(`suite: ${wall.toFixed(1)} s of ${budgets.suiteFail} s (warns at ${budgets.suiteWarn} s); one test may take ${budgets.test} s, one file ${budgets.file} s`);
  return { lines, failures, warnings };
}
