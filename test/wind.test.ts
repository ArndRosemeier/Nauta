import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng, angleDiff } from '@futuremagic/core';
import { gustShape, gustsNear, makeWind, meanWind, windAt, type WindState } from '../src/sim/wind.ts';
import { VEER_PERIOD, WIND_PRESETS } from '../src/sim/rules/wind.ts';
import { BEAUFORT, beaufortSpeed } from '../src/sim/rules/beaufort.ts';
import { DEGREE, bearingDir } from '../src/sim/units.ts';

const HOUR = 3600;
/** The signed turn from bearing b to bearing a, rad. */
const turnBetween = (a: number, b: number) => angleDiff(b, a);

test('the same seed gives the same wind; another seed other gusts', () => {
  const a = makeWind(7, 4, 1);
  const b = makeWind(7, 4, 1);
  const c = makeWind(8, 4, 1);
  let differs = false;
  for (let n = 0; n < 200; n++) {
    const x = n * 37, z = -n * 53, t = n * 19;
    assert.deepEqual(windAt(a, x, z, t), windAt(b, x, z, t));
    if (windAt(a, x, z, t).speed !== windAt(c, x, z, t).speed) differs = true;
  }
  assert.ok(differs);
});

test('the state is plain data: sent as JSON and read back, it gives the same wind', () => {
  const w = makeWind(99, 5, 4);
  const back: WindState = JSON.parse(JSON.stringify(w));
  for (let n = 0; n < 50; n++) assert.deepEqual(windAt(back, n * 91, n * 13, n * 7.5), windAt(w, n * 91, n * 13, n * 7.5));
});

test('the bearing is a compass bearing the wind blows from; toward and (x, z) point the other way', () => {
  const north = makeWind(1, 0, 0);
  const m = meanWind(north, 0);
  assert.ok(Math.abs(turnBetween(m.from, 0)) <= WIND_PRESETS[0]!.veer + 1e-9);
  const w = meanWind(makeWind(3, 4, Math.PI / 2), 1234);
  const [fx, fz] = bearingDir(w.from);
  assert.ok(Math.abs(w.x + fx) < 1e-12 && Math.abs(w.z + fz) < 1e-12);
  assert.ok(Math.abs(Math.cos(w.toward) - w.x) < 1e-12 && Math.abs(Math.sin(w.toward) - w.z) < 1e-12);
  // A wind from the east (bearing a quarter turn) blows toward -x.
  assert.ok(w.x < -0.9);
});

test('a force outside the presets is refused', () => {
  assert.throws(() => makeWind(1, -1, 0), RangeError);
  assert.throws(() => makeWind(1, WIND_PRESETS.length, 0), RangeError);
  assert.throws(() => makeWind(1, 2.5, 0), RangeError);
  assert.throws(() => beaufortSpeed(BEAUFORT.length), RangeError);
});

for (const force of [2, 4, 6, 8]) {
  test(`force ${force}: the mean speed and bearing over time and place match the preset`, () => {
    const from = 2.2;
    const w = makeWind(force * 11, force, from);
    const rng = new Rng(force);
    let speed = 0, sx = 0, sz = 0;
    const samples = 3000;
    for (let n = 0; n < samples; n++) {
      const s = windAt(w, rng.range(-20000, 20000), rng.range(-20000, 20000), rng.range(0, 24 * HOUR));
      speed += s.speed;
      sx += Math.sin(s.from);
      sz += Math.cos(s.from);
      assert.ok(Math.abs(turnBetween(s.from, from)) <= WIND_PRESETS[force]!.veer + 1e-9, 'never veers past its limit');
    }
    const mean = beaufortSpeed(force);
    assert.ok(Math.abs(speed / samples / mean - 1) < 0.05, `mean speed ${speed / samples} vs ${mean}`);
    assert.ok(Math.abs(turnBetween(Math.atan2(sx, sz), from)) < 3 * DEGREE, 'mean bearing');
  });
}

test('the mean wind veers slowly: it turns, but never jumps', () => {
  const w = makeWind(5, 4, 0);
  // The fastest the swings can turn it (rad/s): its reach times the quickest swing's angular speed, under 0.2° a second.
  const fastest = (WIND_PRESETS[4]!.veer * 2 * Math.PI) / VEER_PERIOD[0];
  let turned = 0, last = meanWind(w, 0).from;
  for (let t = 1; t <= 2 * HOUR; t++) {
    const now = meanWind(w, t).from;
    const step = Math.abs(turnBetween(now, last));
    assert.ok(step <= fastest, `turned ${step / DEGREE}° in a second at ${t} s`);
    turned = Math.max(turned, Math.abs(turnBetween(now, 0)));
    last = now;
  }
  assert.ok(turned > 3 * DEGREE, 'it does veer');
});

test('gusts: their strength lies in the table range, they rise and fade, and the wind under them is smooth', () => {
  for (const force of [1, 4, 7]) {
    const preset = WIND_PRESETS[force]!;
    const w = makeWind(42, force, 1);
    for (let t = 0; t < 2 * HOUR; t += 97) {
      for (const g of gustsNear(w, 0, 0, t, 2000)) {
        assert.ok(g.peak >= preset.gustStrength[0] && g.peak <= preset.gustStrength[1], `peak ${g.peak}`);
        assert.ok(g.strength >= 0 && g.strength <= g.peak);
        assert.ok(g.radius >= preset.gustRadius[0] && g.radius <= preset.gustRadius[1], `radius ${g.radius}`);
      }
    }
    let last = windAt(w, 100, 100, 0).speed;
    for (let t = 0.5; t < 600; t += 0.5) {
      const now = windAt(w, 100, 100, t).speed;
      assert.ok(Math.abs(now - last) < 0.02 * last + 0.01, `speed jumped from ${last} to ${now} at ${t} s`);
      last = now;
    }
  }
});

test('gust spacing on the water matches the table', () => {
  for (const force of [2, 5, 8]) {
    const preset = WIND_PRESETS[force]!;
    const w = makeWind(1000 + force, force, 0.5);
    const radius = 3000;
    let count = 0, moments = 0;
    for (let t = 0; t < 12 * HOUR; t += 1800, moments++) {
      count += gustsNear(w, 0, 0, t, radius).filter((g) => Math.hypot(g.x, g.z) < radius).length;
    }
    const spacing = 1 / Math.sqrt(count / moments / (Math.PI * radius * radius));
    assert.ok(Math.abs(spacing / preset.gustSpacing - 1) < 0.15, `force ${force}: spacing ${spacing} vs ${preset.gustSpacing}`);
  }
});

test('gusts drift with the wind, and windAt feels the gusts that gustsNear lists', () => {
  const w = makeWind(77, 5, 3);
  const t = 5000;
  const strong = gustsNear(w, 0, 0, t, 3000).sort((a, b) => b.strength - a.strength)[0]!;
  const m = meanWind(w, t);
  const later = gustsNear(w, strong.x + m.x * m.speed * 10, strong.z + m.z * m.speed * 10, t + 10, 50);
  const same = later.find((g) => g.peak === strong.peak);
  assert.ok(same, 'the gust is found downwind 10 s later');
  const moved = Math.hypot(same.x - strong.x, same.z - strong.z);
  assert.ok(Math.abs(moved / (m.speed * 10) - 1) < 0.25, `moved ${moved} m in 10 s with the wind at ${m.speed} m/s`);
  const at = windAt(w, strong.x, strong.z, t);
  assert.ok(at.gust >= strong.strength - 1e-12, 'the gust is felt at its heart');
  assert.ok(Math.abs(at.speed / meanWind(w, t).speed - (1 + at.gust)) < 1e-9);
});

test('a gust is strongest at its heart and gone at its rim', () => {
  assert.equal(gustShape(0), 1);
  assert.equal(gustShape(1), 0);
  assert.equal(gustShape(3), 0);
  assert.ok(gustShape(0.5) > gustShape(0.6));
});

test('a thousand winds with gusts take well under the step budget', () => {
  const w = makeWind(3, 8, 0);
  const start = performance.now();
  for (let n = 0; n < 1000; n++) windAt(w, n * 7, n * 3, n * 0.033);
  assert.ok(performance.now() - start < 20);
});
