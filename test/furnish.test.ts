import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodePack } from '@futuremagic/props';
import { furnish, type Furnishing } from '../src/sim/ship/furnish.ts';
import { insideBreadth, shipPlan } from '../src/sim/ship/plan.ts';
import { weatherDeck } from '../src/sim/ship/hull.ts';
import { CASK, MODEL } from '../src/sim/rules/fittings.ts';
import { BELAY_HEIGHT, LOAD_WATERLINE, RAILS } from '../src/sim/rules/ships.ts';

const plan = shipPlan();
const all = furnish(plan);
const along = (f: Furnishing) => -f.z;
const height = (f: Furnishing) => f.y + LOAD_WATERLINE;
const of = (model: string) => all.filter((f) => f.model === model);
/** Fittings that hang outboard of her side by design: the anchors at the catheads, the stern davits and the gig. */
const OUTBOARD = new Set<string>([MODEL.anchor, MODEL.davits, MODEL.gig, MODEL.netting]);
/** Two places this close are one, m. */
const CLOSE = 1e-6;
/** Casks nested in a tier touch the two below: this close counts as touching, m. */
const TOUCHING = 1e-3;
/** The guns stand against her side, where the deck's round lifts them a hair above the height the plan reckons her inside at, m. */
const AT_THE_SIDE = 0.01;
/** Cots and tables hang this far above their origin on the floor, where her side has flared out a little, m. */
const HANGING = 0.6;
/** The boats on the skids are not a pair: the cutter to port, the jolly boat to starboard. */
const UNPAIRED = new Set<string>([MODEL.cutter, MODEL.jolly]);

test('furnishing her is the same every time', () => {
  assert.deepEqual(furnish(plan), all);
});

test('a long six stands behind every port the plan gives one but the chase port, both sides (the carronades are drawn with her)', () => {
  const guns = of(MODEL.long6);
  const expected = plan.guns.filter((g) => !g.chase && g.gun !== 'carronade');
  assert.equal(guns.length, expected.length);
  for (const g of expected) {
    const here = guns.filter((f) => Math.abs(along(f) - g.along) < CLOSE && Math.sign(f.x) === g.side);
    assert.equal(here.length, 1, g.id);
    // Its muzzle points out of the port: the model's front (+z) turned to her side.
    assert.ok(Math.abs(Math.sin(here[0]!.turn) - g.side) < CLOSE, g.id);
  }
  assert.equal(of(MODEL.long6).length, 2);
});

test('every fitting but those hung outboard stands inside her side', () => {
  for (const f of all) {
    if (OUTBOARD.has(f.model)) continue;
    const inside = Math.max(insideBreadth(along(f), height(f)), insideBreadth(along(f), height(f) + HANGING));
    assert.ok(Math.abs(f.x) <= inside + AT_THE_SIDE, `${f.model} at ${along(f).toFixed(2)}, ${f.x.toFixed(2)}`);
  }
});

test('she is furnished the same to port and to starboard', () => {
  for (const f of all.filter((g) => g.x > CLOSE && g.level === 'weather' && !UNPAIRED.has(g.model))) {
    const twin = all.find((g) => g.model === f.model && Math.abs(g.x + f.x) < CLOSE && Math.abs(g.z - f.z) < CLOSE && Math.abs(g.y - f.y) < CLOSE);
    assert.ok(twin, `${f.model} at ${along(f).toFixed(2)}`);
  }
});

test('the helm, capstan, guns and bitts stand on the weather deck', () => {
  for (const f of [...of(MODEL.wheel), ...of(MODEL.binnacle), ...of(MODEL.capstan), ...of(MODEL.long6), ...of(MODEL.bitts), ...of(MODEL.fifeRail)]) {
    assert.ok(Math.abs(height(f) - weatherDeck(along(f), f.x)) < CLOSE, f.model);
  }
});

test('every fife rail of the plan has its timber, its front face on the rail, facing the men who haul there', () => {
  const rails = RAILS.filter((r) => r.kind === 'fife rail');
  const timbers = [...of(MODEL.bitts), ...of(MODEL.fifeRail)];
  assert.equal(timbers.length, rails.length);
  for (const r of rails) {
    const t = timbers.find((f) => Math.abs(along(f) - r.at) < CLOSE);
    assert.ok(t, r.id);
    // The model's front (+z) turned toward the side the men stand: aft is +z in her space, so forward is a half turn.
    assert.ok(Math.abs(Math.cos(t.turn) + r.toward) < CLOSE, r.id);
    // Its pins (the rig's) stand level on the rail's top, however the deck below rounds up.
    for (const b of plan.belays.filter((p) => p.rail === r.id)) assert.ok(Math.abs(b.height - (height(t) + BELAY_HEIGHT)) < CLOSE, b.id);
  }
});

test('below her weather deck every fitting stands in a room of its deck', () => {
  for (const f of all.filter((g) => g.level !== 'weather')) {
    const room = plan.spaces.find((s) => s.level === f.level && along(f) >= s.aft && along(f) <= s.fore && f.x >= s.port && f.x <= s.starboard);
    assert.ok(room, `${f.model} at ${along(f).toFixed(2)}, ${f.x.toFixed(2)}`);
  }
});

test('the casks in the hold never pass through one another', () => {
  const butts = of(MODEL.butt);
  assert.ok(butts.length > 20);
  for (const a of butts) {
    for (const b of butts) {
      if (a === b || Math.abs(a.z - b.z) > CLOSE) continue;
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 2 * CASK.butt.radius - TOUCHING, `butts at ${a.x.toFixed(2)}, ${b.x.toFixed(2)}`);
    }
  }
});

test('the fittings pack holds every model she is furnished with', () => {
  const pack = decodePack(new Uint8Array(readFileSync(new URL('../public/ship/fittings.fmpk', import.meta.url))));
  for (const model of new Set(all.map((f) => f.model))) assert.ok(pack.has(model), model);
});
