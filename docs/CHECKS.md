# Checks

Tests are only useful if they run all the time, so they stay fast, and the limits are enforced by the tools, not by good intentions (Arnd 2026-11-17: "I often had test suites run out of control").

## Time budgets

The numbers live in `tools/test/budgets.json`. **Raising one needs Arnd's OK**, written next to the number here with his name and the date.

| Limit | Value | What happens |
|---|---|---|
| One test | **2 s** | The run fails, naming the test. |
| One test file | **5 s** (its tests added up) | The runner stops the file there (`--test-timeout`) and the run fails, naming the file. A test that hangs is stopped with its file. |
| The whole of `npm test` | warns at **20 s**, fails at **30 s** | The run fails, on a desk as in CI. |
| A slow check (browser, screenshots, a long simulated fight) | warns at **2 min**, fails at **3 min** each | `tools/guards/budget.mjs` around the step in CI. |
| All slow checks together | **10 min** | The CI job's own limit. |

`npm test` is `node tools/test/run.mjs`: every `test/**/*.test.ts` (through tsx) and `tools/**/*.test.mjs` under Node's test runner. After each run it prints the five slowest tests and the suite's time against its budget, so creep shows long before a limit is hit. `npm test -- test/look.test.ts` runs the files given.

What keeps tests fast:

- No browser, no network, no big simulation in `npm test`. Those are slow checks.
- Seeds, fake clocks and small fixtures, never wall-clock waits.
- A fixture several files need is built once and frozen, not once per test.
- A test that outgrows 2 s gets a smaller fixture or is split. It does not get a longer limit.

### Timing tests

A test never asserts bare milliseconds: a CI runner is slower than the tablet and shares its cores with the other test files, so such a test fails by chance and gets flakier as the suite grows. A test that guards a cost uses `pace(work, pairs)` from `test/support/pace.ts`: the work's time as a share of a reference loop of plain sines and cosines, measured in the same rounds on the same machine. The limit is then a ratio that holds on any machine. The milliseconds themselves (a sea sample, a simulation step, a frame) are measured where they count, on the tablet, by `?bench`.

## Slow checks

Each is its own script, run in CI on pushes to `main` (the `Slow checks` job) and by hand, never inside `npm test`.

- `npm run shot -- "<query>" out.png`: the built game in headless Chromium (see the script's header for its switches). CI takes a desktop view and a tablet view with a finger drag, and fails if the page reports an error or never gets ready.

## Guards

Part of `npm test` (`test/guards.test.ts`); `npm run guards` prints them alone.

- **Layers** (`tools/guards/rules.json`): the pure layers (`src/sim`, and the pure files of `src/app`) import no three.js and nothing from `src/render`.
- **No `Math.random`** anywhere under `src`.
- **Change-friendly rules** (`tools/guards/discipline.mjs`, [ARCHITECTURE.md](ARCHITECTURE.md)): no bare number under `src` (only 0, 1, 2 and indexes; everything else is a named top-level constant); a field of the game's state is assigned only in its owner file (`owners` in `rules.json`); every row of [SEAMS.md](SEAMS.md) points at an export that exists.
- **Duplication ratchet** (`tools/guards/duplication.mjs`), on every run:
  - A copied function body (two functions alike enough to be one) is **never allowed**. Keep one and call it from both places.
  - A repeated idiom (the same few lines in three files or more) or two alike functions of one name must be listed in `tools/guards/duplication-baseline.json` with a reason: a false alarm says why it is one, a real copy needs Arnd's OK. `npm run guards -- --keys` prints the entries to fill in.
  - A listed entry that is no longer found fails as stale, so the list only ever shrinks to what is true.

`npm run dup` and `npm run repeated` (the Toolbox finders behind the ratchet) write full reports to `reports/` for a closer look, including weaker candidates the ratchet does not fail on.
