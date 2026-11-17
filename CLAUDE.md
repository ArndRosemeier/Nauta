# Working on Nauta

1. **Design first:** read [docs/design/nauta-plan.md](docs/design/nauta-plan.md) before larger changes. Its fixed rules: the player commands and never steers; the view is on board; being there comes first; fun before realism.
2. **Build in plan order:** the plan's build order (N0 to N7) says what comes next and when a step is done. Every commit or PR description has a `PLAN:` line (`PLAN: N1 sea`, `PLAN: fix`).
3. **Tablets from the start** (Arnd 2026-11-17): the reference machine is an iPad Air M4 in Safari, as a web app. Touch is designed first, keys and mouse come on top. One code path with quality levels, never a second one for desktop. A step is not done until it runs smoothly on the tablet.
4. **Shaders follow [docs/SHADERS.md](docs/SHADERS.md):** every material is a kind in `src/render/materials.ts`, compiled behind the loading screen; nothing compiles on the render path; things enter the scene through `stage.add`.
5. **Layers** are in `tools/guards/rules.json`: `src/sim` (the simulation: sea heights, ships, crew, guns, damage) is pure, with no three.js and no DOM, so it runs in tests, in workers and on the multiplayer host alike. `src/render` draws, `src/app` joins them.
6. **No `Math.random`.** Every random number comes from a seed (`@futuremagic/core` `Rng`, `deriveSeed`): every player's machine must compute the same sea and the same fight.
7. **Tests follow [docs/CHECKS.md](docs/CHECKS.md)** (budgets in `tools/test/budgets.json`, enforced by `npm test` itself): at most 2 s per test, 5 s per test file, 30 s for all of `npm test`. Browser and other slow checks are separate scripts, at most 3 min each. Raising a limit needs Arnd's OK.
8. **No duplicates:** search before writing a helper. `npm test` holds the duplication ratchet (`tools/guards/duplication.mjs`): a copied function body always fails; other findings need an entry with a reason in `tools/guards/duplication-baseline.json`. Every commit or PR description has a `COPIES:` line.
9. **Shared code comes from packages:** `@futuremagic/*` from the AssetGenerator submodule (`vendor/assetgenerator`, clone with `--recurse-submodules`), characters from Actors. Do not copy their code, and do not copy MasterWorld's: what both games need moves into a shared package.
10. **Show, don't tell** (Arnd): if an action can be rendered, render it. The crew is seen doing what was ordered. Crew speech is speech bubbles, never voices; all other sound is real sound.
11. **Git** (Arnd 2026-11-17): Claude does all Git work and pushes to `main` itself. Pushes to `main` deploy the game to https://arndrosemeier.github.io/Nauta/.

Checks: `npm test` (unit tests and guards), `npm run build` (typecheck and bundle), `npm run shot -- "?gl&hud" shots/x.png` (headless screenshot after a build; `SHOT_SIZE=1180x820 SHOT_DRAG=-300,120` for a tablet view with a finger drag). In the cloud container set `CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome` and use `?gl`.
