# Scenarios: up to eight ships, sides and commanders

Arnd, 2026-11-18: "A scenario setup instead of 1 on 1 and watch battle: define the ships in the game, the side they are on and who commands them, max 8 ships; the same setting for multiplayer; the host assigns real players to ships; with no player-controlled ship it is today's watch mode with more ships" and "a ship placement (with sensible default) in that dialog, on a map". Staged plan and the design thread's rulings: [the plan](implementation-plan.md) (decisions table, 2026-11-18) and `/mnt/project-files/nauta/scenarios/plan.md`.

## What a scenario is

`src/sim/scenario.ts`: one to eight ships (`MOST_SHIPS`, at least two), each with a **side** (A to D, four at most; a ship alone on a side is free for all), a **navy** (set per side, overridable per ship: dress and names only), a **commander** (`you`, a `player` who joins a room, or a `computer` at a skill) and, optionally, a **place** put by hand. Kept on the device in the match terms (`settings.match.scenario`), and (stage 4) in a room's meta and snapshot. `limitOf` says what cannot be run yet, one place for every stage to lift a limit.

## The dialog (`menu.ts` `setup`, `scenarioDialog.ts`, `placementMap.ts`)

The main screen's "Set up a battle" replaces Fight alone, Host a duel and Watch a battle; "Join a battle" stays for entering a code. Start from one of four scenarios (you against the computer, you and a friend, only watch, a fleet action), then edit: the ship cards (side, navy, captain, remove), "Add a ship", the sides' navies, the match's terms. Its button reads Beat to quarters (you command a ship), Begin the battle (only computers) or Open the room (a player's seat). Beside the cards a **sea chart** shows where they start (wind from the top, 500 m grid, scale bar, the distance between the first two sides); a finger drags a ship and her brass handle turns her; "Place them as the start would" returns the start's own places. Placements are in the wind's frame, so the match turns the picture to whatever wind its seed blows and a ship keeps her place against the wind. Putting one ship by hand freezes all of them (the dialog never mixes hand-made and default), and any change to the ships (add, remove, side) clears them. Ships may not be nearer than 60 m.

## Start rules (`start.ts`)

Two sides: opposite lines as the duel's, one ship each is exactly `duelStart` (the test proves it to the bit); three or four sides at equal angles round the middle; a side's ships abreast 150 m apart. "How you meet" turns the wind between the first two sides.

## Stages

| Stage | What | State |
|---|---|---|
| 1 | Scenario model, `fleetStart`, the dialog and its placement map. Runs what the duel runs (two ships of two sides in two navies); the rest is shown dimmed with the reason | built (PR 152) |
| 2 | Sim: sides (`SimShip.side`), `foes.ts` (enemies nearest first, her foe), each gun on the nearest enemy its side faces, the end rule by side (`winningSide`), parting between sides. The duel is unchanged. "Target her" waits for stage 6 with its buttons | built |
| 3 | The computer captain for N: he sights and fights the nearest enemy of another side (`sightOf`, `captainOrders`, the master's kept order). Choosing a target on purpose and holding it is left to "Make captains manoeuvre in battle" | built |
| 4 | Netcode (`PROTOCOL` 3): a room for as many captains as the scenario has seats (up to 8); the scenario in the room's meta; the host steps the computer captains and a new host goes on with them; players seated in the ships a person commands. The state is **deflated** (fflate) instead of coarse crews for unmanned ships: 8 ships at work measure about 18 KB as sent against GameHub's 64 KB, and every ship stays exact. Which player sits in which ship is picked in the waiting room (stage 6); until then they take the seats in order | built |
| 5a | Rendering of up to eight ships (`src/app/rivals.ts`: every ship but the captain's is a `ShipView` of the same build, with fittings, guns and hammocks; `?watch&ships=N` runs N computer captains for a look). The hole maps are **array textures** (one layer a ship; a 8-ship atlas would pass WebGPU's 8192 px limit), the flags a uniform per ship. The sea reads only `WAKE_SLOTS` = 2 wake maps (the captain's ship and the nearest other, kept by hysteresis); the others leave no wake yet. `npm run shot:fleet` takes the pictures | built |
| 5b | Crews for every ship (now: the captain's ship and one other; the crowd meshes hang on the ship group of a navy) | open |
| 6 | Page and watch: free camera over N ships, end card by side, spectate after your ship is lost | open |
| 7 | Checks: runs and ends for 4 and 8 ships, shots | open |
