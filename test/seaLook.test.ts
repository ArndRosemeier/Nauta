import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beaufortSpeed } from '../src/sim/rules/beaufort.ts';
import { SEA_CHANGE_SECONDS } from '../src/sim/rules/sea.ts';
import { changeWind, seaAt, startSea } from '../src/sim/sea/sea.ts';
import { makeWind, gustsNear } from '../src/sim/wind.ts';
import {
  BAND_TEXELS_LEAST, BAND_WAVE_STRIDE, FINE_FADE_IN, FINE_LONGEST, FINE_REPEAT, FINE_SHORTEST, bandLayout, bandTables, fineFrame, fineFrameFor,
  fineLayer, fineSlope, gustRoughening, seaRoughness, slopeVariance,
} from '../src/render/seaFine.ts';
import { foamLevels, normalAbove, whitecapShare } from '../src/render/seaFoam.ts';
import { GUST_CHANNELS, GUST_SPAN, GUST_TEXEL, GUST_TEXELS, drawGusts, gustMap } from '../src/render/seaGusts.ts';
import { fillSeaWaves, seaWaveTable } from '../src/render/seaWaves.ts';

const wind = (force: number, toward = 0.4) => ({ speed: beaufortSpeed(force), toward });

test('the sea roughens with the wind as Cox and Munk measured, and is glassy in a calm', () => {
  assert.ok(seaRoughness(0) < 0.001, 'a calm is nearly a mirror');
  assert.ok(Math.abs(seaRoughness(7) - (0.003 + 0.00512 * 7)) < 0.002, 'force 4: Cox and Munk');
  for (let u = 0; u < 25; u += 0.5) assert.ok(seaRoughness(u + 0.5) >= seaRoughness(u), `no smoother at ${u + 0.5} m/s`);
});

test('the fine sea\'s bands run from the longest fine wave down to the ripples without a gap, each tile holding its waves', () => {
  for (const [count, texels] of [[2, 128], [2, 256], [3, 256], [4, 512]] as const) {
    const { bands } = bandLayout(count, texels);
    assert.equal(bands.length, count);
    assert.ok(Math.abs(bands[0]!.longest - FINE_LONGEST) < 1e-9 && Math.abs(bands[count - 1]!.shortest - FINE_SHORTEST) < 1e-9);
    for (let b = 0; b < count; b++) {
      const band = bands[b]!;
      if (b > 0) assert.ok(Math.abs(band.longest - bands[b - 1]!.shortest) < 1e-9, 'the next band begins where this one ends');
      assert.ok(band.shortest / (band.tile / texels) >= BAND_TEXELS_LEAST - 1e-9, `band ${b} of ${count}×${texels}²: its shortest wave spans enough texels`);
      assert.ok(band.tile >= 3 * band.longest, `band ${b} of ${count}×${texels}²: its tile holds a few of its longest waves`);
      for (let c = 0; c < b; c++) assert.ok(Math.abs(bands[c]!.tile / band.tile - Math.round(bands[c]!.tile / band.tile)) > 0.01, 'no two tiles share a period');
    }
    assert.ok(bands[count - 1]!.gust > bands[0]!.gust, 'gusts roughen the short waves most');
  }
});

test('the bands\' tables are seeded, mirror-symmetric, and hold each wavenumber in one band only', () => {
  const layout = bandLayout(3, 64), a = bandTables(layout, 7), b = bandTables(layout, 7), c = bandTables(layout, 8);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.noise, c.noise);
  assert.deepEqual(a.base, c.base, 'only the noise depends on the seed');
  const n = 64, per = n * n;
  for (let band = 0; band < 3; band++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = band * per + y * n + x, m = band * per + ((n - y) % n) * n + ((n - x) % n);
    assert.equal(a.base[i], a.base[m], 'the GPU reads one base for k and for −k');
    assert.equal(a.waves[i * BAND_WAVE_STRIDE + 2], a.waves[m * BAND_WAVE_STRIDE + 2], 'and one frequency');
    const kx = a.waves[i * BAND_WAVE_STRIDE]!, kz = a.waves[i * BAND_WAVE_STRIDE + 1]!, length = (2 * Math.PI) / Math.hypot(kx, kz);
    const { longest, shortest } = layout.bands[band]!;
    if (a.base[i]! > 0) assert.ok(length <= longest * (1 + 1e-6) && length >= (band === 2 ? FINE_SHORTEST : shortest) * (1 - 1e-6), `band ${band}: a ${length} m wave`);
    const omega = a.waves[i * BAND_WAVE_STRIDE + 2]!;
    assert.ok(Math.abs(omega * FINE_REPEAT / (2 * Math.PI) - Math.round(omega * FINE_REPEAT / (2 * Math.PI))) < 1e-3, 'its phase comes round after FINE_REPEAT');
  }
});

test('the waves the GPU makes from the tables carry the slope each band is given', () => {
  // The GPU's spectrum (seaBands.ts) worked out here: E|h(k)|² = (A(k)² + A(−k)²), A = base · √(level · window · D).
  const layout = bandLayout(3, 256), t = bandTables(layout, 3), n = 256, per = n * n;
  const layer = fineLayer(layout, { toward: 0.7 }, 9, 0.03);
  const dx = Math.cos(0.7), dz = Math.sin(0.7);
  const window = (lnk: number) => { const x = Math.min(1, Math.max(0, (lnk - layer.top) / FINE_FADE_IN)); return x * x * (3 - 2 * x); };
  for (let band = 0; band < 3; band++) {
    let slope = 0;
    for (let j = 0; j < per; j++) {
      const i = band * per + j, base = t.base[i]!;
      if (!base) continue;
      const kx = t.waves[i * BAND_WAVE_STRIDE]!, kz = t.waves[i * BAND_WAVE_STRIDE + 1]!, s = t.waves[i * BAND_WAVE_STRIDE + 3]!, k = Math.hypot(kx, kz);
      const along = (kx * dx + kz * dz) / k, w = layer.level * window(Math.log(k));
      slope += k * k * base * base * w * (((1 + along) / 2) ** s + ((1 - along) / 2) ** s);
    }
    const want = layer.slope[band]!;
    assert.ok(Math.abs(slope - want) <= 0.12 * want + 1e-7, `band ${band}: ${slope} against ${want}`);
  }
  const total = layer.slope.reduce((a, b) => a + b, 0) + layer.ripples;
  assert.ok(Math.abs(total - 0.03) < 1e-3, 'the bands and the ripples carry it all');
  assert.ok(layer.slope[0]! < layer.slope[1]!, 'nothing above the fine waves\' longest (9 m) but the fade-in');
});

test('the fine sea of a moment weights its two strongest layers as their simulated waves, in energy', () => {
  const layout = bandLayout(3, 256);
  const sea = changeWind(startSea(1805, wind(3), 0), wind(6, 1.9), 100);
  const mid = 100 + SEA_CHANGE_SECONDS / 2;
  const frame = fineFrame(sea, mid, layout, fineFrameFor(layout));
  assert.equal(frame.layers.filter((l) => l.layer).length, 2, 'both layers show while one fades into the other');
  const energy = frame.layers.reduce((a, l) => a + l.weight * l.weight, 0);
  assert.ok(Math.abs(energy - 1) < 1e-9);
  let want = 0;
  for (const l of frame.layers) want += l.weight * l.weight * l.layer!.slope[1]!;
  assert.ok(Math.abs(frame.slope[1]! - want) < 1e-12);
  const again = fineFrame(sea, mid, layout, fineFrameFor(layout));
  assert.equal(again.layers[0]!.layer, frame.layers[0]!.layer, 'a layer\'s fine waves are made once');
  const calm = fineFrame(startSea(1805, wind(4), 0), 0, layout, fineFrameFor(layout));
  assert.equal(calm.layers[1]!.layer, null);
  assert.ok(calm.slope.every((s) => s >= 0) && calm.ripples > 0);
});

test('the fine waves carry what the simulated waves leave of the roughness, and gusts roughen a light air most', () => {
  const sea = startSea(1805, wind(4), 0);
  const coarse = slopeVariance(sea.seaLayers[0]!.waves) + slopeVariance(sea.seaSwell);
  assert.ok(coarse < seaRoughness(beaufortSpeed(4)));
  assert.ok(Math.abs(coarse + fineSlope(beaufortSpeed(4), coarse) - seaRoughness(beaufortSpeed(4))) < 1e-12);
  assert.equal(gustRoughening(beaufortSpeed(4), coarse, 0), 1);
  assert.ok(gustRoughening(beaufortSpeed(1), 0, 0.5) > gustRoughening(beaufortSpeed(6), 0, 0.5) + 0.5);
});

test('the normal quantile and the whitecap share', () => {
  assert.ok(Math.abs(normalAbove(0.5)) < 1e-3);
  assert.ok(Math.abs(normalAbove(0.02275) - 2) < 1e-3);
  assert.ok(whitecapShare(beaufortSpeed(2)) < 1e-3, 'a light breeze has no whitecaps to speak of');
  assert.ok(whitecapShare(beaufortSpeed(8)) > 0.1);
});

test('the foam forms on the share of the sea the wind whitens (checked against seaAt\'s stretch)', () => {
  for (const force of [4, 6, 8]) {
    const sea = startSea(1805, wind(force, 0.3), 0), speed = beaufortSpeed(force);
    const { level } = foamLevels(fillSeaWaves(sea, 0, 0, 0, seaWaveTable()), speed);
    let below = 0;
    const n = 1500;
    for (let i = 0; i < n; i++) if (seaAt(sea, (i * 37.1) % 900, (i * 91.7) % 1100, i * 0.37).stretch < level) below++;
    const want = whitecapShare(speed), got = below / n;
    assert.ok(got > want / 2 && got < want * 2, `force ${force}: ${got} of the sea white, want ${want}`);
  }
  assert.ok(foamLevels(fillSeaWaves(startSea(1805, wind(1), 0), 0, 0, 0, seaWaveTable()), beaufortSpeed(1)).level < 0, 'no foam in a light air');
});

test('the gust map lies on a fixed lattice around the eye and shows each gust at its heart', () => {
  const w = makeWind(1805, 3, 1.2), t = 600, x = 1234.5, z = -987.6;
  const map = drawGusts(w, t, x, z, beaufortSpeed(3), 0.01, gustMap());
  assert.equal(Math.abs(map.x0 % GUST_TEXEL) + Math.abs(map.z0 % GUST_TEXEL), 0);
  assert.ok(Math.abs(map.x0 + GUST_SPAN / 2 - x) <= GUST_TEXEL && Math.abs(map.z0 + GUST_SPAN / 2 - z) <= GUST_TEXEL);
  const gusts = gustsNear(w, x, z, t, GUST_SPAN / 3).filter((g) => g.strength > 0.1);
  assert.ok(gusts.length > 0, 'the test sees some gusts');
  for (const g of gusts) {
    const i = Math.floor((g.x - map.x0) / GUST_TEXEL), j = Math.floor((g.z - map.z0) / GUST_TEXEL);
    if (i < 0 || j < 0 || i >= GUST_TEXELS || j >= GUST_TEXELS) continue;
    const at = (j * GUST_TEXELS + i) * GUST_CHANNELS;
    assert.ok(map.data[at]! > 0 && map.data[at + 1]! > 0, 'a gust roughens and shows at its heart');
  }
});
