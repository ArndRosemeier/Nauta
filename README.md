# Nauta

Ship battles commanded from the deck (TypeScript, three.js, WebGPU). You walk your ship and give the orders; the crew sails and fights her. The first game is a duel of two brigs in the age of sail, for two players or against a computer captain, in the browser on a desktop or a tablet.

Design and build order: [docs/design/nauta-plan.md](docs/design/nauta-plan.md). Rules for contributors (human or AI): [CLAUDE.md](CLAUDE.md).

## Play it

https://arndrosemeier.github.io/Nauta/ (built from `main` on every push). On an iPad, "Add to Home Screen" in Safari's share menu makes it a full-screen app.

So far (step N0): the sky through the day. Drag with a finger or the mouse to look around. `?hud` shows frame time and the clock, `?hour=18` sets the hour, `?day=2` makes a day last two minutes.

## Run it

```sh
git clone --recurse-submodules https://github.com/ArndRosemeier/Nauta
cd Nauta
npm install
npm run dev        # http://localhost:5300
```

Already cloned without submodules: `git submodule update --init`.

## Checks

`npm test` (unit tests and guards), `npm run build` (typecheck and bundle), `npm run shot -- "?hud" shots/x.png` (headless screenshot after a build).
