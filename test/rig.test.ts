import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MASTHEAD_SIDE, MAST_SPARS, SAILS, YARDS } from '../src/sim/rules/rig.ts';
import { BODY, QUARTERDECK } from '../src/sim/rules/ships.ts';
import { hullEnds, hullHalfBreadth } from '../src/sim/ship/hull.ts';
import type { LineEnd } from '../src/sim/ship/lines.ts';
import { shipPlan } from '../src/sim/ship/plan.ts';
import { rigPlan, rigWalk, sparOf } from '../src/sim/ship/rig.ts';
import { sailArea, sailSettings } from '../src/sim/ship/sails.ts';
import { shipY } from '../src/sim/ship/section.ts';
import type { RigPoint } from '../src/sim/ship/spars.ts';
import { nodeAt, reachable } from '../src/sim/ship/walk.ts';

const plan = shipPlan();
const rig = rigPlan(plan);
const graph = rigWalk(plan, BODY);
const fromQuarterdeck = reachable(graph, nodeAt(graph, plan.stations.find((s) => s.id === QUARTERDECK)!));
const NEAR = 1e-6;

/** How far a point lies from the segment a to b, m. */
function offSegment(p: RigPoint, a: RigPoint, b: RigPoint): number {
  const d = [b.along - a.along, b.across - a.across, b.height - a.height], q = [p.along - a.along, p.across - a.across, p.height - a.height];
  const len2 = d[0]! ** 2 + d[1]! ** 2 + d[2]! ** 2, t = Math.max(0, Math.min(1, (q[0]! * d[0]! + q[1]! * d[1]! + q[2]! * d[2]!) / len2));
  return Math.hypot(q[0]! - t * d[0]!, q[1]! - t * d[1]!, q[2]! - t * d[2]!);
}

test('the rig is built once and frozen, and every id in it is unique', () => {
  assert.equal(rigPlan(), rig);
  assert.ok(Object.isFrozen(rig) && Object.isFrozen(rig.lines[0]) && Object.isFrozen(rig.lines[0]!.ends[0]));
  for (const list of [rig.spars, rig.sails, rig.lines, rig.deadeyes, rig.surfaces, rig.ways, rig.stations, rig.places]) {
    const ids = list.map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length);
  }
});

test('the spar table: each spar a chain of segments between the places it breaks, the masts stacked on one another', () => {
  assert.equal(rig.spars.filter((s) => s.kind === 'yard').length, YARDS.length);
  for (const s of rig.spars) {
    assert.ok(s.marks.length >= 2 && s.marks[0]!.at === 0 && Math.abs(s.marks[s.marks.length - 1]!.at - s.length) < NEAR, s.id);
    for (let i = 1; i < s.marks.length; i++) assert.ok(s.marks[i]!.at > s.marks[i - 1]!.at, `${s.id}: ${s.marks[i]!.name}`);
    if (s.on) {
      // A spar fixed to another touches it: its heel (or a yard's slings) lies on or beside the other.
      const on = sparOf(rig, s.on), at = s.kind === 'yard' ? { along: s.heel.along, across: 0, height: s.heel.height } : s.heel;
      assert.ok(offSegment(at, on.heel, on.head) < (on.diameter + s.diameter) / 2 + MASTHEAD_SIDE, `${s.id} is not on ${s.on}`);
    }
  }
  for (const mast of ['fore', 'main'] as const) {
    const g = rig.masts[mast];
    // A topmast's heel stands in the lower masthead, a topgallant's in the topmast's head (their doublings).
    assert.ok(g.lowerHounds < g.lowerHead && g.topmastHounds < g.topmastHead && g.topgallantHounds < g.truck);
    assert.ok(sparOf(rig, `${mast}-topmast`).heel.height === g.lowerHounds && sparOf(rig, `${mast}-topgallant-mast`).heel.height === g.topmastHounds);
  }
  // ship.md: main truck about 32 m and fore about 29 m over the deck, the main yard about 17 m.
  const overDeck = (m: 'fore' | 'main') => rig.masts[m].truck - rig.masts[m].deck;
  assert.ok(Math.abs(overDeck('main') - 32) < 1.5 && Math.abs(overDeck('fore') - 29) < 1.5, `${overDeck('main')}, ${overDeck('fore')}`);
  assert.ok(Math.abs(sparOf(rig, 'main-yard').length - 17) < 0.5);
  // The slice's lower mainmast (N2.0): its heights as the slice drew them; the rig rakes it aft.
  assert.ok(Math.abs(rig.masts.main.lowerHead - rig.masts.main.heel - MAST_SPARS.main.lower.length) < NEAR, 'the slice\'s lower mainmast');
  assert.ok(sparOf(rig, 'main-mast').head.along < sparOf(rig, 'main-mast').heel.along, 'the masts rake aft');
});

test('how far the yards brace round, the boom and gaff swing, and where the yards hang', () => {
  for (const s of rig.spars.filter((x) => x.yard)) {
    const y = s.yard!;
    assert.ok(y.brace > 0 && y.brace < Math.PI / 2, s.id);
    assert.ok(y.lowered <= y.hoisted, `${s.id} is lowered below where it is hoisted`);
  }
  for (const mast of ['fore', 'main'] as const) {
    const brace = (level: string) => rig.spars.find((s) => s.yard?.level === level && s.mast === mast)!.yard!.brace;
    assert.ok(brace('course') <= brace('topsail') && brace('topsail') <= brace('topgallant'), 'higher yards brace further');
    // The yards one above another: course, topsail, topgallant, each hoisted under the next mast's hounds.
    const at = (level: string) => rig.spars.find((s) => s.yard?.level === level && s.mast === mast)!.yard!.hoisted;
    assert.ok(at('course') < rig.masts[mast].topFloor && at('topsail') < rig.masts[mast].crosstrees && at('topgallant') < rig.masts[mast].topgallantHounds);
  }
  for (const id of ['boom', 'gaff']) assert.ok(sparOf(rig, id).swing! > 0 && sparOf(rig, id).swing! < Math.PI / 2, id);
});

test('the sails: eleven, each with its area, place and settings; about 900 m² of plain sail', () => {
  assert.equal(rig.sails.length, SAILS.length);
  assert.equal(rig.sails.filter((s) => s.kind === 'square').length, 6);
  let total = 0;
  for (const s of rig.sails) {
    const full = sailArea(s);
    total += full;
    assert.ok(full > 10, `${s.id}: ${full.toFixed(1)} m²`);
    // Furled first, then set with every reef in, then full sail: the area grows with each reef shaken out.
    const settings = sailSettings(s);
    assert.deepEqual(settings[0], { set: false, reefs: 0 });
    assert.equal(sailArea(s, settings[0]), 0);
    assert.equal(settings.length, s.reefs + 2);
    for (let i = 2; i < settings.length; i++) assert.ok(sailArea(s, settings[i]) > sailArea(s, settings[i - 1]), `${s.id}: reef ${settings[i]!.reefs}`);
    assert.throws(() => sailArea(s, { set: true, reefs: s.reefs + 1 }));
    if (s.shape.kind === 'trapezium') assert.ok(s.shape.foot >= s.shape.head && s.shape.drop > 0, s.id);
  }
  assert.ok(total > 800 && total < 1050, `${total.toFixed(0)} m²`);
  // A square sail's head is bent to its yard; a topsail's and topgallant's clews are at the arms of the yard below.
  for (const s of rig.sails.filter((x) => x.kind === 'square')) {
    const yard = sparOf(rig, s.on[0]!);
    for (const c of s.corners.filter((k) => k.name.startsWith('head'))) assert.ok(offSegment(c.at, yard.heel, yard.head) < NEAR, `${s.id} ${c.name}`);
  }
  // A headsail's or staysail's luff lies on its stay.
  for (const s of rig.sails.filter((x) => x.kind === 'head' || x.kind === 'stay')) {
    const stay = rig.lines.find((l) => l.id === s.on[0])!;
    for (const name of ['tack', 'head']) assert.ok(offSegment(s.corners.find((c) => c.name === name)!.at, stay.ends[0], stay.ends[1]) < NEAR, `${s.id} ${name}`);
  }
});

test('every line of the rig in one list: about 200, each with its kind, its two ends, its pin and what it does', () => {
  assert.ok(rig.lines.length >= 180 && rig.lines.length <= 220, `${rig.lines.length} lines`);
  for (const kind of ['shroud', 'stay', 'brace', 'sheet', 'clewline', 'halliard'] as const) assert.ok(rig.lines.some((l) => l.kind === kind), kind);
  const serves = new Set([...rig.spars.map((s) => s.id), ...rig.sails.map((s) => s.id)]);
  for (const l of rig.lines) {
    assert.ok(serves.has(l.serves), `${l.id} serves ${l.serves}`);
    assert.ok(l.does.length > 0 && l.diameter > 0, l.id);
    assert.equal(l.standing, l.belay === null, `${l.id}: a running line has a pin, a standing one none`);
  }
  // Every yard has its two braces and every sail its sheets.
  for (const y of rig.spars.filter((s) => s.yard)) assert.equal(rig.lines.filter((l) => l.kind === 'brace' && l.serves === y.id).length, 2, y.id);
  for (const s of rig.sails.filter((x) => x.kind !== 'boom')) assert.equal(rig.lines.filter((l) => l.kind === 'sheet' && l.serves === s.id).length, 2, s.id);
});

test('every running line is made fast on a pin of the plan\'s rails, one line to a pin, its hand\'s place reached from the quarterdeck', () => {
  const pins = new Map(plan.belays.map((b) => [b.id, b]));
  const used = new Set<string>();
  for (const l of rig.lines.filter((x) => !x.standing)) {
    const pin = pins.get(l.belay!);
    assert.ok(pin, `${l.id} on ${l.belay}`);
    assert.ok(!used.has(pin.id), `${pin.id} carries two lines`);
    used.add(pin.id);
    const end = l.ends[1];
    assert.ok(end.on === 'belay' && end.id === pin.id && end.along === pin.along && end.across === pin.across && end.height === pin.height, l.id);
    if (l.side !== 0) assert.equal(Math.sign(pin.across), l.side, `${l.id} belays on the wrong side`);
    const hand = plan.places.find((p) => p.of === pin.id)!;
    assert.ok(fromQuarterdeck.has(nodeAt(graph, hand)), `${l.id}: its hand at ${pin.id}`);
  }
});

test('every line ends on real points: on its spar, a sail\'s edge, a deadeye, a pin, her hull, the futtock stave or the crosstrees', () => {
  const deadeyes = new Map(rig.deadeyes.map((d) => [d.id, d]));
  const onEdge = (e: LineEnd) => {
    const s = rig.sails.find((x) => x.id === e.id)!;
    return s.corners.some((c, i) => offSegment(e, c.at, s.corners[(i + 1) % s.corners.length]!.at) < NEAR);
  };
  for (const l of rig.lines) {
    for (const e of l.ends) {
      const where = `${l.id} at ${e.on} ${e.id}`;
      if (e.on === 'spar') {
        const s = sparOf(rig, e.id);
        assert.ok(offSegment(e, s.heel, s.head) <= Math.max(s.diameter, MASTHEAD_SIDE) / 2 + NEAR, where);
      } else if (e.on === 'sail') assert.ok(onEdge(e), where);
      else if (e.on === 'deadeye') { const d = deadeyes.get(e.id)!; assert.ok(d && d.along === e.along && d.across === e.across && d.height === e.height, where); }
      else if (e.on === 'belay') assert.ok(plan.belays.some((b) => b.id === e.id), where);
      else if (e.on === 'hull') {
        if (e.id === 'stem') assert.ok(Math.abs(e.along - hullEnds(e.height).fore) < NEAR, where);
        else assert.ok(Math.abs(e.across) >= hullHalfBreadth(e.along, e.height) && Math.abs(e.across) < hullHalfBreadth(e.along, e.height) + 1, where);
      } else if (e.on === 'stave') {
        // The shared climb (X3): the futtock stave lies where the climb's gait meets the futtock shrouds.
        const c = rig.climbs.find((k) => k.mast === e.id && k.side === Math.sign(e.across))!;
        assert.ok(Math.abs(shipY(e.height) - c.futtock.lo) < NEAR, where);
      } else {
        const g = rig.masts[e.id as 'fore' | 'main'];
        assert.ok(Math.abs(e.height - g.crosstrees) < NEAR && Math.abs(Math.abs(e.across) - MAST_SPARS[e.id as 'fore' | 'main'].crosstrees) < NEAR, where);
      }
    }
  }
});

test('the climbs: shrouds lean in, futtock shrouds out over the climber, each footrope beside the shrouds it is stepped off', () => {
  for (const c of rig.climbs) {
    assert.ok(c.shroud.lean! > 0 && c.futtock.lean! < 0 && c.topmast.lean! > 0 && c.crosstrees.lean! < 0 && c.topgallant.lean! > 0, `${c.mast} ${c.side}`);
    assert.equal(c.shroud.above, c.futtock);
  }
  for (const w of rig.ways.filter((x) => x.kind === 'footrope' && x.at !== null)) {
    const ladder = w.ladders[w.ladders.length - 1]!;
    assert.ok(w.at! >= ladder.floor && w.at! <= ladder.hi, w.id);
  }
});

test('every surface aloft is reachable from the deck: tops, crosstrees, every yard\'s footropes, the bowsprit and jib-boom', () => {
  assert.deepEqual(graph.refused, [], 'every way fits the body and stands on floor at both ends');
  const kinds = new Set(rig.surfaces.map((s) => s.kind));
  for (const k of ['top', 'crosstrees', 'footrope', 'bowsprit']) assert.ok(kinds.has(k as never), k);
  // Both footropes of every yard and of the jib-boom.
  assert.equal(rig.surfaces.filter((s) => s.kind === 'footrope').length, 2 * (YARDS.length + 1));
  for (const s of rig.surfaces) {
    assert.ok(s.area > 0, s.id);
    assert.ok(fromQuarterdeck.has(graph.aloft.get(s.id)!), `${s.name} cannot be reached`);
  }
  // A top holds a man standing and turning; the stations aloft and every topman's place are reached.
  for (const s of rig.surfaces.filter((x) => x.kind === 'top')) assert.ok(s.area > BODY.breadth * BODY.breadth * 4, s.id);
  assert.deepEqual(rig.stations.map((s) => s.id).sort(), ['fore-top', 'main-top', 'masthead']);
  for (const p of rig.places) assert.ok(fromQuarterdeck.has(nodeAt(graph, p)), p.id);
  assert.ok(rig.places.filter((p) => p.kind === 'yard').length > 50);
});

test('the bowsprit\'s inboard part is walked round, not over: no standing on it, the deck either side of it and its step at the stem reached', () => {
  const bowsprit = sparOf(rig, 'bowsprit');
  const on = (along: number, across: number) => nodeAt(graph, { space: 'deck', along, across });
  assert.ok(on(bowsprit.heel.along + 1, 0) < 0, 'not on its top');
  for (const side of [-1, 1]) assert.ok(fromQuarterdeck.has(on(bowsprit.heel.along + 1, side * 1.2)), `beside it, ${side > 0 ? 'starboard' : 'larboard'}`);
  assert.ok(fromQuarterdeck.has(graph.aloft.get('bowsprit')!), 'onto it at the stem');
});
