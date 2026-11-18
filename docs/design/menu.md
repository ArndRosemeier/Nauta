# From the title to the deck: the menu and the match

The design that package N7.2 is built to. Written by the design thread on 2026-11-18, after Arnd asked for the main address to be brought into its final shape ("I understand that underneath it's not all working yet, but I would like to iterate that"). A first proposal throughout: Arnd iterates on what he sees. The look is [ui-style.md](ui-style.md)'s; this file says what each screen holds and what the match settings mean.

## What it must do

From a cold page to standing on deck in three taps. Nothing here ever feels like a web form: the sea and the brig are already there behind every screen, alive, and the menu sits over them. Everything works with one finger on the iPad; keys and mouse come on top.

## The screens

**1. The title** (N7.7). Shows almost at once and plays while the game prepares. One tap begins (and lets the sound start).

**2. The main screen.** Behind it, the view from her own quarterdeck at sea, hove to on a quiet morning, the ship moving under you. Over it, the name and four choices, largest first:

| Choice | Leads to |
| --- | --- |
| **Fight alone** | match setup, against a computer captain |
| **Host a duel** | match setup, then the waiting room with its code |
| **Join a duel** | enter a code, or pick from the open rooms |
| **Walk the ship** | on deck at sea with no enemy, free to roam and try orders |

Small, in a corner: Settings; the version with "What's new"; language (English, German). Later, when N7.4 exists: "Your first command" above the four.

**3. Match setup** (alone or hosting). One screen, every line with a sensible default, so a single tap on "Beat to quarters" starts a match:

| Setting | Choices | Default |
| --- | --- | --- |
| Your navy | British, French: two pictures of the same brig in her two coats | the last one chosen |
| The other captain (alone only) | Green, Seasoned, Master | Seasoned |
| Wind | As it comes; Light (force 2 to 3); Fresh (4); Strong (5 to 6) | As it comes |
| Hour | As it comes; Dawn; Day; Dusk; Moonlight | As it comes |
| How you meet | Meeting on even terms; You hold the weather position; She holds it | even terms |
| Length | 20 minutes; 40 minutes; an hour; no limit | 40 minutes |

"As it comes" is drawn from the match's seed. The seed is shown small and can be typed, so a match can be played again.

**4. The waiting room** (hosting). The room's code, large, with "Share" (the link that joins it) and the settings as chosen. The other captain appears with his name when he joins and takes the other navy. Each taps "Ready"; the match starts when both are. The host may still change settings until both are ready.

**5. Joining.** A field for the code and, under it, the open rooms from the server's list (host's name, wind, length). Tapping one joins it and shows the same waiting room, without the power to change settings.

**6. In the match** nothing of the menu is on screen except one small button in a corner. It opens the captain's pause: Resume; Settings (everything works mid-match); Leave the match (asked twice). Alone, the fight stands still while this is open. With another captain it does not, and the screen says so. Leaving a duel of two strikes your colours: the other captain wins.

**7. The end.** After the quiet moment on deck (N6.7), one card: how it ended (she struck, she sank, she burnt, she blew up, you struck, they parted at nightfall, she broke off the action), how long it lasted, and a few numbers for each ship (broadsides fired, shot that struck, men lost, masts lost). Then: "Again" (the same settings with a new seed; with two captains both must tap it) and "Back".

## What the match settings mean

- **The wind** sets the force for the whole match; it still veers and gusts as the wind does.
- **The hour and the sky's clock.** The match starts at the chosen hour and the sky then moves at three times the pace of the clock: twenty minutes of fighting are an hour of light. A fight begun at dusk ends in the dark, one begun before dawn sees the sun come up. The ship's bell keeps the match's own time.
- **How you meet.** On even terms is the start already decided: as far apart as the ships close in about three minutes, the wind on the beam of the line between them. Holding the weather position turns that picture so the wind blows from you toward her; she holding it, the other way. With two captains only "even terms" is offered unless the host changes it, and the guest sees what was chosen.
- **Length.** When the time runs out with neither ship lost, they part at nightfall and the match is drawn. The master warns five minutes before.
- **Sailing out of the fight.** A duel is fought in sight of each other. When the ships are more than 3 km apart the master says they are losing her. When they have been more than 4 km apart for a full minute the match ends: the ship that opened the distance has broken off the action and loses; if both sailed apart, it is drawn. A computer captain never runs unless he is beaten, and then he strikes.
- **Walk the ship** uses the same settings for wind and hour, with no enemy, no time limit and every order available, so it is also the place to learn her.

## Addresses

The plain address opens the title and then the main screen. A link with a room's code opens the title and then that room's waiting room. The working addresses (`?sail`, `?bench`, `?crew`, `?walk`, `?ship`, `?probe` and the scene switches) keep working as they are and skip the menu: they are tools.

## What is not here yet, and shows as such

Until the packages under it are built, a choice that cannot work yet is shown in its place, dimmed, with one line saying what is still coming, never hidden: Arnd is iterating on the final shape. "Your first command" (N7.4) appears when it exists.

## Built (first pass, 2026-11-18)

Everything above is on the plain address, with these still shown dimmed with their line: both captains tapping "Ready" (the room's match runs from the moment the room opens), "Again" with two captains, the navies' two coats. Sailing out of the fight is not a rule yet, so "she broke off the action" never ends a match. The sea behind the main screen is always the same quiet morning (her alone in a light wind, hove to by her crew as the menu opens). One tap on the title begins once the game is ready; before that, taps play with the title as they did. The theme plays on under the menu and fades when a match begins.
