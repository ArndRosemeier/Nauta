import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shipPlan } from '../src/sim/ship/plan.ts';
import { walkGraph, nodeAt } from '../src/sim/ship/walk.ts';
import { shutDoors } from '../src/sim/ship/doors.ts';
import { deckGround, eyeOf, stepWalker, walkerAt, type DeckWalker } from '../src/sim/ship/deckWalk.ts';
import { handholdNear } from '../src/sim/ship/handholds.ts';
import { pointVelocity, startMotion, toWorld, type ShipPose } from '../src/sim/ship/motion.ts';
import { CaptainBody, type BodyPose, type BodyWorld } from '../src/app/body.ts';
import { CALM_LEAST } from '../src/sim/rules/body.ts';
import { WALK_PACE } from '../src/sim/rules/walking.ts';

const plan = shipPlan(), graph = walkGraph(plan), doors = shutDoors(plan), DT = 1 / 60;
const still = startMotion(0, 0, 0).pose;
/** Her pose rolling `amp` rad either way in `period` s (starboard down first), at time t. */
const rolling = (amp: number, period: number, t: number): ShipPose => {
  const w = (2 * Math.PI) / period;
  return { ...still, pitch: 0, roll: amp * Math.sin(w * t), rollRate: amp * w * Math.cos(w * t) };
};
const worldOf = (w: () => DeckWalker): BodyWorld => ({
  stands: (x, z) => deckGround(plan, graph, doors).stand(x, z, w()) !== null,
  handhold: () => handholdNear(plan, w().place, -w().z, w().x, w().floor),
});
/** The angle between a head's up (ship space) turned into the world by her pose and the world's up, rad. */
const worldTilt = (pose: ShipPose, up: readonly number[]) => {
  const o = toWorld(pose, 0, 0, 0), p = toWorld(pose, up[0]!, up[1]!, up[2]!);
  return Math.acos(Math.min(1, p[1] - o[1]));
};
/** Her deck's own tilt off the world's up at a pose, rad. */
const deckTilt = (pose: ShipPose) => worldTilt(pose, [0, 1, 0]);
const quarterdeck = plan.stations.find((s) => s.id === 'quarterdeck')!;
const run = (body: CaptainBody, w: DeckWalker, seconds: number, pose: (t: number) => ShipPose, each?: (b: BodyPose, t: number) => void) => {
  let b: BodyPose | null = null;
  for (let i = 0; i < seconds / DT; i++) {
    const t = i * DT, p = pose(t);
    b = body.follow({ pose: p, walker: w, eye: eyeOf(w), onLadder: false, yaw: 0 }, DT);
    each?.(b, t);
  }
  return b!;
};

test('standing on a still deck the body is still: the eye where the walker puts it, the head level, both feet planted', () => {
  const w = walkerAt(plan, quarterdeck), body = new CaptainBody(worldOf(() => w));
  const b = run(body, w, 3, () => still);
  const eye = eyeOf(w);
  // Her trim by the stern tilts her deck 2.1°; the head is held to gravity, not to her deck.
  assert.ok(Math.hypot(b.eye[0] - eye[0], b.eye[2] - eye[2]) < 0.08, 'over his feet');
  assert.ok(Math.abs(b.eye[1] - eye[1]) < 0.02, 'at his height');
  assert.ok(worldTilt(still, b.up) < deckTilt(still) * 0.5, `head ${worldTilt(still, b.up).toFixed(3)} rad off level, deck ${deckTilt(still).toFixed(3)}`);
  assert.ok(Math.abs(b.feet.L[1] - w.floor) < 1e-9 && Math.abs(b.feet.R[1] - w.floor) < 1e-9, 'feet on the deck');
  assert.ok(Math.hypot(b.feet.L[0] - b.feet.R[0], b.feet.L[2] - b.feet.R[2]) > 0.2, 'stance');
});

test('in a beam sea he leans against the roll: his head keeps nearer upright than her deck, a little behind her', () => {
  const w = walkerAt(plan, quarterdeck), body = new CaptainBody(worldOf(() => w));
  let head = 0, deck = 0;
  const amp = 0.17, period = 6.3;
  run(body, w, 20, (t) => rolling(amp, period, t), (b, t) => {
    if (t < 5) return;
    const p = rolling(amp, period, t);
    head = Math.max(head, worldTilt(p, b.up)); deck = Math.max(deck, deckTilt(p));
  });
  assert.ok(head < deck * 0.55 && head > deck * 0.1, `head swings ${head.toFixed(3)} rad, deck ${deck.toFixed(3)}`);
});

test('in a gale\'s roll his feet step out to a wider stance', () => {
  const w = walkerAt(plan, quarterdeck), body = new CaptainBody(worldOf(() => w));
  let steps = 0, last = false, wide = 0;
  run(body, w, 20, (t) => rolling(0.35, 6.3, t), (b) => {
    const up = b.feet.L[1] > w.floor || b.feet.R[1] > w.floor;
    if (up && !last) steps++;
    last = up;
    wide = Math.hypot(b.feet.L[0] - b.feet.R[0], b.feet.L[2] - b.feet.R[2]);
  });
  assert.ok(steps >= 1, 'his feet stepped');
  assert.ok(wide > 0.35, `stance ${wide.toFixed(2)} m`);
});

test('his eye stays where his middle may stand, however he leans: never out over her side or into a bulkhead', () => {
  // Beside her bulwark, rolling hard toward it.
  let across = 0;
  for (let x = 0; x < 5; x += 0.02) if (nodeAt(graph, { space: 'deck', along: 2, across: x }) >= 0) across = x;
  const w = walkerAt(plan, { space: 'deck', along: 2, across }), ground = deckGround(plan, graph, doors), body = new CaptainBody(worldOf(() => w));
  run(body, w, 15, (t) => rolling(0.35, 6.3, t), (b) => {
    assert.ok(ground.stand(b.eye[0], b.eye[2], w) !== null || Math.hypot(b.eye[0] - w.x, b.eye[2] - w.z) < 0.04, `eye at ${b.eye[0].toFixed(2)}, ${b.eye[2].toFixed(2)}`);
  });
});

test('the calm view keeps the head level and the eye over his feet', () => {
  const w = walkerAt(plan, quarterdeck), body = new CaptainBody(worldOf(() => w));
  body.strength = CALM_LEAST;
  let head = 0, deck = 0, off = 0;
  const eye = eyeOf(w);
  run(body, w, 15, (t) => rolling(0.17, 6.3, t), (b, t) => {
    const p = rolling(0.17, 6.3, t);
    head = Math.max(head, worldTilt(p, b.up)); deck = Math.max(deck, deckTilt(p));
    off = Math.max(off, Math.hypot(b.eye[0] - eye[0], b.eye[2] - eye[2]));
  });
  assert.ok(head < deck * 0.12, `head ${head.toFixed(3)} rad, deck ${deck.toFixed(3)}`);
  assert.ok(off < 0.03, `eye moved ${off.toFixed(3)} m`);
});

test('walking, his feet step one after the other at a man\'s cadence and his eye bobs a few centimetres', () => {
  let w = walkerAt(plan, { space: 'deck', along: -4, across: 1.5 });
  const body = new CaptainBody(worldOf(() => w));
  let steps = 0, last: Record<'L' | 'R', boolean> = { L: false, R: false }, both = false, low = Infinity, high = -Infinity;
  for (let i = 0; i < 6 / DT; i++) {
    w = stepWalker(w, { forward: 1, strafe: 0, heading: 0 }, plan, graph, doors, DT);
    const b = body.follow({ pose: still, walker: w, eye: eyeOf(w), onLadder: false, yaw: 0 }, DT);
    const up = { L: b.feet.L[1] > w.floor, R: b.feet.R[1] > w.floor };
    if (up.L && up.R) both = true;
    if (i * DT > 2) {
      for (const s of ['L', 'R'] as const) if (up[s] && !last[s]) steps++;
      const drop = eyeOf(w)[1] - b.eye[1];
      low = Math.min(low, drop); high = Math.max(high, drop);
    }
    last = up;
  }
  const cadence = steps / 4;
  assert.ok(Math.hypot(w.vx, w.vz) > WALK_PACE * 0.9, 'at his pace');
  assert.ok(!both, 'never both feet in the air');
  assert.ok(cadence > 1.5 && cadence < 2.4, `${cadence.toFixed(2)} steps a second`);
  assert.ok(high - low > 0.015 && high - low < 0.07, `bob ${(high - low).toFixed(3)} m`);
});

test('in a heavy sea he takes hold of the rail beside him; in a breeze he stands free', () => {
  let across = 0;
  for (let x = 0; x < 5; x += 0.02) if (nodeAt(graph, { space: 'deck', along: 2, across: x }) >= 0) across = x;
  const w = walkerAt(plan, { space: 'deck', along: 2, across });
  assert.ok(handholdNear(plan, 'deck', 2, across, w.floor)?.kind === 'rail', 'the rail is within reach');
  const held = (amp: number) => { let h = false; run(new CaptainBody(worldOf(() => w)), w, 12, (t) => rolling(amp, 6.3, t), (b, t) => { if (t > 8 && b.hold) h = true; }); return h; };
  assert.ok(held(0.17), 'holds on rolling 10°');
  assert.ok(!held(0.04), 'stands free rolling 2°');
});

test('below deck the beam over his head is a hold; in the middle of her deck there is none', () => {
  const w = walkerAt(plan, plan.stations.find((s) => s.id === 'surgeon')!);
  assert.equal(handholdNear(plan, w.place, -w.z, w.x, w.floor)?.kind, 'beam');
  const mid = walkerAt(plan, plan.stations.find((s) => s.id === 'waist')!);
  assert.equal(handholdNear(plan, mid.place, -mid.z, mid.x, mid.floor), null);
});

test('a blow staggers him: his lean is thrown and a foot steps to catch it, then he settles', () => {
  const w = walkerAt(plan, quarterdeck), body = new CaptainBody(worldOf(() => w));
  run(body, w, 2, () => still);
  body.jolt(1, 0, 1);
  let stepped = false, most = 0;
  const b = run(body, w, 4, () => still, (p, t) => {
    if (t < 1) { stepped ||= p.feet.L[1] > w.floor || p.feet.R[1] > w.floor; most = Math.max(most, Math.abs(p.up[0])); }
  });
  assert.ok(most > 0.05, `thrown ${most.toFixed(3)}`);
  assert.ok(stepped, 'a foot stepped');
  assert.ok(Math.abs(b.up[0]) < 0.02, 'settled');
});

test('a point of her moves as her heave, pitch and roll rates say', () => {
  const p: ShipPose = { ...still, roll: 0.1, rollRate: 0.2, pitchRate: -0.05, heaveRate: 0.3 };
  const v = pointVelocity(p, 3, 2, -4), h = 1e-4;
  const a = toWorld(p, 3, 2, -4), b = toWorld({ ...p, roll: p.roll + p.rollRate * h, pitch: p.pitch + p.pitchRate * h, heave: p.heave + p.heaveRate * h }, 3, 2, -4);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(v[i]! - (b[i]! - a[i]!) / h) < 1e-3, `axis ${i}`);
});

test('her heeled deck slows him as it slows every man aboard', () => {
  const pace = (heel: number) => {
    let w = walkerAt(plan, { space: 'deck', along: -4, across: 1.5 });
    for (let i = 0; i < 2 / DT; i++) w = stepWalker(w, { forward: 1, strafe: 0, heading: 0 }, plan, graph, doors, DT, { x: Math.sin(heel), y: Math.cos(heel), z: 0 });
    return Math.hypot(w.vx, w.vz);
  };
  assert.ok(pace(0.35) < pace(0) * 0.8 && pace(0.35) > pace(0) * 0.4, `level ${pace(0).toFixed(2)} m/s, heeled 20° ${pace(0.35).toFixed(2)}`);
});
