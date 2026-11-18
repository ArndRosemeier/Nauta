import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOW_AHEAD, ChurnWatch, TRACK_EVERY, TRACK_POINTS, TRACK_STRIDE, Track, kelvinAt, kelvinWavenumber, speedHead, type WakeSource } from '../src/render/wake.ts';
import { startMotion, type ShipPose } from '../src/sim/ship/motion.ts';
import { startSea } from '../src/sim/sea/sea.ts';
import { KNOT } from '../src/sim/units.ts';

/** Kelvin's integral done the long way: Re ∫ e^(−(kb)²/4) e^(i·k₀·secθ·(s + y·tanθ)) dθ over the half turn. */
function integral(s: number, y: number, k0: number, size: number): number {
  const n = 120000, edge = (Math.PI / 2) * 0.9999;
  let re = 0;
  for (let i = 0; i < n; i++) {
    const th = -edge + (2 * edge * (i + 0.5)) / n, sec = 1 / Math.cos(th), k = k0 * sec * sec;
    re += Math.exp(-((k * size) ** 2) / 4) * Math.cos(k0 * sec * (s + y * Math.tan(th)));
  }
  return (re * 2 * edge) / n;
}

test('Kelvin\'s pattern by stationary phase matches the integral inside the wedge, and holds at the cusp', () => {
  const k0 = 0.35, size = 1.4;
  for (const [s, y] of [[60, 10], [60, -5], [80, 20]] as const) {
    const near = kelvinAt(s, y, k0, size).height, far = integral(s, y, k0, size);
    assert.ok(Math.abs(near - far) < 0.2 * Math.max(Math.abs(far), 0.2), `at ${s}, ${y}: ${near.toFixed(3)} against ${far.toFixed(3)}`);
  }
  // On the cusp line (19.47°) stationary phase alone grows without end; held, it stays within half again of the integral.
  for (const s of [40, 80]) {
    const y = s / Math.sqrt(8), near = kelvinAt(s, y, k0, size).height, far = integral(s, y, k0, size);
    assert.ok(Math.abs(near) < 1.5 * Math.abs(far) + 0.1, `cusp at ${s}: ${near.toFixed(3)} against ${far.toFixed(3)}`);
  }
});

test('her waves lie only behind her and inside the wedge, symmetric to both sides, their slope the height\'s gradient', () => {
  const k0 = 0.35, size = 1.4;
  assert.equal(kelvinAt(-10, 0, k0, size).height, 0, 'nothing ahead');
  assert.ok(Math.abs(kelvinAt(60, 40, k0, size).height) < 1e-3, 'outside the wedge it dies away');
  assert.ok(Math.abs(kelvinAt(50, 7, k0, size).height - kelvinAt(50, -7, k0, size).height) < 1e-12);
  // The slope is the waves' own (the amplitude's slow change left out): compare with differences where it is slow.
  const at = kelvinAt(120, 9, k0, size), e = 1e-3;
  const ds = (kelvinAt(120 + e, 9, k0, size).height - kelvinAt(120 - e, 9, k0, size).height) / (2 * e);
  const dy = (kelvinAt(120, 9 + e, k0, size).height - kelvinAt(120, 9 - e, k0, size).height) / (2 * e);
  assert.ok(Math.abs(at.alongS - ds) < 0.08 * Math.hypot(ds, dy) + 1e-3 && Math.abs(at.alongY - dy) < 0.08 * Math.hypot(ds, dy) + 1e-3, `slope ${at.alongS}, ${at.alongY} against ${ds}, ${dy}`);
});

test('a slow ship makes almost no waves; at her best her transverse waves are about 20 m long and her bow head over a metre', () => {
  const size = 1.4, slow = kelvinWavenumber(2 * KNOT), fast = kelvinWavenumber(11 * KNOT);
  assert.ok(Math.abs(kelvinAt(60, 0, slow, size).height) < 1e-3);
  assert.ok(Math.abs((2 * Math.PI) / fast - 20.5) < 1, `${(2 * Math.PI) / fast} m`);
  assert.ok(speedHead(11 * KNOT) > 1.5 && speedHead(11 * KNOT) < 1.8);
});

const source = (pose: ShipPose, ahead: number): WakeSource => ({ pose, ahead, leeway: 0, bowChurn: 0, sideChurn: 0 });

test('her track keeps a point a second, newest first, and lays out how far behind and how long ago', () => {
  const track = new Track(), speed = 5;
  let lists = track.lists;
  for (let t = 0; t <= 30; t += 0.25) {
    // Heading east (bearing a quarter turn), then turning north after 20 s.
    const pose = { ...startMotion(0, 0, Math.PI / 2).pose, x: Math.min(t, 20) * speed, z: -Math.max(0, t - 20) * speed, heading: t < 20 ? Math.PI / 2 : 0 };
    lists = track.follow(source(pose, speed), t, 100, 50);
  }
  // A point ahead of her bow, where she is, and one kept a second back to the start.
  assert.equal(lists.count, 2 + Math.floor(30 / TRACK_EVERY));
  const at = (slot: number, i: number) => lists.place[slot * TRACK_STRIDE + i]!;
  assert.ok(at(0, 2) < -BOW_AHEAD, 'the point ahead of her bow is ahead');
  assert.ok(Math.abs(at(1, 0) - (100 - 100)) < 1e-9 && Math.abs(at(1, 1) - (-50 - 50)) < 1e-9, 'where she is, from the sea\'s origin');
  assert.ok(Math.abs(at(2, 2) - speed) < 1e-6 && Math.abs(at(2, 3) - 1) < 1e-9, 'a second back: 5 m behind');
  const last = lists.count - 1;
  assert.ok(Math.abs(at(last, 2) - 30 * speed) < 1e-6, 'the oldest: her whole run behind her');
  // The track bends where she turned: 15 s back she was heading east.
  assert.ok(Math.abs(lists.heading[16 * TRACK_STRIDE]! - 1) < 1e-9 && Math.abs(lists.heading[1 * TRACK_STRIDE + 1]! + 1) < 1e-9);
  for (let t = 31; t < 31 + TRACK_POINTS * 2; t += 1) lists = track.follow(source(startMotion(0, 0, 0).pose, 0), t, 0, 0);
  assert.equal(lists.count, TRACK_POINTS + 1, 'never more than it keeps (and the point ahead)');
});

test('the water at her side does not churn on a calm sea, and works her waterline in a gale', () => {
  const pose = startMotion(0, 0, 0).pose;
  const calm = startSea(7, { speed: 0, toward: 0 }, 0), gale = startSea(7, { speed: 19, toward: 0.3 }, 0);
  const still = new ChurnWatch(), working = new ChurnWatch();
  for (let i = 0; i < 60; i++) { still.watch(pose, calm, i / 30); working.watch(pose, gale, i / 30); }
  assert.ok(still.churnNow().side < working.churnNow().side, 'more in the gale');
  assert.ok(working.churnNow().side > 0.2, `${working.churnNow().side} m/s`);
});
