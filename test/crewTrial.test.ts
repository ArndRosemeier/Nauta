import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CREW_SIZE, MUSTER, berthPlaces, musterCrews, walkerPlace, facingToward } from '../src/app/crew.ts';
import { PACK_CLIPS, PACK_GARMENTS, PACK_HAIR, lookOf } from '../src/app/crewLooks.ts';
import { CROWD, FULL, MEDIUM, STICK, crewLevels, stepAt, type ManLevel, type ManSeen } from '../src/app/crewLevels.ts';
import { QUALITY_LEVELS } from '../src/app/quality.ts';
import { TRIAL_PHASES, TRIAL_SECONDS, TRIAL_SETTLE_SECONDS, emptySamples, trialAt, trialLines } from '../src/app/crewTrial.ts';
import { insideBreadth, shipPlan } from '../src/sim/ship/plan.ts';
import { shipY } from '../src/sim/ship/section.ts';
import { sheer } from '../src/sim/ship/hull.ts';

const plan = shipPlan();
const twin = musterCrews(false, plan), aboard = musterCrews(true, plan);

test('two crews of 120, made up as the muster says, each man on a floor of hers and inside her sides', () => {
  for (const men of [twin, aboard]) {
    assert.equal(men.length, 2 * CREW_SIZE);
    for (const crew of [0, 1]) assert.equal(men.filter((m) => m.crew === crew).length, CREW_SIZE);
    for (const m of men) {
      const along = -m.at[2], across = m.at[0];
      assert.ok(Math.abs(across) < insideBreadth(along, sheer(along)), `${m.space} ${along.toFixed(1)}, ${across.toFixed(1)} is inside her`);
      assert.ok(m.at[1] > shipY(0) && m.at[1] < shipY(sheer(along)) + 1, 'his feet are on one of her floors');
      assert.ok(PACK_CLIPS.includes(m.clip), m.clip);
    }
  }
  const hers = twin.filter((m) => m.crew === 0);
  assert.equal(hers.filter((m) => m.rank === 'officer').length, MUSTER.officers);
  assert.equal(hers.filter((m) => m.rank === 'marine').length, MUSTER.marines);
  assert.equal(hers.filter((m) => m.beat).length, MUSTER.walking);
});

test('no two men of a deck stand in one place: her twin\'s crew copies hers, aboard the other crew takes the free places', () => {
  const key = (m: { at: readonly number[] }) => m.at.map((v) => v.toFixed(2)).join();
  for (const [men, decks] of [[twin, [0, 1]], [aboard, [0]]] as const) {
    for (const d of decks) {
      const standing = men.filter((m) => (decks.length > 1 ? m.crew === d : true) && !m.beat).map(key);
      assert.equal(new Set(standing).size, standing.length);
    }
  }
  assert.ok(berthPlaces(plan).length >= MUSTER.below * 2, 'room below for both crews\' men off watch');
});

test('the muster is the same on every load (seeded)', () => {
  assert.deepEqual(musterCrews(false, plan), twin);
});

test('a walker goes from his start to the end of his beat and back, facing the way he goes', () => {
  const w = twin.find((m) => m.beat)!, out: [number, number, number] = [0, 0, 0];
  const length = Math.hypot(w.beat![0] - w.at[0], w.beat![2] - w.at[2]);
  for (let t = 0; t < 60; t += 0.7) {
    const facing = walkerPlace(w, t, out);
    const s = Math.hypot(out[0] - w.at[0], out[2] - w.at[2]);
    assert.ok(s <= length + 1e-9);
    const ahead = Math.abs(facing - facingToward(w.at[0], w.at[2], w.beat![0], w.beat![2])) < 1e-9;
    const back = Math.abs(Math.abs(facing - facingToward(w.beat![0], w.beat![2], w.at[0], w.at[2]))) < 1e-9;
    assert.ok(ahead || back);
  }
});

test('a man\'s look comes from his seed, wears only what the pack has, and tells rank and navy apart', () => {
  for (const m of twin) {
    const look = lookOf(m.seed, m.rank, m.navy);
    assert.deepEqual(look, lookOf(m.seed, m.rank, m.navy));
    for (const g of look.outfit!) assert.ok(PACK_GARMENTS.includes(g), g);
    assert.ok(PACK_HAIR.includes(look.hair!), look.hair!);
    assert.ok(look.outfit!.includes('wool-pants'), 'every man wears trousers');
  }
  const coat = (rank: 'officer' | 'marine', navy: 'british' | 'french') => lookOf(1, rank, navy).garmentColors!.longsleeve;
  assert.notEqual(coat('marine', 'british'), coat('marine', 'french'));
  assert.notEqual(coat('officer', 'british'), coat('marine', 'british'));
});

const knobs = QUALITY_LEVELS[0]!.crew;
const seenAt = (distance: number, level = CROWD, seen = true): ManSeen => ({ distance, seen, level });

test('the nearest men seen get detail by distance, at most as many as the knob allows; the rest are crowd', () => {
  const men = Array.from({ length: 40 }, (_, i) => seenAt(1 + i * 0.5));
  const out = crewLevels(men, knobs, []);
  const detailed = out.filter((l) => l.level !== CROWD).length;
  assert.equal(detailed, Math.min(knobs.detailed, men.filter((m) => m.distance <= knobs.mediumTo).length));
  assert.equal(out[0]!.level, FULL);
  assert.ok(out.every((l, i) => l.level === CROWD || men[i]!.distance <= knobs.mediumTo));
  // A man out of sight is never given detail, and animates at the hidden rate.
  const hidden = crewLevels([seenAt(1, CROWD, false)], knobs, []);
  assert.equal(hidden[0]!.level, CROWD);
  assert.equal(hidden[0]!.step, knobs.hiddenStep);
});

test('a man keeps his level a little past its limit, so two at the edge do not trade places every frame', () => {
  const edge = knobs.mediumTo + STICK / 2;
  assert.equal(crewLevels([seenAt(edge, MEDIUM)], knobs, [])[0]!.level, MEDIUM);
  assert.equal(crewLevels([seenAt(edge, CROWD)], knobs, [])[0]!.level, CROWD);
  assert.equal(crewLevels([seenAt(knobs.mediumTo + STICK * 2, MEDIUM)], knobs, [])[0]!.level, CROWD);
});

test('far men animate less often, and the trial\'s overrides win', () => {
  assert.equal(stepAt(knobs, 1), knobs.steps[0]);
  assert.equal(stepAt(knobs, 1e4), knobs.steps[knobs.steps.length - 1]);
  const men = [seenAt(2), seenAt(100)], out: ManLevel[] = [];
  crewLevels(men, knobs, out, { everyFrame: true, level: CROWD, shadows: false });
  assert.ok(out.every((l) => l.step === 1 && l.level === CROWD && !l.shadow));
  crewLevels(men, knobs, out);
  assert.ok(out[0]!.shadow && !out[1]!.shadow, 'only the near man casts the sun\'s shadow');
});

test('each quality level gives the crew less than the one above', () => {
  QUALITY_LEVELS.forEach((l, i) => {
    const c = l.crew, up = QUALITY_LEVELS[i - 1]?.crew;
    assert.equal(c.steps.length, c.stepsTo.length + 1);
    assert.ok(c.fullTo <= c.mediumTo);
    if (!up) return;
    assert.ok(c.detailed <= up.detailed && c.mediumTo <= up.mediumTo && c.shadowTo <= up.shadowTo && c.hiddenStep >= up.hiddenStep);
    c.steps.forEach((s, k) => assert.ok(s >= up.steps[k]!));
  });
});

test('the trial runs its phases in order, each settling before it is measured, and says what both crews add', () => {
  assert.deepEqual(trialAt(0), { phase: 0, measuring: false });
  assert.deepEqual(trialAt(TRIAL_SETTLE_SECONDS + 0.1), { phase: 0, measuring: true });
  assert.equal(trialAt(TRIAL_SECONDS + 1).phase, TRIAL_PHASES.length);
  assert.deepEqual(TRIAL_PHASES.slice(0, 3).map((p) => p.crews), [0, 1, 2]);
  const samples = TRIAL_PHASES.map(emptySamples);
  samples.forEach((s, i) => { for (let k = 0; k < 10; k++) { s.frames.push(16.7); s.work.push(2 + i); s.crew.push(i); s.draws.push(100 * i); } });
  const lines = trialLines(samples);
  assert.equal(lines.length, TRIAL_PHASES.length + 2);
  assert.match(lines[lines.length - 1]!, /both crews add 2\.0 ms of page work/);
});
