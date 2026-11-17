import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beaufortSpeed } from '../src/sim/rules/beaufort.ts';
import { SEA_CHANGE_SECONDS } from '../src/sim/rules/sea.ts';
import { changeWind, seaAt, startSea } from '../src/sim/sea/sea.ts';
import { makeWind, gustsNear } from '../src/sim/wind.ts';
import {
  FINE_AT, FINE_MORE_AT, FINE_SHORTEST, SEA_FINE_DRAWN, SEA_FINE_PER_LAYER, SEA_FINE_STRIDE, fillFineWaves, fineSlope, fineTable,
  gustRoughening, makeFineWaves, seaRoughness, slopeVariance,
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

test('a layer\'s fine waves are seeded, run from the simulated waves down to ripples, and carry the slope asked for', () => {
  const a = makeFineWaves(7, wind(4), 4.5, 0.03), b = makeFineWaves(7, wind(4), 4.5, 0.03), c = makeFineWaves(8, wind(4), 4.5, 0.03);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.phase, c.phase);
  let slope = 0;
  for (let i = 0; i < SEA_FINE_PER_LAYER; i++) {
    const k = Math.hypot(a.kx[i]!, a.kz[i]!), length = (2 * Math.PI) / k;
    assert.ok(length <= 4.5 + 1e-9 && length >= FINE_SHORTEST - 1e-9, `wave ${i} is ${length} m`);
    slope += (a.amp[i]! * k) ** 2 / 2;
  }
  assert.ok(a.ripples > 0 && Math.abs(slope + a.ripples - 0.03) < 1e-9, 'the waves and the ripples carry it all');
  assert.equal(a.excess, 0);
  // A gale's slope is more than the waves may carry: they are capped and the rest is roughness, nothing lost.
  const gale = makeFineWaves(7, wind(8), 9, 0.1);
  let carried = 0, most = 0;
  for (let i = 0; i < SEA_FINE_PER_LAYER; i++) {
    const s = (gale.amp[i]! * Math.hypot(gale.kx[i]!, gale.kz[i]!)) ** 2 / 2;
    carried += s; most = Math.max(most, s);
  }
  assert.ok(gale.excess > 0 && most < 0.1 / SEA_FINE_PER_LAYER);
  assert.ok(Math.abs(carried + gale.excess + gale.ripples - 0.1) < 1e-9);
});

test('the fine waves of a moment are ordered long to short, each with the slope of every shorter one', () => {
  const sea = changeWind(startSea(1805, wind(3), 0), wind(6, 1.9), 100);
  const mid = 100 + SEA_CHANGE_SECONDS / 2;
  const table = fillFineWaves(sea, mid, 2048, -1024, fineTable());
  assert.equal(table.count, 2 * SEA_FINE_PER_LAYER, 'both layers show while one fades into the other');
  assert.ok(table.count <= SEA_FINE_DRAWN);
  let lastK = 0, lastTail = Infinity;
  for (let i = 0; i < table.count; i++) {
    const at = i * SEA_FINE_STRIDE, k = table.more[at + FINE_MORE_AT.k]!, tail = table.more[at + FINE_MORE_AT.tail]!;
    assert.ok(k >= lastK && tail <= lastTail * (1 + 1e-6));
    assert.ok(Math.abs(table.wave[at + FINE_AT.phase]!) <= Math.PI + 1e-6, 'phases stay small');
    lastK = k; lastTail = tail;
  }
  assert.equal(fillFineWaves(startSea(1805, wind(4), 0), 0, 0, 0, fineTable()).count, SEA_FINE_PER_LAYER);
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
