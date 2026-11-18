/**
 * Hits (implementation plan N6.1): the same shot and seed give the same damage; a ball spends its punch in order along
 * its path; the design's ranges for piercing hold; every effect is reachable (a hole, a lodged ball, splinters, a gun
 * dismounted, a man struck, a spar wounded, a line cut, a sail holed); splinters strike only men ahead of the hole;
 * chain cuts more than round shot; a ball through her wheel shoots her steering away and one fired close may set her
 * afire (N6.2); the step puts fired shots in flight and traces them; a ball in by her stern rakes her (N7.5a). That no state under `owners`
 * is written elsewhere is the guards' test (test/guards.test.ts).
 *
 * Shots here fly straight at a set speed through a ship lying still (built for the purpose, as CHECKS.md asks): what a
 * ball meets is the geometry's and the punch's, not the flight's, which shot.test.ts checks.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encode } from '../src/sim/codec.ts';
import { manAt } from '../src/sim/crew/crew.ts';
import { brigRoster } from '../src/sim/crew/roster.ts';
import { cellState, GONE, harmOf, holeAt, isCut, launch, punchAt, stepHits, woundsTo, type Damage, type Flying, type HitShip, type Hit } from '../src/sim/damage.ts';
import { sparParts, type Place } from '../src/sim/damage/meet.ts';
import { battery, gunAt } from '../src/sim/guns/guns.ts';
import { fly, type Shot, type Vec } from '../src/sim/guns/shot.ts';
import { MUZZLE_SPEED, PATH_STEP, SHOT, type ShotKind } from '../src/sim/rules/guns.ts';
import { HAMMOCKS, HURT, PIERCE, SPLINTER_REACH, TIMBER, WHEEL_HIGH } from '../src/sim/rules/damage.ts';
import { ON_CENTRELINE } from '../src/sim/rules/fittings.ts';
import { sideTop, weatherDeck } from '../src/sim/ship/hull.ts';
import { LOAD_WATERLINE, type GunKind } from '../src/sim/rules/ships.ts';
import { toWorld } from '../src/sim/ship/motion.ts';
import { shipPlan } from '../src/sim/ship/plan.ts';
import { hashState, startMatch, type SimState } from '../src/sim/state.ts';
import { step } from '../src/sim/step.ts';

const SEED = 1805;
/** Ship 0 fires from far off (she is never traced against her own shot); ship 1 lies still, heading north, at the origin. */
const MATCH = startMatch({ seed: SEED, windForce: 3, windFrom: 0, ships: [{ x: -3000, z: 0, heading: 0 }, { x: 0, z: 0, heading: 0 }] });
const TARGET = 1;
const CARRONADE = battery().findIndex((g) => g.gun === 'carronade');
/** Speeds of round shot from a carronade at the design's ranges, m/s (as rules/damage.ts gives them): 100 m and 400 m. */
const AT_100 = 221;
const AT_400 = 196;
/** A speed at which a carronade's ball cannot pierce her side even square on, m/s. */
const SPENT = 180;
/** Across her from well off one side to well off the other, m. */
const OFF = 14;
/** Heights above her base, m: between her decks (above her waterline, below her wale), and half a metre over her deck amidships. */
const BETWEEN_DECKS = 4.1;
const OVER_DECK = 5.6;
/** A place along her clear of her masts, ladders and hatches, m forward of the mainmast. */
const CLEAR = 3.1;

const ships = (): HitShip[] => MATCH.ships.map((s) => ({ pose: s.motion.pose, crew: s.crew, canvas: s.sailing.canvas, guns: s.guns, damage: s.damage }));
const POSE = MATCH.ships[TARGET]!.motion.pose;
/** A place in her as a world point. */
const world = (p: Place): Vec => toWorld(POSE, p[1], p[2] - LOAD_WATERLINE, -p[0]);

/** A shot of `balls` balls flying straight from one place in her to another and on, at `speed`. */
function straight(kind: ShotKind, from: Place, to: Place, speed: number, balls = 1): Shot {
  const a = world(from), b = world(to), length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const n = Math.ceil(length / (speed * PATH_STEP));
  const path = Array.from({ length: n + 1 }, (_, i): Vec => { const f = (i * speed * PATH_STEP) / length; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; });
  return { shot: kind, span: SHOT[kind].span, balls: Array.from({ length: balls }, () => ({ path, splashes: [], touches: [], ends: n * PATH_STEP })) };
}

interface Run { readonly events: Hit[]; readonly damage: Damage; readonly guns: readonly number[]; readonly spent: (readonly number[])[] }

/** A shot fired by gun `gun` of ship 0 in tick `tick`, stepped until it is spent, from ships as they lie (`start`). */
function fire(shot: Shot, gun = CARRONADE, seed = SEED, start: HitShip[] = ships(), tick = 0): Run & { readonly ships: HitShip[] } {
  let flying: Flying[] = launch([], { kind: 'fired', tick, ship: 0, gun, fired: shot });
  let now = start;
  const events: Hit[] = [], spent: (readonly number[])[] = [];
  for (let k = tick + 1; flying.length > 0; k++) {
    const out = stepHits({ seed, tick: k, flying, ships: now });
    events.push(...out.events);
    now = now.map((s, i) => ({ ...s, damage: out.damage[i]!, guns: out.guns[i]! }));
    flying = out.flying;
    if (flying[0]) spent.push(flying[0].spent);
  }
  return { events, damage: now[TARGET]!.damage, guns: now[TARGET]!.guns, spent, ships: now };
}

/** A carronade's round shot square across her, from larboard to starboard, at a height and speed. */
const across = (h: number, speed: number, kind: ShotKind = 'round', balls = 1): Shot => straight(kind, [CLEAR, -OFF, h], [CLEAR, OFF, h], speed, balls);

/** Grape across her deck at a gun's place, at the height of the crew's chests. */
const GUN_AT = battery()[CARRONADE + 2]!;
const grapeOverDeck = (): Shot => straight('grape', [GUN_AT.along, -OFF, OVER_DECK + 0.6], [GUN_AT.along, OFF, OVER_DECK + 0.6], AT_100, SHOT.grape.balls);

test('the same shot and seed give the same damage, as plain data the state can carry', () => {
  const a = fire(grapeOverDeck()), b = fire(grapeOverDeck());
  assert.ok(a.events.length > 0, 'the grape struck her');
  assert.deepEqual(b.events, a.events);
  assert.deepEqual(b.damage, a.damage);
  assert.deepEqual(encode(b.damage), encode(a.damage));
});

test('a ball spends its punch in order along its path: through both sides close in, lodged in the far side farther off, in the near side when spent', () => {
  const timber = (r: Run) => r.events.filter((e) => e.what === 'hole' || e.what === 'lodged').map((e) => `${e.what} ${e.at[1] < 0 ? 'larboard' : 'starboard'}`);
  assert.deepEqual(timber(fire(across(BETWEEN_DECKS, AT_100))), ['hole larboard', 'hole starboard']);
  assert.deepEqual(timber(fire(across(BETWEEN_DECKS, AT_400 + (AT_100 - AT_400) / 2))), ['hole larboard', 'lodged starboard']);
  assert.deepEqual(timber(fire(across(BETWEEN_DECKS, SPENT))), ['lodged larboard']);
  // Everything it did lies along its line in the order it flew; what it has spent only grows, and once stopped it is gone.
  const r = fire(across(BETWEEN_DECKS, AT_100));
  r.events.forEach((e, i) => { if (i > 0) assert.ok(e.at[1] >= r.events[i - 1]!.at[1] - 1e-9, `${e.what} after ${r.events[i - 1]!.what}`); });
  const spent = r.spent.map((s) => s[0]!).filter((s) => s !== GONE);
  spent.forEach((s, i) => { if (i > 0) assert.ok(s >= spent[i - 1]!); });
  assert.ok(Math.max(...spent) >= 2 * TIMBER.side * 1000 * 0.99, `through both sides it spent ${Math.max(...spent)} mm`);
  const lodged = fire(across(BETWEEN_DECKS, SPENT));
  assert.ok(lodged.events.every((e) => e.at[1] <= lodged.events.find((x) => x.what === 'lodged')!.at[1]), 'nothing after it lodged');
});

/** A ball's speed `range` m from a muzzle on its flight at the gun's muzzle speed (fired level high above the sea, so it is not cut short). */
function speedAt(kind: ShotKind, gun: GunKind, range: number): number {
  const v = MUZZLE_SPEED[gun] * SHOT[kind].speed, f = fly(kind, gun, [0, HIGH_ABOVE_SEA, 0], [v, 0, 0], null, 0);
  const i = f.path.findIndex((p) => p[0] >= range), a = f.path[i - 1]!, b = f.path[i]!;
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / PATH_STEP;
}
const HIGH_ABOVE_SEA = 200;

test('the design\'s ranges: round shot pierces as the design says, chain never her side, grape nothing thicker than a bulwark', () => {
  const punch = (kind: ShotKind, gun: GunKind, range: number) => punchAt(kind, gun, speedAt(kind, gun, range));
  assert.ok(punch('round', 'carronade', 400) >= TIMBER.side, 'a 32-pound ball through her side at 400 m');
  assert.ok(punch('round', 'carronade', 100) >= 2 * TIMBER.side, 'and through both sides at 100 m');
  assert.ok(punch('round', 'carronade', 700) < TIMBER.side, 'but not her side at 700 m');
  assert.ok(punch('round', 'long6', 150) >= TIMBER.side, 'a 6-pound ball through her side at 150 m');
  assert.ok(punch('round', 'long6', 200) < TIMBER.side, 'not at 200 m');
  assert.ok(punch('round', 'long6', 700) >= TIMBER.bulwark, 'through a bulwark at 700 m');
  for (const gun of ['carronade', 'long6'] as const) {
    assert.ok(punchAt('chain', gun, MUZZLE_SPEED[gun]) < TIMBER.side, `${gun} chain never pierces her side`);
    assert.ok(punch('chain', gun, 250) >= TIMBER.bulwark, `${gun} chain through a bulwark at 250 m`);
    assert.ok(punchAt('grape', gun, MUZZLE_SPEED[gun]) < TIMBER.side, `${gun} grape never pierces her side`);
    assert.ok(punch('grape', gun, 100) >= TIMBER.bulwark, `${gun} grape through a bulwark at 100 m`);
  }
  for (const shares of Object.values(HURT)) assert.ok(Math.abs(shares.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.ok(Object.values(PIERCE).every((row) => Object.values(row).every((p) => p.fast[0] > p.slow[0] && p.fast[1] > p.slow[1])));
});

/** Across her rig a little aslant, at the height of her main topsail (set under battle sail), through the doubling of her mainmast and topmast. */
const RIG_H = 20;
const RIG_SLANT = 2.5;
const throughRig = (kind: ShotKind): Shot => straight(kind, [-0.5 - RIG_SLANT, -OFF, RIG_H], [-0.5 + RIG_SLANT, OFF, RIG_H], AT_100);
/** Into a starboard carronade through her port, at the height of the gun. */
function intoGun(): { shot: Shot; gun: number } {
  const gun = battery().findIndex((g) => g.side > 0 && g.gun === 'carronade' && g.along > 0), g = battery()[gun]!, h = (g.sill + g.top) / 2 - 0.2;
  return { shot: straight('round', [g.along, OFF, h], [g.along, -OFF, h], AT_100), gun };
}

test('every effect is reachable: holes, lodged balls, splinters, a gun dismounted, men struck, spars wounded, lines cut, sails holed', () => {
  const seen = new Set<string>();
  const runs = [fire(across(BETWEEN_DECKS, AT_100)), fire(across(BETWEEN_DECKS, SPENT)), fire(grapeOverDeck()), fire(across(OVER_DECK, AT_100)), fire(throughRig('chain')), fire(throughRig('round'))];
  const gunShot = intoGun(), intoIt = fire(gunShot.shot);
  for (const r of [...runs, intoIt]) for (const e of r.events) if (e.what !== 'fire') seen.add(e.what);
  assert.deepEqual([...seen].sort(), ['gun', 'hole', 'line', 'lodged', 'man', 'sail', 'spar', 'splinters']);
  // What the events say is what the state keeps.
  assert.ok(gunAt(intoIt.guns, gunShot.gun).dismounted, 'the gun the ball met is dismounted');
  for (const r of runs) {
    for (const e of r.events) {
      if (e.what === 'line') assert.ok(isCut(r.damage, e.id));
      if (e.what === 'spar') assert.ok(woundsTo(r.damage, e.id) >= 1 && e.id < sparParts().length);
      if (e.what === 'sail') assert.ok(r.damage.rent[e.id]! >= 1);
      if (e.what === 'man') assert.ok(harmOf(r.damage, e.id) !== null);
    }
    // Each hole is read back in its own cell, the timber the event names.
    const kinds = { side: 'planking', wale: 'planking', bulwark: 'bulwark', weather: 'deck', berth: 'deck' } as const;
    const holes = r.events.filter((e) => (e.what === 'hole' || e.what === 'lodged') && e.id >= 0);
    assert.equal(r.damage.holes.length, holes.length);
    r.damage.holes.map(holeAt).forEach((h, i) => {
      const cell = shipPlan().cells[h.cell]!, e = holes[i]!;
      assert.equal(h.cell, e.id);
      assert.equal(cell.kind, kinds[e.part!]);
      assert.equal(h.lodged, e.what === 'lodged');
      assert.ok(h.u <= cell.fore - cell.aft + 0.04 && h.v <= cell.to - cell.from + 0.04, `a hole inside its ${cell.kind} cell`);
      assert.notEqual(cellState(r.damage, cell), 'sound');
    });
  }
});

test('splinters strike only men ahead of where the ball came through, within their reach; a man killed is struck no more', () => {
  const roster = brigRoster(), crew = MATCH.ships[TARGET]!.crew;
  const placeOf = (man: number): Place => { const { spot, height } = manAt(crew.men[man]!, roster[man]!.post); return [spot.along, spot.across, height]; };
  let splintered = 0;
  for (const seed of [1, 2, 3, 4]) {
    const r = fire(across(OVER_DECK, AT_100), CARRONADE, seed);
    const holes = r.events.filter((e) => e.what === 'splinters');
    const killed = new Set<number>();
    for (const e of r.events) {
      if (e.what !== 'man') continue;
      assert.ok(!killed.has(e.id), `man ${e.id} struck after he was killed`);
      if (e.harm === 'killed') killed.add(e.id);
      if (e.cause !== 'splinter') continue;
      splintered++;
      const p = placeOf(e.id);
      // Within reach of a hole (to his middle, a metre over his feet) and on the side the ball went on to.
      assert.ok(holes.some((h) => Math.hypot(p[0] - h.at[0], p[1] - h.at[1], p[2] + 1 - h.at[2]) <= SPLINTER_REACH && p[1] > h.at[1]), `man ${e.id} splintered out of reach or behind the ball`);
    }
  }
  assert.ok(splintered > 0, 'splinters struck someone');
});

test('a ball through her wheel shoots her steering away; a ball fired close may set her afire where it struck', () => {
  const wheel = ON_CENTRELINE.wheel, h = weatherDeck(wheel, 0) + WHEEL_HIGH;
  const r = fire(straight('round', [wheel, -OFF, h], [wheel, OFF, h], AT_100));
  assert.ok(r.events.some((e) => e.what === 'steering') && !r.damage.steering, 'her steering is shot away');
  // Fired from within WAD_RANGE (the shots here start 14 m off her middle), one ball in about twenty through her side sets her afire.
  let afire: Run | null = null;
  for (let seed = 1; seed < 200 && !afire; seed++) { const run = fire(across(BETWEEN_DECKS, AT_100), CARRONADE, seed); if (run.damage.fires.length > 0) afire = run; }
  assert.ok(afire, 'some ball set her afire');
  const started = afire.events.find((e) => e.what === 'fire')!;
  assert.deepEqual(afire.damage.fires.map((f) => f.space), [started.id]);
  assert.equal(shipPlan().spaces[started.id]!.level, 'berth', 'between her decks, where it came through');
});

test('chain cuts more of her rigging than round shot on the same path', () => {
  const cuts = (kind: ShotKind) => fire(throughRig(kind)).events.filter((e) => e.what === 'line' || e.what === 'spar' || e.what === 'sail').length;
  assert.ok(cuts('chain') > cuts('round'), `chain ${cuts('chain')}, round ${cuts('round')}`);
});

test('the step puts a gun\'s shot in flight and traces it through the other ship; one this machine never saw fired is let go', () => {
  const run = (from: SimState) => {
    let s = from, struck = 0;
    for (let k = 0; k < STEPS && (k === 0 || s.flying.length > 0); k++) { const r = step(s); s = r.state; struck += r.events.filter((e) => e.kind === 'hit').length; }
    return { s, struck };
  };
  const fired = { kind: 'fired', tick: 0, ship: 0, gun: CARRONADE, fired: across(BETWEEN_DECKS, AT_100) } as const;
  const a = run({ ...MATCH, flying: launch([], fired) }), b = run({ ...MATCH, flying: launch([], fired) });
  assert.ok(a.struck > 0 && a.s.ships[TARGET]!.damage.holes.length === 2, 'both her sides holed');
  assert.equal(a.s.flying.length, 0);
  assert.equal(hashState(a.s), hashState(b.s));
  // A shot from a tick no machine fired in has no flight here: it is dropped and does nothing.
  const unknown = stepHits({ seed: SEED, tick: 1, flying: [{ by: 0, gun: CARRONADE, tick: -1, spent: [0] }], ships: ships() });
  assert.equal(unknown.flying.length, 0);
  assert.equal(unknown.events.length, 0);
});
/** Steps the integration test runs at most (a ball crosses the 3 km between the ships' places well inside it). */
const STEPS = 120;

/** From well astern of her to well ahead, m along. */
const AHEAD = 30;
test('a ball in by her stern rakes her: it travels the length of her battery, dismounting more guns than one across her, and its splinters strike more', () => {
  const g = battery().find((p) => p.side > 0 && p.gun === 'carronade')!, h = (g.sill + g.top) / 2 - 0.2;
  const line = (g.footprint.port + g.footprint.starboard) / 2;
  let raked = { guns: 0, men: 0 }, square = { guns: 0, men: 0 };
  // Square into her side at a gun (`intoGun`), and from astern along the line of her starboard guns at their height.
  const count = (r: Run, was: { guns: number; men: number }) => ({ guns: was.guns + r.events.filter((e) => e.what === 'gun').length, men: was.men + r.events.filter((e) => e.what === 'man').length });
  for (const seed of [1, 2, 3, 4]) {
    raked = count(fire(straight('round', [-AHEAD, line, h], [AHEAD, line, h], AT_100), CARRONADE, seed), raked);
    square = count(fire(intoGun().shot, CARRONADE, seed), square);
  }
  // A ball fired into her side at one gun: through the port it dismounts that gun and stops.
  assert.ok(raked.guns > square.guns && raked.men > 2 * square.men, `raking: ${raked.guns} guns, ${raked.men} men; into her side: ${square.guns} guns, ${square.men} men`);
});

test('at quarters the hammocks in the waist\'s nettings hold grape as the old bulwark did; round shot goes through them as if they were not there', () => {
  // Across her waist over its rail, through both sides' nettings, from a little above the crew's heads down to them.
  const along = WAIST_AT, top = sideTop(along), over = (kind: ShotKind) => straight(kind, [along, -OFF, top + HAMMOCKS_BAND], [along, OFF, top + HAMMOCKS_BAND], AT_100, kind === 'grape' ? SHOT.grape.balls : 1);
  const at = (quarters: boolean) => ships().map((s) => ({ ...s, quarters }));
  const spent = (r: Run) => Math.max(...r.spent.flatMap((s) => s.filter((x) => x !== GONE)));
  const grape = { open: fire(over('grape'), CARRONADE, SEED, at(false)), stowed: fire(over('grape'), CARRONADE, SEED, at(true)) };
  assert.ok(spent(grape.stowed) - spent(grape.open) >= HAMMOCKS.thick * 1000 * 0.99, `grape spent ${spent(grape.open)} mm open, ${spent(grape.stowed)} mm with the hammocks stowed`);
  const round = { open: fire(over('round'), CARRONADE, SEED, at(false)), stowed: fire(over('round'), CARRONADE, SEED, at(true)) };
  assert.deepEqual(round.stowed.events, round.open.events);
  assert.deepEqual(round.stowed.spent, round.open.spent);
});
/** Over the waist's rail, in the hammocks' band, m above the top of her side; in the waist between two of its ports, m forward of the mainmast. */
const HAMMOCKS_BAND = 0.35;
const WAIST_AT = 5.2;
