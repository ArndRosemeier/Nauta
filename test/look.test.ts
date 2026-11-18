import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PITCH_LIMIT, lookDir, turn } from '../src/app/look.ts';

test('a drag turns the look by pixels times the angle per pixel', () => {
  const l = turn({ yaw: 0, pitch: 0 }, 100, -50, 0.001);
  assert.ok(Math.abs(l.yaw - 0.1) < 1e-12);
  assert.ok(Math.abs(l.pitch + 0.05) < 1e-12);
});

test('the mouse turns the heading the way it moves, the finger drags the picture the other way; up and down alike', () => {
  const mouse = turn({ yaw: 0, pitch: 0 }, 100, -50, 0.001, 'mouse');
  const finger = turn({ yaw: 0, pitch: 0 }, 100, -50, 0.001, 'finger');
  // Yaw grows to the left: the mouse moved right looks right (yaw falls), a finger dragged right turns left.
  assert.ok(Math.abs(mouse.yaw + 0.1) < 1e-12);
  assert.ok(Math.abs(finger.yaw - 0.1) < 1e-12);
  assert.equal(mouse.pitch, finger.pitch);
});

test('the tilt stops short of straight up and down', () => {
  assert.equal(turn({ yaw: 0, pitch: 1.4 }, 0, 1e6, 0.001).pitch, PITCH_LIMIT);
  assert.equal(turn({ yaw: 0, pitch: -1.4 }, 0, -1e6, 0.001).pitch, -PITCH_LIMIT);
});

test('the heading stays within half a turn however far it is dragged', () => {
  let l = { yaw: 0, pitch: 0 };
  for (let i = 0; i < 1000; i++) l = turn(l, 997, 0, 0.01);
  assert.ok(l.yaw >= -Math.PI && l.yaw <= Math.PI);
});

test('the direction is a unit vector: -z ahead, +y up, -x after a quarter turn left', () => {
  const near = (a: readonly number[], b: readonly number[]) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]!) < 1e-12, `${a} vs ${b}`));
  near(lookDir({ yaw: 0, pitch: 0 }), [0, 0, -1]);
  near(lookDir({ yaw: Math.PI / 2, pitch: 0 }), [-1, 0, 0]);
  near(lookDir({ yaw: 0, pitch: Math.PI / 2 }), [0, 1, 0]);
  const d = lookDir({ yaw: 0.7, pitch: -0.4 });
  assert.ok(Math.abs(Math.hypot(...d) - 1) < 1e-12);
});
