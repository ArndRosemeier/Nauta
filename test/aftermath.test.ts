/**
 * What damage leads to (implementation plan N6.2): a hole below the waterline floods her at the rule's rate and lists
 * her; the carpenter's crew at the pumps holds one and a half waterline holes and hands to the pumps three (N7.5a), four sink
 * her against the crew alone and, plugged, only weep; a spar falls with three wounds in a part, or with its weather shrouds gone and the
 * wind on them, taking all it carries and the men on it, or with its stay gone and still aback after a while (in danger
 * first), and a dismasted ship cannot sail; fire doubles at the table's
 * pace, spreads, is put out by men fighting it and, unfought, reaches the magazine in the table's time; with her
 * steering shot away she answers no helm.
 *
 * Each from the smallest case that shows it (CHECKS.md): the rules on their own where minutes are needed, the step
 * for at most a minute in all.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holeCode, startDamage, stepAftermath, type Aftermath, type AftermathIn, type Damage } from '../src/sim/damage.ts';
import { fallsDue, standingOf } from '../src/sim/damage/fall.ts';
import { burnt, kindled, magazineSpace, type Fire } from '../src/sim/damage/fire.ts';
import { founderTonnes, inflow, pumped, sinkingFor } from '../src/sim/damage/flood.ts';
import { sparParts } from '../src/sim/damage/meet.ts';
import { REPAIRS } from '../src/sim/rules/crew.ts';
import { ABACK_FALLS, AT_WATERLINE, FIGHT_AT_HAND, FIRE, PUMPING, WASH, WEEP } from '../src/sim/rules/damage.ts';
import { shipPlan } from '../src/sim/ship/plan.ts';
import { rigPlan } from '../src/sim/ship/rig.ts';
import { stepSailing, UNDAMAGED, type SailingDamage } from '../src/sim/ship/sailing.ts';
import { startMatch, type SimState } from '../src/sim/state.ts';
import { step } from '../src/sim/step.ts';
import { STEPS_PER_SECOND } from '../src/sim/units.ts';
import { windAt } from '../src/sim/wind.ts';
import { spotUnder } from './support/damage.ts';

/** The carpenter's crew at the pumps while he and his mate plug, and "Hands to the pumps" (rules/crew.ts). */
const CARPENTERS_CREW = 4;
const HANDS_TO_THE_PUMPS = 8;
const SECONDS_PER_MINUTE = 60;
/** A fire party (rules/crew.ts). */
const FIRE_PARTY = REPAIRS.fight.men;
/** Four holes at her waterline: more than the carpenter's crew can hold, a hole more than hands to the pumps can. */
const FOUR = 4;
/** With the carpenter's crew alone at the pumps, four such holes founder her within this many minutes; hands to the pumps hold her half as long again. */
const FOUNDERS_WITHIN = 20;
const LONGER = 1.5;

test('the carpenter\'s crew at the pumps holds one and a half holes at her waterline, hands to the pumps three; a hole a metre down is more', () => {
  const hole = inflow('round', 'carronade', AT_WATERLINE), crew = pumped(CARPENTERS_CREW, PUMPING.least + 1), hands = pumped(HANDS_TO_THE_PUMPS, PUMPING.least + 1);
  assert.ok(pumped(0, PUMPING.least + 1) === 0 && pumped(CARPENTERS_CREW, PUMPING.least) === 0, 'manned, they draw while there is water above the well');
  assert.ok(Math.abs(crew - PUMPING.holds * hole) < 1e-9 && Math.abs(hands - 2 * crew) < 1e-9, `the crew clears ${crew.toFixed(3)} t/s, hands ${hands.toFixed(3)}, a hole lets in ${hole.toFixed(3)}`);
  assert.ok(inflow('round', 'long6', AT_WATERLINE) < hole / 2, 'a 6-pound shot hole lets in a fraction of a 32-pound one');
  assert.ok(inflow('round', 'carronade', 1) > 1.5 * hole, 'a 32-pound shot hole a metre down lets in more');
  assert.equal(inflow('round', 'carronade', 1, 1), 0, 'once the water inside stands as high as the sea outside, none comes in');
});

/** Minutes until four waterline holes (weeping by `share`) founder her against `men` at the pumps, in steps of a second, the holes sinking deeper as her water sinks her; Infinity if not within `most`. */
function foundering(men: number, share: number, most: number): number {
  const founders = founderTonnes();
  let water = 0;
  for (let t = 0; t < most * SECONDS_PER_MINUTE; t++) {
    water = Math.max(0, water + FOUR * share * inflow('round', 'carronade', AT_WATERLINE + sinkingFor(water)) - pumped(men, water));
    if (water >= founders) return t / SECONDS_PER_MINUTE;
  }
  return Infinity;
}

test('four holes at her waterline founder her against the carpenter\'s crew; hands to the pumps hold her far longer; plugged, they only weep and hands to the pumps clear her', () => {
  const crew = foundering(CARPENTERS_CREW, 1, FOUNDERS_WITHIN), hands = foundering(HANDS_TO_THE_PUMPS, 1, LONGER * FOUNDERS_WITHIN);
  assert.ok(crew < FOUNDERS_WITHIN && hands > LONGER * crew, `foundered in ${crew.toFixed(1)} min, with hands to the pumps in ${hands.toFixed(1)} min`);
  // Plugged: they weep, and hands at the pumps clear what is in her.
  const half = founderTonnes() / 2;
  let water = half;
  for (let k = 0; k < FOUNDERS_WITHIN * SECONDS_PER_MINUTE; k++) water += FOUR * WEEP * inflow('round', 'carronade', AT_WATERLINE + sinkingFor(water)) - pumped(HANDS_TO_THE_PUMPS, water);
  assert.ok(water < half / 2, `pumped down to ${water.toFixed(0)} t of ${half.toFixed(0)}`);
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
  const expected = (3 * inflow('round', 'carronade', 1 / 2 + WASH) - pumped(CARPENTERS_CREW, l + s)) * seconds;
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
  // A contest (N7.5a): the two men at hand cannot hold a fresh fire; a fire party of eight puts it out within a minute.
  assert.ok(run(kindled([], deck), 10, FIGHT_AT_HAND).fires[0]!.size > FIRE.start, 'the men at hand do not hold a fresh fire');
  assert.deepEqual(run(kindled([], deck), SECONDS_PER_MINUTE, FIRE_PARTY).fires, [], 'a fire party puts it out');
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
  // Every man badly hurt: no one fights it.
  const hurt = ship.crew.men.map((_, i) => i * 3 + 1);
  const fresh: Damage = { ...ship.damage, fires: [{ space: magazineSpace(), size: FIRE.start }] };
  const fought = after(fresh), unfought = after({ ...fresh, hurt });
  assert.ok(fought.damage.fires[0]!.size < unfought.damage.fires[0]!.size, 'the gunner\'s mate and his boys beat at it');
  const gone = after({ ...burning, hurt });
  assert.ok(gone.damage.blownUp && gone.events.some((e) => e.what === 'blew up'), 'her powder goes up');
  const quiet = stepAftermath(startDamage(), input);
  assert.deepEqual(quiet.events, []);
  assert.equal(quiet.sailing, UNDAMAGED, 'an unhurt ship sails as she did');
});

test('a mast whose stay is shot away while aback is in danger, and falls only if she stays aback (design thread 2026-11-18)', () => {
  const s0 = startMatch({ seed: 3, windForce: 3, windFrom: 0, ships: [{ x: 0, z: 0, heading: Math.PI / 2, canvas: 'plain' }] });
  const ship = s0.ships[0]!, wind = windAt(s0.wind, 0, 0, 0);
  const input: AftermathIn = { seed: 3, tick: 0, t: 0, ship: 0, pose: ship.motion.pose, sea: s0.sea, crew: ship.crew, sailing: ship.sailing, wind };
  // Head to wind, every square sail is aback.
  const aback = { ...input, sailing: { ...ship.sailing, heading: 0 } };
  const stayCut: Damage = { ...startDamage(), cut: [lineIndex('fore-stay')] };
  const run = (d: Damage, inp: AftermathIn, seconds: number) => {
    const events: Aftermath[] = [];
    let out = { damage: d };
    for (let k = 0; k < seconds * STEPS_PER_SECOND; k++) { const r = stepAftermath(out.damage, { ...inp, tick: k }); events.push(...r.events); out = r; }
    return { damage: out.damage, events };
  };
  const fore = partOf('fore-mast', 1), main = partOf('main-mast', 1), [most, least] = ABACK_FALLS.seconds;
  assert.deepEqual(run(stayCut, input, 1).events, [], 'drawing, she keeps it: no danger');
  const first = run(stayCut, aback, 1);
  assert.deepEqual(first.events.map((e) => [e.what, e.id]), [['danger', fore]], 'aback, the master cries it once');
  assert.deepEqual(first.damage.danger.map(([part]) => part), [fore]);
  const held = run(stayCut, aback, least);
  assert.ok(!held.events.some((e) => e.what === 'fell'), `it stands at least ${least} s`);
  const filled = run(held.damage, input, 1);
  assert.deepEqual(filled.damage.danger, [], 'filled, it is out of danger');
  const lost = run(stayCut, aback, most + 1);
  assert.deepEqual(lost.events.filter((e) => e.what === 'fell').map((e) => e.id), [fore], `still aback after at most ${most} s it falls, and the main does not go with it`);
  assert.deepEqual(lost.events.filter((e) => e.what === 'danger').map((e) => e.id), [fore, main], 'the main stay made fast to it, the main comes into danger in its turn');
});
