# Nauta: game design and build order

Agreed with Arnd on 2026-11-17. Decisions carry his name and date where he made them.

## The game in short

Nauta is a ship battle game in which you command one ship from on board and never touch the wheel. You walk the deck, give orders, and the crew carries them out in front of you.

These rules are fixed:

- **Commander, not helmsman.** The player never steers, trims or fires directly. Every action is an order that the crew performs.
- **On board.** The view is a person on the ship, free to roam it while it sails and fights. No outside camera, no map with enemy markers.
- **Being there comes first.** When a choice is between realism, convenience and the feeling of standing on that deck, the feeling wins.
- **Fun before realism.** Pace is tuned for a good fight. A realistic mode may come later and probably won't be needed.
- **Top quality.** The sea must be better than MasterWorld's, which is the best so far.
- **Show, don't tell.** If an action can be seen, it is seen. Text only for what cannot be shown.

The long-term range is several ages, from sail to modern destroyers and submarines. The first game is the age of sail, historical, around 1800. Battles are the focus; a sandbox is a possible later expansion.

## The first game: a duel

Two brigs of about 16 guns meet on open sea, each commanded by one player or by a computer captain. A match lasts 10 to 20 minutes and ends when one ship is destroyed or strikes her colours.

1. **Sighting.** The ships start in sight of each other and closing. You read the wind, judge her course through the spyglass and choose who gets the windward position.
2. **Closing.** You set sail, clear for action and pick the shot. The crew goes to quarters around you.
3. **The fight.** Broadsides, turns to bring the other battery to bear, attempts to cross her bow or stern. Damage piles up on both ships and changes what each can still do.
4. **The end.** A ship sinks, burns, is dismasted and helpless, or strikes. There is no second life: your ship is your game.

Every player is a captain of their own ship. Nobody serves on another player's ship.

## Commanding

An order is the game's only verb, and the time between giving it and seeing it done is where the tension lives.

**Giving an order.** You look at a station or an officer and choose from a short list of orders that make sense there: the helm for courses and turns, the sailing master for sail, the gunner for shot, target and when to fire. The frequent orders also have keys. Spoken orders by microphone are a possible later extra.

**What happens then.** The order travels: an officer takes it, the bosun's pipe sounds, men run to their places and do the work. How long it takes depends on how many hands are free, how far they have to go, and what state the ship is in. Orders compete for the same men, so asking for everything at once slows everything.

**The crew.** Every crew member is a simulated person with a station, a task and a state (fit, wounded, dead). Men are drawn with Actors. A brig has roughly 100 to 120 of them.

**Speech.** The crew does not speak aloud (Arnd: text-to-speech is not authentic enough, and repeated clips get old). Acknowledgements, reports and cries appear as speech bubbles over the person speaking. Pipes, drums, bells and wordless shouts are real sound.

**Knowing things.** What you know is what you can see or what someone tells you. The lookout reports a sail, the carpenter reports the leak, and you go and look if you want to judge for yourself.

## Being there

The feeling of standing on that deck is built from five things, in this order of importance.

1. **Sound.** Timber creaking with each roll, wind in the rigging, water along the hull, canvas cracking as a sail fills. A broadside is a physical blow followed by ringing ears. Everything is placed in space and sounds different below deck. Sounds come in many seeded takes so nothing repeats noticeably. No voices.
2. **A body, not a camera.** You lean with the roll and keep your feet on a moving deck. A hit staggers you, close shot makes you flinch, heavy weather makes you slow. The captain cannot be killed (Arnd): the ship is destroyed, game over, that is the risk.
3. **A ship full of people.** Men haul, climb, load, carry powder, pump, and drag wreckage clear. The deck is never empty and never idle.
4. **Smoke and chaos.** After a broadside the enemy vanishes behind your own smoke until the wind clears it. Splinters fly, a spar comes down in a tangle of rope, a sail tears.
5. **Lasting marks.** Shot holes stay where they hit, rails are gone, the deck is scarred.

**Violence is a setting** (Arnd). At the mildest, men fall and are carried below. At the strongest, a gun deck in action looks as terrible as it was. The simulation is the same at every level; only what is drawn changes.

## The sea

The sea is a new system, because open ocean seen from a deck for a whole match asks more than MasterWorld's water was built for. MasterWorld sums five fixed waves and fades them out 800 m from the camera.

Proposed, to be confirmed by a short trial at the start of N1:

- **A wave spectrum instead of a wave list.** Thousands of waves from an ocean spectrum driven by wind speed and fetch, computed on the GPU in several size bands so detail holds from a hand's width to the horizon. Calm, fresh breeze and gale are the same system with different wind.
- **One sea for eyes and physics.** The simulation needs wave heights under every hull, identical on every player's machine. So the sea is a function of seed, wind and shared clock. Preferred: the largest waves evaluated on the CPU (what hulls feel), the GPU adding the fine detail on top.
- **Foam where waves break**, driven by the surface folding over itself, lingering and fading.
- **The ship in the water.** Bow wave, wake, foam along the side, spray over the bow in a seaway, shot splashes. No water drawn inside the hull. Green water over the deck in a gale.
- **Light.** Sun glitter, sky reflection, the colour of deep water, light through wave crests, and a proper underwater view for the moment you lose. MasterWorld's lighting work (`src/render/sky.ts`: the light rig for physical albedos, the sky as fill light through the environment map, the brighter sky under a low sun, the eye adapting, cloud shadows, the colour grade over the day) moves into the shared sky package so both games use one rig.

## The ship and the fight

The ship is one real structure that sails, fights and breaks as a whole, so that damage changes what you can order.

**Sailing.** Wind on each set sail pushes and heels the ship, the hull resists sideways, the rudder turns her. She cannot sail straight into the wind, loses way in a tack and can miss stays if handled badly. The numbers are tuned for pace: a tack takes well under a minute.

**Guns.** Each gun has a crew that goes through the drill you can watch: sponge, load, ram, run out, aim, fire, recoil. Reload is about 30 to 40 seconds with a full crew and slower with men missing. Round shot for the hull, chain for rigging, grape for men. You choose the shot, the target and whether to fire as guns bear or on the roll.

**Damage.** Shot is traced through the actual ship. It holes planking, dismounts guns, cuts rigging, brings down spars and masts, starts fires and hits men. Holes near the waterline let water in, the pumps and the carpenter fight it, and the ship settles and lists as she fills.

**Losing.** The ship sinks, burns, blows up, or is so beaten that she strikes. Any of these ends the game for that captain.

## Multiplayer

Multiplayer is in from the start (Arnd) and runs on GameHub (the `gameserver` repository) as it is: one player's machine hosts the simulation, the others send their orders to it.

- **Orders are the only input.** A captain sends a few messages a minute, far below GameHub's limit of 60 a second.
- **The host sends the state** about 20 times a second: each ship's position and motion, sails, guns, damage, and each crew member's task and state, with events such as a shot fired or a mast falling.
- **The sea is not sent.** Every machine computes it from the seed, the wind and the shared clock.
- **Each machine draws its own detail.** Animation, smoke, spray and splinters are local.
- **Host migration.** Every machine holds the full state, so if the host leaves another carries on.
- **A computer captain** plays any ship without a human.

For this the simulation (`src/sim`) is pure, seeded and separate from drawing from the first step.

## Technology

A browser game in TypeScript on three.js with WebGPU, set up the way MasterWorld is.

| Need | Comes from |
| --- | --- |
| Renderer, shader compile policy, floating origin | `@futuremagic/stage` (AssetGenerator) |
| Sky, sun, moon, clouds, weather | `@futuremagic/sky` |
| Seeded random numbers, noise, maths | `@futuremagic/core` |
| Placed sound, ambience beds, muffling, echo, seeded takes, sound generation through OpenRouter | `@futuremagic/audio` |
| Many repeated meshes drawn by distance | `@futuremagic/instances` |
| Posing hands and feet, climbing | `@futuremagic/figure` |
| The crew: bodies, clothes, animation | Actors |
| Guns, blocks, barrels, fittings | AssetGenerator specs, packed with `@futuremagic/props` |
| Multiplayer rooms and relay | gameserver (GameHub client) |
| Duplicate finders | Toolbox |
| A starting point for decks that carry a walker, ship plans, ladders | MasterWorld `src/world/deck.ts`, `@futuremagic/settlement` ship plans |

New for Nauta: the sea, the sailing and gunnery simulation, the damage model, sails and rigging, the crew's task system, the order interface, and a brig detailed enough to live on for twenty minutes. Parts that other games could use, the sea first of all, go into the shared packages.

## Tablets

Nauta runs flawlessly on tablets from the first step, as a web app (Arnd), and that makes the tablet the machine everything is measured on. The reference tablet is the iPad Air with M4.

- **Touch is a first-class way to play.** One thumb walks, the other looks, a tap on a station or officer opens its orders. The order interface is designed for a finger first and gets keys and mouse on top.
- **The tablet sets the budget.** Frame time, memory and download size are set by the reference tablet. A desktop gets more (longer view, denser foam, more cloth detail) from the same systems through quality levels, never through a second code path.
- **The sea scales.** The number of wave bands and their resolution are settings, and the simulation's part of the sea is the same at every level, so tablets and desktops fight each other fairly.
- **The crew is the heaviest load.** Distant and hidden crew are drawn simply and animated at a lower rate from the start.
- **Memory is tight.** Safari closes a page that takes too much, so textures and sounds are loaded within a fixed budget and the brig is built from repeated parts.
- **A web app.** It installs to the home screen, runs full screen in landscape, and sound starts with the first tap.
- **Every step is checked on the tablet.** Every push to `main` deploys to https://arndrosemeier.github.io/Nauta/, so a step is judged by opening that page.

To confirm on the device: WebGPU with compute in Safari on the reference iPad, before the sea is built on it.

## Build order

The work packages of each step, their order and their gates are in [implementation-plan.md](implementation-plan.md).

Each step ends in something you can stand in and judge, and the sea comes first because everything else floats on it. Sound is not a step of its own: every step brings its sounds.

| Step | What is built | Done when |
| --- | --- | --- |
| N0 Keel | Repository, renderer, sky, checks, CI, a page that deploys | An empty sky renders from the deployed page on desktop and on the reference tablet, touch look works, and CI is green |
| N1 The sea | The new ocean, its height function for the simulation, the shared light rig, sea and wind sound | From deck height it beats MasterWorld side by side in calm, breeze and gale, at full frame rate on the reference tablet |
| N2 A ship afloat | The brig's hull and decks, floating on the waves, wake, bow wave, no water inside; you walk her | You can roam every deck of a ship riding the swell and it feels right in your stomach |
| N3 Under sail, together | Wind, masts, sails, rigging, the sailing model; two players in one room, each on their own ship | Two captains sail around each other in the same sea, by typed orders |
| N4 The crew | Crew members with stations and tasks, the order interface, speech bubbles | You give every sailing order from the deck and watch the men do it |
| N5 The guns | Gun drill, firing, shot in flight, smoke, splashes, the sound of a broadside | A broadside looks, sounds and feels like one, from both ships |
| N6 Damage | Holes, flooding, falling spars, fire, casualties, sinking, striking, the violence setting | A duel between two players runs to a proper end |
| N7 The opponent | The computer captain, the room and match flow, settings | A stranger can open the page and play a full duel alone or with a friend |

N1 and N2 carry the most risk for the quality wanted, so they get the most care and are not left until they convince.

## Later, and open questions

Not in the first game, but kept in mind so nothing blocks them: larger ships and more than two captains in a battle, squadrons commanded by signal flags, boarding, coasts and shoals, night and storm fights, a sandbox of voyages and ports, spoken orders, later ages up to destroyers and submarines, and fantasy settings.

Open:

- **WebGPU only?** The proposed sea needs GPU compute, which the WebGL 2 fallback does not have. Until N1 decides, N0 keeps the fallback.
- **Android tablets** from the start too?
- **How is the brig made?** Suggested: built in code from a ship plan (so damage can cut into it anywhere) with AssetGenerator props for fittings.
- **Which navies?** British against French around 1800 is the obvious first pair.
- **Does the fight have a coast?** Open sea only is simplest for the first game.
