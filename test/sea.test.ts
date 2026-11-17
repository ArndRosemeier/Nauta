import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '@futuremagic/core';
import { BEAUFORT, beaufortSpeed } from '../src/sim/rules/beaufort.ts';
import {
  SEA_BY_FORCE, SEA_CHANGE_SECONDS, SEA_COMPONENTS, SWELL_COMPONENTS, SWELL_HEIGHT, SWELL_OFF_WIND, SWELL_PERIOD_LONGEST, SWELL_PERIOD_SHORTEST,
} from '../src/sim/rules/sea.ts';
import { changeWind, followWind, layerWeights, seaAt, seaSample, seaWind, startSea, surfaceAt, type SeaState } from '../src/sim/sea/sea.ts';
import { makeSwell } from '../src/sim/sea/swell.ts';
import { HEIGHT_PER_DEVIATION, makeWaves, seaPreset, type WaveSet } from '../src/sim/sea/waves.ts';
import { GRAVITY } from '../src/sim/units.ts';

const SEED = 1805;
const wind = (force: number, toward = 0.4) => ({ speed: beaufortSpeed(force), toward });
/** The forces a duel is likely to see, and the extremes. */
const FORCES = [1, 3, 5, 7, 8, 10, 12];

/** A wind preset's height with the swell added as squares add: Hs² of both. */
const withSwell = (height: number) => Math.hypot(height, SWELL_HEIGHT);

/** A set's significant height from its amplitudes: four times the root of the variance Σ amp²/2. */
const setHeight = (w: WaveSet) => HEIGHT_PER_DEVIATION * Math.sqrt(w.amp.reduce((sum, a) => sum + (a * a) / 2, 0));

/** The smallest angle between two directions, rad. */
const between = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/** Height statistics of the water under `n` seeded world points spread over many wavelengths and an hour. */
function heights(sea: SeaState, n: number, span: number, t0 = 0, t1 = 3600) {
  const r = new Rng(9), o = seaSample();
  let sum = 0, sq = 0, minStretch = Infinity;
  for (let i = 0; i < n; i++) {
    surfaceAt(sea, r.range(-span, span), r.range(-span, span), r.range(t0, t1), o);
    sum += o.height;
    sq += o.height * o.height;
    minStretch = Math.min(minStretch, o.stretch);
  }
  const mean = sum / n;
  return { mean, significant: HEIGHT_PER_DEVIATION * Math.sqrt(sq / n - mean * mean), minStretch };
}

test('the same seed and wind give the same sea; another seed gives another', () => {
  const a = startSea(SEED, wind(6), 0), b = startSea(SEED, wind(6), 0), c = startSea(SEED + 1, wind(6), 0);
  assert.deepEqual(a, b);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a, 'the state is plain data');
  assert.equal(a.seaLayers[0]!.waves.kx.length, SEA_COMPONENTS);
  const sa = seaAt(a, 120, -40, 77), sb = seaAt(b, 120, -40, 77), sc = seaAt(c, 120, -40, 77);
  assert.deepEqual(sa, sb);
  assert.notEqual(sa.height, sc.height);
});

test('the presets follow the Beaufort scale and are read between forces by wind speed', () => {
  BEAUFORT.forEach((f, i) => {
    assert.equal(f.force, i);
    const p = seaPreset(beaufortSpeed(i));
    assert.ok(Math.abs(p.height - SEA_BY_FORCE[i]!.height) < 1e-9 && Math.abs(p.period - SEA_BY_FORCE[i]!.period) < 1e-9);
  });
  const mid = seaPreset((beaufortSpeed(5) + beaufortSpeed(6)) / 2);
  assert.ok(Math.abs(mid.height - (SEA_BY_FORCE[5]!.height + SEA_BY_FORCE[6]!.height) / 2) < 1e-9);
  assert.deepEqual(seaPreset(-1), SEA_BY_FORCE[0]);
  assert.deepEqual(seaPreset(1000), SEA_BY_FORCE[SEA_BY_FORCE.length - 1]);
});

test('the mean height is zero and the significant wave height matches the preset with its swell within 10 %', () => {
  for (const force of FORCES) {
    const sea = startSea(SEED, wind(force), 0), w = sea.seaLayers[0]!.waves;
    const { mean, significant, minStretch } = heights(sea, 2000, w.peakLength * 40);
    const want = withSwell(SEA_BY_FORCE[force]!.height);
    assert.ok(Math.abs(significant - want) / want < 0.1, `force ${force}: Hs ${significant.toFixed(3)} m, preset ${want} m`);
    assert.ok(Math.abs(mean) < 0.02 * want, `force ${force}: mean ${mean.toFixed(4)} m`);
    assert.ok(minStretch > 0, `force ${force}: the surface folds (${minStretch})`);
  }
});

/**
 * The sea's spatial autocorrelation at offset (rx, rz): for a sum of plane waves of distinct wavenumbers it is
 * Σ amp² cos(k·r) / Σ amp² over the whole plane. A repeat at r would show as a value near 1.
 */
function correlation(w: WaveSet, rx: number, rz: number): number {
  let num = 0, den = 0;
  w.kx.forEach((kx, i) => {
    const a2 = w.amp[i]! ** 2;
    num += a2 * Math.cos(kx * rx + w.kz[i]! * rz);
    den += a2;
  });
  return num / den;
}

test('the sea does not repeat within 2 km (autocorrelation)', () => {
  const RANGE = 2000, DIRECTIONS = 16;
  for (const force of [1, 4, 8, 12]) {
    const w = makeWaves(SEED, wind(force));
    // Within a few wavelengths a wave group still resembles itself; beyond that nothing may.
    let worst = 0, at = 0;
    for (let d = 0; d < DIRECTIONS; d++) {
      const ux = Math.cos((d * Math.PI) / DIRECTIONS), uz = Math.sin((d * Math.PI) / DIRECTIONS);
      for (let r = 4 * w.peakLength; r <= RANGE; r += w.shortest / 4) {
        const c = Math.abs(correlation(w, ux * r, uz * r));
        if (c > worst) [worst, at] = [c, r];
      }
    }
    // A repeat would give 1; 28 incommensurate waves line up by chance to about 0.6 at the most.
    assert.ok(worst < 0.7, `force ${force}: correlation ${worst.toFixed(2)} at ${at.toFixed(0)} m`);
  }
});

test('1000 samples take under 1 ms', () => {
  const sea = startSea(SEED, wind(6), 0), o = seaSample();
  const round = () => {
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) seaAt(sea, i * 3.1, i * 1.7, 100 + i * 0.01, o);
    return performance.now() - t0;
  };
  // Other test files run beside this one, so the quietest of many rounds is the honest measure.
  for (let i = 0; i < 20; i++) round();
  let best = Infinity;
  for (let i = 0; i < 60; i++) best = Math.min(best, round());
  assert.ok(best < 1, `best of 60 rounds: ${best.toFixed(3)} ms`);
});

test('the water under a world point is found: its calm point plus its shift is that point', () => {
  const sea = startSea(SEED, wind(10), 0), r = new Rng(3), o = seaSample();
  for (let i = 0; i < 200; i++) {
    const x = r.range(-500, 500), z = r.range(-500, 500), t = r.range(0, 600);
    surfaceAt(sea, x, z, t, o);
    const cx = x - o.shift[0], cz = z - o.shift[1], back = seaAt(sea, cx, cz, t);
    assert.ok(Math.hypot(cx + back.shift[0] - x, cz + back.shift[1] - z) < 1e-3);
    assert.ok(Math.abs(back.height - o.height) < 1e-3);
  }
});

test('the normal is square to the drawn surface and the velocity is how its water moves', () => {
  const sea = startSea(SEED, wind(7), 0), r = new Rng(4), e = 1e-3;
  const at = (x: number, z: number, t: number) => {
    const s = seaAt(sea, x, z, t);
    return [x + s.shift[0], s.height, z + s.shift[1]];
  };
  for (let i = 0; i < 50; i++) {
    const x = r.range(-300, 300), z = r.range(-300, 300), t = r.range(0, 600), s = seaAt(sea, x, z, t);
    const ax = at(x + e, z, t), bx = at(x - e, z, t), az = at(x, z + e, t), bz = at(x, z - e, t);
    const tx = ax.map((v, j) => (v - bx[j]!) / (2 * e)), tz = az.map((v, j) => (v - bz[j]!) / (2 * e));
    const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
    assert.ok(Math.abs(dot(s.normal, tx)) < 1e-5 && Math.abs(dot(s.normal, tz)) < 1e-5, 'normal');
    assert.ok(Math.abs(Math.hypot(...s.normal) - 1) < 1e-9 && s.normal[1] > 0, 'unit, up');
    const later = at(x, z, t + e), sooner = at(x, z, t - e);
    later.forEach((v, j) => assert.ok(Math.abs((v - sooner[j]!) / (2 * e) - s.velocity[j]!) < 1e-4, 'velocity'));
  }
});

test('a change of wind blends over minutes without a jump', () => {
  const STEP = 1 / 30, CHANGE = 600;
  const before = startSea(SEED, wind(3, 0), 0);
  const sea = changeWind(before, wind(7, 1.2), CHANGE);
  const after: SeaState = { ...sea, seaLayers: [sea.seaLayers[1]!] };
  const end = CHANGE + SEA_CHANGE_SECONDS;
  assert.equal(seaWind(sea, CHANGE - 1).speed, beaufortSpeed(3));
  assert.equal(seaWind(sea, CHANGE + 1).speed, beaufortSpeed(7));
  // Untouched before the change, wholly the new sea once it is over.
  assert.equal(seaAt(sea, 10, 20, CHANGE - STEP).height, seaAt(before, 10, 20, CHANGE - STEP).height);
  assert.ok(Math.abs(seaAt(sea, 10, 20, end + 1).height - seaAt(after, 10, 20, end + 1).height) < 1e-12);
  // Step by step through the change, the surface moves no faster than the new sea's own waves do.
  let worst = 0, steady = 0, prev = seaAt(sea, 10, 20, CHANGE - 1).height, prevAfter = seaAt(after, 10, 20, CHANGE - 1).height;
  for (let t = CHANGE - 1; t < end + 1; t += STEP) {
    const h = seaAt(sea, 10, 20, t).height, ha = seaAt(after, 10, 20, t).height;
    worst = Math.max(worst, Math.abs(h - prev));
    steady = Math.max(steady, Math.abs(ha - prevAfter));
    [prev, prevAfter] = [h, ha];
  }
  assert.ok(worst <= steady * 1.1, `largest step ${worst.toFixed(4)} m, the new sea's own ${steady.toFixed(4)} m`);
  // Halfway, both seas show, and the energy is shared: Hs² in between, with the swell's on top.
  const span = after.seaLayers[0]!.waves.peakLength * 40;
  const mid = heights(sea, 1500, span, CHANGE + SEA_CHANGE_SECONDS / 2, CHANGE + SEA_CHANGE_SECONDS / 2).significant;
  const want = withSwell(Math.sqrt((SEA_BY_FORCE[3]!.height ** 2 + SEA_BY_FORCE[7]!.height ** 2) / 2));
  assert.ok(Math.abs(mid - want) / want < 0.1, `halfway Hs ${mid.toFixed(2)} m, expected about ${want.toFixed(2)} m`);
  assert.ok(heights(sea, 1500, span, CHANGE, end).minStretch > 0, 'the blend never folds the surface');
});

test('a change during a change waits its turn, a waiting change is replaced, and old layers are dropped', () => {
  const a = changeWind(startSea(SEED, wind(3), 0), wind(5), 100);
  const b = changeWind(a, wind(6), 150);
  assert.equal(b.seaLayers.length, 3);
  assert.equal(b.seaLayers[2]!.start, 100 + SEA_CHANGE_SECONDS);
  const c = changeWind(b, wind(7), 160);
  assert.equal(c.seaLayers.length, 3, 'the waiting change is replaced');
  assert.equal(c.seaLayers[2]!.wind.speed, beaufortSpeed(7));
  assert.notDeepEqual(c.seaLayers[2]!.waves, b.seaLayers[2]!.waves, 'every change draws its own waves');
  const d = changeWind(c, wind(4), 2000);
  assert.deepEqual(d.seaLayers.map((l) => l.wind.speed), [beaufortSpeed(7), beaufortSpeed(4)]);
  // Through the queued changes the surface stays continuous.
  let prev = seaAt(c, 0, 0, 0).height, worst = 0;
  for (let t = 0; t < 800; t += 1 / 30) {
    const h = seaAt(c, 0, 0, t).height;
    worst = Math.max(worst, Math.abs(h - prev));
    prev = h;
  }
  assert.ok(worst < 0.2, `largest step ${worst.toFixed(3)} m`);
});

test('a sea following a moving wind takes a new wave set only when the wind has moved enough', () => {
  const sea = startSea(SEED, wind(5, 0), 0);
  assert.equal(followWind(sea, { speed: beaufortSpeed(5) + 0.5, toward: 0.1 }, 60), sea);
  assert.equal(followWind(sea, { speed: beaufortSpeed(5), toward: 2 * Math.PI - 0.1 }, 60), sea, 'a turn across north is small');
  assert.equal(followWind(sea, { speed: beaufortSpeed(6), toward: 0 }, 60).seaLayers.length, 2);
  assert.equal(followWind(sea, { speed: beaufortSpeed(5), toward: 0.5 }, 60).seaLayers.length, 2);
});

test('the layer weights share the energy: their squares add up to one at every moment', () => {
  const sea = changeWind(changeWind(startSea(SEED, wind(3), 0), wind(5), 100), wind(6), 150);
  for (let t = 0; t < 600; t += 7) {
    const w = layerWeights(sea, t);
    assert.ok(Math.abs(w.reduce((s, f) => s + f * f, 0) - 1) < 1e-12, `at ${t}: ${w}`);
  }
  assert.deepEqual(layerWeights(sea, 50), [1, 0, 0]);
});

test('a flat calm keeps the swell: its height, and no wave shorter than the swell\'s', () => {
  const calm = startSea(SEED, wind(0), 0), swell = calm.seaSwell;
  assert.ok(calm.seaLayers[0]!.waves.amp.every((a) => a === 0), 'force 0 has no wind sea');
  // Nothing shorter: the swell's shortest wave is that of its shortest period (deep water, L = g T² / 2π).
  const longest = (GRAVITY * SWELL_PERIOD_SHORTEST ** 2) / (2 * Math.PI);
  assert.ok(swell.shortest >= longest * (1 - 1e-9), `shortest swell wave ${swell.shortest.toFixed(1)} m`);
  swell.omega.forEach((w) => {
    const period = (2 * Math.PI) / w;
    assert.ok(period >= SWELL_PERIOD_SHORTEST && period <= SWELL_PERIOD_LONGEST, `period ${period.toFixed(2)} s`);
  });
  assert.equal(swell.kx.length, SWELL_COMPONENTS);
  assert.ok(Math.abs(setHeight(swell) - SWELL_HEIGHT) < 1e-9);
  const { mean, significant, minStretch } = heights(calm, 2000, swell.peakLength * 10);
  assert.ok(Math.abs(significant - SWELL_HEIGHT) / SWELL_HEIGHT < 0.1, `calm Hs ${significant.toFixed(3)} m`);
  assert.ok(Math.abs(mean) < 0.02 * SWELL_HEIGHT && minStretch > 0);
  // It breathes: the water at one place rises and falls by tens of centimetres over a minute.
  let lo = Infinity, hi = -Infinity;
  for (let t = 0; t < 60; t += 0.5) {
    const h = seaAt(calm, 0, 0, t).height;
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
  }
  assert.ok(hi - lo > SWELL_HEIGHT / 4, `rise and fall ${(hi - lo).toFixed(2)} m`);
});

test('in every preset the swell raises the significant height by no more than its own share', () => {
  BEAUFORT.forEach((_, force) => {
    const sea = startSea(SEED, wind(force), 0);
    const preset = SEA_BY_FORCE[force]!.height, both = Math.hypot(setHeight(sea.seaLayers[0]!.waves), setHeight(sea.seaSwell));
    assert.ok(both - preset <= SWELL_HEIGHT + 1e-9 && both > preset, `force ${force}: ${preset} m becomes ${both.toFixed(3)} m`);
    assert.ok(Math.abs(both - withSwell(preset)) < 1e-9);
  });
});

test('the swell is the seed\'s: its direction well off the wind, its phases free, the same in every preset', () => {
  const directions = new Set<string>(), phases = new Set<string>();
  for (let seed = 0; seed < 40; seed++) {
    for (const toward of [0, 1.3, -2.8]) {
      const swell = startSea(seed, wind(4, toward), 0).seaSwell;
      swell.kx.forEach((kx, i) => {
        const off = between(Math.atan2(swell.kz[i]!, kx), toward);
        assert.ok(off >= SWELL_OFF_WIND - 1e-9, `seed ${seed}: a swell wave runs ${(off * 180 / Math.PI).toFixed(1)}° off the wind`);
      });
      if (toward === 0) {
        directions.add(Math.atan2(swell.kz[0]!, swell.kx[0]!).toFixed(3));
        phases.add(swell.phase[0]!.toFixed(3));
      }
    }
    // The same seed and wind direction give the same swell, whatever the force; a change of wind keeps it.
    const calm = startSea(seed, wind(0, 0.7), 0), gale = startSea(seed, wind(10, 0.7), 0);
    assert.deepEqual(calm.seaSwell, gale.seaSwell);
    assert.deepEqual(changeWind(calm, wind(6, 2), 100).seaSwell, calm.seaSwell);
    assert.deepEqual(followWind(calm, wind(8, -1), 100).seaSwell, calm.seaSwell);
  }
  assert.ok(directions.size === 40 && phases.size === 40, 'every seed draws its own direction and phases');
  // Both sides of the wind occur.
  const sides = [...directions].map((d) => Math.sign(Math.sin(Number(d))));
  assert.ok(sides.includes(1) && sides.includes(-1));
  assert.deepEqual(makeSwell(7, 0.3), makeSwell(7, 0.3));
});
