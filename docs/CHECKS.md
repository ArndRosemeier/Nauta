# Checks

Tests are only useful if they run all the time, so they stay fast.

| Limit | Value | How it is kept |
|---|---|---|
| One test | **5 s** | `--test-timeout=5000` in `npm test`. A test that needs more gets a smaller fixture or becomes a slow check. |
| The whole of `npm test` | **70 s** | CI stops it at 70 s. No browsers, no network, no big worlds in `npm test`. |
| A slow check (browser, screenshots, long simulation) | **5 min** each | Its own script, never inside `npm test`. |

`npm test` runs `test/**/*.test.ts` (through tsx) and the tools' own tests with Node's test runner. It includes the guards (`tools/guards`, rules in `rules.json`): the pure layers import no renderer, and nothing calls `Math.random`.

Tests use seeds, fake clocks and small fixtures, never wall-clock waits.

Slow checks today: `npm run shot` (headless screenshots of the built game, see its header for the switches).

Duplication: `npm run dup` (functions sharing a name across files) and `npm run repeated` (repeated code) list candidates for a human to judge.
