import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BRIG, EXCHANGE, SKY_KEYS, TITLE_LAYOUT, brigPlace, exchange, onBrig, paletteAt, sunFromFinger } from '../src/title/titleLook.ts';
import { FramePace } from '../src/title/scene.ts';

/** An iPad Air in landscape, CSS px. */
const W = 1180;
const H = 820;
/** A 120 Hz screen's frames, ms, for a second. */
const PROMOTION_MS = 1000 / 120;
const PROMOTION_FRAMES = 120;
/** Exchanges of fire looked at. */
const TAPS = 40;

test('the sky blends between its keys and holds past the ends', () => {
  const first = SKY_KEYS[0], last = SKY_KEYS[SKY_KEYS.length - 1];
  assert.equal(paletteAt(first.at - 1).stars, first.stars);
  assert.equal(paletteAt(last.at + 1).stars, last.stars);
  // Halfway between sunset and the golden hour the stars are half gone and the colours in between.
  const a = SKY_KEYS[1], b = SKY_KEYS[2], mid = paletteAt((a.at + b.at) / 2);
  assert.ok(Math.abs(mid.stars - (a.stars + b.stars) / 2) < 1e-9);
  const top = paletteAt(a.at).top, topB = paletteAt(b.at).top;
  for (let i = 0; i < top.length; i++) assert.ok(Math.abs(mid.top[i] - (top[i] + topB[i]) / 2) < 1e-9);
});

test('a finger puts the sun within the sky it may have, the top of the screen highest', () => {
  const high = sunFromFinger(-50, 0, W, H), low = sunFromFinger(W + 50, H, W, H);
  assert.ok(Math.abs(high.height - TITLE_LAYOUT.sunHighest) < 1e-9);
  assert.ok(Math.abs(low.height - TITLE_LAYOUT.sunLowest) < 1e-9);
  assert.equal(high.x, W * TITLE_LAYOUT.sunMargin);
  assert.equal(low.x, W * (1 - TITLE_LAYOUT.sunMargin));
});

test('a tap on her sails fires; a tap on the open sky or sea does not', () => {
  const her = brigPlace(W, H), mast = BRIG.masts[1];
  assert.ok(onBrig(her.x + mast.x * her.length, her.y - mast.heads[1] * her.length, W, H));
  assert.ok(!onBrig(W * TITLE_LAYOUT.sunX, H * TITLE_LAYOUT.horizon / 2, W, H));
  assert.ok(!onBrig(W - 1, H - 1, W, H));
});

test('each exchange of fire is seeded, fires a real port and drops its balls where the layout says', () => {
  assert.deepEqual(exchange(3), exchange(3));
  const ports = new Set<number>();
  for (let n = 0; n < TAPS; n++) {
    const e = exchange(n);
    ports.add(e.port);
    assert.ok(e.port >= 0 && e.port < BRIG.ports.length);
    assert.ok(e.fall[0] >= EXCHANGE.fallX[0] && e.fall[0] <= EXCHANGE.fallX[1]);
    assert.ok(e.fall[1] > TITLE_LAYOUT.horizon && e.answerFall[1] > TITLE_LAYOUT.horizon);
    assert.ok(e.answer >= EXCHANGE.answer && e.answer <= EXCHANGE.answer + EXCHANGE.answerSpread);
  }
  assert.ok(ports.size > 1, 'she fires from more than one port');
});

test('the title draws at most 60 pictures a second on a 120 Hz screen', () => {
  const pace = new FramePace(60);
  let drawn = 0;
  for (let k = 0; k < PROMOTION_FRAMES; k++) if (pace.due(k * PROMOTION_MS)) drawn++;
  assert.equal(drawn, PROMOTION_FRAMES / 2);
});
