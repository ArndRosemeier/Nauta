# Nauta: implementation plan

What is built, in which order, and when each piece is done. The design is in [nauta-plan.md](nauta-plan.md); this file turns its build order (N0 to N7) into milestones and work packages that a coding thread can pick up one at a time.

Written 2026-11-17 by the design thread. Arnd decides at the gates; design questions go to the design thread.

## How work is done

**Roles.** The design thread owns this plan and the design. Coding threads build work packages. Arnd judges each milestone at its gate, on the iPad.

**A coding thread takes one work package** (`N1.3`), named in its first message. Before writing code it reads [CLAUDE.md](../../CLAUDE.md), [nauta-plan.md](nauta-plan.md), [ARCHITECTURE.md](../ARCHITECTURE.md), [SEAMS.md](../SEAMS.md) and the package below with everything it depends on.

**Each package lands like this:**

1. Work on a branch. Keep `npm test` and `npm run build` green.
2. Add the package's tests, its rows in SEAMS.md, its owners in `tools/guards/rules.json`, its numbers as named constants or rule tables, and its what's-new note `whatsnew/N1.3-<what>.txt` ([whatsnew/README.md](../../whatsnew/README.md)): what Arnd can now see or do on the iPad, in plain words, with no version number.
3. Take the package's screenshots or run its check, and look at them.
4. Open a pull request with `PLAN: N1.3` and a `COPIES:` line, and squash-merge it into `main` once CI is green (one commit is one build, one version). No review by Arnd is needed for a package. `main` deploys to https://arndrosemeier.github.io/Nauta/.
5. In the same pull request, set the package's status in this file to `done` and note anything the next package must know under "Notes" of its milestone.

**Stop and ask the design thread** (through Arnd) when a package needs a decision this plan does not make, when "done when" cannot be met as written, or when the work wants to change a fixed rule, a budget or another package's seam. Do not decide design in a coding thread.

**Status values:** `open`, `in work` (with the thread's name), `done`, `blocked` (with the reason).

**A milestone is finished at its gate:** Arnd opens the deployed page on the iPad Air M4 and judges the gate's list. Until he says yes, the milestone stays open and the next one's packages that depend on it wait.

## Budgets

These hold from N1 on. They are proposals until Arnd confirms them at gate G1; after that, changing one needs his OK.

| Budget | Value on the reference tablet (iPad Air M4, Safari) |
| --- | --- |
| Frame rate | 60 frames a second, steady: 95 of 100 frames within 16.7 ms, none over 33 ms in a 5 minute fight |
| Sea, all of it | at most 4 ms of a frame |
| Crew, all of it (animation and drawing, 2 ships) | at most 4 ms of a frame |
| Both ships drawn (hull, fittings, rigging, sails, damage, her shadow map) | at most 3 ms of a frame; at most 250 draw calls and 1.5 million triangles |
| Powder smoke at its worst | at most 2 ms of a frame |
| Sky, light, the grade and the interface | at most 2 ms of a frame |
| Ship memory (geometry, textures, damage maps) | at most 250 MB of the page's 1.2 GB |
| Ship download (models and textures, both navies) | at most 20 MB of the duel's 60 MB |
| Building her at load, in a worker | at most 3 s of the 15 s from tap to deck |
| Shader compile on the render path | none (docs/SHADERS.md) |
| Page memory | at most 1.2 GB |
| First load (download before the title shows) | at most 15 MB; everything for a duel at most 60 MB |
| Time from tap to standing on deck | at most 15 s on a good connection |
| Simulation step | fixed, 30 a second; one step of a full duel at most 2 ms on the tablet |
| Network | host sends at most 20 states a second, each at most 16 KB |

**The frame's shares fit together at the worst moment** (design thread, 2026-11-17, after the ship design's warning that sea 5, crew 5, ship 3 and smoke 3 ms left nothing for the rest). A broadside in smoke with both crews in sight is sea 4 + crew 4 + ships 3 + smoke 2 + sky, light and interface 2 = 15 ms, which leaves 1.7 ms spare in the 16.7 ms frame. How each share is kept: the sea's compute costs next to nothing on the iPad (the probe), so its 4 ms is shading, and the part of the sea hidden behind the ship and the smoke is not shaded; men below deck are drawn only through openings (the ship's rooms and openings, N2.4), and distant and hidden men animate at a lower rate (N4.0 fixes the rates); smoke is drawn at half resolution and joined to the frame by depth; and one render scale, a quality setting, is the first knob when a frame runs long. No share may borrow from another: a package that cannot keep its share comes to the design thread.

`?bench` (package N1.9) measures the frame and memory budgets on the device itself and shows the result on screen, since the tablet has no developer tools at hand.

## Cross-cutting rules for every package

- **The simulation is the game.** Everything that decides anything lives in `src/sim`, pure and seeded, stepped at a fixed rate. The renderer and the sound only show state and events.
- **One state, serialisable.** The whole match is one plain data value (`SimState`) that can be sent, saved and compared. No simulation state hides in a closure or a class instance elsewhere.
- **Events for what happens in an instant** (a gun fires, a spar parts, a man falls): the simulation emits them, drawing and sound consume them. A package that adds something audible or visible adds its event, never a callback into the renderer.
- **Rules as data** in `src/sim/rules/` (one file per subject). A package that needs a tuning number adds it there, with unit and source.
- **Quality levels** come from one place (`src/app/quality.ts`, N1.8). A package that costs frame time adds its knob there; it never checks for "tablet" itself.
- **Sound with the feature.** Each package lists its sounds; they are made through `@futuremagic/audio`'s tool and OpenRouter into `sounds.json`, several seeded takes each. No voices.
- **Touch first.** Every interaction a package adds works with a finger before it gets a key.
- **Shared code moves, it is not copied.** Code that MasterWorld already has and Nauta needs is moved into a shared package by a pull request in AssetGenerator, then both games use it.

---

## N0 Keel

A sky on a page that deploys, with the rules that keep the code healthy.

| Package | What | Done when | Status |
| --- | --- | --- | --- |
| N0.1 | Repository skeleton, shared packages, renderer, sky, drag look, web app manifest | The sky renders through the day; a drag turns the look | done |
| N0.2 | Tests with time budgets, layer guards, duplication ratchet, slow-checks job | `npm test` enforces 2 s / 5 s / 30 s; CI green | done |
| N0.3 | Change-friendly guards: named numbers, state owners, seam index | The three checks run in `npm test` | done |
| N0.4 | Public page | GitHub Pages is switched on (Arnd: Settings, Pages, Source "GitHub Actions") and the Pages run is green | done |
| N0.5 | Device probe: `?probe` shows on screen what the browser offers (WebGPU or WebGL 2, adapter limits, a small compute pass run and timed, float texture filtering, storage textures, max texture size, device memory, screen size and refresh) | The probe's result from the iPad is copied into "Notes" below | done |

**Gate G0 (Arnd, on the iPad):** the page opens in Safari; the corner shows `webgpu`; dragging a finger looks around smoothly; "Add to Home Screen" gives a full-screen app in landscape; the probe's report is sent to the design thread.

**Notes:** WebGL 2 stays as a fallback only until N1.2 lands, which removes it. Until then headless checks in the cloud use `?gl`.

**The iPad's probe result (Arnd, 2026-11-17, iPad Air M4, Safari 26.5, version 0.002).** WebGPU yes, drawn with it, finger look works. Float32 filtering yes; `shader-f16` and `timestamp-query` yes. Storage textures rgba16float, rgba32float, r32float, rg32float and rgba8unorm yes (bgra8unorm no); `read_write` r32float yes. Compute: a wave pass of 16 waves a texel takes 0.10 ms at 256² and 0.15 ms at 512²; a chain of 16 passes over 256² complex values (one FFT's shape) takes 0.125 ms. Safari rounds its clock, so read these as "well under a quarter of a millisecond each", not to the digit. Limits are far above anything planned (textures to 16384, 44 storage textures a stage). Screen 2048 × 2732 px at 2×, 58.8 Hz measured, wide colour and HDR. 8 CPU threads; not cross-origin isolated, so no shared-memory threads. Safari reports itself as a Mac, so never tell tablet from desktop by the user agent: use touch points and measured frame time (N1.8). "Add to Home Screen" gives a full-screen app (Arnd, 2026-11-17). **Gate G0 is passed.**

**The probe (N0.5).** Open https://arndrosemeier.github.io/Nauta/?probe in Safari on the iPad, wait a few seconds, tap "Copy report" and paste it into the design thread. The summary at the top holds what N1.2 needs: WebGPU yes or no and the adapter, float32 filtering, the storage texture formats and whether `read_write` works, the time of one wave pass (16 waves a texel at 256² and 512²) and of one FFT-shaped chain (16 compute passes over 256² complex values), the key limits, the screen and its refresh rate. The full report below it lists every feature, limit and WebGL 2 extension. The probe's code is in `src/probe/` and loads only with `?probe`. Times are wall time from submit to "work done", the median of 5 rounds, so they include each submit's overhead: read them as upper bounds. Safari does not tell the device memory; the JS heap limit is Chrome's only. Headless SwiftShader (cloud, 2026-11-17, a software GPU, only to show the probe works): WebGPU yes, compute result checked against the CPU ok, wave pass 6.4 ms at 256² and 24 ms at 512², FFT-shaped chain 12.5 ms.

---

## N1 The sea

The new ocean: better than MasterWorld's from deck height, in calm, breeze and gale, within its 4 ms on the tablet. Everything later floats on it, so it is built with the most care.

**The design in one paragraph.** The sea is one function of seed, wind and time. Its long waves (those a hull feels) are a seeded set of wave components computed in `src/sim` on the CPU, the same on every machine. The renderer displaces the surface by exactly these components, so a hull sits in the water it is drawn in. Shorter waves, ripples, foam and light are added by the renderer on top and never affect the simulation.

| Package | What | Done when | Needs | Status |
| --- | --- | --- | --- | --- |
| N1.1 | **Sea state (pure).** `src/sim/sea/`: a wind-driven spectrum with directional spread, sampled into a seeded set of wave components (direction, length, amplitude, phase; deep-water speed). `seaAt(state, x, z, t)` gives height, surface normal, horizontal shift and water velocity. Presets by Beaufort force in `src/sim/rules/sea.ts`. | Tests: same seed and wind give the same sea; mean height is zero; significant wave height matches the preset within 10 %; no visible repeat within 2 km (autocorrelation test); 1000 samples take under 1 ms; a change of wind blends over minutes without a jump. | | done |
| N1.2 | **The fine sea, on the GPU.** Decided 2026-11-17 from the iPad's probe (no trial needed): the short waves below the simulated set's `shortest` wavelength come from the same spectrum, computed each frame in WebGPU compute passes as bands of different size (three bands of 256² by default; the quality knob is two to four bands of 128² to 512²). Each band gives displacement, slopes and how much the surface folds (for foam) as textures the sea material reads. Seeded like the rest, though it never touches the simulation. With it WebGPU becomes required: the renderer asks for `webgpu` only, a browser without it gets a plain page saying what is needed, and the headless checks (`npm run shot`, CI) run WebGPU on the software GPU instead of `?gl`. | The bands' whole cost on the iPad is under 1 ms by `?bench`; no tile repeat is visible from deck height to the horizon; where the simulated waves end and the fine ones begin cannot be seen; the WebGL 2 fallback and `?gl` are gone and CI's browser check passes on WebGPU. | N1.1, N1.3 | open |
| N1.3 | **Sea surface mesh.** A grid that follows the camera out to the horizon, dense near and coarse far, snapped so vertices do not swim, displaced by N1.1's components in the vertex stage, closing cleanly into the sky's haze at the horizon. | From 3 m to 30 m eye height: no cracks, no popping, no swimming when the camera moves or turns; the horizon is a clean line. Shots at three heights. | N1.1 | done |
| N1.4 | **Sea material.** Reflection of the real sky, sun and moon glitter, the colour of deep water by sun height and weather, light through thin crests, foam where the surface folds (lingering and fading), fine normal detail that does not tile visibly, distance haze. A proper view from under water. | Standard shots (N1.9) at dawn, noon, dusk, moonlit night, each in calm, breeze and gale, look right to Arnd next to MasterWorld's sea. | N1.3, N1.5 | open |
| N1.5 | **The light rig, shared.** MasterWorld's lighting (`src/render/sky.ts`: the rig for physical albedos, the sky as fill through the environment map, the brighter sky under a low sun, eye adaptation, cloud shadows, the grade over the day) moves into `@futuremagic/sky` as one rig both games use. MasterWorld switches to it in the same step. Nauta's `defineKind` moves into `@futuremagic/stage` likewise. | MasterWorld's standard shots are unchanged after the switch; Nauta lights a test object with the shared rig; neither game holds a copy. | | done |
| N1.6 | **Wind (pure).** `src/sim/wind.ts`: true wind direction and speed over the fight, slow veering and seeded gusts as moving patches; `windAt(state, x, z, t)`. The sea's driving wind and the sails' wind are this one. Gusts show on the water as darker ruffled patches (N1.4 reads them). | Tests: seeded and repeatable; mean speed and direction match the preset; gust strength and spacing within the table's range. | | done |
| N1.7 | **Sound of sea and wind.** Ambience beds for sea state and wind strength that crossfade with the weather, placed swell and slap sounds near the viewer, sound starting on the first tap (Safari's rule). | On the iPad the sound starts with the first touch and follows calm, breeze and gale without a seam or an audible loop within 3 minutes. | N1.1, N1.6 | open |
| N1.8 | **Quality levels.** `src/app/quality.ts`: the one place for every cost knob (resolution scale, sea grid density, fine-sea bands, foam detail), with presets and a choice made from measured frame time in the first seconds. | The tablet and a desktop each land on a level that holds 60 frames a second; the level and its reason show in the HUD. | N1.3 | open |
| N1.9 | **Looking and measuring.** `npm run shot:sea` takes the standard sea shots (times of day × weather × eye heights). `?bench` flies a fixed path for 60 s and shows frame time percentiles, the worst frame and memory on screen. `?sea=calm`, `?wind=`, `?hour=` set the scene. | The shot set runs within its 3 minutes; the bench result on the iPad can be read off the screen and is noted here. | N1.3 | open |
| N1.10 | **The swell from elsewhere (pure).** Every sea carries a long, low swell that does not come from the local wind: two or three wave components about 0.6 m high in all with periods of 9 to 12 s, from a seeded direction at least 40° off the wind, the same in every preset, added to the wave set in `src/sim/sea/` and tuned in `src/sim/rules/sea.ts`. So a calm is glassy on top and still breathes, and in a breeze the wind sea crosses an older one. | Tests: force 0 has the swell's height and nothing shorter; in every preset the significant height rises by no more than the swell's share; seeded direction and phase; the 1000-sample budget still holds. | N1.1 | done |

**Order:** N1.1, N1.5 and N1.6 can start at once, side by side. N1.3 follows N1.1. N1.4, N1.8 and N1.9 follow N1.3. N1.7 any time after N1.1 and N1.6. N1.2 follows N1.3 and can run beside N1.4.

**Notes:** N1.5 (light rig): the light is `SkyRig` from `@futuremagic/sky/rig`, MasterWorld's own rig moved there unchanged; its numbers (gain for physical albedos, `lowSunSky`, `adaptedSun`, `skyFill`, `eyeAdapt`, `ENV_SATURATION`) are pure in `@futuremagic/sky` (light.ts). Nauta's `SkyView` (render/skyView.ts) extends it with its settings and the clock; view.ts makes the sun and hemisphere lights before the warm-up. For N1.4: the sky's environment map is `sky.envTexture` (the env copy is drawn at `ENV_SATURATION` of its colour; a mirror puts it back with `fullSky`), the sun's light as it falls is `sky.sunColor` and `sky.lightDirection`, the day's light `sky.light` (`SkyLight`); the scene's lights carry `sky.gain`. Light of Nauta's own (lanterns below deck, N2.4) goes in `SkyView.local`, which runs before the eye adapts; `sky.inside` (0..1) moves the grade to the day's key in a lamp-lit room. No shadows and no fog yet: MasterWorld's shadow box and aerial-perspective fog stay in MasterWorld until a Nauta package needs them (move, do not copy). Material kinds come from `@futuremagic/stage` `Kinds` (both games). `?rig` shows three matte test balls (sailcloth, oak, tar).

**Notes:** N1.6 (wind) is in `src/sim/wind.ts`, its tuning in `src/sim/rules/wind.ts` (forces 0 to 8) and the Beaufort scale in `src/sim/rules/beaufort.ts` (one table for wind and sea). A match's wind is `makeWind(seed, force, fromBearing)`, plain data. `meanWind(state, t)` is the wind without gusts (the sea's driver); `windAt(state, x, z, t)` adds the gusts (the sails'). Both give `{ speed, toward, x, z, from, gust }`: `toward` is the sea's angle (0 = +x, a quarter turn = +z), `from` a compass bearing (0 north = -z, clockwise, `units.ts#bearingDir`). The mean veers slowly, each swing taking 10 to 30 minutes, within the preset's limit (45° in calm down to 10° from force 6), and freshens a little; whether the sea follows the veer or keeps its start value is the sea's choice. For N1.4: `gustsNear(state, x, z, t, radius)` lists the patches (heart, radius, strength now, peak), and the shader draws each with `gustShape` (one at the heart, (1 - d²)² to the rim); patches drift with the mean wind. Gust, veer and freshen numbers are first proposals, to be tuned by eye at N1.4 and by feel at N3.3.

N1.1 (sea state) is in `src/sim/sea/`, its tuning in `src/sim/rules/sea.ts`. A sea is `startSea(seed, wind, t)`, plain data; call `followWind(sea, meanWind(windState, t), t)` every step and the sea takes a new wave set only when the mean wind has moved by 1.5 m/s or 15°, fading it in over 3 minutes (`changeWind` forces one). Each wave set is 25 Gerstner waves (`SEA_COMPONENTS`; with the swell's 3 the sea sums 28, and 32 missed the 1 ms on CI) from a JONSWAP spectrum (0.6 to 2.5 times the peak frequency) with a cos-2s spread, equal energy per wave, so the set's significant height is the preset's. For N1.3: `seaAt(sea, x, z, t)` is a calm point and where its water is now, exactly what the vertex stage must do: for each layer, factor `f` from `layerWeights(sea, t)`, and for each wave θ = kx·x + kz·z − omega·t + phase, height += f·amp·cos θ, shift −= f·reach·(kx, kz)·sin θ, plus f²·lift per layer (the lift keeps the mean level at zero under Gerstner's wide troughs). The renderer's short waves start below the set's `shortest` wavelength. For N2.2: `surfaceAt(sea, x, z, t)` is the water under a world point (Newton on the shift, about 1.2 µs each against 0.5 µs for `seaAt`), with normal and water velocity; `stretch` is below 1 on crests and never reaches 0 (the simulated sea does not fold; foam from folding is the short waves'). Sines and cosines in the hot loop are `trig.ts#sincos`, built from + and × only and without a branch, so they round alike on every engine and cost a third of Math.sin plus Math.cos; the wave set itself uses Math.exp and Math.cos once per set, which engines may round differently in the last bit, so machines should compare the host's state, not sea samples. Answered by the design thread below (N1.10 adds a swell; heights are judged at N1.4).

N1.10 (the swell) is in `src/sim/sea/swell.ts`, its tuning (`SWELL_*`) in `src/sim/rules/sea.ts`. Every sea carries `seaSwell`, one more wave set beside its layers: 3 waves of 9 to 12 s, 0.6 m significant height together, drawn once by `startSea` from the sea's seed and the starting wind's direction (every wave at least 40° off it, within 8° of the swell's own direction), never changed by `changeWind` or `followWind`, the same at every force. For N1.3: `seaAt` adds the swell first at factor 1 (no fade), with its own `lift` (f² = 1), then the layers as before; so the vertex stage sums `seaSwell` plus each layer by `layerWeights`. The swell's waves are 125 to 225 m long, so on a small patch of sea it shows as the whole surface rising and falling slowly. The wind set's `shortest` still marks where the renderer's short waves begin. The wind sets' fold limit stays 0.7; the swell takes what two crossfading sets leave below 1 (`SWELL_FOLD_LIMIT`, about 0.01), which holds its choppiness near 0.7 to 0.8. A preset's height becomes √(preset² + 0.6²): a calm 0.6 m, force 3 0.85 m, force 6 3.06 m.

N1.3 (the sea's surface mesh) is in `src/render/`: `seaGrid.ts` lays the sea out as a quadtree of square tiles around the eye (CDLOD's layout), every tile one shared grid of 16 × 16 cells, level k being 4 m × 2^k wide on a fixed lattice of its own size (so vertices never swim), 0.25 m cells under the eye, drawn out to 1.25 times the horizon's distance plus 500 m. A level reaches 5 tile sides from the eye; in its last fifth its vertices slide onto the next coarser grid (`seaMorph`, mirrored in the vertex stage), so levels meet without cracks and tiles split or join without a pop (test/seaGrid.test.ts checks both). `seaWaves.ts` hands the vertex stage `seaAt`'s waves as one weighted list with each phase worked out in double precision near the eye (`forEachShownSet` in `sea.ts` is the one place that lists the sets showing), so the drawn surface is `seaAt`'s to a millimetre 60 km out and hours into a match. A wave is drawn fully where it spans 6 cells of the grid and fades out by 3 (`SEA_WAVE_FULL_CELLS`, `SEA_WAVE_GONE_CELLS`): far waves fade into a flat sea instead of flickering, and near the eye waves shorter than about 1.5 m are left to the fine sea (N1.2), which at forces 1 and 2 includes the simulated set's shortest waves. The earth's curve (`earth.ts#earthDrop`) bends the drawn sea down around the eye, so the horizon is a true one (3.57 √h km off) and a clean line. For N1.4: `seaMaterial.ts` has a plain stand-in look (sky colour by Fresnel, a sun glint, a dark body, haze toward the horizon's colour, all from `SkyView.light`) to replace; the vertex stage passes the surface normal (`vSeaNormal`) and the vector to the eye (`vSeaToEye`), and the glint shows the grid's facets where it is sharp, so N1.4's normals should come per pixel. For N1.8: the knobs are `SEA_TILE_CELLS`, `SEA_FINEST_CELL` and `SEA_LOD_RANGE` in `seaGrid.ts`; at the defaults the camera sees 200 to 330 tiles of 289 vertices, each summing the 28 waves (53 during a change of wind). For N2.5 and N3.8: everything drawn far off must sink by `earthDrop` like the sea, or it floats; the sea's mesh has its own origin, stepping by 1024 m with the eye. `?eye=` (metres, 0.5 to 200) and `?wind=` (Beaufort force 0 to 8) now set the scene (`src/app/params.ts`); N1.9 adds to them. Checked headless with WebGL 2 (`?gl`) at 3 m, 10 m and 30 m, looking level, down and across, in a breeze and a gale; on WebGPU the sea's shader was compiled headless without a message, but no frame was drawn: the cloud's software WebGPU loses its device before the first frame, on `main` before this package too, so WebGPU was checked on Arnd's PC instead (Chrome, RTX 5070): 16.7 ms a frame (vsync) at 3, 4.5 and 30 m and in a gale, the shader built in the warm-up with no compile later, no holes below the horizon, and the horizon a clean line within one pixel row; the iPad look is still to come.

**Gate G1 (Arnd, on the iPad):** stand at deck height and look around in calm, breeze and gale, at noon, dusk and by moonlight. It beats MasterWorld's sea side by side. `?bench` shows the budgets met. The sound belongs to the picture. The budgets table above is confirmed or changed.

**Design decisions for N1 (design thread, 2026-11-17; Arnd may overrule at G1):** a flat calm keeps a swell from elsewhere (N1.10), because a mirror-still sea looks dead and a ship should always breathe under your feet. A duel is fought in force 2 to 6: below that the ships do not move, above it the guns cannot be worked; force 0 and the gale exist for looking at the sea. Wave heights and periods stay at the open-sea values until they are judged by eye at N1.4, then the rule table is tuned once, there.

**Open design questions for N1 (design thread):** the Beaufort presets a duel may have (calm to near gale: a full gale makes gunnery impossible and may be for later); whether weather changes during a match.

---

## N2 A ship afloat

A brig rides the swell and you can roam every deck of her. The ship herself is designed in [ship.md](ship.md) (agreed with Arnd, 2026-11-17): a Cruizer-class brig-sloop, the same hull in two coats for the two navies, sixteen 32-pounder carronades and two long 6-pounders on one flush deck. A coding thread on an N2 package, or on N3.2, N3.6, N3.10 or N3.11, reads it first.

**The design in one paragraph.** The brig is built in code from a plan: a hull form, decks, bulkheads, ladders, hatches, gun ports, mast steps. The same plan gives the drawn ship, the walkable decks, the points the water pushes on, the places and ways of the crew and, later, the cells that damage breaks. So one description serves everything and the ship can be cut into anywhere.

| Package | What | Done when | Needs | Status |
| --- | --- | --- | --- | --- |
| N2.0 | **The slice.** Before the whole brig, one 6 m section of her waist built to the full quality wanted: deck and beams, the bulwark with two carronades in their ports, the main shrouds with deadeyes and channel, the pin rail with coiled lines, a hatch with its grating and the berth deck below it, a lantern, in the real sea under the real sky. It fixes the quality bar, the materials, the look of rope and the cost per metre of ship while a change is cheap. What it builds (material kinds, the rope kind, the carronade's spec) is kept; the section itself is replaced by the real ship. | Arnd, on the iPad: this is the quality he wants. Its frame time, draw calls, triangles and memory are noted here and, scaled to two whole ships, fit the ship's budgets. | N1.4, N1.5 | open |
| N2.1 | **Ship plan (pure).** `src/sim/ship/plan.ts` and `src/sim/rules/ships.ts`: the brig of [ship.md](ship.md) as data. The hull form from a table of offsets taken off the Cruizer draughts (about fifteen stations by eight heights, keel, stem and sternpost, the sheer of each deck). The levels: weather deck (flush, no quarterdeck step), berth deck, platforms, hold. Compartments and the openings between them (hatches, the companion, doors), bulkheads, ladders, gun ports, mast steps. The stations where orders are given, the crew's places (gun crews, pins, ladders, shrouds), and where every line is made fast (the lines themselves come with N3.2). The one walk graph: every surface a body can stand on and every way between them, with the body-size rules (headroom, widths of doors, hatches and gaps, the step of ladders) in `rules/ships.ts`. The hull and decks divided into numbered cells (planking panels, frames, deck panels) for later damage. | Tests: the hull is closed and symmetric; displacement at the design waterline matches her weight within 3 %; from the quarterdeck every surface of the plan is reachable by the graph with the captain's body; every surface meets the headroom and width rules; every door, hatch and ladder joins two surfaces; every gun port has a gun place behind it. Pictures for Arnd: the drawn plan (side, top, sections) and a map of the walk graph. | ship.md | open |
| N2.2 | **Floating (pure).** `src/sim/ship/motion.ts`: the hull as pressure points from the plan, pushed up by N1.1's water and down by her weight; heave, pitch and roll integrated at the fixed step; heading and speed given from outside for now. Owner of the ship's pose. | Tests: in calm she settles at her waterline; heeled 20° and let go she rights herself and the roll dies out; her roll period is in the table's range; ten simulated minutes in the strongest preset never blow up; two runs agree bit for bit. | N1.1, N2.1 | open |
| N2.3 | **Decks you walk on.** The walker that stands on a moving deck moves out of MasterWorld (`src/world/deck.ts`) into a shared package and is driven by the plan's walk graph: floors, rails, masts, ladders, hatches, doors, headroom below (where it is under his height the captain stoops and the view lowers with him). Every door opens and is seen swinging. Touch: left thumb walks, right thumb looks. Keys and mouse on top. Climbing ladders is seen (`@futuremagic/figure`). The rig above the deck comes with N3.11. | On the iPad you walk from the quarterdeck down to the hold and back with two thumbs while she rolls, never falling through, sliding off or getting stuck. A slow check walks the captain along a path through every space and up and down every ladder in the strongest duel sea, and fails if he falls through, sticks, slides off or passes through a solid part. MasterWorld uses the shared walker too. | N2.1, N2.2 | open |
| N2.4 | **The ship drawn.** Hull, decks, bulwarks, companionways and interior from the plan's cells, to the quality the slice fixed: planking with caulked seams, copper below the waterline, paint, wear, beams and knees seen from below. Material kinds for wood, paint, copper, iron, rope, laid in ship space. Built in a worker at load. Her own shadow map, fitted round her and moving with her, so the rig's shadows are sharp on deck. Drawing by rooms and openings: from the deck only what can be seen through an opening is drawn below, and from below the same. The hull and decks laid out for a damage map from the start (N6.5 writes into it). Levels of detail for the other ship at distance that never pop. | Shots from the quarterdeck, the waist, the berth deck, the hold, and from 50 m and 500 m off, by day and by lantern below. Within the ship's budgets with the sea on. | N2.0, N2.1, N1.5 | open |
| N2.5 | **Ship and water together.** No sea drawn inside the hull, a clean waterline with foam that follows her motion, bow wave and wake that stay on the water behind her, spray over the bow when she slams, water running off. The wake and foam go through one seam into the sea material. | Shots and a short clip: looking over the side, from the bow in a breeze, down a hatch in a seaway (no water inside), astern along the wake. | N1.4, N2.2, N2.4 | open |
| N2.6 | **Fittings.** AssetGenerator specs for what stands on her (the list is in ship.md, "How she is made"): the 32-pounder carronade on its slide and the long 6-pounder on its truck carriage, each with breeching, tackles and its tools; the wheel, binnacle, capstan, pumps, galley stove, bell, lanterns, boats on the skids, anchors, shot garlands, casks, buckets, hammock nettings and hammocks, mess tables, chests; blocks, deadeyes, pins, cleats and coils. Fittings within reach ship as models with baked textures and levels of detail; small parts repeated hundreds of times are packed and drawn as instances, through `@futuremagic/props` and `@futuremagic/instances`, placed by the plan and moving with her pose. | Every fitting passes AssetGenerator's QA gates; the decks look furnished; all fittings together cost under 1 ms, inside the ship's 3 ms. | N2.1, X1 | open |
| N2.7 | **The captain's body.** The view is a body: it leans against the roll, steps to keep balance, bobs when walking, is slowed by a steep deck. Looking down you see your own hands, arms and legs in a captain's dress (Actors, the head hidden). Its strength is one setting, down to nearly still for those who get queasy. | Arnd, on the iPad: it feels like standing there, and the "calm view" setting removes the motion for those who want that. | N2.2, N2.3, X2 | open |
| N2.8 | **Sound of the ship.** Timber creaking with the roll rate, water along the hull by speed, slap under the counter, footsteps on wood by stride, a different sound below deck (muffled, close). | Eyes shut on the iPad you can tell above from below deck and calm from breeze. | N2.2, N2.3 | open |

**Order:** N2.0 (the slice) and N2.1 first, side by side; N2.4 waits for Arnd's word on the slice. Then N2.2, N2.4 and N2.6 side by side. N2.3 after N2.2. N2.5 after N2.4. N2.7 and N2.8 last.

**Gate G2 (Arnd, on the iPad):** roam every deck, cabin and storeroom of the brig, from the quarterdeck to the hold, while she rides the swell in a breeze. It feels right in the stomach. No water where it should not be. Frame budget met.

**Work in other repositories that N2 to N4 wait for** (each can start now):

| Id | What | Where | Needed by | Status |
| --- | --- | --- | --- | --- |
| X1 | `@futuremagic/instances` draws its instances in a moving frame, so all her fittings move with her pose | AssetGenerator | N2.6 | done (AssetGenerator #181: `DrawOptions.frames`, a record's `FRAME`; frames nest by multiplying, so a gun on its slide or a door on its hinges is a frame too) |
| X2 | An age-of-sail navy wardrobe: seamen's slops, marines, officers, for two navies | Actors | N2.7 (the captain's own body), N4.3 | open |
| X3 | `@futuremagic/figure` climbs shrouds and ratlines, goes round the futtock shrouds and walks a footrope | AssetGenerator | N3.11, N4.3 | done (AssetGenerator #182: `shroudWays`, `Yard` with the 'footrope' and 'yard' steps, `sidle`; at sea `up`, `grip`, `pace`. The rig plan, N3.2, puts each futtock stave at `futtock.lo`) |

**Design questions for N2, answered** (Arnd, 2026-11-17, in ship.md): the brig is a Cruizer-class brig-sloop, the same hull for both navies; you see your own hands, arms and legs, the head hidden; the captain goes everywhere, from the hold to the crosstrees, and the whole ship is navigable.

---

## N3 Under sail, together

Two captains sail around each other in the same sea, giving orders as text or buttons.

| Package | What | Done when | Needs | Status |
| --- | --- | --- | --- | --- |
| N3.1 | **Simulation frame (pure).** `src/sim/state.ts` and `src/sim/step.ts`: the match as one `SimState` (seed, clock, wind, ships), `step(state, orders)` at 30 a second, events out. Encoding to and from bytes, and a hash of the state for comparing machines. | Tests: the same orders give the same hash after ten simulated minutes; encode then decode is identical; a step of two ships is within the 2 ms budget. | N2.2 | open |
| N3.2 | **Rig plan (pure).** Masts, yards, sails of a brig as data: the spar table (each spar a chain of segments, so a hit breaks it at a real place); courses, topsails, topgallants, jib and staysails, spanker, each sail's area, place and states (furled, reefed, set); how far each yard braces round. Every line of the rig as one list: what it is (shroud, stay, brace, sheet, clewline, halliard), its two ends, where it is made fast and what it does, read alike by the sailing model, the crew, the damage and the drawing. The rig's surfaces and ways (shrouds and ratlines, futtock shrouds, tops, crosstrees, footropes, the bowsprit) join N2.1's walk graph. | Tests on the data (areas, limits; every line ends on real points; every surface aloft is reachable from the deck). A drawn sail plan and rigging plan as pictures. | N2.1 | open |
| N3.3 | **Sailing model (pure).** `src/sim/ship/sailing.ts`: force of the wind on each set sail by its angle to the apparent wind, the hull's resistance ahead and sideways, the rudder, heel from the sails, leeway. Tacking, wearing, being taken aback, heaving to. Tuned for pace in `src/sim/rules/sailing.ts`. Owner of speed and heading. | Tests: her speed on each point of sail matches the table (fastest with the wind on the quarter, none within about 60° of the wind); a tack ordered at speed completes in under 60 s; a tack without way fails and she falls back; heel in the strongest preset stays below the limit. | N1.6, N3.1, N3.2 | open |
| N3.4 | **Orders (pure).** `src/sim/orders.ts`: the vocabulary as data: steer a course, come up or bear away by points, tack, wear, heave to, sail settings (battle sail, plain sail, all sail, take in), brace for the wind. Until the crew exists (N4) each order takes effect over a time from a table. The owner of what the ship has been told to do. | Tests: every order parses, applies and shows in the state; orders that cannot be done (tack while in irons) answer with a reason as an event. | N3.3 | open |
| N3.5 | **Typed orders and buttons.** A plain panel to give N3.4's orders by tap or by typing, with the answer shown. A working tool for N3 and for tests later, not the final interface (N4.4). | On the iPad you can sail her anywhere with taps. | N3.4 | open |
| N3.6 | **Masts and rigging drawn.** Spars turned from the spar table: masts with tops, caps and trestle trees, yards with slings and footropes, bowsprit and jib-boom, boom and gaff. Every line of the rig plan drawn by its sag (taut nearly straight, slack hanging), with its blocks, deadeyes and coils. Rope is one material kind in a few draw calls: round tubes near, flat strips far, never thinner than a pixel and fading by how much of a pixel it covers, so the rig never shimmers. The yards brace round with the simulation. | Shots and clips from the deck and from 50 m to 2 km off, in motion: no shimmer or flicker in the rig at any distance. Within the ship's budgets. | N3.2, N2.4 | open |
| N3.7 | **Two players.** GameHub's client taken as its README says; rooms (create, join by code or link); the host steps the simulation and sends state and events; guests send orders and draw between received states; the sea's clock agreed between machines; the host leaving passes hosting on. A fake hub for tests. | Tests with two simulations and the fake hub: guests match the host's hash; a host change loses nothing. A slow check plays two headless browsers against the live server. PC and iPad in one room see the same sea and each other. | N3.1, N3.4 | open |
| N3.8 | **The other ship, and the spyglass.** The enemy drawn from hull-down on the horizon to alongside without a pop. The spyglass: raise it, a magnified round view that sways with your hands and the roll; pinch or a button on touch. | You can read her point of sail and sail setting through the glass at 2 km. | N3.10, N3.7 | open |
| N3.9 | **Sound under sail.** Wind in the rigging by apparent wind, canvas filling, flogging and thundering aback, blocks and the creak of yards bracing round. | A tack can be followed with eyes shut. | N3.10 | open |
| N3.10 | **Sails drawn.** No cloth simulation: the simulation says how each sail stands (how far set, reefs, brace angle, how hard the wind presses, aback or shivering) and the drawing shapes a fine grid from that: a belly by the pressure, ripples along a shivering sail, the gathered folds of a sail being clewed up, so setting and furling are seen happening. Seams, reef bands and points, bolt ropes, light through the canvas with the rig's shadows on it. Each sail laid out for its own hole map (N6.5). The ensign and pennant as simple cloth that shows the true wind exactly. | Shots and clips on every point of sail, through a tack, and of a sail being set and furled. Within the ship's budgets. | N3.3, N3.6 | open |
| N3.11 | **The captain aloft.** The captain climbs the rig on the same walk graph: up the ratlines hand over hand, out and round the futtock shrouds, onto the tops and crosstrees, along the footropes of every yard, out on the bowsprit and jib-boom. The climbing is seen; the body leans in with the roll and slows as she heels; he cannot fall, a hard roll makes him hold on. | A slow check walks him to every masthead, every yard arm and the jib-boom end in the strongest duel sea. Arnd, on the iPad: he climbs to the main crosstrees and looks down on his deck. | N2.3, N3.2, N3.6, X3 | open |

**Order:** N3.1 and N3.2 first, side by side. Then N3.3, N3.4. Then N3.5, N3.6 and N3.7 side by side, N3.10 and N3.11 after N3.6. N3.8 and N3.9 last.

**Gate G3 (Arnd, PC and iPad in one room):** both ships sail, tack and wear by orders; each sees the other where she is, in the same waves; no drift apart over fifteen minutes; the host can leave and the game goes on.

**Open design questions for N3:** how much pace: the table of speeds and turning times (design thread proposes, Arnd feels it at the gate); how the two ships start (distance, who has the wind).

---

## N4 The crew

You give every sailing order from the deck and watch the men do it.

| Package | What | Done when | Needs | Status |
| --- | --- | --- | --- | --- |
| N4.0 | **Trial: a hundred men on the tablet.** 240 Actors figures (two crews) on a stand-in deck with the sea on, animated, at the planned levels of detail. Before anything else in N4, because the result shapes the rest. | Frame times from the iPad noted here; the levels of detail and animation rates that fit the 5 ms budget are fixed. | N2.4 | open |
| N4.1 | **Crew and tasks (pure).** `src/sim/crew/`: the roster of a brig (officers, petty officers, topmen, gun crews, marines, idlers) and the quarter bill as data; tasks with a place, the hands they need and the work they take; who is given what; orders from N3.4 become tasks, so their time now comes from the men (N3.4's time table goes). Owner of every man's task and state. | Tests: each order done by a full crew takes the time in the table; with half the hands it takes longer by the rule; two orders at once share the men; no man has two tasks. | N3.4 | open |
| N4.2 | **Ways through the ship (pure).** The crew's routes on the one walk graph of N2.1 and N3.2 (decks, ladders, hatches, doors, shrouds, tops, yards), the same graph the captain walks, so where a man can go the captain can go. Men walk it at speeds that depend on heel and crowding, step aside for the captain, and find another way when a gun run out or wreckage closes one. | Tests: any station reaches any other; a blocked ladder reroutes; route times match hand-measured ones. | N2.1, N3.2 | open |
| N4.3 | **The crew drawn.** Actors bodies in period dress by rank and navy, placed and animated by N4.1's tasks: hauling, going aloft, laying out on a yard, furling and loosing, at the wheel, at the capstan, standing by. Levels from N4.0. Motions come from what Actors already has before anything is made: its 84 ready clips, then the CMU motion capture library in its pack (2,548 motions, searchable, loaded on demand; Arnd, 2026-11-17) for hauling, climbing, carrying, pushing and the like. Only what neither holds is listed for Actors as new work. | Clips of each order being carried out, from the quarterdeck. Within the crew budget for two ships. | N4.0, N4.1, N4.2 | open |
| N4.4 | **The order interface.** Look at or tap an officer or a station to get the short list of orders that make sense there now; frequent orders on keys; what is under way is seen in the men, not in a list. Built to the design thread's orders specification. | On the iPad every sailing order is given with a look and a tap in under two seconds, mid-turn, without a text panel. | N4.1, design thread: orders specification | open |
| N4.5 | **Speech bubbles and reports.** Bubbles over the speaker for acknowledgements, relayed orders, reports and cries, readable on the tablet at a glance, never stacking into a wall; the phrases as data by order, rank and navy; lookout and officer reports raised by the simulation's events. | An order is seen going down the chain; a sail sighted and a missed tack are reported by the right man. | N4.1, N4.3 | open |
| N4.6 | **Sound of the crew at work.** The bosun's calls (one per kind of order), bare feet running, hauling rhythm (wordless), the drum, the ship's bell on the half hour. | Each order has its call; nothing speaks words. | N4.1 | open |

**Order:** N4.0 first. N4.1 and N4.2 side by side. Then N4.3, N4.4, N4.5, N4.6.

**Gate G4 (Arnd, on the iPad):** sail her through a tack and a change of sail by look and tap; the deck is alive and never idle; the bubbles read well and feel of the period; frame budget met with both crews in sight.

**Open design questions for N4:** the orders specification (stations, lists, keys, the look of the menu); bubble style and the phrase book; dress by navy and rank; how much the men show mood.

---

## N5 The guns

A broadside looks, sounds and feels like one, from both ships.

| Package | What | Done when | Needs | Status |
| --- | --- | --- | --- | --- |
| N5.1 | **Guns (pure).** `src/sim/guns/` and `src/sim/rules/guns.ts`: each gun's kind, crew and state through the drill (sponge, load, ram, run out, aim, fire, recoil); how far it trains and elevates; the reload time by hands present. Owner of every gun's state. | Tests: a full crew reloads in the table's time, short-handed slower by the rule; a gun cannot fire unloaded or run in; a dismounted gun does nothing. | N4.1 | open |
| N5.2 | **Shot in flight (pure).** Round, chain and grape with their speed, drag and spread; aim from the gun's training and the ship's roll at the instant of firing; seeded scatter. Each shot is an event with its whole path, so every machine can draw it without being sent positions. | Tests: ranges match the table; firing on the up-roll goes high, on the down-roll low; the same seed gives the same fall of shot. | N5.1 | open |
| N5.3 | **Gunnery orders.** Beat to quarters, the shot to load, the target (hull, rigging, deck), run out, fire as they bear, fire on the roll, a full broadside, cease fire, which battery. In the vocabulary (N3.4) and the interface (N4.4), carried by the gunner and the gun captains. | Each order is given from the deck and seen carried out by the gun crews. | N5.1, N4.4 | open |
| N5.4 | **The drill and the shot drawn.** Gun crews working the drill; the gun leaping back on its breeching; flash, burning wad, shot seen as a flicker; splashes that belong to the sea (through N2.5's seam); balls skipping. | Clips from behind a gun, from the quarterdeck, and from the other ship. | N5.1, N5.2, N4.3, N2.5 | open |
| N5.5 | **Powder smoke.** Smoke that pours from the ports, hangs, drifts with the wind (N1.6) and thins, lit by the sun and by flashes. Thick enough after a broadside that the enemy is hidden until it clears. The quality knob is density, never whether it hides. | Shots through a broadside sequence on both tacks; smoke, drawn at half resolution, costs at most 2 ms on the tablet at its worst. | N5.4 | open |
| N5.6 | **The sound of gunfire.** One gun close, a rippling broadside, guns below your feet, the enemy's guns arriving after their flash by the speed of sound, shot passing overhead. After your own broadside the world is dull and ringing for a moment. The deck jolts (N2.7). | Arnd, on the iPad with headphones: the first broadside makes him flinch. | N5.2, N2.7 | open |

**Order:** N5.1 then N5.2. Then N5.3, N5.4 and N5.6 side by side. N5.5 after N5.4.

**Gate G5 (Arnd, PC and iPad):** fight a gunnery exchange without damage; a broadside from both ends; smoke hides and clears with the wind; frame budget met in the thick of it.

**Open design questions for N5:** how the captain chooses a target (by where he looks, or by order to the gunner); how much aiming the gunner does unprompted; ranges and accuracy for pace.

---

## N6 Damage

A duel between two players runs to a proper end.

**The rule this milestone lives by:** one routine takes a hit and decides everything that follows from it. Nothing else changes a ship's structure, a gun's condition or a man's health.

| Package | What | Done when | Needs | Status |
| --- | --- | --- | --- | --- |
| N6.1 | **Hits (pure).** `src/sim/damage.ts`, the one routine: a shot's path traced through the ship's cells (N2.1); what it pierces by its energy and the timber's thickness; what it does on the way: holes, splinters, a gun dismounted, men struck, rigging cut, a spar wounded. Rules in `src/sim/rules/damage.ts`. Owner of all structural state. | Tests: the same shot and seed give the same damage; energy is spent in order along the path; every effect is reachable; no state under `owners` is written elsewhere. | N5.2, N2.1 | open |
| N6.2 | **What damage leads to (pure).** Flooding through holes near the waterline, by depth and heel, against the pumps; loss of stays and shrouds bringing down a spar or a mast, and what it drags; fire starting, spreading and being fought; the magazine; steering shot away. Each feeds back into floating (N2.2) and sailing (N3.3) through their owners. | Tests: a hole below the waterline floods at the rule's rate and lists her; pumps hold a small leak and lose to a large one; a dismasted ship cannot sail; fire unfought reaches the magazine in the table's time. | N6.1 | open |
| N6.3 | **Repair and the wounded (pure).** Tasks for the crew (N4.1): plug and pump, cut wreckage away, knot and splice, fight fire, carry the wounded below. Fewer hands at guns and sails while they do. | Tests: repair parties take men from other work by the quarter bill; each repair restores what the rule says. | N6.1, N4.1 | open |
| N6.4 | **Striking and sinking (pure).** When a ship is lost: she sinks, burns out, blows up, or her state (men left, guns left, water, masts) makes her strike her colours. The player may strike by order. The end of the match as state. | Tests for each ending; a headless duel always ends. | N6.2 | open |
| N6.5 | **Damage drawn.** Shot holes cut where they struck, inside and out; rails and bulwarks gone; splinters flying; spars and masts falling with their rigging and lying where they fell or dragging alongside; torn and holed sails; fire and its smoke; water rising below; the list; the ship going down and what floats after. | Shots of each, and a clip of a ship fought to the end, from on board. Within the frame budget. | N6.1, N6.2, N2.4, N3.6 | open |
| N6.6 | **The men under fire, and the violence setting.** Men falling, being carried below, repair and fire parties at work. The setting from mild to unsparing changes only what is drawn. | Each level shown to Arnd; the mildest is fit for any player. | N6.3, N4.3 | open |
| N6.7 | **The end, from on board.** Losing: the water comes up the decks, the view goes under (N1.4's underwater view). Winning: she strikes or goes down in front of you. A quiet moment, then the way back to a new match. | Both ends played through on the iPad. | N6.4, N6.5 | open |
| N6.8 | **Sound of damage.** Shot striking timber near and far, splinters, a mast going, rigging coming down, fire, water rushing in below, the ship breaking up. | With eyes shut, where you were hit can be told. | N6.1 | open |

**Order:** N6.1 first. Then N6.2 and N6.3. Then N6.4. Drawing and sound (N6.5 to N6.8) alongside from N6.1 on.

**Gate G6 (Arnd and a friend, PC and iPad):** a full duel from sighting to the end, 10 to 20 minutes; damage changes what each ship can do; the ship at the end tells the fight's story; both ends work.

**Open design questions for N6:** the balance of the three shot types; how fast a brig can be lost at the quickest; what "strikes" means for a human player (forced, or only advised by the first lieutenant); the levels of the violence setting.

---

## N7 The opponent and the game around the duel

A stranger can open the page and play a full duel alone or with a friend.

| Package | What | Done when | Needs | Status |
| --- | --- | --- | --- | --- |
| N7.1 | **The computer captain (pure).** `src/sim/captain/`: gives the same orders a player can, from what a captain could see. Seeks the weather gauge, chooses range for his guns, tries to rake, repairs when he must, strikes when beaten. Three levels of skill. | A slow check plays 100 duels between computer captains: all end, none in a stalemate, most between 10 and 20 minutes. A human of some practice loses to the best level about half the time. | N6.4 | open |
| N7.2 | **From the title to the deck.** Title, play alone, host a match, join by code or from the list of open rooms, choice of navy, weather set or drawn by seed, a rematch. Listed in GameHub's lobby. | From a cold page to standing on deck in three taps; two strangers can find each other. | N3.7 | open |
| N7.3 | **Settings.** Quality, violence, view motion, controls (touch layout, keys, sensitivity), sound levels. Kept on the device. | Every setting holds across a restart and works mid-match. | | open |
| N7.4 | **The first match.** A new captain is led through sailing and fighting by his first lieutenant, in bubbles and by what the crew does, against a weak opponent. Skippable. | Someone who has never seen the game wins the first duel without reading anything outside it. | N7.1, N4.5 | open |
| N7.5 | **Pace and balance.** The rule tables tuned together so a duel is tense, lasts 10 to 20 minutes and rewards seamanship. | The design thread's balance sheet is met in the 100-duel check and in play. | N7.1 | open |
| N7.6 | **Tablet finish.** Loading within budget, download size within budget, a service worker so the app starts without a network once loaded, memory held over an hour of matches, heat and battery looked at. | `?bench` and an hour's play on the iPad within the budgets. | all | open |

**Gate G7 (Arnd):** the game is good enough to show to others.

---

## After N7

Not planned in detail, in rough order of how much each adds for its cost: larger ships (frigates) and battles of more than two; night and heavy weather; boarding; squadrons by signal; coasts and shoals; a sandbox of voyages and ports; spoken orders; later ages.

## Decisions log

| Date | Decision | By |
| --- | --- | --- |
| 2026-11-17 | Age of sail first; a single duel; battles before sandbox; one ship per player; multiplayer from the start; fun before realism | Arnd |
| 2026-11-17 | No crew voices, speech bubbles; the captain cannot fall; violence adjustable; historical setting | Arnd |
| 2026-11-17 | Tablets from the start as a web app; reference iPad Air M4 | Arnd |
| 2026-11-17 | Guardrails: test time budgets, duplication ratchet, named numbers, state owners, seam index | Arnd |
| 2026-11-17 | This thread is the design thread; other threads build work packages | Arnd |
| 2026-11-17 | The fine sea is computed on the GPU and WebGPU is required (the iPad's probe: compute costs next to nothing); a calm keeps a swell; duels in force 2 to 6 | design thread |
| 2026-11-17 | Versions start at 0.001 and go up by 0.001 with each build on `main`; a "What's new" button shows the full history; each change adds its note in `whatsnew/` | Arnd |
| 2026-11-17 | The brig is a Cruizer-class brig-sloop, one hull in two coats for the two navies, with her real carronades and long sixes ([ship.md](ship.md)); the captain sees his own hands, arms and legs; a slice of her is built and judged first; the captain is free to move anywhere and the whole ship is navigable | Arnd |
| 2026-11-17 | The frame's shares at the worst moment: sea 4, crew 4, ships 3, smoke 2, sky, light and interface 2 ms (15 of 16.7 ms). To be confirmed with the other budgets at gate G1 | design thread |
