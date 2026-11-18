import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { anchorWeights, bedIds, bedLevels, seaForce, takeAngle, windPresence, type Hearing } from '../src/audio/ambience.ts';
import { SlapWatch, seaRms, slapKind, type SlapEvent } from '../src/audio/slaps.ts';
import { BURST, CREST, LAP, SEA_BEDS, SLAP, SLAP_GAP, SLAP_REACH, TAKE_SWING, WIND_BEDS, WIND_FULL } from '../src/audio/tuning.ts';
import { BEAUFORT, beaufortForce, beaufortSpeed } from '../src/sim/rules/beaufort.ts';
import { SEA_CHANGE_SECONDS } from '../src/sim/rules/sea.ts';
import { changeWind, startSea } from '../src/sim/sea/sea.ts';

const SEED = 1805;
/** Three minutes, s: the plan's span within which no loop may be heard. */
const THREE_MINUTES = 180;
/** A frame at 30 a second, s. */
const STEP = 1 / 30;
const levelOf = (h: Hearing, id: string) => bedLevels(h, SEED).find((b) => b.id === id)!.level;
const hearing = (seaForce: number, windSpeed: number, t = 0, rise = 0): Hearing => ({ seaForce, windSpeed, rise, t });
const sound = JSON.parse(readFileSync(new URL('../public/sound/index.json', import.meta.url), 'utf8')) as { sounds: Record<string, { files: string[] }> };

test('beaufortForce is beaufortSpeed backwards, and climbs without a jump', () => {
  for (let f = 0; f < BEAUFORT.length; f++) assert.ok(Math.abs(beaufortForce(beaufortSpeed(f)) - f) < 1e-9, `force ${f}`);
  let last = 0;
  for (let v = 0; v < 40; v += 0.05) {
    const f = beaufortForce(v);
    assert.ok(f >= last && f - last < 0.1, `at ${v} m/s`);
    last = f;
  }
});

test('every sound the mix asks for is made, with its takes', () => {
  for (const id of bedIds()) assert.ok(sound.sounds[id]?.files.length, id);
  for (const k of [LAP, SLAP, CREST, BURST]) assert.ok((sound.sounds[k.id]?.files.length ?? 0) >= 4, `${k.id} has several takes`);
});

test('neighbouring beds share at equal power, and nothing jumps along the scale', () => {
  for (let x = -1; x < 10; x += 0.01) {
    const w = anchorWeights(SEA_BEDS, x);
    assert.ok(Math.abs(w.reduce((s, v) => s + v * v, 0) - 1) < 1e-9);
    const next = anchorWeights(SEA_BEDS, x + 0.01);
    w.forEach((v, i) => assert.ok(Math.abs(v - next[i]!) < 0.02, `at ${x}`));
  }
});

test('a calm is quiet water and no wind; a gale is the gale beds, loud', () => {
  const calm = hearing(0, 0.1);
  assert.ok(levelOf(calm, 'bed/sea-calm-a') ** 2 + levelOf(calm, 'bed/sea-calm-b') ** 2 > 0);
  for (const a of WIND_BEDS) assert.equal(levelOf(calm, `${a.id}-a`) + levelOf(calm, `${a.id}-b`), 0);
  const gale = hearing(8, 20);
  const pair = (h: Hearing, id: string) => Math.hypot(levelOf(h, `${id}-a`), levelOf(h, `${id}-b`));
  assert.ok(Math.abs(pair(gale, 'bed/sea-gale') - 1) < 1e-9);
  assert.ok(Math.abs(pair(gale, 'bed/wind-gale') - 1) < 1e-9);
  assert.equal(pair(gale, 'bed/sea-calm'), 0);
  // Louder as it blows harder: the sea's and the wind's whole level only rise with the force.
  const whole = (h: Hearing) => Math.hypot(...bedLevels(h, SEED).map((b) => b.level));
  let last = 0;
  for (let f = 0; f <= 8; f += 0.25) {
    const now = whole(hearing(f, beaufortSpeed(Math.round(f))));
    assert.ok(now >= last - 1e-9, `force ${f}`);
    last = now;
  }
});

test('the wind is heard from a light air on, and rises with a gust', () => {
  assert.equal(windPresence(0), 0);
  assert.equal(windPresence(WIND_FULL), 1);
  assert.ok(windPresence(beaufortSpeed(1)) > 0);
  const steady = hearing(4, 6), gusting = hearing(4, 9);
  const wind = (h: Hearing) => Math.hypot(...bedLevels(h, SEED).filter((b) => b.id.startsWith('bed/wind')).map((b) => b.level));
  assert.ok(wind(gusting) > wind(steady));
});

test('each bed\'s two takes swing slowly at equal power, every bed at its own pace, the same for the same seed', () => {
  const periods = new Set<number>();
  for (const a of [...SEA_BEDS, ...WIND_BEDS]) {
    let crossings = 0, last = takeAngle(SEED, a.id, 0) - Math.PI / (2 * 2);
    for (let t = 0; t < THREE_MINUTES; t += 1) {
      const angle = takeAngle(SEED, a.id, t);
      assert.ok(angle >= 0 && angle <= Math.PI / 2);
      assert.equal(angle, takeAngle(SEED, a.id, t));
      const side = angle - Math.PI / (2 * 2);
      if (side * last < 0) crossings++;
      last = side;
    }
    // Within three minutes a swing comes round at most 180 / 47 ≈ 4 times: two crossings each.
    assert.ok(crossings <= (2 * THREE_MINUTES) / TAKE_SWING[0] + 1, a.id);
    periods.add(Math.round(takeAngle(SEED, a.id, 1) * 1e6));
  }
  assert.equal(periods.size, SEA_BEDS.length + WIND_BEDS.length, 'no two beds swing together');
});

test('the sea\'s sound follows a change of wind as the waves do, over minutes and without a jump', () => {
  const sea0 = startSea(SEED, { speed: beaufortSpeed(2), toward: 0 }, 0);
  const sea = changeWind(sea0, { speed: beaufortSpeed(6), toward: 0 }, 10);
  assert.ok(Math.abs(seaForce(sea, 5) - 2) < 1e-9);
  assert.ok(Math.abs(seaForce(sea, 10 + SEA_CHANGE_SECONDS + 1) - 6) < 1e-9);
  let last = seaForce(sea, 0);
  for (let t = 0; t < SEA_CHANGE_SECONDS + 20; t += 1) {
    const f = seaForce(sea, t);
    assert.ok(f >= last - 1e-9 && f - last < 0.1, `at ${t} s`);
    last = f;
  }
});

test('which sound a crest makes: laps in a calm, slaps in a breeze, crests and bursts as it blows up', () => {
  assert.equal(slapKind(0, 0.9, 0, 0), LAP);
  assert.equal(slapKind(4, 0, 0.9, 0), SLAP);
  assert.equal(slapKind(5, 0, 0, 0.9), CREST);
  assert.equal(slapKind(8, 0, 0, 0), BURST);
  assert.equal(slapKind(2, 0, 0, 0), LAP);
  assert.notEqual(slapKind(4, 0.5, 0.5, 0.5), LAP);
});

/** A minute of slaps heard at 30 frames a second, the listener at (x, z). */
function minuteOfSlaps(force: number, seed = SEED, x = 0, z = 0): { t: number; e: SlapEvent }[] {
  const sea = startSea(seed, { speed: beaufortSpeed(force), toward: 1 }, 0), watch = new SlapWatch(seed), out: SlapEvent[] = [];
  const heard: { t: number; e: SlapEvent }[] = [];
  for (let t = 0; t < THREE_MINUTES / 3; t += STEP) for (const e of watch.listen(sea, t, x, z, force, out)) heard.push({ t, e });
  return heard;
}

test('slaps come from crests near the listener, now and then, never in a heap, the same for the same seed', () => {
  for (const force of [0, 3, 6]) {
    const heard = minuteOfSlaps(force, SEED, 100, -40);
    assert.ok(heard.length >= 10 && heard.length <= 200, `force ${force}: ${heard.length} a minute`);
    for (let i = 1; i < heard.length; i++) assert.ok(heard[i]!.t - heard[i - 1]!.t >= SLAP_GAP - 1e-9);
    for (const { e } of heard) {
      const d = Math.hypot(e.at[0] - 100, e.at[2] + 40);
      assert.ok(d < SLAP_REACH[1] * 1.5, `${d} m off`);
    }
    assert.deepEqual(minuteOfSlaps(force, SEED, 100, -40), heard);
  }
  const calm = minuteOfSlaps(0).map(({ e }) => e.kind);
  assert.ok(calm.every((k) => k === LAP), 'a calm only laps');
  const strong = minuteOfSlaps(6).map(({ e }) => e.kind);
  assert.ok(strong.includes(CREST) && strong.includes(SLAP), 'a strong breeze slaps and breaks');
});

test('the sea\'s RMS height matches its significant height (a quarter of it)', () => {
  const sea = startSea(SEED, { speed: beaufortSpeed(5), toward: 0 }, 0);
  // Force 5: 2 m of wind sea with the 0.6 m swell, √(2² + 0.6²) = 2.09 m significant.
  assert.ok(Math.abs(4 * seaRms(sea, 0) - Math.hypot(2, 0.6)) < 0.1);
});
