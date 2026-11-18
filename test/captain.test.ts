import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shipPlan } from '../src/sim/ship/plan.ts';
import { shipY } from '../src/sim/ship/section.ts';
import { walkGraph } from '../src/sim/ship/walk.ts';
import { Captain } from '../src/app/captain.ts';

const plan = shipPlan(), graph = walkGraph(plan), DT = 1 / 30, UP = { x: 0, y: 1, z: 0 };

test('up the companion ladder from the cabin and down again, played out rung by rung, never cut', () => {
  const way = plan.ways.find((w) => w.id === 'companion-ladder')!, line = way.line!;
  const c = new Captain(plan, graph, way.from);
  const heading = Math.atan2(-line.toward[1], line.toward[0]);
  let frames = 0, lastEye = c.eye[1], biggest = 0;
  for (let i = 0; i < 10 / DT && (frames === 0 || c.onLadder); i++) {
    c.update({ forward: c.onLadder ? 0 : 1, strafe: 0, heading: c.facing ?? heading }, UP, DT);
    if (c.onLadder) frames++;
    biggest = Math.max(biggest, Math.abs(c.eye[1] - lastEye));
    lastEye = c.eye[1];
  }
  assert.ok(!c.onLadder && frames * DT > 2, `climbed in ${(frames * DT).toFixed(1)} s`);
  assert.equal(c.spot.space, 'deck');
  assert.ok(Math.abs(c.walker.floor - shipY(line.head[2])) < 0.3, 'on the weather deck');
  assert.ok(biggest < 0.2, `the eye jumped ${biggest.toFixed(2)} m in a frame`);
  // And down: from the head, pushing toward it.
  const s = c.spot, down = Math.atan2(-(line.head[1] - s.across), line.head[0] - s.along);
  frames = 0;
  for (let i = 0; i < 10 / DT && (frames === 0 || c.onLadder); i++) {
    c.update({ forward: c.onLadder ? 0 : 1, strafe: 0, heading: c.facing ?? down }, UP, DT);
    if (c.onLadder) frames++;
  }
  assert.equal(c.spot.space, 'cabin');
});

test('in a hard roll he holds on: the climb takes longer than in a calm', () => {
  const way = plan.ways.find((w) => w.id === 'fore-ladder')!, line = way.line!, heading = Math.atan2(-line.toward[1], line.toward[0]);
  const climbTime = (roll: (t: number) => number) => {
    const c = new Captain(plan, graph, way.from);
    let t = 0;
    for (let i = 0; i < 30 / DT && (t === 0 || c.onLadder); i++) {
      const r = roll(i * DT);
      c.update({ forward: c.onLadder ? 0 : 1, strafe: 0, heading: c.facing ?? heading }, { x: Math.sin(r), y: Math.cos(r), z: 0 }, DT);
      if (c.onLadder) t += DT;
    }
    return t;
  };
  const calm = climbTime(() => 0), rolling = climbTime((t) => 0.35 * Math.sin(2.4 * t));
  assert.ok(rolling > calm + 0.3, `calm ${calm.toFixed(1)} s, rolling ${rolling.toFixed(1)} s`);
});
