import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '@futuremagic/core';
import {
  SEA_LOD_RANGE, SEA_MAX_TILES, SEA_MORPH_START, SEA_TILE_CELLS, seaLodRange, seaMorph, seaReach, seaTiles, seaTileSize, type SeaEye,
} from '../src/render/seaGrid.ts';
import { earthDrop, horizonDistance } from '../src/render/earth.ts';

interface Tile { x: number; z: number; size: number; level: number }
const tilesFor = (eye: SeaEye, reach = seaReach(eye.y)) => {
  const out: Tile[] = [];
  seaTiles(eye, reach, null, (x, z, size, level) => out.push({ x, z, size, level }));
  return out;
};
/** Eye heights the plan names (3 m to 30 m), at seeded places far from zero. */
const EYES: SeaEye[] = [3, 4.5, 12, 30].map((y, i) => {
  const r = new Rng(40 + i);
  return { x: r.range(-5e4, 5e4), y, z: r.range(-5e4, 5e4) };
});
const dist = (e: SeaEye, x: number, z: number) => Math.hypot(x - e.x, e.y, z - e.z);
/** Nearest and farthest distance from the eye to a segment along x (z fixed) or along z (x fixed). */
function segmentRange(e: SeaEye, x0: number, z0: number, x1: number, z1: number): [number, number] {
  const cx = Math.min(Math.max(e.x, Math.min(x0, x1)), Math.max(x0, x1)), cz = Math.min(Math.max(e.z, Math.min(z0, z1)), Math.max(z0, z1));
  return [dist(e, cx, cz), Math.max(dist(e, x0, z0), dist(e, x1, z1))];
}
/** The stretch two tiles share along one side, or null when they only touch at a corner or not at all. */
function sharedEdge(a: Tile, b: Tile): [number, number, number, number] | null {
  const ox0 = Math.max(a.x, b.x), ox1 = Math.min(a.x + a.size, b.x + b.size);
  const oz0 = Math.max(a.z, b.z), oz1 = Math.min(a.z + a.size, b.z + b.size);
  if (ox0 === ox1 && oz1 > oz0) return [ox0, oz0, ox0, oz1];
  if (oz0 === oz1 && ox1 > ox0) return [ox0, oz0, ox1, oz0];
  return null;
}

test('the ranges leave room for a level to meet the next without a crack', () => {
  assert.equal(SEA_TILE_CELLS % 2, 0, 'vertices pair up when they slide onto the coarser grid');
  assert.ok(SEA_LOD_RANGE * (2 * SEA_MORPH_START - 1) >= 2 * Math.SQRT2, 'a level ends before the next coarser one begins to slide');
  assert.equal(seaMorph(SEA_MORPH_START * seaLodRange(3), seaTileSize(3)), 0);
  assert.equal(seaMorph(seaLodRange(3), seaTileSize(3)), 1);
});

test('the sea is drawn past the horizon, which the earth\'s curve puts where a sailor expects', () => {
  // From 30 m the horizon is about 19.6 km off (3.57 √h km), and a point 5 km off has sunk about 2 m.
  assert.ok(Math.abs(horizonDistance(30) - 19550) < 50);
  assert.ok(Math.abs(earthDrop(5000) - 1.96) < 0.01);
  for (const e of EYES) assert.ok(seaReach(e.y) > horizonDistance(e.y));
});

test('tiles stand on their own fixed lattice, cover the sea once, and stay within the room drawn', () => {
  const r = new Rng(7);
  for (const e of EYES) {
    const tiles = tilesFor(e);
    assert.ok(tiles.length < SEA_MAX_TILES, `${tiles.length} tiles at ${e.y} m`);
    for (const t of tiles) {
      assert.equal(t.size, seaTileSize(t.level));
      assert.ok(Number.isInteger(t.x / t.size) && Number.isInteger(t.z / t.size), 'a tile\'s corner is on its level\'s lattice, so its vertices never swim');
    }
    // Points of the sea out to the reach each lie in exactly one tile.
    const flat = Math.sqrt(seaReach(e.y) ** 2 - e.y * e.y) * 0.99;
    for (let i = 0; i < 1500; i++) {
      const a = r.range(0, 2 * Math.PI), d = flat * Math.sqrt(r.float());
      const x = e.x + d * Math.cos(a), z = e.z + d * Math.sin(a);
      const n = tiles.filter((t) => x >= t.x && x < t.x + t.size && z >= t.z && z < t.z + t.size).length;
      assert.equal(n, 1, `point ${d.toFixed(0)} m from the eye lies in ${n} tiles`);
    }
  }
});

test('where a level meets the next, the finer edge has slid onto the coarser grid and the coarser has not moved', () => {
  for (const e of EYES) {
    const tiles = tilesFor(e);
    let meetings = 0;
    for (const a of tiles) for (const b of tiles) {
      if (a === b) continue;
      const edge = sharedEdge(a, b);
      if (!edge) continue;
      assert.ok(Math.abs(a.level - b.level) <= 1, 'neighbours differ by one level at most');
      if (b.level !== a.level + 1) continue;
      meetings++;
      const [near, far] = segmentRange(e, ...edge);
      assert.equal(seaMorph(near, a.size), 1, 'the finer tile\'s edge is the coarser grid');
      assert.equal(seaMorph(far, b.size), 0, 'the coarser tile\'s edge has not begun to slide');
    }
    assert.ok(meetings > 0);
  }
});

test('as the eye sails on, a tile splits or joins only where both look the same', () => {
  const key = (t: Tile) => `${t.level}:${t.x}:${t.z}`;
  const e = { x: 1000.3, y: 4.5, z: -250.7 };
  const step = 0.8, reach = 3000;
  let before = new Map(tilesFor(e, reach).map((t) => [key(t), t]));
  let changes = 0;
  for (let i = 0; i < 400; i++) {
    e.x += step; e.z += step * 0.37;
    const now = new Map(tilesFor(e, reach).map((t) => [key(t), t]));
    for (const [k, t] of now) {
      if (before.has(k)) continue;
      // A tile the reach just took in is at the far edge, beyond the horizon; any other came from a split or a join.
      const corners = [[t.x, t.z], [t.x + t.size, t.z], [t.x, t.z + t.size], [t.x + t.size, t.z + t.size]];
      const near = Math.min(...corners.map(([x, z]) => dist(e, x!, z!)));
      if (near > reach - t.size * 2) continue;
      changes++;
      const [lo, hi] = segmentRange(e, t.x, t.z, t.x + t.size, t.z + t.size);
      const finer = before.has(`${t.level - 1}:${t.x}:${t.z}`) || [...before.values()].some((b) => b.level === t.level - 1 && b.x >= t.x && b.x < t.x + t.size && b.z >= t.z && b.z < t.z + t.size);
      if (finer) {
        // Joined: the finer tiles had all slid onto this grid, and this one has not slid at all.
        assert.ok(seaMorph(lo, t.size / 2) >= 1 - step / ((1 - SEA_MORPH_START) * seaLodRange(t.level - 1)), 'joined finer tiles were all slid');
      } else {
        // Split: the new finer tile starts fully slid onto its parent's grid.
        assert.ok(seaMorph(lo, t.size) >= 1 - (2 * step) / ((1 - SEA_MORPH_START) * seaLodRange(t.level)), `a split tile starts slid (${seaMorph(lo, t.size)})`);
        assert.ok(hi > lo);
      }
    }
    before = now;
  }
  assert.ok(changes > 10, `${changes} changes seen`);
});
