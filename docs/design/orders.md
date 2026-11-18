# Orders: how the captain commands

The orders specification that package N4.4 (the order interface) is built to, with what N3.4, N4.1, N4.5, N5.3 and N6 take from it. Written by the design thread on 2026-11-18. **Agreed by Arnd on 2026-11-18** ("yes to all for this slice. Later when we expand the game more might be needed."); his answers are at the end.

## What it has to do

An order is the game's only verb. The interface must let the captain give any order in under two seconds with one finger, in the middle of a turn, without a text panel and without taking him out of the ship. What happens after is seen in the men, never in a list.

Fixed by the design: the captain never steers, trims or fires himself; the crew has no voices, so every answer is a speech bubble, a pipe or a drum; what can be shown is shown.

## Three ways to give an order

1. **To a man you can see.** Look at an officer or tap him, and his orders open around your finger. He is hailed across the deck, so this works from anywhere he can see or hear you, which on a 30 m brig is the whole weather deck. This is the main way.
2. **Through your midshipman.** A midshipman stays at the captain's side wherever he goes: below, aloft, on the bowsprit. Tap him and choose first whom the order is for, then the order. He runs to deliver it, and you see him go. It costs the time of his run, so being away from the quarterdeck in a fight has a price, and it is never impossible to command.
3. **From the officer row** (Arnd 2026-11-18: "As a player of course I have no idea which person does what. Give me everybody that I can command as an icon with a small description below, obviously clickable. Clicking one of those then reveals the available commands."). Along the foot of the view, always on screen, one card for each man he commands: an icon, his rank and what he is for ("Master: steering and course"). A tap or click on a card opens that man's fan above it, the same fan as a tap on the man; the same card again closes it. A man out of the captain's voice is marked "by midshipman" and his orders go by the midshipman, as with the keys. It is the main way to start with, since nobody has to be found in the ship first; taps on men in the world and keys stay. With the mouse taken for looking the cards cannot be clicked (the pointer is locked): free it with Escape, or use the dot and the keys.
4. **By key** (keyboard) for the frequent orders. A key gives the same order to the same officer, hailed if he is in reach of your voice, by the midshipman if not.

The game never pauses while orders are open, and the view keeps moving with the ship.

## The officer row

Six cards along the foot of the view, in the midshipman's order: master (the wheel: steering and course), first lieutenant (a square sail: sails, quarters, striking), gunner (a gun: guns and shot), carpenter (a hammer: leaks and repairs), lookout (a spyglass: what he sees), midshipman (a sealed letter: carries your word below). Each is a lacquer card in a brass rule with the icon in brass on a round lacquer disc, the rank in small brass capitals and the role in small italic. A card of a man out of voice has a dashed disc and "by midshipman" under it; the card of the open fan is brass; in the first match the lesson rings the card of the man to tap. On a narrow screen (a phone) the roles are left out; while "Fire!" or "Steer there" stand by the thumb, a tablet's row moves to the left clear of them. Built in `src/app/officerRow.ts`; what the cards say is `officerCards` in `fanOrders.ts`.

## The order fan

- Tapping a man opens a fan of **at most six** orders around the finger, each a large round button with a small picture and one or two words. The fan shows only orders that make sense at this moment for this man: the master offers "Tack" only under way, the gunner offers "Fire" only when guns are loaded.
- At most **one more level**: "Sail" opens the settings of sail, "Shot" the three kinds. Never deeper.
- Slide the finger to an order and lift it, or tap the man and then the order: both work. Lifting outside the fan gives no order.
- An order that cannot be done now is shown dim. Choosing it makes the man say why in his bubble ("She has no way on her, sir").
- The order now being carried out carries a ring, so opening the fan also answers "what did I tell him".
- With a mouse the fan opens on a click; the middle of the view picks the man when the pointer is locked. As built (2026-11-18, after Arnd found the PC controls unclear; `src/app/mouse.ts`): the mouse is **free** at first (a drag looks, a left click on a man opens his fan round the cursor, the man under the cursor is named) and a plain click on the sea or deck **takes** it (pointer lock: it looks without a button, a brass dot marks the middle, a click opens the fan of the man under the dot and moving the mouse moves a brass pointer from the hub onto an order). The right button never opens anything: it steps back out of a ring, closes the fan, lowers the pointing arm. Escape frees the mouse; Escape again opens the captain's pause. A sheet frees it too. On a desk each tag with a key shows the key's cap.

## Who takes which orders

Stations and people are those of [ship.md](ship.md) ("Where orders are given"). Milestone says when an order arrives in the game.

| To | Order | What happens | From |
| --- | --- | --- | --- |
| **The master**, at the wheel | Steer there | The captain's arm points where he looks; she comes to that heading. Refused closer than close-hauled: the master says so and steers close-hauled on the tack that course falls on. A course order never takes her through the wind: a course on the other tack is reached by wearing, and the master says "Wearing round, sir" | N4 |
| | Come up a point, Bear away a point | Eleven and a quarter degrees toward or off the wind; repeated taps add up | N4 |
| | Full and by | As close to the wind as she will lie, following the wind as it shifts | N4 |
| | Steer for her, Keep her on the beam | Follow the enemy: head for her, or hold her abeam on the engaged side at the distance now | N5 |
| | Tack, Wear | Through the wind, or round before it, onto the other tack | N4 |
| | Heave to | Main yards aback, courses up, boom sail brailed, helm down: she stops in about a minute | N4 |
| **The first lieutenant**, on the quarterdeck, the boatswain beside him | Sail: Battle sail, Plain sail, All sail, Shorten sail | The four settings of N3.3; "Shorten" is one step down. Reefs are the crew's own business by the wind's force | N4 |
| | Back the main topsail, Fill | One mast laid aback to check her way, and let draw again | N4 |
| | Beat to quarters, Stand down | The drum; every man to his station for battle, guns cast loose, the surgeon ready, marines to the tops. A ship not at quarters cannot fire | N5 |
| | Hands to the pumps, Fire party, Clear the wreckage | Men taken from guns and sails for the ship's life (the first lieutenant says how many it costs) | N6 |
| | Strike the colours | Gives up the fight. Asked twice | N6 |
| **The gunner** (the second lieutenant in action), in the waist | Shot: Round, Chain, Grape | What the next loading is. Guns already loaded fire what they hold | N5 |
| | Aim: Hull, Rigging, Deck | Where the gun captains lay their guns | N5 |
| | Fire as they bear | Each gun fires when it bears on her, and keeps firing | N5 |
| | Hold for my word, then **Fire!** | The loaded side waits, on the roll, for the captain's word. While it waits, a large "Fire!" stays on screen by the thumb, wherever the captain stands. This is the one order with no walk and no fan, because the moment is the game | N5 |
| | Cease firing | Guns finish loading and stand ready | N5 |
| **The carpenter**, at the well | Sound the well | He reports the water in her | N6 |
| | Plug the shot holes, Man the pumps | Where his crew works first | N6 |
| **The lookout**, in the top | What do you see? | He reports her bearing, course, sail and state | N4 |
| **The surgeon**, on the berth deck | (reports only) | The butcher's bill when asked | N6 |

Which side fires is never ordered: the side she bears on fires. Orders left out on purpose for the first game: single sails and single yards, single guns, the anchors, the boats, boarding.

## The fans as built (confirmed 2026-11-18)

- **The master:** Steer there; Come up; Bear away; About (a ring: Tack, Wear); Keep her (a ring of standing orders: Full and by, Steer for her, Her on the beam); Heave to.
- **The first lieutenant:** Make sail (a ring: battle, plain, all); Shorten; Back or Fill (one place, whichever applies); Quarters or Stand down (one place); Her life (a ring: Hands to the pumps, Fire party, Clear the wreckage); Strike (asked twice).
- **The midshipman** asks whom the order is for, then shows that man's fan. He follows the captain on every deck and below, never aloft; from aloft the captain hails, and a hail reaches the weather deck.
- **The carpenter:** Sound the well (he reports the water in her, an event), Plug the shot holes, Man the pumps.
- Standing at a fixed standpoint without walking, the captain counts as on the quarterdeck.

**One crew serves a pair of guns.** At quarters each gun's crew stands to the gun of its pair on the side that is engaged, and crosses the deck when the other side comes to bear, which is seen and takes its seconds. Fought on both sides at once, the crews are split between the pair and each gun is served at a little over half pace. So which side a captain shows the enemy, and being caught between two fires, matter.

## How an order travels

1. **The captain's part is seen.** His arm points for a course, he lifts the speaking trumpet for a hail, he turns to his midshipman.
2. **The answer.** The man addressed answers in a bubble ("Aye aye, sir. Ready about!") and the order goes down the chain as short bubbles over each man who passes it on, at most three on screen for one order. The boatswain's pipe sounds the call for that kind of order (N4.6), so with time the ear knows what was ordered.
3. **The work.** Men leave what they were doing and go to their places by the ways of N4.2. How long it takes comes from the hands free, how far they go and the state of the ship (N4.1).
4. **Done, or not.** The officer reports when it matters ("She's about, sir", "Missed stays, sir!"). A routine order ends without a word: the result is on view.

**Orders compete for men.** A new order to the same officer replaces his last one if they cannot both stand (a tack ordered during a tack is refused until she is round). Orders to different officers run together and share the hands; when there are too few, the first lieutenant says so and the slower work is seen. The captain never queues orders: one word at a time to each officer, as on a ship.

**Answers are events, and they are codes, not sentences.** The simulation raises three kinds for an order: `refused` (not done, with why), `answered` (taken, with something the captain must know: "wearing round", "close-hauled instead", "too few hands, it will be slow") and the plain result events (`tacked`, `wore`, `missed stays`). Each carries a short code for what is said, never the words: the phrase book (N4.5) turns the code into the man's words in the player's language. An order that is taken but changed (a course she cannot lie) is `answered`, not `refused`.

## What you are told without asking

Reports are bubbles over the man who makes them, raised by the simulation's events, never by a rule in the interface. Each is short enough to read at a glance and shows for as long as it takes to read.

| Who | Reports |
| --- | --- |
| Lookout | A sail sighted; she tacks, wears, makes or shortens sail; she opens her ports; her mast is gone; she strikes |
| Master | Wind shifts or freshens; "She won't lie that course"; missed stays; taken aback ("Bearing away a point, sir, she was taken aback": under a steer order the helmsman bears away by himself, a point at a time at most) |
| First lieutenant | At quarters; too few hands for what is ordered; fire; the colours shot away |
| Gunner | Side ready; guns bear; a gun dismounted |
| Carpenter | Water in the well rising or gaining; holed below the waterline; a mast wounded |
| Surgeon | Only when asked |

A cry in danger ("Fire in the fore hold!") is larger and carries a sound, and is the only kind that may interrupt another bubble.

## Bubbles and the phrase book

- A bubble hangs over the speaker's head, turned to the captain, with a tail to the man. Far speakers get a smaller bubble with larger letters, so it stays readable; a speaker out of view gets his bubble at the screen's edge on his side, with his rank.
- Never more than four bubbles at once. Reports wait their turn, the newest order's answer goes first, and stale ones are dropped, not shown late.
- The phrases are data (N4.5): by order or event, rank and navy, several seeded variants each so a man does not repeat himself. The first game's words are English and German by the device's language. Both navies speak the player's language, since a bubble must be read at a glance; the navies differ in names, dress and turns of phrase.
- The sea words stay (larboard, starboard, "Ready about", "Helm's a-lee") with nothing explained in text: the men doing it is the explanation.

## Keys

Walking keeps W, A, S, D and the mouse. Orders:

| Key | Order | Key | Order |
| --- | --- | --- | --- |
| X | Steer there (where you look) | 1, 2, 3 | Battle sail, plain sail, all sail |
| Z, C | Come up, bear away a point | 4 | Shorten sail |
| T | Tack | B | Beat to quarters |
| G | Wear | 7, 8, 9 | Round, chain, grape |
| H | Heave to | F | Fire as they bear; while holding for your word: Fire! |
| E | Open the fan of the man you look at | V | Cease firing |
| M | Turn to the midshipman | Q | Raise or lower the spyglass |

## What each package takes from this

- **N3.4** (orders, pure): the sailing rows above as its vocabulary, with the refusals and their reasons as events. Until the crew exists each order takes its time from a table.
- **N3.5** (typed orders and buttons): a plain working panel of the same orders; it stays as a test tool and is not this interface.
- **N4.1** (crew and tasks): who takes each order, the chain it passes down, the hands it needs, what replaces what.
- **N4.4** (the order interface): the fan, the three ways, the keys, the captain's seen part, the midshipman.
- **N4.5** (bubbles): the bubble rules, the reports table and the phrase book.
- **N5.3** (gunnery orders): the gunner's rows, the first lieutenant's "Beat to quarters", the master's two following orders and the "Fire!" button.
- **N6**: the carpenter's and surgeon's rows, the pumps, fire party, wreckage and striking.

## Arnd's answers (2026-11-18)

Yes to all four, for this first game; more may be needed when the game grows.

1. **The midshipman:** orders from anywhere on the ship go by a midshipman who runs with them.
2. **"Steer there":** a course is given by looking where she should go, with "a point" up or off the wind for fine changes. No compass numbers.
3. **The "Fire!" button:** while a broadside is held for the captain's word, one large button stays on screen.
4. **No pause:** the ship and the fight go on while the fan is open, in single player too.
