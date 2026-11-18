import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BODY } from '../src/sim/rules/ships.ts';
import { DOOR_PASS } from '../src/sim/rules/walking.ts';
import { holds, overheadAt, shipPlan } from '../src/sim/ship/plan.ts';
import { shipY } from '../src/sim/ship/section.ts';
import { nodeAt, walkGraph } from '../src/sim/ship/walk.ts';
import { doorAngle, doorHinge, doorLeaves, shutDoors, stepDoors } from '../src/sim/ship/doors.ts';
import { CAPTAIN_GAIT, eyeOf, ladderOffered, spotOf, stepWalker, walkerAt, type DeckWalker } from '../src/sim/ship/deckWalk.ts';
import { keyPush, stickPush, STICK_REACH } from '../src/app/thumbs.ts';

const plan = shipPlan(), graph = walkGraph(plan), DT = 1 / 30;
/** The yaw that faces from a spot toward a place (along, across). */
const yawTo = (w: DeckWalker, along: number, across: number) => { const s = spotOf(w); return Math.atan2(-(across - s.across), along - s.along); };

test('every door is hinged on a jamb of its doorway and opens into one of its two spaces, its turn taking the leaf there', () => {
  assert.equal(doorLeaves(plan).length, plan.ways.filter((w) => w.kind === 'door').length);
  for (const leaf of doorLeaves(plan)) {
    assert.ok([leaf.way.from.space, leaf.way.to.space].includes(leaf.into), leaf.id);
    assert.ok(Math.abs(Math.hypot(leaf.hinge[0] - leaf.middle[0], leaf.hinge[1] - leaf.middle[1]) - leaf.width / 2) < 1e-9, `${leaf.id}: hinge on a jamb`);
    // Turned by +90° × opens about ship space's +y (x across, z aft), the shut leaf points into `into`.
    const sx = leaf.shut[1], sz = -leaf.shut[0], t = (leaf.opens * Math.PI) / 2;
    const ox = sx * Math.cos(t) + sz * Math.sin(t), oz = -sx * Math.sin(t) + sz * Math.cos(t);
    assert.ok(ox * leaf.toward[1] + oz * -leaf.toward[0] > 0.99, `${leaf.id}: opens into ${leaf.into}`);
    const into = plan.spaces.find((s) => s.id === leaf.into)!;
    assert.ok(holds(into, leaf.middle[0] + leaf.toward[0] * leaf.width / 2, leaf.middle[1] + leaf.toward[1] * leaf.width / 2), `${leaf.id}: toward lies in ${leaf.into}`);
  }
  assert.equal(doorHinge(plan, 'cabin-door').into, 'cabin', "the captain's door opens into his cabin, not into the passage");
  assert.equal(doorHinge(plan, 'magazine-door').into, 'magazine');
  // Standing open, no leaf cuts a space in two (the walk graph keeps clear of open leaves).
  // One part to each space; the weather deck's three, the quarterdeck, the waist and the forecastle (N2.12), joined by ladders.
  assert.equal(graph.nodes.length, new Set(graph.nodes.map((n) => n.space)).size + 2, 'one part to each space');
  assert.equal(graph.nodes.filter((n) => n.space === 'deck').length, 3, 'the weather deck in its three');
});

test('a door swings open as he comes near and shut once he has gone, in its own time', () => {
  const leaf = doorHinge(plan, 'master-door'), near = { space: 'passage', along: leaf.middle[0], across: 0.3 };
  let doors = shutDoors(plan);
  doors = stepDoors(doors, plan, near, DT);
  assert.ok(doorAngle(plan, doors, leaf.id) > 0 && doorAngle(plan, doors, leaf.id) < leaf.swing / 2, 'starts to swing, not flung open');
  for (let i = 0; i < 30; i++) doors = stepDoors(doors, plan, near, DT);
  assert.equal(doorAngle(plan, doors, leaf.id), leaf.swing);
  assert.equal(doorAngle(plan, doors, 'gunner-door'), 0, 'a door far off stays shut');
  for (let i = 0; i < 30; i++) doors = stepDoors(doors, plan, { space: 'deck', along: 0, across: 0 }, DT);
  assert.equal(doorAngle(plan, doors, leaf.id), 0);
});

/** Walks him at a spot for some seconds, the doors stepped as he goes unless `shut`; every step must stand on the graph or in a doorway. */
function walkAt(w: DeckWalker, target: { along: number; across: number }, seconds: number, shut = false): { w: DeckWalker; passedShut: boolean } {
  let doors = shutDoors(plan), passedShut = false;
  for (let i = 0; i < seconds / DT; i++) {
    const was = w.place;
    w = stepWalker(w, { forward: 1, strafe: 0, heading: yawTo(w, target.along, target.across) }, plan, graph, doors, DT);
    if (w.place !== was && doorLeaves(plan).some((l) => (doors.swing[l.id] ?? 0) < DOOR_PASS && [l.way.from.space, l.way.to.space].includes(was) && [l.way.from.space, l.way.to.space].includes(w.place))) passedShut = true;
    if (!shut) doors = stepDoors(doors, plan, spotOf(w), DT);
  }
  return { w, passedShut };
}

test('he walks through a door only once it has swung open, and never through a shut one', () => {
  const way = plan.ways.find((w) => w.id === 'surgeon-door')!;
  const start = walkerAt(plan, { space: 'passage', along: way.to.along, across: 0.4 });
  const shut = walkAt(start, way.from, 4, true);
  assert.equal(shut.w.place, 'passage', 'a shut door holds him');
  const open = walkAt(start, way.from, 4);
  assert.equal(open.w.place, 'surgeon', 'through the open door into the cabin');
  assert.ok(!open.passedShut, 'never through it before it was open');
});

test('walking into her side, a bulkhead or a coaming, he slides along it and stays where a body fits', () => {
  // From the waist, straight at her side to starboard, then at the main hatch's coaming.
  let w = walkerAt(plan, { space: 'deck', along: 4.5, across: 0 });
  for (const [along, across] of [[4.6, 6], [2, 0], [-12, 0]] as const) {
    for (let i = 0; i < 4 / DT; i++) {
      w = stepWalker(w, { forward: 1, strafe: 0.3, heading: yawTo(w, along, across) }, plan, graph, shutDoors(plan), DT);
      assert.ok(nodeAt(graph, spotOf(w)) >= 0, `off the graph at ${JSON.stringify(spotOf(w))}`);
    }
  }
});

test('on the berth deck he stoops under the beams, and his eye goes down with him', () => {
  let w = walkerAt(plan, { space: 'deck', along: 4.5, across: 0 });
  const tall = eyeOf(w)[1] - w.floor;
  w = walkerAt(plan, { space: 'messdeck', along: 10, across: 1.5 });
  for (let i = 0; i < 2 / DT; i++) w = stepWalker(w, { forward: 1, strafe: 0, heading: 0 }, plan, graph, shutDoors(plan), DT);
  const s = plan.spaces.find((p) => p.id === w.place)!, sp = spotOf(w);
  const room = shipY(overheadAt(s, sp.along, sp.across)) - w.floor;
  assert.ok(room < BODY.height, 'the berth deck is low');
  assert.ok(w.height <= room - CAPTAIN_GAIT.clear + 1e-9 && eyeOf(w)[1] - w.floor < tall, `head ${w.height.toFixed(2)} under ${room.toFixed(2)}`);
});

test('a ladder is climbed when he stands at it pushing into it, not when he walks past or away', () => {
  const way = plan.ways.find((w) => w.id === 'fore-ladder')!, line = way.line!;
  const up = Math.atan2(-line.toward[1], line.toward[0]), into = { forward: 1, strafe: 0, heading: up };
  // From the spot before its foot he walks into the ladder, which stops him: then he climbs.
  let w = walkerAt(plan, way.from), offered = null;
  for (let i = 0; i < 2 / DT && !offered; i++) {
    offered = ladderOffered(w, into, plan);
    if (!offered) w = stepWalker(w, into, plan, graph, shutDoors(plan), DT);
  }
  assert.equal(offered?.way.id, 'fore-ladder');
  assert.equal(offered?.up, true);
  assert.equal(ladderOffered(w, { ...into, heading: up + Math.PI }, plan), null, 'walking away');
  assert.equal(ladderOffered(w, { ...into, forward: 0 }, plan), null, 'standing');
  assert.equal(ladderOffered({ ...w, vx: -Math.sin(up) * CAPTAIN_GAIT.walk, vz: -Math.cos(up) * CAPTAIN_GAIT.walk }, into, plan), null, 'walking on past');
  const head = walkerAt(plan, way.to), down = Math.atan2(-line.down[1], line.down[0]);
  assert.equal(ladderOffered(head, { forward: 1, strafe: 0, heading: down }, plan)?.up, false);
});

test('the walking thumb: a resting thumb does not creep, a full drag is a full push, keys walk no faster across', () => {
  assert.deepEqual(stickPush(3, -4), { forward: 0, strafe: 0 });
  const full = stickPush(0, -STICK_REACH * 2);
  assert.ok(Math.abs(full.forward - 1) < 1e-9 && Math.abs(full.strafe) < 1e-9);
  const half = stickPush(STICK_REACH / 2, 0);
  assert.ok(half.strafe > 0 && half.strafe < 1 / 2);
  const both = keyPush(new Set(['KeyW', 'KeyD']));
  assert.ok(Math.abs(Math.hypot(both.forward, both.strafe) - 1) < 1e-9 && both.forward > 0 && both.strafe > 0);
  assert.deepEqual(keyPush(new Set(['ArrowUp', 'ArrowDown'])), { forward: 0, strafe: 0 });
});

test('sliding past a ladder\'s side below is walking past it, not climbing it; pressed against its front he climbs', () => {
  const way = plan.ways.find((w) => w.id === 'magazine-ladder')!, foot = way.line!.foot;
  const beside: DeckWalker = { ...walkerAt(plan, { space: way.from.space, along: foot[0] + 0.15, across: way.width / 2 + 0.06 }), vx: 0.5 };
  // Pushing aft (into the ladder's climb), a little to starboard, while sliding along beside it.
  const push = { forward: 1, strafe: 0, heading: -2.81 };
  assert.equal(ladderOffered(beside, push, plan), null);
  const before: DeckWalker = { ...beside, x: 0, vx: 0 };
  assert.equal(ladderOffered(before, push, plan)?.way.id, 'magazine-ladder');
});
