/**
 * The order panel (implementation plan N3.5): its buttons give every order of the vocabulary, its words say how she
 * answers, and with nothing but the panel's taps she can be sailed anywhere: compass points on every side of the wind reached or answered
 * with full and by, round onto the other tack, stopped and made to sail again. Whole matches of one brig through the
 * match the page runs alone (soloMatch.ts), a few simulated minutes each.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { angleDiff } from '@futuremagic/core';
import { VOCABULARY, type Order } from '../src/sim/orders.ts';
import { NO_WAY } from '../src/sim/rules/orders.ts';
import { CLOSE_HAULED } from '../src/sim/rules/sailing.ts';
import { simTime } from '../src/sim/state.ts';
import type { SimEvent } from '../src/sim/step.ts';
import { DEGREE, KNOT, STEP_SECONDS } from '../src/sim/units.ts';
import { meanWind } from '../src/sim/wind.ts';
import {
  bearingWords, clockWords, crewLines, eventWords, isStanding, orderButtons, pointOfSail, shipLines, STEER_POINTS, steerPoint, wouldRefuse,
} from '../src/app/orderReport.ts';
import { SoloMatch, sparAngles } from '../src/app/soloMatch.ts';

/** The page's own start: a moderate breeze from west-south-west, the brig heading north (main.ts). */
const START = { seed: 1805, windForce: 4, windFrom: 247.5 * DEGREE, x: 0, z: 0, heading: 0 };

/** Every line the panel would show of each match's events, as they come. */
const heardOf = new WeakMap<SoloMatch, string[]>();

/** A match sailed alone for `seconds` after the taps `orders` (one a step), with the lines the panel showed meanwhile. */
function sail(match: SoloMatch, seconds: number, orders: readonly Order[] = []): string[] {
  let heard = heardOf.get(match);
  if (!heard) {
    const lines: string[] = heard = [];
    heardOf.set(match, lines);
    match.on('events', (events: readonly SimEvent[]) => {
      for (const e of events) { const w = eventWords(e, match.state, match.ship); if (w) lines.push(w); }
    });
  }
  const from = heard.length, until = Math.round((simTime(match.state) + seconds) / STEP_SECONDS) * STEP_SECONDS;
  for (const o of orders) match.give(o);
  // The page's clock never runs ahead by more than a few steps a frame; here it runs on in frames of a tenth of a second.
  while (simTime(match.state) < until - STEP_SECONDS / 2) match.advance(Math.min(until, simTime(match.state) + FRAME));
  return heard.slice(from);
}

/** A frame of the page's clock at its longest, s (main.ts). */
const FRAME = 0.1;

const button = (kind: Order['kind']) => orderButtons().find((b) => b.order.kind === kind)!.order;
const from = (m: SoloMatch) => meanWind(m.state.wind, simTime(m.state)).from;
const she = (m: SoloMatch) => m.state.ships[0]!.sailing;

test('the buttons give every order of the vocabulary, each canvas and mast its own, courses from the compass', () => {
  const buttons = orderButtons();
  const kinds = new Set([...buttons.map((b) => b.order.kind), 'steer']);
  assert.deepEqual([...kinds].sort(), VOCABULARY.map((w) => w.kind).sort());
  assert.deepEqual(buttons.filter((b) => b.order.kind === 'sail').map((b) => b.label), ['battle sail', 'plain sail', 'all sail']);
  assert.deepEqual(buttons.filter((b) => b.order.kind === 'back').map((b) => b.label), ['back the fore topsail', 'back the main topsail']);
  assert.ok(buttons.every((b) => b.to === 'master' || b.to === 'first lieutenant'));
  assert.deepEqual(STEER_POINTS.map((_, i) => Math.round(steerPoint(i) / DEGREE)), [0, 45, 90, 135, 180, 225, 270, 315]);
});

test('the panel says her heading, way, wind, point of sail, canvas and what the crew is doing', () => {
  assert.equal(bearingWords(247.5 * DEGREE), '248° WSW');
  assert.equal(bearingWords(359 * DEGREE), '359° N');
  assert.equal(pointOfSail(0, 270 * DEGREE), 'wind on the beam, larboard tack');
  assert.equal(pointOfSail(340 * DEGREE, 270 * DEGREE), 'close-hauled, larboard tack');
  assert.equal(pointOfSail(90 * DEGREE, 270 * DEGREE), 'running before the wind');
  assert.equal(pointOfSail(250 * DEGREE, 270 * DEGREE), 'head to wind, starboard tack');
  assert.equal(clockWords(3725 * 30), '62:05');
  const m = new SoloMatch(START);
  sail(m, 1);
  const lines = shipLines(m.state, 0);
  assert.match(lines[0]!, /^Heading 00\d° N · \d+\.\d kn · told: steer 000$/);
  assert.match(lines[1]!, /^Wind from 2\d\d° W\w*, force 4 · broad reach, larboard tack$/);
  assert.equal(lines[2], 'battle sail');
  assert.deepEqual(crewLines(m.state, 0), ['Crew: standing by']);
  sail(m, 1, [{ kind: 'sail', ship: 0, canvas: 'plain' }]);
  assert.match(crewLines(m.state, 0)[0]!, /^Crew: plain sail: setting the (fore|main) course, a square sail loosed on its yard: (waiting for hands|\d+ men? (on the way|at work)) \(\d+ s\), \d+ more jobs$/);
  sail(m, 10);
  assert.match(crewLines(m.state, 0)[0]!, /^Crew: plain sail: .*: \d+ men? (on the way|at work) \(\d+ s\)/);
  assert.ok(isStanding({ kind: 'sail', ship: 0, canvas: 'plain' }, m.state.ships[0]!.told));
});

test('the answers: taken with words, refused, done, and the events of her sailing', () => {
  const m = new SoloMatch(START);
  // Nothing is aback: "fill" is refused, and its button is dim.
  assert.ok(wouldRefuse(m.state, button('fill')));
  assert.ok(!wouldRefuse(m.state, button('tack')));
  let heard = sail(m, 1, [button('fill')]);
  assert.deepEqual(heard, ['00:00 ✗ fill: every sail is drawing']);
  // A course on the other tack (she heads north, the wind on her larboard side; 160 has it on her starboard): she wears, and the master says so.
  heard = sail(m, 90, [{ kind: 'steer', ship: 0, heading: 160 * DEGREE }]);
  assert.match(heard[0]!, /^00:01 steer 160: wearing round, sir: 160 lies on the other tack$/);
  assert.ok(heard.some((h) => /she has worn round/.test(h)), heard.join(' | '));
  assert.ok(heard.some((h) => /✓ steer 160: done/.test(h)), heard.join(' | '));
  // A job begun with fewer hands than it needs is reported too.
  const short: SimEvent = { kind: 'short-handed', tick: 95 * 30, ship: 0, order: button('heave'), job: 'brace' };
  assert.equal(eventWords(short, m.state, 0), "01:35 heave to: short-handed: a mast's yards swung round");
  assert.equal(eventWords({ ...short, ship: 1 }, m.state, 0), null);
});

/** Steered to compass point `i` with one tap and sailed on: there, or full and by on the nearer tack when it lies too near the wind. */
function reachPoint(i: number): void {
  const m = new SoloMatch(START), heading = steerPoint(i);
  sail(m, 90, [{ kind: 'steer', ship: 0, heading }]);
  const wind = from(m), off = angleDiff(heading, wind);
  const aim = Math.abs(off) < CLOSE_HAULED ? wind - Math.sign(off || 1) * CLOSE_HAULED : heading;
  const miss = Math.abs(angleDiff(she(m).heading, aim)) / DEGREE;
  assert.ok(miss < 8, `${STEER_POINTS[i]}: heading ${(she(m).heading / DEGREE).toFixed(0)}°, aimed ${(aim / DEGREE).toFixed(0)}°`);
  assert.ok(she(m).ahead > 2 * KNOT, `${STEER_POINTS[i]}: under way at ${(she(m).ahead / KNOT).toFixed(1)} kn`);
}

test('with taps alone she reaches the compass points: on her tack, by wearing, and full and by where a point lies too near the wind', () => {
  // E: wind abaft the beam on her own tack; S: round by wearing; SW: too near the wind on the other tack; W: in the wind's eye.
  for (const name of ['E', 'S', 'SW', 'W'] as const) reachPoint(STEER_POINTS.indexOf(name));
});

test('with taps alone she tacks to windward, heaves to and lies still, and makes sail again', () => {
  const m = new SoloMatch(START);
  sail(m, 40, [button('by')]);
  const before = Math.sign(angleDiff(she(m).heading, from(m)));
  // The yards are drawn braced as she is trimmed: close-hauled, hard round; on the other tack, round the other way.
  const yard = (st: typeof m) => new Map(sparAngles(st.state, 0)).get('main-topsail-yard')!;
  const braced = yard(m);
  assert.ok(Math.abs(braced) > 10 * DEGREE, `main topsail yard braced ${(braced / DEGREE).toFixed(0)}°`);
  const heard = sail(m, 90, [button('tack')]);
  assert.equal(Math.sign(yard(m)), -Math.sign(braced), 'braced round for the other tack');
  assert.ok(heard.some((h) => /come through the wind/.test(h)), heard.join(' | '));
  assert.equal(Math.sign(angleDiff(she(m).heading, from(m))), -before, 'on the other tack');
  sail(m, 150, [button('heave')]);
  assert.ok(Math.abs(she(m).ahead) < 2 * NO_WAY, `hove to at ${(she(m).ahead / KNOT).toFixed(2)} kn`);
  assert.ok(isStanding(button('heave'), m.state.ships[0]!.told));
  sail(m, 60, [button('fill')]);
  assert.ok(she(m).ahead > 2 * NO_WAY, `gathering way again: ${(she(m).ahead / KNOT).toFixed(1)} kn after a minute`);
  // Drawn between steps: her pose moves smoothly with the clock.
  const t = simTime(m.state), a = m.pose(t), b = m.pose(t + STEP_SECONDS / 2);
  assert.ok(Math.hypot(b.x - a.x, b.z - a.z) < she(m).ahead * STEP_SECONDS);
});
