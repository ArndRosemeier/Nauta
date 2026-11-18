/**
 * The order panel (implementation plan N3.5): its buttons give every order of the vocabulary, its words say how she
 * answers, its rings and dim buttons what stands and what she would refuse, and her yards are drawn as she is trimmed.
 * Short rules on the match the page runs alone (N3.7's session offline, src/net/duel.ts), a few simulated seconds each. That with the panel's taps
 * alone she reaches every compass point, tacks, heaves to and fills is a scenario of `npm run check:sailing`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VOCABULARY, type Order } from '../src/sim/orders.ts';
import { simTime } from '../src/sim/state.ts';
import type { SimEvent } from '../src/sim/step.ts';
import { DEGREE, KNOT, STEP_SECONDS } from '../src/sim/units.ts';
import {
  bearingWords, clockWords, crewLines, eventWords, isStanding, orderButtons, pointOfSail, shipLines, STEER_POINTS, steerPoint, wouldRefuse,
} from '../src/app/orderReport.ts';
import { sparAngles } from '../src/app/pageMatch.ts';
import { DuelSession } from '../src/net/duel.ts';
import type { MatchSetup } from '../src/sim/state.ts';
import type { ShipPose } from '../src/sim/ship/motion.ts';

/** The page's match sailed alone (N3.7's session, offline), on a clock the test moves: the match one brig at the start given. */
class SoloMatch {
  private t = 0;
  private readonly session: DuelSession;
  constructor(start: { seed: number; windForce: number; windFrom: number; x: number; z: number; heading: number }) {
    const setup: MatchSetup = { seed: start.seed, windForce: start.windForce, windFrom: start.windFrom, ships: [{ x: start.x, z: start.z, heading: start.heading, speed: START_SPEED }] };
    this.session = new DuelSession({ build: 'test', now: () => this.t, setup });
  }
  get state() { return this.session.state; }
  get ship() { return this.session.mine; }
  give(order: Order): void { this.session.give(order); }
  on(kind: 'events', fn: (events: readonly SimEvent[]) => void): void { this.session.on(kind, fn); }
  /** The match stepped up to the clock's `t`, s (a hair over, so a whole step is never lost to rounding). */
  advance(t: number): void { this.t = t + CLOCK_HAIR; this.session.pump(); }
  /** Her pose drawn at the clock's `t`, between her last two steps. */
  pose(t: number): ShipPose { this.t = t; return this.session.pose(this.ship)!; }
}
/** Her way at the start (as the page's first ?sail had it), m/s. */
const START_SPEED = 5 * KNOT;
/** Added to the test's clock so rounding never holds back a step that is due, s. */
const CLOCK_HAIR = 1e-9;

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
      for (const e of events) { const w = eventWords(e, match.ship); if (w) lines.push(w); }
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
  // A course on the other tack (she heads north, the wind on her larboard side; 160 has it on her starboard): she will
  // wear, and the master says so; the course is taken and the helm put over when its men have done it.
  heard = sail(m, 5, [{ kind: 'steer', ship: 0, heading: 160 * DEGREE }]);
  assert.match(heard[0]!, /^00:01 steer 160: wearing round, sir: 160 lies on the other tack$/);
  assert.ok(heard.some((h) => /✓ steer 160: done/.test(h)), heard.join(' | '));
  // Too near the wind on the other tack: answered, full and by on that tack, by wearing.
  heard = sail(m, 1, [{ kind: 'steer', ship: 0, heading: steerPoint(STEER_POINTS.indexOf('SW')) }]);
  assert.match(heard[0]!, /^00:06 steer 225: she will not lie 225: full and by on the starboard tack, \d{3}, wearing round$/);
  // What happens under sail, and a job begun with fewer hands than it needs.
  const at = 95 * 30;
  assert.equal(eventWords({ kind: 'tacked', tick: at, ship: 0 }, 0), '01:35 she has come through the wind');
  assert.equal(eventWords({ kind: 'wore', tick: at, ship: 0 }, 0), '01:35 she has worn round');
  assert.equal(eventWords({ kind: 'missed stays', tick: at, ship: 0 }, 0), '01:35 she missed stays and falls back');
  const short: SimEvent = { kind: 'short-handed', tick: at, ship: 0, order: button('heave'), job: 'brace' };
  assert.equal(eventWords(short, 0), "01:35 heave to: short-handed: a mast's yards swung round");
  assert.equal(eventWords({ ...short, ship: 1 }, 0), null);
  const answered: SimEvent = { kind: 'answered', tick: at, ship: 1, order: { kind: 'steer', ship: 1, heading: 0 }, code: 'wearing round', reason: 'wearing round, sir: 000 lies on the other tack' };
  assert.equal(eventWords(answered, 0), null, "another ship's answer");
  assert.equal(eventWords(answered, 1), '01:35 steer 000: wearing round, sir: 000 lies on the other tack');
});

test('standing orders are ringed, and her yards are drawn braced as she is trimmed, round the other way on the other tack', () => {
  const m = new SoloMatch(START);
  sail(m, 1, [button('heave')]);
  const told = m.state.ships[0]!.told;
  assert.ok(isStanding(button('heave'), told) && isStanding(button('by'), told), 'hove to, full and by');
  assert.ok(isStanding(orderButtons().find((b) => b.label === 'back the main topsail')!.order, told));
  assert.ok(wouldRefuse(m.state, button('heave')), 'hove to already');
  // The same brig on the mirror course (the wind on her other side): her yards braced the other way.
  const mirrored = new SoloMatch({ ...START, heading: 2 * START.windFrom });
  const yard = (st: SoloMatch) => new Map(sparAngles(st.state, 0)).get('main-topsail-yard')!;
  assert.ok(Math.abs(yard(mirrored)) > 10 * DEGREE, `main topsail yard braced ${(yard(mirrored) / DEGREE).toFixed(0)}°`);
  assert.equal(Math.sign(yard(mirrored)), -Math.sign(yard(new SoloMatch(START))), 'braced the other way');
  assert.equal(new Map(sparAngles(m.state, 0)).has('boom'), true, 'the boom swings with the boom sail');
  // Drawn between steps: her pose moves smoothly with the clock, never past the step ahead.
  const t = simTime(m.state), a = m.pose(t), b = m.pose(t + STEP_SECONDS / 2);
  assert.ok(Math.hypot(b.x - a.x, b.z - a.z) < Math.max(she(m).ahead, KNOT) * STEP_SECONDS);
});
