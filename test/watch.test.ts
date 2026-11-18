/**
 * Watching a battle (implementation plan N7.8): a match of two computer captains with none of the ships mine, the
 * address that asks for it, and the free camera's flight (pure: app/freeCam.ts).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DuelSession } from '../src/net/duel.ts';
import { PageMatch } from '../src/app/pageMatch.ts';
import { readParams } from '../src/app/params.ts';
import { lookDir } from '../src/app/look.ts';
import { ABOVE_WATER, BOOST, CEILING, camps, flightSpeed, foeHull, FreeCam, lookToward, SPEED_LEAST, SPEED_MOST, vantageOf, vantageOfAll, vantageOfBoth, vantageOver, type Flying } from '../src/app/freeCam.ts';
import { SKILL } from '../src/sim/rules/captain.ts';
import { STEPS_PER_SECOND } from '../src/sim/units.ts';

/** A match watched, begun at clock 0; `step` runs it on one step. */
function watched(first: 'green' | 'seasoned' | 'master', second: 'green' | 'seasoned' | 'master'): { s: DuelSession; step: () => void } {
  let t = 0;
  const s = new DuelSession({ build: 'test', now: () => t, seed: 3, watch: { first, second } });
  return { s, step: () => { t += 1 / STEPS_PER_SECOND; s.pump(); } };
}

test('a match watched has no ship of mine and both ships are commanded by computer captains at their own skills', () => {
  const { s, step } = watched('master', 'master');
  assert.equal(s.watched, true);
  assert.equal(s.mine, -1);
  assert.deepEqual(s.shipCaptains, [null, null]);
  // A master beats to quarters at his first look at any range; the second ship's captain looks half a look after the first's.
  step();
  assert.equal(s.state.ships[0]!.told.quarters, true, 'the first ship\'s captain gave his orders at the first step');
  assert.equal(s.state.ships[1]!.told.quarters, false);
  const secondLook = Math.round(SKILL.master.look * STEPS_PER_SECOND / 2);
  while (s.state.tick <= secondLook) step();
  assert.equal(s.state.ships[1]!.told.quarters, true, 'and the second\'s at his');
  // Whoever watches gives no order.
  const before = s.state.ships[0]!.told.serial;
  s.give({ kind: 'steer', ship: 0, heading: 1 });
  step();
  assert.equal(s.state.ships[0]!.told.serial, before);
  // Each captain's crews are drilled as his skill keeps them.
  const mixed = watched('green', 'master').s;
  assert.equal(mixed.state.ships[0]!.drill, SKILL.green.drill);
  assert.equal(mixed.state.ships[1]!.drill, SKILL.master.drill);
  // Another match is not watched.
  assert.equal(new DuelSession({ build: 'test', now: () => 0, seed: 3, foe: 'master' }).watched, false);
});

test('the page runs a match watched as soon as it is given, with the first ship its own and the other beside it', (t) => {
  // The page's pump is a setInterval that nothing stops; a mocked one cannot hold this file's process open (run alone, it timed out).
  t.mock.timers.enable({ apis: ['setInterval'] });
  const m = new PageMatch('test', null, () => 0);
  const s = new DuelSession({ build: 'test', now: () => 0, seed: 5, watch: { first: 'seasoned', second: 'seasoned' } });
  m.useSession(s, 'british');
  assert.equal(m.session, s);
  assert.equal(m.ship, 0);
  assert.equal(m.other, 1);
  assert.equal(m.navy, 'british');
  assert.equal(m.herNavy, 'french');
});

test('?watch names the battle: skills for the British ship and the French (one skill alone is both\'s), and keeps no menu', () => {
  assert.deepEqual(readParams('?watch').watch, { british: 'seasoned', french: 'seasoned' });
  assert.deepEqual(readParams('?watch=master').watch, { british: 'master', french: 'master' });
  assert.deepEqual(readParams('?watch=master,green').watch, { british: 'master', french: 'green' });
  assert.deepEqual(readParams('?watch=admiral,').watch, { british: 'seasoned', french: 'seasoned' });
  assert.equal(readParams('?watch').menu, false);
  assert.equal(readParams('?sail').watch, null);
});

const still: Flying = { push: { forward: 0, strafe: 0 }, climb: 0, boost: false, near: Infinity, water: 0 };

test('the eye flies faster the farther it is from a ship, within its least and most; the boost multiplies it', () => {
  assert.equal(flightSpeed(5), SPEED_LEAST);
  assert.equal(flightSpeed(Infinity), SPEED_MOST);
  assert.ok(flightSpeed(100) > flightSpeed(50) && flightSpeed(50) > flightSpeed(30));
  const a = new FreeCam([0, 50, 0]), b = new FreeCam([0, 50, 0]);
  const ahead = { ...still, push: { forward: 1, strafe: 0 }, near: 80 };
  a.onward(1, { yaw: 0, pitch: 0 }, ahead, null);
  b.onward(1, { yaw: 0, pitch: 0 }, { ...ahead, boost: true }, null);
  assert.ok(Math.abs(a.z + flightSpeed(80)) < 1e-9, 'forward along -z at yaw 0');
  assert.ok(Math.abs(b.z + flightSpeed(80) * BOOST) < 1e-9);
});

test('forward flies along the look, up and down included; strafe is level, to the right; the eye keeps above the water and under the ceiling', () => {
  const c = new FreeCam([0, 50, 0]);
  c.onward(1, { yaw: 0, pitch: 0.5 }, { ...still, push: { forward: 1, strafe: 0 }, near: 100 }, null);
  assert.ok(c.y > 50 && c.z < 0, 'looking up, forward climbs');
  const d = new FreeCam([0, 50, 0]);
  d.onward(1, { yaw: Math.PI / 2, pitch: 0.5 }, { ...still, push: { forward: 0, strafe: 1 }, near: 100 }, null);
  // Looking west (yaw a quarter turn left), his right is north (-z); a strafe never climbs.
  assert.ok(d.z < 0 && Math.abs(d.x) < 1e-9 && d.y === 50);
  const low = new FreeCam([0, 1, 0]);
  low.onward(1, { yaw: 0, pitch: -1 }, { ...still, push: { forward: 1, strafe: 0 }, near: 100, water: 2 }, null);
  assert.equal(low.y, 2 + ABOVE_WATER);
  const high = new FreeCam([0, CEILING - 1, 0]);
  high.onward(1, { yaw: 0, pitch: 0 }, { ...still, climb: 1, near: Infinity }, null);
  assert.equal(high.y, CEILING);
});

test('the eye keeps company with a ship: carried by what she moves; staying, it does not move', () => {
  const c = new FreeCam([10, 40, 10]);
  c.onward(1 / 30, { yaw: 0, pitch: 0 }, still, { x: 100, z: 100 });
  assert.deepEqual([c.x, c.z], [10, 10], 'the first frame only learns where she is');
  c.onward(1 / 30, { yaw: 0, pitch: 0 }, still, { x: 103, z: 98 });
  assert.deepEqual([c.x, c.z], [13, 8]);
  c.onward(1 / 30, { yaw: 0, pitch: 0 }, still, null);
  c.onward(1 / 30, { yaw: 0, pitch: 0 }, still, null);
  assert.deepEqual([c.x, c.z], [13, 8]);
  // Changing company: not carried by the difference between the old and the new.
  c.onward(1 / 30, { yaw: 0, pitch: 0 }, still, { x: 0, z: 0 });
  c.parted();
  c.onward(1 / 30, { yaw: 0, pitch: 0 }, still, { x: 500, z: 500 });
  assert.deepEqual([c.x, c.z], [13, 8]);
  c.onward(1 / 30, { yaw: 0, pitch: 0 }, still, { x: 501, z: 500 });
  assert.deepEqual([c.x, c.z], [14, 8]);
});

test('a glide arrives at its place and look, goes with the ship while it goes, and ends at the viewer\'s hand', () => {
  const ship = { x: 200, z: -100, heading: 1 };
  const v = vantageOf(ship);
  const c = new FreeCam([0, 60, 0]);
  let look = { yaw: 0, pitch: 0 };
  c.glideTo(v);
  for (let i = 0; i < 30 * 6; i++) look = c.onward(1 / 30, look, still, null);
  assert.equal(c.gliding, false);
  assert.ok(Math.hypot(c.x - v.at[0], c.y - v.at[1], c.z - v.at[2]) < 0.5);
  assert.deepEqual(look, v.look);
  // From the vantage the ship is in front of the eye.
  const [dx, dy, dz] = lookDir(look), toShip = [ship.x - c.x, 9 - c.y, ship.z - c.z], len = Math.hypot(...toShip);
  assert.ok(dx * toShip[0]! / len + dy * toShip[1]! / len + dz * toShip[2]! / len > 0.999);
  // A push ends a glide at once.
  const d = new FreeCam([0, 60, 0]);
  d.glideTo(v);
  d.onward(1 / 30, { yaw: 0, pitch: 0 }, still, null);
  assert.equal(d.gliding, true);
  d.onward(1 / 30, { yaw: 0, pitch: 0 }, { ...still, push: { forward: 1, strafe: 0 }, near: 50 }, null);
  assert.equal(d.gliding, false);
  // So does a look of his own.
  const e = new FreeCam([0, 60, 0]);
  e.glideTo(v);
  const turned = e.onward(1 / 30, { yaw: 0, pitch: 0 }, still, null);
  e.onward(1 / 30, { yaw: turned.yaw + 0.3, pitch: turned.pitch }, still, null);
  assert.equal(e.gliding, false);
});

test('looking toward a place agrees with the direction looked along; both ships are in view from the place for both', () => {
  const from = [10, 30, -20] as const, to = [-60, 5, 140] as const, look = lookToward(from, to), dir = lookDir(look);
  const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]] as const, len = Math.hypot(...d);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(dir[i]! - d[i]! / len) < 1e-9);
  const a = { x: -500, z: 0, heading: 1.5 }, b = { x: 500, z: 0, heading: -1.5 };
  const v = vantageOfBoth(a, b), forward = lookDir(v.look);
  for (const ship of [a, b]) {
    const to = [ship.x - v.at[0], -v.at[1], ship.z - v.at[2]] as const, l = Math.hypot(...to);
    // Each within 60° of the middle of the view.
    assert.ok((forward[0] * to[0] + forward[1] * to[1] + forward[2] * to[2]) / l > Math.cos(Math.PI / 3));
  }
});

test('the opening shot stands close behind the first ship, with her and the far enemy both near the middle of the view', () => {
  const a = { x: 0, z: 0, heading: 0 }, b = { x: 1200, z: -900, heading: 3 };
  const v = vantageOver(a, b), forward = lookDir(v.look);
  // Close: the ship is under 60 m off, and the enemy is a mile and a half away.
  assert.ok(Math.hypot(v.at[0] - a.x, v.at[2] - a.z) < 60);
  for (const ship of [a, b]) {
    const to = [ship.x - v.at[0], 8 - v.at[1], ship.z - v.at[2]] as const, l = Math.hypot(...to);
    // Each within 40° of the middle of the view.
    assert.ok((forward[0] * to[0] + forward[1] * to[1] + forward[2] * to[2]) / l > Math.cos(Math.PI * 40 / 180));
  }
});

test('a fleet is watched by side: the first one\'s ships, the others, every ship; the first one\'s foe is the nearest of another side', () => {
  const hulls = [{ x: 0, z: 0, heading: 0, side: 0 }, { x: 100, z: 0, heading: 0, side: 0 }, { x: 900, z: 0, heading: 0, side: 1 }, { x: 500, z: 0, heading: 0, side: 1 }];
  const { first, others } = camps(hulls);
  assert.deepEqual([first.length, others.length], [2, 2]);
  assert.equal(foeHull(hulls), hulls[3], 'the nearest ship of the other side');
  assert.equal(camps([hulls[0]!, hulls[1]!]).others.length, 2, 'with none of another side the others are the same ships');
  const v = vantageOfAll(hulls), both = vantageOfBoth(hulls[0]!, hulls[2]!);
  assert.ok(v.at[1] >= 40 && Math.hypot(v.at[0] - 375, v.at[2]) >= 200, 'high and to one side of the fleet');
  assert.deepEqual(vantageOfAll([hulls[0]!, hulls[2]!]), both, 'two ships are seen as before');
});
