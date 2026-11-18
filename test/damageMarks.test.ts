/** The marks damage leaves on her maps (plan N6.5, render/ship/damageMarks.ts): holes inside and out, cuts, sails. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { holeCode, startDamage, type Damage } from '../src/sim/damage.ts';
import { girthTo, plankingPlace } from '../src/sim/damage/meet.ts';
import { SMASHED } from '../src/sim/rules/damage.ts';
import { designWaterline, sheer } from '../src/sim/ship/hull.ts';
import { shipPlan, type Cell } from '../src/sim/ship/plan.ts';
import { rigPlan } from '../src/sim/ship/rig.ts';
import { shipZ } from '../src/sim/ship/section.ts';
import { DAMAGE, DAMAGE_MAP_SIZE, SIDE_REGIONS, damageTexel } from '../src/render/ship/damageMap.ts';
import { HOLE_DARK, HOLE_LIGHT, HULL_BLOCK_ROWS, HullMarks, MARK, SailMarks, type MapBlock } from '../src/render/ship/damageMarks.ts';

const W = DAMAGE_MAP_SIZE.width;
/** A map of two ships' blocks; this test draws the second's. */
const block = (): MapBlock => ({ data: new Uint8Array(W * HULL_BLOCK_ROWS * 2 * 4), width: W, row: HULL_BLOCK_ROWS, rows: HULL_BLOCK_ROWS });
const at = (b: MapBlock, region: number, u: number, v: number, mark: number): number => {
  const t = damageTexel(region, u, v)!;
  return b.data[((b.row + Math.floor(t[1])) * b.width + Math.floor(t[0])) * 4 + mark]!;
};
const cells = shipPlan().cells;
/** A starboard planking panel amidships wholly above her waterline, and the bulwark over it. */
const plank = cells.find((c) => c.kind === 'planking' && c.side === 1 && c.aft <= 0 && c.fore > 0 && plankingPlace(c, 0, 0)[2] > designWaterline(c.aft) + 0.5)!;
const bulwark = cells.find((c) => c.kind === 'bulwark' && c.side === 1 && c.aft === plank.aft)!;
const holed = (holes: number[], more: Partial<Damage> = {}): Damage => ({ ...startDamage(), holes, ...more });
const middle = (c: Cell) => [(c.fore - c.aft) / 2, (c.to - c.from) / 2] as const;

test('a ball through her side above the water: dark outside, daylight inside, nothing cut; plugged, no light', () => {
  const b = block(), marks = new HullMarks(b), [u, v] = middle(plank), code = holeCode(plank.id, u, v, 'round', 'carronade', false);
  assert.equal(marks.bringUpTo(holed([code])), true);
  const z = shipZ(plank.aft + Math.round(u / 0.04) * 0.04), g = plank.from + Math.round(v / 0.04) * 0.04, h = plankingPlace(plank, Math.round(u / 0.04) * 0.04, Math.round(v / 0.04) * 0.04)[2];
  assert.equal(at(b, SIDE_REGIONS.side(1), z, g, MARK.hole), HOLE_DARK);
  assert.equal(at(b, SIDE_REGIONS.ceiling(1), z, h, MARK.hole), HOLE_LIGHT);
  assert.equal(at(b, SIDE_REGIONS.side(1), z, g, MARK.cut), 0);
  assert.equal(marks.cut, false);
  // The first ship's block is untouched.
  assert.ok(b.data.subarray(0, W * HULL_BLOCK_ROWS * 4).every((x) => x === 0));
  // Asked again with the same holes, nothing is drawn.
  assert.equal(marks.bringUpTo(holed([code])), false);
  marks.bringUpTo(holed([code], { plugged: [code] }));
  assert.equal(at(b, SIDE_REGIONS.ceiling(1), z, h, MARK.hole), HOLE_DARK);
});

test('a ball through a bulwark cuts it inside and out; a section smashed out takes its rail', () => {
  const b = block(), marks = new HullMarks(b), [u, v] = middle(bulwark), along = bulwark.aft + Math.round(u / 0.04) * 0.04, height = bulwark.from + Math.round(v / 0.04) * 0.04;
  marks.bringUpTo(holed([holeCode(bulwark.id, u, v, 'round', 'carronade', false)]));
  assert.equal(at(b, SIDE_REGIONS.side(1), shipZ(along), girthTo(along, height), MARK.cut), 255);
  assert.equal(at(b, SIDE_REGIONS.bulwark(1), shipZ(along), height - sheer(along), MARK.cut), 255);
  assert.equal(at(b, SIDE_REGIONS.rail(1), shipZ(along), 0, MARK.cut), 0);
  assert.equal(marks.cut, true);
  const smashed = Array.from({ length: SMASHED }, (_, k) => holeCode(bulwark.id, 0.1 + 0.2 * k, 0.1, 'grape', 'long6', false));
  marks.bringUpTo(holed(smashed));
  assert.equal(at(b, SIDE_REGIONS.rail(1), shipZ(bulwark.aft + (bulwark.fore - bulwark.aft) / 2), 0, MARK.cut), 255);
});

test('her sails: each hole cut where the seed puts it, a split from head to foot; the same rent draws the same', () => {
  const rects = rigPlan().sails.map((_, i) => ({ x: (i % 4) * 200, y: Math.floor(i / 4) * 200, width: 150, height: 120 }));
  const map = () => ({ data: new Uint8Array(1024 * 2048 * 4), width: 1024, row: 1024, rows: 1024, texel: 0.05 });
  const a = map(), b = map(), rent = rigPlan().sails.map((_, i) => (i === 0 ? 400 : i === 1 ? 2 : 0));
  assert.equal(new SailMarks(a, rects).bringUpTo(rent), true);
  new SailMarks(b, rects).bringUpTo([...rent]);
  assert.deepEqual(a.data, b.data);
  const cutIn = (r: (typeof rects)[number], row: number) => { let n = 0; for (let x = r.x; x < r.x + r.width; x++) n += a.data[((a.row + row) * a.width + x) * 4 + MARK.cut]! ? 1 : 0; return n; };
  // The split sail is torn on every row; the other two holes cut a little; a sail with none is whole.
  for (const row of [rects[0]!.y, rects[0]!.y + 60, rects[0]!.y + 119]) assert.ok(cutIn(rects[0]!, row) > 0, `row ${row}`);
  let one = 0;
  for (let y = rects[1]!.y; y < rects[1]!.y + rects[1]!.height; y++) one += cutIn(rects[1]!, y);
  assert.ok(one > 4 && one < 600, `${one} texels cut`);
  for (let y = rects[2]!.y; y < rects[2]!.y + rects[2]!.height; y++) assert.equal(cutIn(rects[2]!, y), 0);
});

test('a fire chars the deck it burns on and the one over it, from its middle out as it grows; the char stays when it is out', () => {
  const b = block(), marks = new HullMarks(b), space = shipPlan().spaces.findIndex((s) => s.id === 'messdeck'), s = shipPlan().spaces[space]!;
  const mid = shipZ((s.aft + s.fore) / 2), across = (s.port + s.starboard) / 2, nearEnd = shipZ(s.fore - (s.fore - s.aft) / 8);
  const fire = (size: number) => ({ ...startDamage(), fires: [{ space, size }] });
  assert.equal(marks.bringUpTo(fire(0.2)), true);
  assert.equal(at(b, DAMAGE.berthDeck, mid, across, MARK.scorch), 255);
  assert.equal(at(b, DAMAGE.weatherDeck, mid, across, MARK.scorch), 255, 'the deck over it, from below');
  assert.equal(at(b, DAMAGE.berthDeck, nearEnd, across, MARK.scorch), 0, 'not yet to its ends');
  marks.bringUpTo(fire(1));
  assert.ok(at(b, DAMAGE.berthDeck, nearEnd, across, MARK.scorch) > 0, 'grown to its ends');
  assert.equal(at(b, DAMAGE.berthDeck, shipZ(s.fore + 2), across, MARK.scorch), 0, 'none past them');
  // Put out, and a hole plugged (her block drawn again): the char is still there.
  const code = holeCode(plank.id, ...middle(plank), 'round', 'carronade', false);
  marks.bringUpTo({ ...startDamage(), holes: [code] });
  marks.bringUpTo({ ...startDamage(), holes: [code], plugged: [code] });
  assert.equal(at(b, DAMAGE.berthDeck, mid, across, MARK.scorch), 255);
});
