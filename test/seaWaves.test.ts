import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beaufortSpeed } from '../src/sim/rules/beaufort.ts';
import { SEA_CHANGE_SECONDS } from '../src/sim/rules/sea.ts';
import { changeWind, seaAt, startSea, type SeaState } from '../src/sim/sea/sea.ts';
import { MORE_AT, SEA_DRAWN_WAVES, SEA_WAVE_STRIDE, WAVE_AT, fillSeaWaves, seaWaveTable, type SeaWaveTable } from '../src/render/seaWaves.ts';

const wind = (force: number, toward = 0.4) => ({ speed: beaufortSpeed(force), toward });

/** The surface at a calm point (x, z) as the vertex stage sums the table, with x and z measured from its origin. */
function drawn(table: SeaWaveTable, x: number, z: number) {
  let h = table.lift, sx = 0, sz = 0;
  for (let i = 0; i < table.count; i++) {
    const at = i * SEA_WAVE_STRIDE, kx = table.wave[at + WAVE_AT.kx]!, kz = table.wave[at + WAVE_AT.kz]!;
    const th = kx * x + kz * z + table.wave[at + WAVE_AT.phase]!;
    h += table.wave[at + WAVE_AT.height]! * Math.cos(th);
    sx -= kx * table.more[at + MORE_AT.reach]! * Math.sin(th);
    sz -= kz * table.more[at + MORE_AT.reach]! * Math.sin(th);
  }
  return { h, sx, sz };
}

/** The largest difference between the drawn surface and `seaAt` over points near an origin far out, at time t. */
function worst(sea: SeaState, t: number, ox: number, oz: number): number {
  const table = fillSeaWaves(sea, t, ox, oz, seaWaveTable());
  let most = 0;
  for (let i = 0; i < 40; i++) {
    const x = ((i * 37) % 300) - 150, z = ((i * 53) % 300) - 150;
    const want = seaAt(sea, ox + x, oz + z, t), got = drawn(table, x, z);
    most = Math.max(most, Math.abs(want.height - got.h), Math.abs(want.shift[0] - got.sx), Math.abs(want.shift[1] - got.sz));
  }
  return most;
}

test('the vertex stage draws exactly seaAt\'s surface, far from zero and late in a match', () => {
  for (const force of [0, 2, 4, 6, 9]) {
    const sea = startSea(1805, wind(force), 0);
    assert.ok(worst(sea, 0, 0, 0) < 1e-3, `force ${force} at the start`);
    assert.ok(worst(sea, 5 * 3600 + 0.37, 61440, -38912) < 1e-3, `force ${force}, 60 km out, five hours on`);
  }
});

test('while one wind\'s waves fade into another\'s, both are drawn as seaAt weighs them', () => {
  const sea = changeWind(startSea(1805, wind(3), 0), wind(6, 1.9), 100);
  const mid = 100 + SEA_CHANGE_SECONDS / 2;
  assert.ok(worst(sea, mid, 2048, 1024) < 1e-3);
  const table = fillSeaWaves(sea, mid, 2048, 1024, seaWaveTable());
  assert.ok(table.count <= SEA_DRAWN_WAVES);
  for (let i = 0; i < table.count; i++) assert.ok(Math.abs(table.wave[i * SEA_WAVE_STRIDE + WAVE_AT.phase]!) <= Math.PI + 1e-6, 'phases stay small');
  assert.ok(table.extent > 0 && table.lift >= 0);
});
