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
| Sea, all of it | at most 5 ms of a frame |
| Crew, all of it (animation and drawing, 2 ships) | at most 5 ms of a frame |
| Shader compile on the render path | none (docs/SHADERS.md) |
| Page memory | at most 1.2 GB |
| First load (download before the title shows) | at most 15 MB; everything for a duel at most 60 MB |
| Time from tap to standing on deck | at most 15 s on a good connection |
| Simulation step | fixed, 30 a second; one step of a full duel at most 2 ms on the tablet |
| Network | host sends at most 20 states a second, each at most 16 KB |

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
| N0.5 | Device probe: `?probe` shows on screen what the browser offers (WebGPU or WebGL 2, adapter limits, a small compute pass run and timed, float texture filtering, storage textures, max texture size, device memory, screen size and refresh) | The probe's result from the iPad is copied into "Notes" below | blocked: built (`?probe`); waits for the iPad's report, which needs N0.4 (Pages) and Arnd |

**Gate G0 (Arnd, on the iPad):** the page opens in Safari; the corner shows `webgpu`; dragging a finger looks around smoothly; "Add to Home Screen" gives a full-screen app in landscape; the probe's report is sent to the design thread.

**Notes:** WebGL 2 stays as a fallback until N1.2 decides. Headless checks in the cloud use `?gl`.

**The probe (N0.5).** Open https://arndrosemeier.github.io/Nauta/?probe in Safari on the iPad, wait a few seconds, tap "Copy report" and paste it into the design thread. The summary at the top holds what N1.2 needs: WebGPU yes or no and the adapter, float32 filtering, the storage texture formats and whether `read_write` works, the time of one wave pass (16 waves a texel at 256² and 512²) and of one FFT-shaped chain (16 compute passes over 256² complex values), the key limits, the screen and its refresh rate. The full report below it lists every feature, limit and WebGL 2 extension. The probe's code is in `src/probe/` and loads only with `?probe`. Times are wall time from submit to "work done", the median of 5 rounds, so they include each submit's overhead: read them as upper bounds. Safari does not tell the device memory; the JS heap limit is Chrome's only. Headless SwiftShader (cloud, 2026-11-17, a software GPU, only to show the probe works): WebGPU yes, compute result checked against the CPU ok, wave pass 6.4 ms at 256² and 24 ms at 512², FFT-shaped chain 12.5 ms.

**The iPad's report:** not yet in.

---

## N1 The sea

The new ocean: better than MasterWorld's from deck height, in calm, breeze and gale, within its 5 ms on the tablet. Everything later floats on it, so it is built with the most care.

**The design in one paragraph.** The sea is one function of seed, wind and time. Its long waves (those a hull feels) are a seeded set of wave components computed in `src/sim` on the CPU, the same on every machine. The renderer displaces the surface by exactly these components, so a hull sits in the water it is drawn in. Shorter waves, ripples, foam and light are added by the renderer on top and never affect the simulation.

| Package | What | Done when | Needs | Status |
| --- | --- | --- | --- | --- |
| N1.1 | **Sea state (pure).** `src/sim/sea/`: a wind-driven spectrum with directional spread, sampled into a seeded set of wave components (direction, length, amplitude, phase; deep-water speed). `seaAt(state, x, z, t)` gives height, surface normal, horizontal shift and water velocity. Presets by Beaufort force in `src/sim/rules/sea.ts`. | Tests: same seed and wind give the same sea; mean height is zero; significant wave height matches the preset within 10 %; no visible repeat within 2 km (autocorrelation test); 1000 samples take under 1 ms; a change of wind blends over minutes without a jump. | | done |
| N1.2 | **Trial of the fine sea.** Two ways to add the short waves, each behind `?fine=`: (a) spectrum bands computed on the GPU with compute passes, (b) scrolling detail from precomputed tiles with no compute. Same lighting for both. A short written comparison with frame times from the tablet. | Arnd has seen both on the iPad and the design thread has recorded the choice here. If (a) wins, WebGPU becomes required and the WebGL 2 fallback goes. | N0.5, N1.1, N1.3, N1.4 (first version) | open |
| N1.3 | **Sea surface mesh.** A grid that follows the camera out to the horizon, dense near and coarse far, snapped so vertices do not swim, displaced by N1.1's components in the vertex stage, closing cleanly into the sky's haze at the horizon. | From 3 m to 30 m eye height: no cracks, no popping, no swimming when the camera moves or turns; the horizon is a clean line. Shots at three heights. | N1.1 | open |
| N1.4 | **Sea material.** Reflection of the real sky, sun and moon glitter, the colour of deep water by sun height and weather, light through thin crests, foam where the surface folds (lingering and fading), fine normal detail that does not tile visibly, distance haze. A proper view from under water. | Standard shots (N1.9) at dawn, noon, dusk, moonlit night, each in calm, breeze and gale, look right to Arnd next to MasterWorld's sea. | N1.3, N1.5 | open |
| N1.5 | **The light rig, shared.** MasterWorld's lighting (`src/render/sky.ts`: the rig for physical albedos, the sky as fill through the environment map, the brighter sky under a low sun, eye adaptation, cloud shadows, the grade over the day) moves into `@futuremagic/sky` as one rig both games use. MasterWorld switches to it in the same step. Nauta's `defineKind` moves into `@futuremagic/stage` likewise. | MasterWorld's standard shots are unchanged after the switch; Nauta lights a test object with the shared rig; neither game holds a copy. | | open |
| N1.6 | **Wind (pure).** `src/sim/wind.ts`: true wind direction and speed over the fight, slow veering and seeded gusts as moving patches; `windAt(state, x, z, t)`. The sea's driving wind and the sails' wind are this one. Gusts show on the water as darker ruffled patches (N1.4 reads them). | Tests: seeded and repeatable; mean speed and direction match the preset; gust strength and spacing within the table's range. | | done |
| N1.7 | **Sound of sea and wind.** Ambience beds for sea state and wind strength that crossfade with the weather, placed swell and slap sounds near the viewer, sound starting on the first tap (Safari's rule). | On the iPad the sound starts with the first touch and follows calm, breeze and gale without a seam or an audible loop within 3 minutes. | N1.1, N1.6 | open |
| N1.8 | **Quality levels.** `src/app/quality.ts`: the one place for every cost knob (resolution scale, sea grid density, fine-sea bands, foam detail), with presets and a choice made from measured frame time in the first seconds. | The tablet and a desktop each land on a level that holds 60 frames a second; the level and its reason show in the HUD. | N1.3 | open |
| N1.9 | **Looking and measuring.** `npm run shot:sea` takes the standard sea shots (times of day × weather × eye heights). `?bench` flies a fixed path for 60 s and shows frame time percentiles, the worst frame and memory on screen. `?sea=calm`, `?wind=`, `?hour=` set the scene. | The shot set runs within its 3 minutes; the bench result on the iPad can be read off the screen and is noted here. | N1.3 | open |

**Order:** N1.1, N1.5 and N1.6 can start at once, side by side. N1.3 follows N1.1. N1.4, N1.8 and N1.9 follow N1.3. N1.7 any time after N1.1 and N1.6. N1.2 is the trial in the middle and needs Arnd.

**Notes:** N1.6 (wind) is in `src/sim/wind.ts`, its tuning in `src/sim/rules/wind.ts` (forces 0 to 8) and the Beaufort scale in `src/sim/rules/beaufort.ts` (one table for wind and sea). A match's wind is `makeWind(seed, force, fromBearing)`, plain data. `meanWind(state, t)` is the wind without gusts (the sea's driver); `windAt(state, x, z, t)` adds the gusts (the sails'). Both give `{ speed, toward, x, z, from, gust }`: `toward` is the sea's angle (0 = +x, a quarter turn = +z), `from` a compass bearing (0 north = -z, clockwise, `units.ts#bearingDir`). The mean veers slowly, each swing taking 10 to 30 minutes, within the preset's limit (45° in calm down to 10° from force 6), and freshens a little; whether the sea follows the veer or keeps its start value is the sea's choice. For N1.4: `gustsNear(state, x, z, t, radius)` lists the patches (heart, radius, strength now, peak), and the shader draws each with `gustShape` (one at the heart, (1 - d²)² to the rim); patches drift with the mean wind. Gust, veer and freshen numbers are first proposals, to be tuned by eye at N1.4 and by feel at N3.3.

N1.1 (sea state) is in `src/sim/sea/`, its tuning in `src/sim/rules/sea.ts`. A sea is `startSea(seed, wind, t)`, plain data; call `followWind(sea, meanWind(windState, t), t)` every step and the sea takes a new wave set only when the mean wind has moved by 1.5 m/s or 15°, fading it in over 3 minutes (`changeWind` forces one). Each wave set is 28 Gerstner waves (`SEA_COMPONENTS`; 32 missed the 1 ms on CI) from a JONSWAP spectrum (0.6 to 2.5 times the peak frequency) with a cos-2s spread, equal energy per wave, so the set's significant height is the preset's. For N1.3: `seaAt(sea, x, z, t)` is a calm point and where its water is now, exactly what the vertex stage must do: for each layer, factor `f` from `layerWeights(sea, t)`, and for each wave θ = kx·x + kz·z − omega·t + phase, height += f·amp·cos θ, shift −= f·reach·(kx, kz)·sin θ, plus f²·lift per layer (the lift keeps the mean level at zero under Gerstner's wide troughs). The renderer's short waves start below the set's `shortest` wavelength. For N2.2: `surfaceAt(sea, x, z, t)` is the water under a world point (Newton on the shift, about 1.2 µs each against 0.5 µs for `seaAt`), with normal and water velocity; `stretch` is below 1 on crests and never reaches 0 (the simulated sea does not fold; foam from folding is the short waves'). Sines and cosines in the hot loop are `trig.ts#sincos`, built from + and × only and without a branch, so they round alike on every engine and cost a third of Math.sin plus Math.cos; the wave set itself uses Math.exp and Math.cos once per set, which engines may round differently in the last bit, so machines should compare the host's state, not sea samples. Open for the design thread: force 0 is mirror flat (should a calm keep a swell from elsewhere?); heights are the WMO probable open-sea values with peak periods of about 4.5 √height, to be judged by eye at N1.4.

**Gate G1 (Arnd, on the iPad):** stand at deck height and look around in calm, breeze and gale, at noon, dusk and by moonlight. It beats MasterWorld's sea side by side. `?bench` shows the budgets met. The sound belongs to the picture. The budgets table above is confirmed or changed.

**Open design questions for N1 (design thread):** the Beaufort presets a duel may have (calm to near gale: a full gale makes gunnery impossible and may be for later); whether weather changes during a match.

---

## N2 A ship afloat

A brig rides the swell and you can roam every deck of her.

**The design in one paragraph.** The brig is built in code from a plan: a hull form, decks, bulkheads, ladders, hatches, gun ports, mast steps. The same plan gives the drawn ship, the walkable decks, the points the water pushes on and, later, the cells that damage breaks. So one description serves everything and the ship can be cut into anywhere.

| Package | What | Done when | Needs | Status |
| --- | --- | --- | --- | --- |
| N2.1 | **Ship plan (pure).** `src/sim/ship/plan.ts` and `src/sim/rules/ships.ts`: the brig as data (about 30 m on deck, 16 guns): hull form by sections, decks (upper deck, lower deck, hold, quarterdeck step), bulkheads, hatches and ladders, gun ports, mast steps, the helm, pumps, magazine. The hull and decks divided into numbered cells (planking panels, frames, deck panels) for later damage. | Tests: the hull is closed and symmetric; displacement at the design waterline matches her weight within 3 %; every deck space is reachable by a ladder or hatch; every gun port has a gun place behind it. A drawn plan (side, top, sections) as a picture for Arnd. | Design thread: the brig's sheet | open |
| N2.2 | **Floating (pure).** `src/sim/ship/motion.ts`: the hull as pressure points from the plan, pushed up by N1.1's water and down by her weight; heave, pitch and roll integrated at the fixed step; heading and speed given from outside for now. Owner of the ship's pose. | Tests: in calm she settles at her waterline; heeled 20° and let go she rights herself and the roll dies out; her roll period is in the table's range; ten simulated minutes in the strongest preset never blow up; two runs agree bit for bit. | N1.1, N2.1 | open |
| N2.3 | **Decks you walk on.** The walker that stands on a moving deck moves out of MasterWorld (`src/world/deck.ts`) into a shared package and is driven by the brig's plan: floors, rails, masts, ladders, hatches, headroom below. Touch: left thumb walks, right thumb looks. Keys and mouse on top. Climbing ladders is seen (`@futuremagic/figure`). | On the iPad you walk from the quarterdeck down to the hold and back with two thumbs while she rolls, never falling through, sliding off or getting stuck. MasterWorld uses the shared walker too. | N2.1, N2.2 | open |
| N2.4 | **The ship drawn.** Hull, decks, bulwarks, companionways and interior from the plan's cells: planking with caulked seams, copper below the waterline, paint, wear. Material kinds for wood, paint, copper, iron, rope. Levels of detail for the other ship at distance. | Shots from the quarterdeck, the waist, the lower deck, the hold, and from 50 m and 500 m off, by day and by lantern below. Within the frame budget with the sea on. | N2.1, N1.5 | open |
| N2.5 | **Ship and water together.** No sea drawn inside the hull, a clean waterline with foam that follows her motion, bow wave and wake that stay on the water behind her, spray over the bow when she slams, water running off. The wake and foam go through one seam into the sea material. | Shots and a short clip: looking over the side, from the bow in a breeze, down a hatch in a seaway (no water inside), astern along the wake. | N1.4, N2.2, N2.4 | open |
| N2.6 | **Fittings.** AssetGenerator specs for what stands on her: 12-pounder long gun and carriage, 24-pounder carronade, the wheel, binnacle, capstan, pumps, a boat on the skids, lanterns, shot racks, casks, hammock nettings. Packed and drawn through `@futuremagic/props` and `@futuremagic/instances`, placed by the plan. | Every fitting passes AssetGenerator's QA gates; the decks look furnished; all fittings together cost under 1 ms. | N2.1 | open |
| N2.7 | **The captain's body.** The view is a body: it leans against the roll, steps to keep balance, bobs when walking, is slowed by a steep deck. Its strength is one setting, down to nearly still for those who get queasy. | Arnd, on the iPad: it feels like standing there, and the "calm view" setting removes the motion for those who want that. | N2.2, N2.3 | open |
| N2.8 | **Sound of the ship.** Timber creaking with the roll rate, water along the hull by speed, slap under the counter, footsteps on wood by stride, a different sound below deck (muffled, close). | Eyes shut on the iPad you can tell above from below deck and calm from breeze. | N2.2, N2.3 | open |

**Order:** N2.1 first (after the design thread's brig sheet). Then N2.2, N2.4 and N2.6 side by side. N2.3 after N2.2. N2.5 after N2.4. N2.7 and N2.8 last.

**Gate G2 (Arnd, on the iPad):** roam every deck of the brig while she rides the swell in a breeze. It feels right in the stomach. No water where it should not be. Frame budget met.

**Open design questions for N2:** the brig's sheet (her class, dimensions, armament, colours for each navy); whether you see your own body and hands; how far below deck the first game needs to go (magazine and hold matter for damage in N6).

---

## N3 Under sail, together

Two captains sail around each other in the same sea, giving orders as text or buttons.

| Package | What | Done when | Needs | Status |
| --- | --- | --- | --- | --- |
| N3.1 | **Simulation frame (pure).** `src/sim/state.ts` and `src/sim/step.ts`: the match as one `SimState` (seed, clock, wind, ships), `step(state, orders)` at 30 a second, events out. Encoding to and from bytes, and a hash of the state for comparing machines. | Tests: the same orders give the same hash after ten simulated minutes; encode then decode is identical; a step of two ships is within the 2 ms budget. | N2.2 | open |
| N3.2 | **Rig plan (pure).** Masts, yards, sails of a brig as data: courses, topsails, topgallants, jib and staysails, spanker; each sail's area, place and states (furled, reefed, set); how far each yard braces round. | Tests on the data (areas, limits). A drawn sail plan as a picture. | N2.1 | open |
| N3.3 | **Sailing model (pure).** `src/sim/ship/sailing.ts`: force of the wind on each set sail by its angle to the apparent wind, the hull's resistance ahead and sideways, the rudder, heel from the sails, leeway. Tacking, wearing, being taken aback, heaving to. Tuned for pace in `src/sim/rules/sailing.ts`. Owner of speed and heading. | Tests: her speed on each point of sail matches the table (fastest with the wind on the quarter, none within about 60° of the wind); a tack ordered at speed completes in under 60 s; a tack without way fails and she falls back; heel in the strongest preset stays below the limit. | N1.6, N3.1, N3.2 | open |
| N3.4 | **Orders (pure).** `src/sim/orders.ts`: the vocabulary as data: steer a course, come up or bear away by points, tack, wear, heave to, sail settings (battle sail, plain sail, all sail, take in), brace for the wind. Until the crew exists (N4) each order takes effect over a time from a table. The owner of what the ship has been told to do. | Tests: every order parses, applies and shows in the state; orders that cannot be done (tack while in irons) answer with a reason as an event. | N3.3 | open |
| N3.5 | **Typed orders and buttons.** A plain panel to give N3.4's orders by tap or by typing, with the answer shown. A working tool for N3 and for tests later, not the final interface (N4.4). | On the iPad you can sail her anywhere with taps. | N3.4 | open |
| N3.6 | **Masts, sails and rigging drawn.** Masts and yards from the rig plan; sails that fill, shiver when luffing and go aback, by the apparent wind and their state; setting and furling seen happening; standing rigging and the main running lines; a pennant and ensign that show the wind. | Shots and clips on every point of sail and through a tack. Within the frame budget. | N3.2, N3.3, N2.4 | open |
| N3.7 | **Two players.** GameHub's client taken as its README says; rooms (create, join by code or link); the host steps the simulation and sends state and events; guests send orders and draw between received states; the sea's clock agreed between machines; the host leaving passes hosting on. A fake hub for tests. | Tests with two simulations and the fake hub: guests match the host's hash; a host change loses nothing. A slow check plays two headless browsers against the live server. PC and iPad in one room see the same sea and each other. | N3.1, N3.4 | open |
| N3.8 | **The other ship, and the spyglass.** The enemy drawn from hull-down on the horizon to alongside without a pop. The spyglass: raise it, a magnified round view that sways with your hands and the roll; pinch or a button on touch. | You can read her point of sail and sail setting through the glass at 2 km. | N3.6, N3.7 | open |
| N3.9 | **Sound under sail.** Wind in the rigging by apparent wind, canvas filling, flogging and thundering aback, blocks and the creak of yards bracing round. | A tack can be followed with eyes shut. | N3.6 | open |

**Order:** N3.1 and N3.2 first, side by side. Then N3.3, N3.4. Then N3.5, N3.6 and N3.7 side by side. N3.8 and N3.9 last.

**Gate G3 (Arnd, PC and iPad in one room):** both ships sail, tack and wear by orders; each sees the other where she is, in the same waves; no drift apart over fifteen minutes; the host can leave and the game goes on.

**Open design questions for N3:** how much pace: the table of speeds and turning times (design thread proposes, Arnd feels it at the gate); how the two ships start (distance, who has the wind).

---

## N4 The crew

You give every sailing order from the deck and watch the men do it.

| Package | What | Done when | Needs | Status |
| --- | --- | --- | --- | --- |
| N4.0 | **Trial: a hundred men on the tablet.** 240 Actors figures (two crews) on a stand-in deck with the sea on, animated, at the planned levels of detail. Before anything else in N4, because the result shapes the rest. | Frame times from the iPad noted here; the levels of detail and animation rates that fit the 5 ms budget are fixed. | N2.4 | open |
| N4.1 | **Crew and tasks (pure).** `src/sim/crew/`: the roster of a brig (officers, petty officers, topmen, gun crews, marines, idlers) and the quarter bill as data; tasks with a place, the hands they need and the work they take; who is given what; orders from N3.4 become tasks, so their time now comes from the men (N3.4's time table goes). Owner of every man's task and state. | Tests: each order done by a full crew takes the time in the table; with half the hands it takes longer by the rule; two orders at once share the men; no man has two tasks. | N3.4 | open |
| N4.2 | **Ways through the ship (pure).** A route graph from the ship plan and rig plan: decks, ladders, hatches, shrouds, tops, yards. Men walk it at speeds that depend on heel and crowding. | Tests: any station reaches any other; a blocked ladder reroutes; route times match hand-measured ones. | N2.1, N3.2 | open |
| N4.3 | **The crew drawn.** Actors bodies in period dress by rank and navy, placed and animated by N4.1's tasks: hauling, going aloft, laying out on a yard, furling and loosing, at the wheel, at the capstan, standing by. Levels from N4.0. Missing motions are listed for Actors. | Clips of each order being carried out, from the quarterdeck. Within the crew budget for two ships. | N4.0, N4.1, N4.2 | open |
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
| N5.5 | **Powder smoke.** Smoke that pours from the ports, hangs, drifts with the wind (N1.6) and thins, lit by the sun and by flashes. Thick enough after a broadside that the enemy is hidden until it clears. The quality knob is density, never whether it hides. | Shots through a broadside sequence on both tacks; smoke costs at most 3 ms on the tablet at its worst. | N5.4 | open |
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
| 2026-11-17 | Versions start at 0.001 and go up by 0.001 with each build on `main`; a "What's new" button shows the full history; each change adds its note in `whatsnew/` | Arnd |
