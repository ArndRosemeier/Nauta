/**
 * What damage leads to (implementation plan N6.2): a hole below the waterline floods her at the rule's rate and lists
 * her; the pumps hold a small leak and lose to a large one; five waterline holes sink her in about eight minutes and,
 * plugged and pumped, she holds; a spar falls with three wounds in a part, or with its weather shrouds gone and the
 * wind on them, taking all it carries and the men on it, and a dismasted ship cannot sail; fire doubles at the table's
 * pace, spreads, is put out by men fighting it and, unfought, reaches the magazine in the table's time; with her
 * steering shot away she answers no helm.
 *
 * Each from the smallest case that shows it (CHECKS.md): the rules on their own where minutes are needed, the step
 * for at most a minute in all.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holeCode, startDamage, stepAftermath, type AftermathIn, type Damage } from '../src/sim/damage.ts';
import { fallsDue, standingOf } from '../src/sim/damage/fall.ts';
import { burnt, kindled, magazineSpace, type Fire } from '../src/sim/damage/fire.ts';
import { founderTonnes, inflow, pumped, sinkingFor } from '../src/sim/damage/flood.ts';
import { plankingPlace, sparParts } from '../src/sim/damage/meet.ts';
import { FIRE, FOUNDER_MINUTES, PUMPING } from '../src/sim/rules/damage.ts';
import { designWaterline } from '../src/sim/ship/hull.ts';
import { shipPlan } from '../src/sim/ship/plan.ts';
import { rigPlan } from '../src/sim/ship/rig.ts';
import { stepSailing, UNDAMAGED, type SailingDamage } from '../src/sim/ship/sailing.ts';
import { startMatch, type SimState } from '../src/sim/state.ts';
import { step } from '../src/sim/step.ts';
import { STEPS_PER_SECOND } from '../src/sim/units.ts';
import { windAt } from '../src/sim/wind.ts';

/** The men the quarter bill posts at the pumps (rules/crew.ts). */
const PUMP_HANDS = 6;
/** A hole "at her waterline" in the design's sense: her roll and the waves put it about this far under, on the average, m. */
const AT_WATERLINE = 0.3;
const SECONDS_PER_MINUTE = 60;

/** A planking cell of her side (`side`) amidships with a spot `depth` m under her load waterline: the cell and the spot's girth. */
function spotUnder(side: 1 | -1, depth: number): { cell: number; u: number; v: number } {
  for (const c of shipPlan().cells) {
    if (c.kind !== 'planking' || c.side !== side || c.aft > 0 || c.fore < 0) continue;
    for (let v = 0; v < c.to - c.from; v += 0.04) {
      const p = plankingPlace(c, 0.5, v);
      if (Math.abs(p[2] - (designWaterline(p[0]) - depth)) < 0.03) return { cell: c.id, u: 0.5, v };
    }
  }
  throw new Error('no such spot');
}

test('the pumps hold a small leak and lose to a large one', () => {
  const pumps = pumped(PUMP_HANDS, PUMPING.least + 1);
  assert.ok(pumps > 0 && pumped(0, PUMPING.least + 1) === 0 && pumped(PUMP_HANDS, PUMPING.least) === 0, 'manned, they draw while there is water above the well');
  assert.ok(inflow('round', 'long6', AT_WATERLINE) < pumps, 'a 6-pound shot hole at her waterline is held');
  assert.ok(inflow('round', 'carronade', 1) > 2 * pumps, 'a 32-pound shot hole a metre down is not');
  assert.equal(inflow('round', 'carronade', 1, 1), 0, 'once the water inside stands as high as the sea outside, none comes in');
});

test('five holes at her waterline sink her in about eight minutes with the pumps manned; plugged and pumped she holds', () => {
  // Her water in steps of a second, the holes sinking deeper as its weight sinks her.
  const founders = founderTonnes();
  let water = 0, t = 0;
  for (; water < founders && t < 2 * FOUNDER_MINUTES * SECONDS_PER_MINUTE; t++) {
    water += 5 * inflow('round', 'carronade', AT_WATERLINE + sinkingFor(water)) - pumped(PUMP_HANDS, water);
  }
  const minutes = t / SECONDS_PER_MINUTE;
  assert.ok(Math.abs(minutes - FOUNDER_MINUTES) < FOUNDER_MINUTES * 0.2, `foundered in ${minutes.toFixed(1)} min`);
  // Plugged: the pumps clear what is in her.
  const half = founders / 2;
  water = half;
  for (let k = 0; k < FOUNDER_MINUTES * SECONDS_PER_MINUTE; k++) water -= pumped(PUMP_HANDS, water);
  assert.ok(water < half, `pumped down to ${water.toFixed(0)} t of ${half.toFixed(0)}`);
});

/** One ship lying still in a calm with three carronade holes half a metre under her waterline on one side, stepped `seconds`. */
function flooding(side: 1 | -1, seconds: number): { state: SimState; roll: number } {
  const spot = spotUnder(side, 1 / 2);
  let state = startMatch({ seed: 3, windForce: 0, windFrom: 0, ships: [{ x: 0, z: 0, heading: Math.PI / 2, canvas: 'bare' }] });
  const holes = [0, 0.3, 0.6].map((du) => holeCode(spot.cell, spot.u + du, spot.v, 'round', 'carronade', false));
  state = { ...state, ships: state.ships.map((s) => ({ ...s, damage: { ...s.damage, holes } })) };
  let roll = 0;
  const steps = seconds * STEPS_PER_SECOND;
  for (let k = 0; k < steps; k++) {
    state = step(state).state;
    if (k >= steps / 2) roll += state.ships[0]!.motion.pose.roll / (steps / 2);
  }
  return { state, roll };
}

test('a hole below her waterline floods her at the rule\'s rate and lists her toward it', () => {
  const seconds = 30;
  const starboard = flooding(1, seconds), larboard = flooding(-1, seconds);
  const [l, s] = starboard.state.ships[0]!.damage.flooded;
  const expected = (3 * inflow('round', 'carronade', 1 / 2) - pumped(PUMP_HANDS, l + s)) * seconds;
  assert.ok(Math.abs(l + s - expected) < expected * 0.25, `${(l + s).toFixed(1)} t in, the rule gives ${expected.toFixed(1)} t`);
  assert.ok(s > l, 'more on the side it comes in');
  assert.ok(starboard.roll > larboard.roll, `heeled ${starboard.roll} with the holes to starboard, ${larboard.roll} to larboard`);
});

/** The `sparParts` place of a spar's part (`k` from its heel). */
const partOf = (spar: string, k: number): number => sparParts().findIndex((p) => p.spar === spar) + k;
const sparIndex = (id: string): number => rigPlan().spars.findIndex((s) => s.id === id);
const lineIndex = (id: string): number => rigPlan().lines.findIndex((l) => l.id === id);

test('a spar falls with three wounds in a part, or its weather shrouds gone with the wind on them, and takes all it carries', () => {
  const d = startDamage(), intact = standingOf(d.fallen, d.cut, d.rent), calm = { across: 0, aback: () => false };
  const wounded = [partOf('main-topmast', 2), partOf('main-topmast', 2)];
  assert.deepEqual(fallsDue(intact, wounded, calm), [], 'two wounds hold');
  const falls = fallsDue(intact, [...wounded, wounded[0]!], { across: 5, aback: () => false });
  assert.deepEqual(falls, [{ part: partOf('main-topmast', 2), side: 1 }], 'three bring it down, over her lee side');
  const after = standingOf(falls.map((f) => f.part), d.cut, d.rent);
  for (const id of ['main-topmast', 'main-topgallant-mast', 'main-topsail-yard', 'main-topgallant-yard']) assert.ok(after.down[sparIndex(id)], `${id} down`);
  assert.ok(!after.down[sparIndex('main-mast')] && !after.down[sparIndex('main-yard')], 'what stands below the break stands');
  assert.equal(after.draws[rigPlan().sails.findIndex((s) => s.id === 'main-topsail')], 0, 'its sails draw no more');
  assert.equal(after.draws[rigPlan().sails.findIndex((s) => s.id === 'main-course')], 1);
  // The starboard main shrouds mostly shot away: she keeps her mast with the wind from larboard, loses it with the wind from starboard.
  const cut = rigPlan().lines.flatMap((l, i) => (l.serves === 'main-mast' && l.side === 1 && l.standing && i % 4 !== 0 ? [i] : []));
  const shot = standingOf([], cut, d.rent);
  assert.deepEqual(fallsDue(shot, [], { across: 5, aback: () => false }), [], 'the wind on her sound side');
  assert.deepEqual(fallsDue(shot, [], { across: -5, aback: () => false }), [{ part: partOf('main-mast', 1), side: -1 }], 'over to larboard at her partners');
  assert.ok(lineIndex('main-shroud-s1') >= 0);
});

test('a dismasted ship cannot sail, and with her steering shot away she answers no helm', () => {
  const s0 = startMatch({ seed: 3, windForce: 4, windFrom: 0, ships: [{ x: 0, z: 0, heading: Math.PI / 2, canvas: 'plain' }] });
  const pose = s0.ships[0]!.motion.pose, wind = windAt(s0.wind, 0, 0, 0);
  const d = startDamage(), down = standingOf([partOf('fore-mast', 1), partOf('main-mast', 1), partOf('bowsprit', 1)], d.cut, d.rent);
  assert.ok(down.draws.every((x) => x === 0), 'no sail can stand');
  /** Her sailing after `seconds` from rest, or told to turn `turn` rad from way of `speed` m/s. */
  const sail = (harm: SailingDamage, seconds: number, turn = 0, speed = 0) => {
    let s = { ...s0.ships[0]!.sailing, ahead: speed };
    if (turn) s = { ...s, steer: { heading: s.heading + turn, turn: 0 } };
    for (let k = 0; k < seconds * STEPS_PER_SECOND; k++) s = stepSailing(s, pose, wind, harm).sailing;
    return s;
  };
  const seconds = 20;
  const whole = sail(UNDAMAGED, seconds).ahead, dismasted = sail({ ...UNDAMAGED, draws: down.draws }, seconds).ahead;
  assert.ok(whole > 1 / 2, `whole, she gathers way (${whole.toFixed(2)} m/s)`);
  assert.ok(Math.abs(dismasted) < whole / 10, `dismasted, she makes none (${dismasted.toFixed(2)} m/s)`);
  const turn = 0.5, way = 3, steered = sail(UNDAMAGED, seconds, turn, way), adrift = sail({ ...UNDAMAGED, steered: false }, seconds, turn, way);
  assert.ok(Math.abs(steered.heading - Math.PI / 2) > turn / 2, 'steered, she comes round');
  assert.ok(Math.abs(adrift.heading - Math.PI / 2) < turn / 4 && adrift.helm === 0, 'with her steering gone the rudder trails and she holds on');
});

test('fire doubles at the table\'s pace, spreads, is put out by men fighting it, and unfought reaches the magazine in the table\'s time', () => {
  const mag = magazineSpace(), deck = shipPlan().spaces.findIndex((s) => s.id === 'passage');
  const run = (fires: Fire[], seconds: number, men = 0) => {
    let f = fires, magazine = false;
    const spread: number[] = [];
    for (let k = 0; k < seconds * STEPS_PER_SECOND && !magazine; k++) { const b = burnt(f, () => men); f = b.fires; spread.push(...b.spread); magazine = b.magazine; }
    return { fires: f, spread, magazine };
  };
  const minute = run(kindled([], deck), SECONDS_PER_MINUTE);
  const grown = minute.fires[0]!.size / FIRE.start, want = 2 ** (SECONDS_PER_MINUTE / FIRE.doubling);
  assert.ok(Math.abs(grown - want) < want * 0.01, `grew ${grown.toFixed(3)} times in a minute, the table ${want.toFixed(3)}`);
  assert.deepEqual(minute.spread, [], 'small, it keeps to its space');
  const big = run([{ space: deck, size: FIRE.spread }], 1);
  assert.ok(big.spread.length > 0 && big.fires.length > 1, 'at its spreading size it catches the spaces joined to it');
  assert.deepEqual(run(kindled([], deck), 10, 4).fires, [], 'four men put a fresh fire out');
  // Unfought, from a fire in the magazine itself (the nearest a fire can start), the powder catches after the table's doublings: three minutes or more.
  const tableTime = FIRE.doubling * Math.log2(FIRE.catch / FIRE.start);
  assert.ok(tableTime >= 3 * SECONDS_PER_MINUTE, `${tableTime.toFixed(0)} s`);
  const nearly = FIRE.catch / 2 ** (2 / FIRE.doubling);
  const lit = run([{ space: mag, size: nearly }], 3);
  assert.ok(lit.magazine && !run([{ space: mag, size: nearly }], 1).magazine, 'the powder goes up when the magazine\'s fire reaches the table\'s size, two seconds on');
});

test('a fire in her magazine is fought by the men there; with none fit to fight it her powder goes up', () => {
  const s0 = startMatch({ seed: 3, windForce: 0, windFrom: 0, ships: [{ x: 0, z: 0, heading: 0, canvas: 'bare' }] });
  const ship = s0.ships[0]!, wind = windAt(s0.wind, 0, 0, 0);
  const input: AftermathIn = { seed: 3, tick: 0, t: 0, ship: 0, pose: ship.motion.pose, sea: s0.sea, crew: ship.crew, sailing: ship.sailing, wind };
  const burning: Damage = { ...ship.damage, fires: [{ space: magazineSpace(), size: FIRE.catch * 0.999 }] };
  const after = (d: Damage) => {
    let out = stepAftermath(d, input);
    for (let k = 1; k < STEPS_PER_SECOND && !out.damage.blownUp; k++) out = stepAftermath(out.damage, { ...input, tick: k });
    return out;
  };
  const fought = after(burning);
  assert.ok(!fought.damage.blownUp && fought.damage.fires[0]!.size < burning.fires[0]!.size, 'the gunner\'s mate and his boys beat it down');
  // Every man badly hurt: no one fights it.
  const hurt = ship.crew.men.map((_, i) => i * 3 + 1);
  const gone = after({ ...burning, hurt });
  assert.ok(gone.damage.blownUp && gone.events.some((e) => e.what === 'blew up'), 'her powder goes up');
  const quiet = stepAftermath(startDamage(), input);
  assert.deepEqual(quiet.events, []);
  assert.equal(quiet.sailing, UNDAMAGED, 'an unhurt ship sails as she did');
});
