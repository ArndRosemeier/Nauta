import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BODY, DOOR, LADDER, LEAST_HATCH, OPENINGS, PORTS, QUARTERDECK, SPACES } from '../src/sim/rules/ships.ts';
import { floorAt, floorsUnder, insideBreadth, overheadAt, sectionGirth, shipPlan, type Space } from '../src/sim/ship/plan.ts';
import { nodeAt, reachable, walkGraph, WALK_CELL } from '../src/sim/ship/walk.ts';
import { HULL_AFT, HULL_FORE, sheer } from '../src/sim/ship/hull.ts';

const plan = shipPlan();
const graph = walkGraph(plan, BODY);
const space = (id: string) => plan.spaces.find((s) => s.id === id)!;
const start = nodeAt(graph, plan.stations.find((s) => s.id === QUARTERDECK)!);
const fromQuarterdeck = reachable(graph, start);

test('the plan is built once and frozen, every id is unique, and every space of the rules is in it', () => {
  assert.equal(shipPlan(), plan);
  assert.ok(Object.isFrozen(plan) && Object.isFrozen(plan.spaces[0]));
  for (const list of [plan.spaces, plan.openings, plan.ways, plan.guns, plan.belays, plan.places, plan.stations, plan.cells]) {
    const ids = list.map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length);
  }
  assert.deepEqual(plan.spaces.map((s) => s.id), SPACES.map((s) => s.id));
});

test('spaces of a level never overlap, and each lies inside her hull', () => {
  for (const a of plan.spaces) {
    for (const b of plan.spaces) {
      if (a === b || a.level !== b.level) continue;
      const overlap = Math.min(a.fore, b.fore) - Math.max(a.aft, b.aft) > 1e-6 && Math.min(a.starboard, b.starboard) - Math.max(a.port, b.port) > 1e-6;
      assert.ok(!overlap, `${a.id} and ${b.id}`);
    }
    const mid = (a.aft + a.fore) / 2;
    assert.ok(insideBreadth(mid, floorAt(a, mid, 0) + BODY.height / 2) > 0, `${a.id} is outside her`);
  }
});

test('from the quarterdeck every space of her plan is reachable by the walk graph with the captain\'s body', () => {
  assert.ok(start >= 0, 'the quarterdeck stands where a body can');
  assert.deepEqual(graph.refused, [], 'every way fits the body and stands on floor at both ends');
  for (const s of plan.spaces) {
    const nodes = graph.nodes.filter((n) => n.space === s.id);
    assert.ok(nodes.length > 0, `the captain fits nowhere in ${s.name}`);
    for (const n of nodes) assert.ok(fromQuarterdeck.has(n.index), `${s.name}: ${n.area.toFixed(1)} m² cannot be reached`);
  }
});

test('every space meets the headroom and width rules', () => {
  for (const s of plan.spaces) {
    const g = graph.grids.get(s.id)!;
    let low = 0;
    for (let c = 0; c < g.cols; c++) {
      for (let r = 0; r < g.rows; r++) {
        const along = s.aft + (c + 1 / 2) * WALK_CELL, across = s.port + (r + 1 / 2) * WALK_CELL, floor = floorAt(s, along, across);
        if (Math.abs(across) > insideBreadth(along, floor + BODY.height / 2)) continue;
        if (overheadAt(s, along, across) - floor < BODY.leastHeadroom) low++;
      }
    }
    assert.equal(low, 0, `${s.name}: ${low} squares under ${BODY.leastHeadroom} m`);
    // The body's middle reaches at least a body's square of its floor: it can stand and turn there.
    const area = graph.nodes.filter((n) => n.space === s.id).reduce((t, n) => t + n.area, 0);
    assert.ok(area >= WALK_CELL * WALK_CELL, `${s.name} is too narrow for a body`);
  }
});

test('every door, hatch and ladder joins two spaces, and fits the body\'s rules', () => {
  for (const w of plan.ways) {
    assert.notEqual(w.from.space, w.to.space, w.id);
    assert.ok(nodeAt(graph, w.from) >= 0 && nodeAt(graph, w.to) >= 0, w.id);
    if (w.kind === 'door') {
      assert.ok(w.width >= DOOR.width - 1e-9 && w.rise <= BODY.stepUp, w.id);
      // A door stands in a bulkhead between its two spaces.
      const wall = plan.bulkheads.find((b) => b.between.includes(w.from.space) && b.between.includes(w.to.space));
      assert.ok(wall, `${w.id} has no bulkhead`);
    }
    if (w.kind === 'ladder') {
      const o = plan.openings.find((x) => x.id === w.opening)!, below = space(w.from.space), above = space(w.to.space);
      assert.equal(o.level, above.level, `${w.id}: its opening is in the deck it climbs to`);
      assert.ok(floorAt(above, w.to.along, w.to.across) > floorAt(below, w.from.along, w.from.across), `${w.id} climbs`);
      assert.ok(w.rise <= LADDER.mostRise && w.height >= LEAST_HATCH - 1e-9 && w.width >= Math.min(LADDER.width, LEAST_HATCH) - 1e-9, w.id);
      // The opening lies over the space below.
      const mid = (o.aft + o.fore) / 2;
      assert.ok(mid >= below.aft && mid <= below.fore, `${w.id}: ${o.id} is not over ${below.id}`);
    }
  }
  // Every ladderway, companion and scuttle has its ladder.
  for (const o of OPENINGS) {
    if (o.kind === 'ladderway' || o.kind === 'companion' || o.kind === 'scuttle') assert.ok(plan.ways.some((w) => w.opening === o.id), `${o.id} has no ladder`);
  }
});

test('every gun port has a gun place behind it, on her deck, whose crew can reach it', () => {
  assert.equal(plan.guns.length, 2 * PORTS.length);
  for (const g of plan.guns) {
    assert.ok(PORTS.some((p) => p[0] === g.port && p[1] === g.along));
    const f = g.footprint, deckHalf = insideBreadth(g.along, sheer(g.along));
    assert.ok(Math.abs(g.side > 0 ? f.starboard : f.port) <= deckHalf + 1e-9 && (g.side > 0 ? f.port > 0 : f.starboard < 0), g.id);
    assert.ok(g.crew.length > 0, g.id);
    for (const c of g.crew) assert.ok(fromQuarterdeck.has(nodeAt(graph, c)), `${g.id}: a crew place at ${c.along.toFixed(2)}, ${c.across.toFixed(2)}`);
  }
  // Sixteen carronades and two long sixes, eight and one a side.
  const fought = plan.guns.filter((g) => !g.chase);
  assert.equal(fought.filter((g) => g.gun === 'carronade').length, 16);
  assert.equal(fought.filter((g) => g.gun === 'long6').length, 2);
});

test('every station, crew place and pin stands where a body can, reached from the quarterdeck', () => {
  for (const p of plan.places) assert.ok(fromQuarterdeck.has(nodeAt(graph, p)), `${p.id} at ${p.along.toFixed(2)}, ${p.across.toFixed(2)}`);
  for (const b of plan.belays) assert.ok(Math.abs(b.across) < insideBreadth(b.along, b.height), b.id);
  assert.ok(plan.belays.length > 20);
});

test('the plan is the same on both sides: guns, pins, places and cells mirror', () => {
  const key = (along: number, across: number) => `${along.toFixed(3)},${across.toFixed(3)}`;
  for (const list of [plan.guns.map((g) => [g.along, g.side] as const), plan.belays.filter((b) => b.rail.endsWith('pins')).map((b) => [b.along, Math.sign(b.across)] as const)]) {
    const seen = new Set(list.map(([a, s]) => key(a, s)));
    for (const [a, s] of list) assert.ok(seen.has(key(a, -s)), `no twin at ${a}`);
  }
  const port = plan.cells.filter((c) => c.side < 0), starboard = plan.cells.filter((c) => c.side > 0);
  assert.equal(port.length, starboard.length);
  port.forEach((c, i) => assert.ok(Math.abs(c.area - starboard[i]!.area) < 1e-9 && c.kind === starboard[i]!.kind));
});

test('the damage cells cover her hull, decks and bulwarks without gaps, each about a metre square', () => {
  const kinds = ['planking', 'frame', 'deck', 'bulwark'] as const;
  for (const k of kinds) assert.ok(plan.cells.some((c) => c.kind === k), k);
  // Planking panels tile each side's girth, band by band.
  const STEP = 1;
  for (let a = HULL_AFT + STEP / 2; a < HULL_FORE; a += STEP) {
    const band = plan.cells.filter((c) => c.kind === 'planking' && c.side > 0 && a >= c.aft && a < c.fore).sort((x, y) => x.from - y.from);
    if (!band.length) continue;
    assert.ok(Math.abs(band[0]!.from) < 1e-9);
    for (let i = 1; i < band.length; i++) assert.ok(Math.abs(band[i]!.from - band[i - 1]!.to) < 1e-9, `gap at ${a}`);
    const girth = sectionGirth((band[0]!.aft + band[0]!.fore) / 2);
    assert.ok(Math.abs(band[band.length - 1]!.to - girth) < 1e-9);
    for (const c of band) assert.ok(c.to - c.from < 2 * WALK_CELL * (1 / WALK_CELL) && c.to - c.from > 1 / 2, 'about a metre');
  }
  const ids = plan.cells.map((c) => c.id);
  assert.deepEqual(ids, ids.map((_, i) => i), 'numbered 0, 1, 2, ...');
});

test('every floor under a place is found, lowest first: hold, berth deck, weather deck', () => {
  const under = floorsUnder(plan, 3, 0).map((f) => f.space.level);
  assert.deepEqual(under, ['hold', 'berth', 'weather']);
  const floors = floorsUnder(plan, 3, 0).map((f) => f.floor);
  assert.ok(floors[0]! < floors[1]! && floors[1]! < floors[2]!);
  const s: Space = space('deck');
  assert.ok(floorAt(s, 0, 0) > floorAt(s, 0, 3), 'the weather deck is cambered');
});
