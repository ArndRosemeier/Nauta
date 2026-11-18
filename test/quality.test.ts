import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LATE_FRAME_MS, MEASURE_MS, QUALITY_LEVELS, QualityChooser, SETTLE_MS, START_SETTLE_MS, TARGET_FPS, levelNamed,
} from '../src/app/quality.ts';
import { SEA_TILE_CELLS, seaCellChoices, seaCellsFit, seaTileTriangles } from '../src/render/seaGrid.ts';

/** A frame at the target rate, ms. */
const AT_TARGET = 1000 / TARGET_FPS;

/** Feeds `chooser` frames whose time comes from the level's knobs, until it has chosen or `limitMs` of frames have passed. */
function run(chooser: QualityChooser, frameMs: (scale: number) => number, limitMs = 60000): number {
  let t = 0;
  while (!chooser.chosen && t < limitMs) {
    const ms = frameMs(chooser.knobs.renderScale);
    chooser.frame(ms);
    t += ms;
  }
  return t;
}

test('the levels go from best to cheapest, and every knob is one the renderer can draw', () => {
  assert.equal(new Set(QUALITY_LEVELS.map((l) => l.name)).size, QUALITY_LEVELS.length);
  QUALITY_LEVELS.forEach((l, i) => {
    assert.ok(l.renderScale > 0 && l.renderScale <= 1);
    assert.ok(seaCellsFit(l.seaCells), `${l.name}: ${l.seaCells} cells a sea tile`);
    assert.ok(l.fineSeaBands >= 2 && l.fineSeaBands <= 4 && [128, 256, 512].includes(l.fineSeaSize), 'the fine sea as N1.2 decided it');
    const up = QUALITY_LEVELS[i - 1];
    if (!up) return;
    assert.ok(l.renderScale < up.renderScale, 'each level draws fewer pixels than the one above');
    assert.ok(l.seaCells <= up.seaCells && l.fineSeaBands <= up.fineSeaBands && l.fineSeaSize <= up.fineSeaSize);
    assert.ok(!l.ropeShadows || up.ropeShadows, 'rope shadows only go off on the way down');
    assert.ok(l.shipFarFrom <= up.shipFarFrom, 'the far ship takes over no later than the level above');
  });
  assert.equal(QUALITY_LEVELS[0]!.seaCells, SEA_TILE_CELLS, 'the top level draws the sea at its densest');
});

test('a device that keeps up stays at the top level', () => {
  const q = new QualityChooser(null);
  run(q, () => AT_TARGET);
  assert.equal(q.level, 0);
  assert.match(q.reason, /high holds 60 fps/);
});

test('a device short of pixels steps down until a level holds, within the first seconds', () => {
  // Frame time grows with the pixels drawn: the top level takes 32 ms, 0.8 of the side 21 ms.
  const pixelBound = (scale: number) => 2 + 30 * scale * scale;
  const q = new QualityChooser(null);
  const took = run(q, pixelBound);
  assert.equal(QUALITY_LEVELS[q.level]!.name, 'medium');
  assert.match(q.reason, /^high missed 100% of frames, medium holds/);
  assert.ok(took < START_SETTLE_MS + 2 * (SETTLE_MS + MEASURE_MS) + LATE_FRAME_MS * 2, `chosen after ${took} ms`);
});

test('a device that holds no level ends at the lowest and says so', () => {
  const q = new QualityChooser(null);
  run(q, () => LATE_FRAME_MS + 1);
  assert.equal(q.level, QUALITY_LEVELS.length - 1);
  assert.match(q.reason, /still short of the target$/);
});

test('a few late frames are not a reason to step down', () => {
  const q = new QualityChooser(null);
  let n = 0;
  run(q, () => (++n % 40 ? AT_TARGET : 2 * AT_TARGET));
  assert.equal(q.level, 0);
});

test('a hidden page\'s long gap is not counted against the level', () => {
  const q = new QualityChooser(null);
  let n = 0;
  run(q, () => {
    // Hidden in the middle of the measuring: no frames for 30 s, then the gap arrives as one frame.
    if (++n !== 100) return AT_TARGET;
    q.interrupt();
    return 30000;
  });
  assert.equal(q.level, 0);
});

test('a very slow device still steps down: every frame counts', () => {
  const q = new QualityChooser(null);
  run(q, () => 600);
  assert.equal(q.level, QUALITY_LEVELS.length - 1);
});

test('?quality fixes the level and nothing is measured', () => {
  const q = new QualityChooser('low');
  assert.ok(q.chosen);
  assert.equal(q.knobs.name, 'low');
  assert.equal(q.frame(LATE_FRAME_MS * 10), false);
  assert.equal(levelNamed('nonsense'), -1);
  assert.equal(new QualityChooser('nonsense').chosen, false);
});

test('a sparser sea grid draws a share of the densest grid\'s vertices and no others', () => {
  assert.deepEqual(seaCellChoices(), [16, 8, 4, 2]);
  const side = SEA_TILE_CELLS + 1;
  for (const cells of seaCellChoices()) {
    const tris = seaTileTriangles(cells), step = SEA_TILE_CELLS / cells;
    assert.equal(tris.length, cells * cells * 6);
    for (const v of tris) {
      assert.ok(v >= 0 && v < side * side);
      assert.equal((v % side) % step, 0);
      assert.equal(Math.floor(v / side) % step, 0);
    }
  }
  assert.throws(() => seaTileTriangles(6));
});
