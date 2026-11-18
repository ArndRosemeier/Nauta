# Orders: how the captain commands

The orders specification that package N4.4 (the order interface) is built to, with what N3.4, N4.1, N4.5, N5.3 and N6 take from it. Written by the design thread on 2026-11-18. **A proposal until Arnd agrees**; the four questions for him are at the end.

## What it has to do

An order is the game's only verb. The interface must let the captain give any order in under two seconds with one finger, in the middle of a turn, without a text panel and without taking him out of the ship. What happens after is seen in the men, never in a list.

Fixed by the design: the captain never steers, trims or fires himself; the crew has no voices, so every answer is a speech bubble, a pipe or a drum; what can be shown is shown.

## Three ways to give an order

1. **To a man you can see.** Look at an officer or tap him, and his orders open around your finger. He is hailed across the deck, so this works from anywhere he can see or hear you, which on a 30 m brig is the whole weather deck. This is the main way.
2. **Through your midshipman.** A midshipman stays at the captain's side wherever he goes: below, aloft, on the bowsprit. Tap him and choose first whom the order is for, then the order. He runs to deliver it, and you see him go. It costs the time of his run, so being away from the quarterdeck in a fight has a price, and it is never impossible to command.
3. **By key** (keyboard) for the frequent orders. A key gives the same order to the same officer, hailed if he is in reach of your voice, by the midshipman if not.

The game never pauses while orders are open, and the view keeps moving with the ship.

## The order fan

- Tapping a man opens a fan of **at most six** orders around the finger, each a large round button with a small picture and one or two words. The fan shows only orders that make sense at this moment for this man: the master offers "Tack" only under way, the gunner offers "Fire" only when guns are loaded.
- At most **one more level**: "Sail" opens the settings of sail, "Shot" the three kinds. Never deeper.
- Slide the finger to an order and lift it, or tap the man and then the order: both work. Lifting outside the fan gives no order.
- An order that cannot be done now is shown dim. Choosing it makes the man say why in his bubble ("She has no way on her, sir").
- The order now being carried out carries a ring, so opening the fan also answers "what did I tell him".
- With a mouse the fan opens on a click; the middle of the view picks the man when the pointer is locked.

## Who takes which orders

Stations and people are those of [ship.md](ship.md) ("Where orders are given"). Milestone says when an order arrives in the game.

| To | Order | What happens | From |
| --- | --- | --- | --- |
| **The master**, at the wheel | Steer there | The captain's arm points where he looks; she comes to that heading. Refused closer than close-hauled: the master says so and steers close-hauled on the nearer tack | N4 |
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

## How an order travels

1. **The captain's part is seen.** His arm points for a course, he lifts the speaking trumpet for a hail, he turns to his midshipman.
2. **The answer.** The man addressed answers in a bubble ("Aye aye, sir. Ready about!") and the order goes down the chain as short bubbles over each man who passes it on, at most three on screen for one order. The boatswain's pipe sounds the call for that kind of order (N4.6), so with time the ear knows what was ordered.
3. **The work.** Men leave what they were doing and go to their places by the ways of N4.2. How long it takes comes from the hands free, how far they go and the state of the ship (N4.1).
4. **Done, or not.** The officer reports when it matters ("She's about, sir", "Missed stays, sir!"). A routine order ends without a word: the result is on view.

**Orders compete for men.** A new order to the same officer replaces his last one if they cannot both stand (a tack ordered during a tack is refused until she is round). Orders to different officers run together and share the hands; when there are too few, the first lieutenant says so and the slower work is seen. The captain never queues orders: one word at a time to each officer, as on a ship.

## What you are told without asking

Reports are bubbles over the man who makes them, raised by the simulation's events, never by a rule in the interface. Each is short enough to read at a glance and shows for as long as it takes to read.

| Who | Reports |
| --- | --- |
| Lookout | A sail sighted; she tacks, wears, makes or shortens sail; she opens her ports; her mast is gone; she strikes |
| Master | Wind shifts or freshens; "She won't lie that course"; missed stays; taken aback |
| First lieutenant | At quarters; too few hands for what is ordered; fire; the colours shot away |
| Gunner | Side ready; guns bear; a gun dismounted; powder running low |
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

## Questions for Arnd

1. **The midshipman.** Orders from anywhere on the ship go by a midshipman who runs with them, so leaving the quarterdeck costs time but never control. The alternative is that the captain must walk to within hail himself. Proposed: the midshipman.
2. **"Steer there".** A course is given by looking where she should go and saying so, with the captain's arm seen pointing. No compass numbers. Proposed: yes, with "a point" up or off the wind for fine changes.
3. **The "Fire!" button.** While a broadside is held for the captain's word, one large button stays on screen. It is still an order, but it is the only one given without picking a man. Proposed: yes, because timing the broadside on the roll is the heart of the fight.
4. **No pause.** The ship and the fight go on while the fan is open. Proposed: yes, in single player too.
