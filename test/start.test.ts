/**
 * Where a duel starts (implementation plan N3, design decision "The start", built with N3.7, by time with N7.5a): as far
 * apart as the ships close in three minutes in that wind (about 650 m in force 2, 1,500 m in force 6), the wind
 * on the beam of the line between them, both under battle sail and closing; the seed turns the picture and picks the
 * force from 2 to 6.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { angleDiff } from '@futuremagic/core';
import { aloneStart, duelStart, endedStart, startApart } from '../src/sim/start.ts';
import { step } from '../src/sim/step.ts';
import { startMatch } from '../src/sim/state.ts';
import { meanWind } from '../src/sim/wind.ts';
import { DUEL_FORCES } from '../src/sim/rules/wind.ts';
import { WEATHER_TURN_DEGREES, WIND_CHOICES } from '../src/sim/rules/start.ts';
import { bearingDir, DEGREE } from '../src/sim/units.ts';

const SEEDS = 200;

test('each seed: three minutes of closing apart, each heading at the other with the wind square across the line, under battle sail with way on', () => {
  for (let seed = 0; seed < SEEDS; seed++) {
    const setup = duelStart(seed);
    const [a, b] = setup.ships, apart = startApart(setup.windForce);
    assert.ok(a && b && setup.ships.length === 2);
    assert.ok(Math.abs(Math.hypot(b.x - a.x, b.z - a.z) - apart) < 1e-9);
    // Each bow points at the other ship.
    const [ax, az] = bearingDir(a.heading), [bx, bz] = bearingDir(b.heading);
    assert.ok(Math.abs(ax * (b.x - a.x) + az * (b.z - a.z) - apart) < 1e-6, `seed ${seed}: the first heads at the second`);
    assert.ok(Math.abs(bx * (a.x - b.x) + bz * (a.z - b.z) - apart) < 1e-6, `seed ${seed}: the second heads at the first`);
    // The wind comes square across both courses, one on each side: neither has the weather gauge.
    assert.ok(Math.abs(Math.abs(angleDiff(a.heading, setup.windFrom)) - 90 * DEGREE) < 1e-9);
    assert.ok(Math.abs(angleDiff(a.heading, setup.windFrom) + angleDiff(b.heading, setup.windFrom)) < 1e-9);
    assert.ok(setup.windForce >= DUEL_FORCES.least && setup.windForce <= DUEL_FORCES.most && Number.isInteger(setup.windForce));
    for (const s of setup.ships) { assert.equal(s.canvas, 'battle'); assert.ok((s.speed ?? 0) > 0); }
  }
});

test('the seed turns the picture all round the compass and picks every force from 2 to 6', () => {
  const forces = new Set<number>(), quarters = new Set<number>();
  for (let seed = 0; seed < SEEDS; seed++) {
    const s = duelStart(seed);
    forces.add(s.windForce);
    quarters.add(Math.floor(s.windFrom / (90 * DEGREE)));
  }
  assert.deepEqual([...forces].sort(), [2, 3, 4, 5, 6]);
  assert.equal(quarters.size, 4);
  assert.deepEqual(duelStart(42), duelStart(42), 'the same seed, the same start');
});

test('the match made from it has that wind and both ships where the ruling puts them', () => {
  const setup = duelStart(7), state = startMatch(setup);
  assert.equal(state.wind.windForce, setup.windForce);
  assert.ok(Math.abs(angleDiff(meanWind(state.wind, 0).from, setup.windFrom)) < 30 * DEGREE);
  state.ships.forEach((s, i) => {
    assert.equal(s.motion.pose.x, setup.ships[i]!.x);
    assert.equal(s.told.canvas, 'battle');
  });
});

test('a chosen wind is drawn within its range, and holding the weather position turns the wind toward the ship that holds it', () => {
  for (let seed = 0; seed < SEEDS; seed++) {
    const even = duelStart(seed);
    for (const [name, range] of Object.entries(WIND_CHOICES)) {
      const f = duelStart(seed, { wind: name as keyof typeof WIND_CHOICES }).windForce;
      assert.ok(f >= range.least && f <= range.most, `seed ${seed}: ${name} gave force ${f}`);
    }
    assert.deepEqual(duelStart(seed, { wind: 'drawn', meet: 'even' }), even, 'the default terms are the duel as it was');
    for (const [meet, holder] of [['weather', 0], ['lee', 1]] as const) {
      const s = duelStart(seed, { meet }), up = s.ships[holder]!, down = s.ships[1 - holder]!;
      // The ships stand where they stood; the wind now blows from the holder's side of the line toward the other.
      assert.deepEqual(s.ships, even.ships);
      const [wx, wz] = bearingDir(s.windFrom);
      assert.ok(wx * (up.x - down.x) + wz * (up.z - down.z) > 0, `seed ${seed}: ${meet}: the holder is to windward`);
      assert.ok(Math.abs(Math.abs(angleDiff(even.windFrom, s.windFrom)) - WEATHER_TURN_DEGREES * DEGREE) < 1e-9);
    }
  }
});

test('one ship alone: the first ship of the same duel, at the middle, with the chosen wind', () => {
  const alone = aloneStart(9, { wind: 'strong' }), duel = duelStart(9, { wind: 'strong' });
  assert.equal(alone.ships.length, 1);
  assert.equal(alone.windForce, duel.windForce);
  assert.equal(alone.ships[0]!.heading, duel.ships[0]!.heading);
  assert.equal(startMatch(alone).ships.length, 1);
});

test('a ship lost from the start (?end=, plan N6.7) ends the fight in the first step as the rules judge it', () => {
  const begun = startMatch(duelStart(7));
  for (const [how, ship] of [['struck', 1], ['sunk', 0], ['burnt', 1], ['blew up', 0]] as const) {
    const r = step(endedStart(begun, { ship, how }));
    assert.deepEqual(r.state.fight.end?.lost, ship === 0 ? [how, null] : [null, how], how);
  }
  assert.equal(step(begun).state.fight.end, null, 'the others are untouched');
});
