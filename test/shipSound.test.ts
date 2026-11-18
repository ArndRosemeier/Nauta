/**
 * The sound of the ship (plan N2.8), the parts that need no sea: the room the ear is in, her creaks as she rolls, the
 * captain's feet, the water's levels and that every sound asked for is made. Her sounds in the game's seas are in
 * shipSoundSea.test.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OPEN_AIR, distanceToRect, roomAt, roomSpaces, roomT60 } from '../src/audio/acoustics.ts';
import { CreakWatch, creakLoudness } from '../src/audio/creaks.ts';
import { COUNTER_EDGE, counterLoudness, slapsCounter } from '../src/audio/counter.ts';
import { Footsteps, stepLoudness, type Footfall } from '../src/audio/footsteps.ts';
import { CaptainBody } from '../src/app/body.ts';
import { deckGround, eyeOf as walkerEye, stepWalker, walkerAt } from '../src/sim/ship/deckWalk.ts';
import { walkGraph } from '../src/sim/ship/walk.ts';
import { shutDoors } from '../src/sim/ship/doors.ts';
import { flowOf, flowShare, insideLevel, runLevel } from '../src/audio/hullWater.ts';
import {
  COUNTER, ECHO_T60, GROAN, HOLD_HZ, HULL_INSIDE, HULL_RUN, OPEN_HZ, SHUT_HZ, STEP_DECK, STEP_PITCH_BELOW, STEP_RUNG, TIMBER,
} from '../src/audio/shipTuning.ts';
import { TAKES } from '../src/audio/ambience.ts';
import { standpoint } from '../src/app/standpoints.ts';
import { LADDER } from '../src/sim/rules/ships.ts';
import { insideBreadth, shipPlan } from '../src/sim/ship/plan.ts';
import { startMotion, toWorld, type ShipPose } from '../src/sim/ship/motion.ts';
import { DEGREE } from '../src/sim/units.ts';

const SEED = 1805;
const plan = shipPlan(), graph = walkGraph(plan), doors = shutDoors(plan);
const sound = JSON.parse(readFileSync(new URL('../public/sound/index.json', import.meta.url), 'utf8')) as { sounds: Record<string, { files: string[] }> };
const eyeOf = (name: string) => standpoint(name).eye;
/** A frame at 60 a second, s. */
const FRAME = 1 / 60;
/** Her roll period, s (N2.2). */
const ROLL_PERIOD = 6.3;

test('every sound of the ship is made, with several takes where it is heard often', () => {
  for (const k of [TIMBER, GROAN, COUNTER]) assert.ok((sound.sounds[k.id]?.files.length ?? 0) >= 6, `${k.id} has several takes`);
  for (const k of [STEP_DECK, STEP_RUNG]) assert.ok((sound.sounds[k.id]?.files.length ?? 0) >= 6, `${k.id} has several takes`);
  for (const bed of [HULL_RUN.id, HULL_INSIDE]) for (const t of TAKES) assert.equal(sound.sounds[`${bed}-${t}`]?.files.length, 1, `${bed}-${t}`);
});

test('on deck, aloft and off her the air is open; below deck the room muffles and rings', () => {
  for (const name of ['quarterdeck', 'waist', 'bow', 'top', 'alongside', '500 m off']) assert.deepEqual(roomAt(plan, eyeOf(name)), OPEN_AIR, name);
  for (const name of ['berth deck', 'cabin', 'hold']) {
    const r = roomAt(plan, eyeOf(name));
    assert.equal(r.below, 1, name);
    assert.ok(r.muffle !== null && r.muffle >= HOLD_HZ && r.muffle <= OPEN_HZ, `${name} muffled at ${r.muffle}`);
    assert.ok(r.through < 1 && r.wet > 0 && r.t60 >= ECHO_T60[0] && r.t60 <= ECHO_T60[1], name);
  }
  assert.equal(roomAt(plan, eyeOf('hold')).muffle, HOLD_HZ);
  assert.equal(roomAt(plan, eyeOf('hold')).space, 'hold');
  assert.equal(roomAt(plan, eyeOf('cabin')).space, 'cabin');
});

test('a small cabin rings shorter than the open berth deck', () => {
  const cabin = roomT60(roomSpaces(plan, 'surgeon')), messdeck = roomT60(roomSpaces(plan, 'messdeck'));
  assert.ok(cabin < messdeck, `cabin ${cabin.toFixed(2)} s, messdeck ${messdeck.toFixed(2)} s`);
  assert.deepEqual(roomSpaces(plan, 'surgeon').map((s) => s.id), ['surgeon']);
  // The passage, the main hatchway, the messdeck, the galley and the fore store rooms are open to each other: one room.
  assert.deepEqual(roomSpaces(plan, 'galley').map((s) => s.id).sort(), ['fore-store', 'galley', 'messdeck', 'midships', 'passage']);
});

test('below deck the sea is heard more openly under a hatch than shut in a cabin', () => {
  const hatch = plan.openings.find((o) => o.id === 'main-hatch')!;
  const y = eyeOf('berth deck')[1], along = (hatch.aft + hatch.fore) / 2, under = roomAt(plan, [0, y, -along]);
  const cabin = roomAt(plan, eyeOf('cabin'));
  const purser = plan.spaces.find((s) => s.id === 'purser')!;
  const shut = roomAt(plan, [(purser.port + purser.starboard) / 2, y, -(purser.aft + purser.fore) / 2]);
  assert.equal(under.space, 'midships');
  assert.ok(Math.abs(under.muffle! - OPEN_HZ) < 1, `under the main hatch ${under.muffle}`);
  assert.equal(shut.muffle, SHUT_HZ, 'the purser\'s cabin has no opening over it');
  assert.ok(cabin.muffle! > SHUT_HZ, 'the companion opens the cabin');
  assert.ok(under.through > shut.through);
  assert.equal(distanceToRect(hatch, along, 0), 0);
  assert.ok(Math.abs(distanceToRect(hatch, hatch.fore + 3, hatch.starboard + 4) - 5) < 1e-9);
});

/** Her pose rolling `amplitude` rad each way over her roll period at time t, pitching a little. */
function rolling(amplitude: number, t: number, at: ShipPose = startMotion(0, 0, 0).pose): ShipPose {
  const w = (2 * Math.PI) / ROLL_PERIOD;
  return { ...at, roll: amplitude * Math.sin(w * t), rollRate: amplitude * w * Math.cos(w * t), pitchRate: (amplitude / 4) * w * Math.cos(1.6 * w * t) };
}

/** A minute of her rolling `amplitude` rad, heard from `eye` (`below` 1 below deck): her creaks. */
function aMinuteOfCreaks(amplitude: number, eye: readonly [number, number, number], below = 0) {
  const watch = new CreakWatch(SEED), heard: { kind: string; gain: number; at: readonly number[]; t: number }[] = [];
  for (let t = 0; t < 60; t += FRAME) {
    const pose = rolling(amplitude, t);
    for (const c of watch.creaks(pose, FRAME, eye, below)) heard.push({ kind: c.kind.id, gain: c.gain, at: c.at, t });
  }
  return heard;
}

test('she creaks more and louder the harder she rolls, and not at all lying still', () => {
  const eye = eyeOf('waist');
  assert.equal(aMinuteOfCreaks(0, eye).length, 0);
  const counts = [1, 5, 15].map((deg) => aMinuteOfCreaks(deg * DEGREE, eye));
  const mean = (h: { gain: number }[]) => h.reduce((s, c) => s + c.gain, 0) / h.length;
  assert.ok(counts[0]!.length >= 1 && counts[0]!.length < counts[1]!.length && counts[1]!.length < counts[2]!.length, counts.map((c) => c.length).join(', '));
  assert.ok(mean(counts[0]!) < mean(counts[1]!) && mean(counts[1]!) < mean(counts[2]!), 'louder');
  // The same roll gives the same creaks.
  assert.deepEqual(aMinuteOfCreaks(5 * DEGREE, eye), counts[1]);
  assert.ok(creakLoudness(0) < creakLoudness(1));
});

test('her creaks come from her near the ear, more of them groans below deck', () => {
  const pose = startMotion(0, 0, 0).pose, eye = eyeOf('berth deck');
  const below = aMinuteOfCreaks(15 * DEGREE, eye, 1), above = aMinuteOfCreaks(15 * DEGREE, eye, 0);
  const groans = (h: { kind: string }[]) => h.filter((c) => c.kind === GROAN.id).length / h.length;
  assert.ok(groans(below) > groans(above), `groans below ${groans(below).toFixed(2)}, above ${groans(above).toFixed(2)}`);
  const ear = toWorld(pose, ...eye);
  for (const c of below) {
    const d = Math.hypot(c.at[0]! - ear[0], c.at[1]! - ear[1], c.at[2]! - ear[2]);
    assert.ok(d < 7, `a creak ${d.toFixed(1)} m off`);
  }
  assert.ok(insideBreadth(-eye[2], eye[1]) > 0);
});

test('the sea slaps the counter only when it comes close and fast, louder the faster', () => {
  assert.ok(!slapsCounter(1.3, 2) && !slapsCounter(0.2, 0.3) && slapsCounter(0.2, 1.5));
  assert.ok(counterLoudness(1) < counterLoudness(2));
  assert.ok(COUNTER_EDGE[1] > 1 && COUNTER_EDGE[2] > 9, 'her counter is over the water, aft');
});

/** The captain's eye moved by `step(t)` for `seconds` with no body, on a ladder or not: his footfalls. */
function walk(seconds: number, step: (t: number) => readonly [number, number, number], onLadder = false, below = 0) {
  const feet = new Footsteps(), heard = [];
  for (let t = 0; t <= seconds; t += FRAME) {
    const f = feet.footfall({ eye: step(t), soles: null, onLadder, below }, FRAME);
    if (f) heard.push(f);
  }
  return heard;
}

/** His body walking forward on her still deck (or standing, `forward` 0) for `seconds`: his soles' landings counted as the body shows them (a sole back on the floor after being lifted) and the footfalls heard, after `settle` s. */
function walkWithBody(seconds: number, forward: number, below = 0, settle = 2) {
  let w = walkerAt(plan, { space: 'deck', along: -4, across: 1.5 });
  const body = new CaptainBody({ stands: (x, z) => deckGround(plan, graph, doors).stand(x, z, w) !== null, handhold: () => null });
  const feet = new Footsteps(), heard: Footfall[] = [], still = startMotion(0, 0, 0).pose;
  let landings = 0, lifted = { L: false, R: false };
  for (let t = 0; t < seconds; t += FRAME) {
    w = stepWalker(w, { forward, strafe: 0, heading: 0 }, plan, graph, doors, FRAME);
    const b = body.follow({ pose: still, walker: w, eye: walkerEye(w), onLadder: false, yaw: 0 }, FRAME);
    const up = { L: b.feet.L[1] > w.floor, R: b.feet.R[1] > w.floor };
    const f = feet.footfall({ eye: b.eye, soles: [b.feet.L, b.feet.R], onLadder: false, below }, FRAME);
    if (t >= settle) {
      for (const k of ['L', 'R'] as const) if (lifted[k] && !up[k]) landings++;
      if (f) heard.push(f);
    }
    lifted = up;
  }
  return { landings, heard };
}

test('his feet are heard as his body sets them down, walking and standing', () => {
  const walking = walkWithBody(6, 1);
  assert.ok(walking.landings >= 6, `${walking.landings} steps in 4 s`);
  assert.ok(Math.abs(walking.heard.length - walking.landings) <= 1, `${walking.heard.length} heard, ${walking.landings} set down`);
  assert.ok(walking.heard.every((s) => s.id === STEP_DECK.id && s.pitch === 1));
  assert.equal(walkWithBody(4, 0).heard.length, 0, 'standing on a still deck');
  assert.ok(walkWithBody(4, 1, 1).heard.every((s) => s.pitch === STEP_PITCH_BELOW), 'below deck');
  assert.ok(stepLoudness(0.2) < stepLoudness(1));
});

test('on a ladder a foot on each tread; with no body once a stride; never when put somewhere', () => {
  const rise = 2.5, climb = walk(6, (t) => [0, Math.min(rise, 0.5 * t), 0], true);
  assert.ok(Math.abs(climb.length - rise / LADDER.rise) <= 2, `${climb.length} treads over ${rise} m`);
  assert.ok(climb.every((s) => s.id === STEP_RUNG.id));
  const pace = 1.4, steps = walk(10, (t) => [0, 1.6, -pace * t]);
  assert.ok(steps.length >= 14 && steps.length <= 22, `${steps.length} steps over 14 m`);
  assert.equal(walk(5, () => [0, 1.6, 0]).length, 0, 'standing');
  assert.equal(walk(1, (t) => [t < 1 / 2 ? 0 : 10, 1.6, 0]).length, 0, 'a standpoint chosen');
});

test('the water along her side is heard by its flow; below deck the sea against her planking is never silent', () => {
  assert.equal(flowOf(3, 4), 5);
  assert.equal(flowShare(0), 0);
  assert.equal(flowShare(100), 1);
  assert.ok(runLevel(0) === 0 && runLevel(0.5) < runLevel(1) && runLevel(1) < runLevel(10));
  assert.ok(insideLevel(0) > 0 && insideLevel(0) < insideLevel(1));
});
