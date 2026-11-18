import { test } from 'node:test';
import assert from 'node:assert/strict';
import { footropeY } from '@futuremagic/figure';
import { shipPlan } from '../src/sim/ship/plan.ts';
import { rigPlan, rigWalk } from '../src/sim/ship/rig.ts';
import { aloftWay, bowspritStep, chainOf, floorAloft, standsOn, surfaceOf } from '../src/sim/ship/aloftWalk.ts';
import { spotOf } from '../src/sim/ship/deckWalk.ts';
import { LOOK_UP } from '../src/sim/rules/walking.ts';
import { Captain } from '../src/app/captain.ts';

const plan = shipPlan(), graph = rigWalk(plan), rig = rigPlan(plan), DT = 1 / 30, UP = { x: 0, y: 1, z: 0 };
/** Facing out to starboard (+x), forward (-z), aft, and to port. */
const STARBOARD = -Math.PI / 2, FORWARD = 0, PORT = Math.PI / 2;
type Push = { forward: number; strafe: number; heading: number };

/** Frames of `push` (the look turned the way he faces while he climbs) until `done`, at most `seconds`; returns the frames' time, s. */
function run(c: Captain, push: Push, done: () => boolean, seconds: number, pitch = 0): number {
  let t = 0;
  for (; t < seconds && !done(); t += DT) c.update({ ...push, heading: Number.isNaN(push.heading) ? c.facing ?? 0 : push.heading }, UP, DT, pitch);
  return t;
}
const on = (c: Captain) => c.aloft.on;
const chainY = (c: Captain) => { const o = on(c); return o?.kind === 'chain' ? o.y : NaN; };
const standingOn = (c: Captain, id: string) => () => !c.aloft.active && c.walker.place === id;

/** On the main shrouds to starboard, the feet at `y` (ship space): walked into them from the deck and climbed. */
function upTheMainShrouds(y: number): Captain {
  const c = new Captain(plan, graph, chainOf(rig, 'main', 1, 'lower').below);
  run(c, { forward: 1, strafe: 0, heading: STARBOARD }, () => on(c)?.kind === 'chain', 4);
  run(c, { forward: 1, strafe: 0, heading: NaN }, () => chainY(c) >= y, 15);
  return c;
}

test('aloft: walked into the shrouds from her deck he gets on them, climbs as pushed, hangs on where he stops, and goes over the rim onto the top', () => {
  const c = upTheMainShrouds(8);
  assert.ok(Math.abs(chainY(c) - 8) < 0.1, `${chainY(c)}`);
  // Let go of the thumb: he hangs on, still.
  const y = c.climber!.pos.y;
  run(c, { forward: 0, strafe: 0, heading: NaN }, () => false, 1);
  assert.ok(Math.abs(c.climber!.pos.y - y) < 1e-6 && c.onLadder);
  let biggest = 0, last = c.eye[1];
  run(c, { forward: 1, strafe: 0, heading: NaN }, () => { biggest = Math.max(biggest, Math.abs(c.eye[1] - last)); last = c.eye[1]; return standingOn(c, 'main-top')(); }, 15);
  assert.equal(c.walker.place, 'main-top');
  const s = spotOf(c.walker), top = surfaceOf(rig, 'main-top')!;
  assert.ok(standsOn(rig, top, s.along, s.across) && Math.abs(c.walker.floor - floorAloft(top, s.along)) < 1e-9, 'standing on the top');
  assert.ok(biggest < 0.12, `the eye jumped ${biggest.toFixed(3)} m in a frame`);
});

test('aloft: level with a yard a push aside takes him across onto its footrope, out to the yardarm, and back onto the shrouds', () => {
  const way = aloftWay(rig, 'main-yard-s'), yard = surfaceOf(rig, way.to.space)!.yard!;
  const c = upTheMainShrouds(way.at! - 0.2), y = chainY(c);
  // Facing in to the mast on her starboard shrouds, the yard (forward) is on his right.
  run(c, { forward: 0, strafe: 1, heading: NaN }, () => on(c)?.kind === 'yard', 4);
  assert.equal(on(c)?.kind, 'yard');
  run(c, { forward: 0, strafe: 1, heading: NaN }, () => false, 3);
  const o = on(c);
  assert.ok(o?.kind === 'yard' && o.s > 1.5, 'sidled out');
  const feet = c.climber!.limbs!.footR!.p;
  assert.ok(Math.abs(feet.y - footropeY(yard, feet.x)) < 0.15, 'his feet on the footrope');
  run(c, { forward: 0, strafe: -1, heading: NaN }, () => on(c)?.kind === 'chain', 10);
  assert.ok(Math.abs(chainY(c) - y) < 1e-9, 'back on the shrouds where he got off them');
});

test('aloft: on a top, looking up he climbs the shrouds over him; looking level he goes down over the rim', () => {
  const start = aloftWay(rig, 'main-shrouds-s').to;
  for (const [pitch, tier] of [[LOOK_UP + 0.1, 'upper'], [0, 'lower']] as const) {
    const c = new Captain(plan, graph, start);
    assert.equal(c.walker.place, 'main-top');
    run(c, { forward: 1, strafe: 0, heading: STARBOARD }, () => on(c)?.kind === 'chain', 6, pitch);
    const o = on(c);
    assert.ok(o?.kind === 'chain' && o.chain.tier === tier && o.chain.climb.side === 1, `${tier}: ${JSON.stringify(o?.kind)}`);
  }
});

test('aloft: onto the bowsprit from beside its heel, out along it, onto the jib-boom\'s rising footrope, and back on deck', () => {
  const c = new Captain(plan, graph, bowspritStep(1));
  run(c, { forward: 1, strafe: 0, heading: PORT }, standingOn(c, 'bowsprit'), 6);
  assert.equal(c.walker.place, 'bowsprit');
  run(c, { forward: 1, strafe: 0, heading: FORWARD }, () => on(c)?.kind === 'yard', 15);
  const o = on(c);
  assert.ok(o?.kind === 'yard' && o.surface.id === 'jib-boom-footrope-s', 'on the jib-boom\'s horse to starboard');
  // Out along it the body rises with the boom.
  const y0 = c.climber!.pos.y;
  run(c, { forward: 1, strafe: 0, heading: FORWARD }, () => false, 4);
  assert.ok(c.climber!.pos.y > y0 + 0.2, `${(c.climber!.pos.y - y0).toFixed(2)} m higher`);
  run(c, { forward: -1, strafe: 0, heading: FORWARD }, standingOn(c, 'bowsprit'), 15);
  run(c, { forward: -1, strafe: 0, heading: FORWARD }, standingOn(c, 'deck'), 20);
  assert.equal(c.walker.place, 'deck');
});

test('aloft: walking past the shrouds by her rail is no push into them; a start aloft stands him there', () => {
  const below = chainOf(rig, 'main', 1, 'lower').below;
  const c = new Captain(plan, graph, { ...below, along: below.along - 2 });
  run(c, { forward: 1, strafe: 0, heading: FORWARD }, () => false, 3);
  assert.ok(!c.onLadder && c.walker.place === 'deck');
  const masthead = new Captain(plan, graph, { space: 'main-crosstrees', along: -0.85, across: 0.45 });
  assert.equal(masthead.walker.place, 'main-crosstrees');
  assert.ok(masthead.eye[1] > 25, 'his eye at the masthead');
});
