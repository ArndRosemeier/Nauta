# Architecture: code that stays easy to change

Arnd, 2026-11-17: single responsibilities, "only one routine to take or deliver damage", named constants instead of literal ones, enforced as well as it can be, so that adjusting a damage formula does not mean touching twenty places. These rules are checked by `npm test` wherever a tool can check them.

## 1. One place does each thing

Every responsibility has one routine, in one file, listed in [SEAMS.md](SEAMS.md) ("the one place that does X").

- **Before writing, look in SEAMS.md.** If a row covers what you need, call it. If it cannot do what you need, change it there. Never write a second one beside it, and never copy its formula to a caller.
- **A new responsibility gets its row in the same commit.** A formula, a rule of the game, a conversion, a way of building or drawing something: each is a seam.
- **Checked:** every row must point at an export that exists; the duplication ratchet (CHECKS.md) fails on a copied body.

## 2. State has one owner

Each piece of the game's state (a ship's hull strength, a gun's load, a crew member's health, water in the hold) is changed by one file only, its owner. Everyone else reads it and asks the owner to change it.

- So all damage a ship takes goes through one function in one file, whatever caused it: shot, fire, flooding, a falling mast. To change how damage works, change that function.
- **Every field of simulation state gets a row in `tools/guards/rules.json` `owners`** when it is made: `{ "field": "hull", "owner": "src/sim/damage.ts", "what": "a ship's hull strength" }`.
- State types are `readonly` to everyone but the owner, so the compiler refuses a stray write too.
- **Checked:** an assignment to an owned field (`=`, `+=`, `++` and the like) outside its owner fails.

## 3. Numbers have names

A number in the code has a name that says what it means, declared once.

- Only `0`, `1` and `2`, and an index like `p[3]`, may stand bare. Every other number is a top-level `const UPPER_CASE = ...` with a comment giving its unit and why it has this value.
- **The game's rules are data, in one place per subject.** How hard a 12-pounder hits, how long a reload takes, how fast a brig turns: tables in `src/sim/rules/` (one file per subject: guns, ships, crew, damage), not numbers spread through the code that uses them. Tuning the game means editing those files.
- Units and conversions are in `src/sim/units.ts`.
- A named constant is not repeated: if two files need it, one exports it.
- **Checked:** a bare number anywhere under `src` fails, with its file and line.

## 4. Layers

`src/sim` is the game itself, pure: no three.js, no DOM, seeded. It runs in tests, in workers and on the multiplayer host. `src/render` draws what the simulation says and decides nothing about the game. `src/app` joins them and handles input. **Checked** (`rules.json`).

## What no tool checks

Whether a function does one thing, and whether a new routine is really new. For those: keep functions short enough to name honestly, and when a change needs the same edit in two places, stop and make it one place first. The `COPIES:` line in every commit says what was found and folded.
