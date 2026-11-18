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

- `npm run check:shots [-- <out dir>]`: the browser check of CI, the built game in headless Chromium on **one page load** (tools/shot/check.mjs): the desktop view as it starts (1280 × 800, with the HUD), then 6 of the standard sea shots from her quarterdeck, every time of day and every sea once (`CI_SHOTS` in the script; see `shot:sea`), and their sheet, then the view changed to a tablet in landscape (1180 × 820) and a finger dragged across it. The tablet comes last because the drag is a press and starts the sound, whose decoding takes the CPU the software GPU draws with (a picture's frames took half as long again after it). The page is opened at `quality=high`, the sea shots' quality. It fails if the page throws or never gets ready (then at once, after a picture of what is there; CI sets `SHOT_TIMEOUT` so that happens inside the step's 3 minutes). It draws with WebGPU on the software GPU (SwiftShader): that GPU computes and renders but cannot present to a canvas (the device is lost on the first frame), so the browser scripts inject a stand-in swap chain (`tools/shot/swapchain.js`) that renders into a plain texture, paints the last frame into the canvas for the picture, and paces the page's frames to the GPU as a real swap chain does (without that the page queues 60 frames a second while the software GPU draws one or two, and a picture taken later waits minutes for them). `SHOT_GPU=1` uses the machine's own GPU and presents normally. Software frames are slow (seconds at 1280 × 800), so their times say nothing about the tablet. CI runs it in Playwright's own Chromium (installed and cached in the job), not the runner's Chrome: with the runner's Chrome the page took 98 s to get ready, with Playwright's Chromium 59 s, and the whole check 131 s (2026-11-18: desktop at 73 s, six sea shots by 121 s, the tablet at 130 s), past its 2 minute warning. In the cloud container it takes about 90 s, ready after 14 s. CI keeps the pictures as the run's `shots` artifact.
- `npm run shot -- "<query>" out.png`: the built game at any address, a page load per picture, for looking by hand (see the script's header for its switches: SHOT_SIZE, SHOT_DRAG, SHOT_WAIT).
- `npm run check:replay` (N3.1): ten simulated minutes of a duel in the strongest wind, two brigs under a seeded script of orders, run in two processes side by side and once more with the state sent through bytes and back at five minutes; fails unless all three have the same hash at every simulated second. About 6 s (two runs of two ships for ten minutes are more than a test file's 5 s).
- `npm run check:sailing` (N3.3): the brig sailed through whole matches (sea, gusty wind, sailing and floating) in every wind from force 2 to the gale, under battle and plain sail: prints her speed close-hauled, on the beam, on the quarter and before the wind, her steadiest heel, how long a tack from a beam reach takes (from the helm put over) and how long heaving to takes her way off (N3.4); fails if a state stops being a number, a steady heel passes `HEEL_LIMIT`, a tack from force 3 up takes a minute or more, heaving to from force 3 up has not taken her way off in five minutes, or the fresh breeze's speeds stray from the table (rules/sailing.ts) by more than one and a half times the test's tolerance. About 30 s.
- `npm run check:gunnery` (N5.2): two brigs lying broadside on in a force 4 sea at 100, 200 and 400 m, five seeded runs of two minutes at each; one's starboard battery, full-crewed, loads round shot, lays on the other's hull and fires as they bear, and each ball's path is traced through her side (a stand-in for N6.1's hits). Prints the share that strike her and how far chain and grape carry; fails if a share strays more than 0.1 from the design's (3 in 4, half, 1 in 5), or if the check did not do what it names: fewer than 60 shots at a range, her roll swinging less than 2°, a path or pose not a number. About 11 s.
- `npm run shot:sea [-- <out dir> [words...]]`: the standard sea shots (plan N1.9), dawn, noon, dusk and a moonlit night × calm, breeze and gale × eye at 4.5 m (her quarterdeck) and 30 m (her masthead), looking into the sun or moon, at quality `high`, with the clocks stopped so the same waves come back every run; and `sheet.png` with all 24 on one page. One page sets each scene in turn (`window.__nautaScene`), so the shaders are built once. The whole set is for looking and runs by hand; CI takes 6 from the quarterdeck inside `check:shots`. Drawn at 800 × 500 (SHOT_SIZE sets another size). Words pick a part of the set (`npm run shot:sea -- shots/sea noon gale`).

**A slow check proves it did what its name says** (2026-11-18). The walk check once stopped walking in its heavy sea without failing: a changed argument made the ship's pose not a number, and every comparison with it passed. So a check asserts its own conditions before its result counts: the sea was as rough as named (she rolled at least so far), the ship moved, the walker covered every space, no state stopped being a number. A check that cannot fail is worse than none. `tools/` is type-checked with the rest (`npm run build`), so a changed signature is found there too.

**Keeping the browser checks inside their budget** (design thread, 2026-11-18). On CI's software GPU nearly all of a browser check's time is the page's load and warm-up (about 60 s in Playwright's Chromium, 100 s in the runner's Chrome, and growing with every material kind), not the pictures. So:

- **One page load serves every picture it can.** The start shots (desktop, and the tablet view with its drag) and the sea shots are one check on one loaded page, which changes the view's size and the scene (`window.__nautaScene`) between pictures. A new picture joins an existing check's page; it does not load its own.
- **CI takes the part of a set that guards something**, the whole set is for looking and runs by hand: of the 24 sea shots CI takes 6 from the quarterdeck, every time of day and every sea once. (The 12 from the quarterdeck did not fit: on CI a scene costs about 6 s, most of it the fine sea's compute rather than the pixels, so the 12, the start shots and the load came to 220 s.)
- **A check past its 2 minute warning is cut back before anything is added to it.** A second page load (the ship's shots, a fight) is a second check with its own 3 minutes, and all slow checks together still fit the job's 10 minutes; the job prints their sum against that (its last step, `budget.mjs --sum 600`: every step `budget.mjs` timed adds itself to `BUDGET_LOG`; it warns past two thirds, as a step does).
- None of this changes a limit.

Real frame times are measured on the tablet, not in a check: open the game with `?bench` (`?bench=30` for a shorter flight). It flies a fixed path for 60 s (a brig's waist up to her masthead and down, turning round twice) and shows the frame time's median, 95th and 99th percentile and worst, the share of frames on time (none missed the display's refresh: at most 1.5 × 16.7 ms), the frames over 33 ms, the page's own work per frame, GPU memory as three.js counts it and the script heap where the browser tells it (Safari does not). It sets the scene like any page: `?bench&sea=gale&hour=17.7`; with `?slice` it measures her slice from the standpoint, without the flight.

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
