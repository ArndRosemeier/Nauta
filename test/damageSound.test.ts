/**
 * Damage heard (implementation plan N6.8): a ball striking her close by is a crash where it struck, on her own bus, with
 * a jolt; striking the other ship far off it is a thud heard after it by the speed of sound; of grape's many blows in a
 * step only the nearest few; splinters only near; a man struck makes no sound of his own; a mast going cracks and falls
 * with its rigging parting after it; her magazine going up is heard; fires crackle where they burn, louder as they
 * grow; the sea rushes in at her holes under the waterline, heard aboard her and louder below; foundering she breaks up.
 * Every take exists.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DamageWatch, damageHits, shipSpaceOf, type DamageHeard, type DamageScene, type HeardShip } from '../src/audio/damageHearing.ts';
import {
  BLOWS_A_STEP, BREAKUP, EXPLODE, FIRE, FIRE_BEDS, HIT_FAR, HIT_NEAR, INRUSH, INRUSH_BEDS, MAST_FALL, RIGGING_PARTS, ROPE, SPLINTERS,
} from '../src/audio/damageTuning.ts';
import type { DueShot } from '../src/audio/due.ts';
import { startDamage, type Aftermath, type Damage, type Hit } from '../src/sim/damage.ts';
import { founderTonnes } from '../src/sim/damage/flood.ts';
import type { Place } from '../src/sim/damage/meet.ts';
import { SPEED_OF_SOUND } from '../src/sim/rules/guns.ts';
import { startMotion, toWorld, type ShipPose } from '../src/sim/ship/motion.ts';
import { shipPlan } from '../src/sim/ship/plan.ts';
import { STEP_SECONDS } from '../src/sim/units.ts';
import { holesUnder } from './support/damage.ts';

const FRAME = 1 / 60;
const LEVEL: ShipPose = { ...startMotion(0, 0, 0).pose, pitch: 0, roll: 0, heave: 0 };
const at = (x: number): ShipPose => ({ ...LEVEL, x });
/** The ear on her quarterdeck at a man's eye (a place in her: along, across, height above her base). */
const EAR: Place = [-3.8, 0, 8.2];
/** A ball's blow at her starboard bulwark beside the ear. */
const BESIDE: Place = [-3, 3.5, 7];

const hit = (ship: number, what: Hit['what'], place: Place, tick = 30): Hit => ({ kind: 'hit', tick, ship, by: 1 - ship, gun: 0, what, at: place, id: 0 });

interface Got extends DueShot { readonly t: number }

/** Runs the watch from `from` for `seconds` with the ear aboard ship 0; every sound with when it is heard, the jolts and the last frame's beds. */
function listen(w: DamageWatch, ships: readonly HeardShip[], from: number, seconds: number, below = 0): { got: Got[]; jolts: DamageHeard['jolts'][number][]; beds: DamageHeard['beds'] } {
  const earShip = shipSpaceOf(EAR), ear = toWorld(ships[0]!.pose, earShip[0], earShip[1], earShip[2]);
  const out: DamageHeard = { shots: [], beds: [], jolts: [] }, got: Got[] = [], jolts: DamageHeard['jolts'][number][] = [];
  for (let t = from; t < from + seconds; t += FRAME) {
    const scene: DamageScene = { t, ear, earShip, aboard: 0, below, ships };
    w.struckAt(scene, out);
    for (const s of out.shots) got.push({ ...s, t: t + s.delay });
    jolts.push(...out.jolts);
  }
  return { got, jolts, beds: [...out.beds] };
}

const two = (mine: Partial<Damage> = {}, hers: Partial<Damage> = {}, apart = 300): HeardShip[] => [
  { pose: LEVEL, damage: { ...startDamage(), ...mine } },
  { pose: at(apart), damage: { ...startDamage(), ...hers } },
];

test('a ball striking her beside the ear: a crash on her own bus where it struck, at once, and a jolt away from it', () => {
  const w = new DamageWatch(1);
  w.keepDamage([hit(0, 'hole', BESIDE)]);
  const { got, jolts } = listen(w, two(), 1, 1);
  assert.deepEqual(got.map((g) => g.id), [HIT_NEAR.id]);
  assert.equal(got[0]!.bus, 'body');
  assert.ok(Math.abs(got[0]!.t - 1) < 0.03, `heard at ${got[0]!.t}`);
  // Struck to starboard: he is thrown to larboard; struck close, hard.
  assert.equal(jolts.length, 1);
  assert.ok(jolts[0]!.x < 0 && jolts[0]!.strength > 0.3, JSON.stringify(jolts[0]));
  // Where it struck: starboard of the ear in the world (she heads north, starboard is east).
  assert.ok(got[0]!.at[0] > 0);
});

test('a ball striking the other ship far off is a thud on the world bus, heard after it by the speed of sound', () => {
  const w = new DamageWatch(1), ships = two();
  w.keepDamage([hit(1, 'hole', [0, -3.5, 6])]);
  const { got, jolts } = listen(w, ships, 1, 2);
  assert.equal(got.length, 1);
  assert.equal(got[0]!.id, HIT_FAR.id);
  assert.equal(got[0]!.bus, 'world');
  const want = 1 + (300 - 3.5) / SPEED_OF_SOUND;
  assert.ok(Math.abs(got[0]!.t - want) < 0.05, `heard at ${got[0]!.t.toFixed(3)}, want about ${want.toFixed(3)}`);
  assert.equal(jolts.length, 0);
});

test("of grape's many blows in a step only the nearest few are heard; splinters only near; a man struck makes no sound", () => {
  const w = new DamageWatch(1);
  w.keepDamage(Array.from({ length: 9 }, (_, k) => hit(0, 'hole', [-6 + k, 3.5, 7])));
  w.keepDamage([hit(0, 'man', BESIDE), hit(1, 'splinters', [0, -3.5, 6])]);
  const { got } = listen(w, two(), 1, 2);
  assert.equal(got.length, BLOWS_A_STEP);
  assert.ok(got.every((g) => g.id === HIT_NEAR.id));
  assert.ok(!got.some((g) => g.id === SPLINTERS.id));
});

test('a mast going cracks and falls with its rigging parting after it, and jolts her; her magazine going up is heard', () => {
  const w = new DamageWatch(1);
  const fell: Aftermath = { kind: 'aftermath', tick: 30, ship: 0, what: 'fell', id: 0, side: 1 };
  const blew: Aftermath = { kind: 'aftermath', tick: 30, ship: 1, what: 'blew up', id: -1 };
  w.keepDamage([fell, blew]);
  const { got, jolts } = listen(w, two(), 1, 4);
  assert.equal(got.filter((g) => g.id === MAST_FALL.id).length, 1);
  assert.equal(got.filter((g) => g.id === ROPE.id).length, RIGGING_PARTS);
  const fall = got.find((g) => g.id === MAST_FALL.id)!;
  assert.ok(got.filter((g) => g.id === ROPE.id).every((r) => r.t >= fall.t), 'the rigging parts after the crack');
  assert.equal(jolts.length, 1);
  const boom = got.find((g) => g.id === EXPLODE.id);
  assert.ok(boom && Math.abs(boom.t - (1 + 300 / SPEED_OF_SOUND)) < 0.05, `explosion at ${boom?.t}`);
});

test('fires crackle where they burn, louder as they grow; the sea rushes in at her holes, louder below; foundering she breaks up', () => {
  const plan = shipPlan(), hold = plan.spaces.findIndex((s) => s.level === 'hold');
  const small = listen(new DamageWatch(1), two({ fires: [{ space: hold, size: 0.04 }] }), 1, FRAME).beds;
  const big = listen(new DamageWatch(1), two({ fires: [{ space: hold, size: 0.5 }] }), 1, FRAME).beds;
  assert.equal(small.length, 1);
  assert.ok(FIRE_BEDS.includes(small[0]!.id) && small[0]!.bus === 'body');
  assert.ok(Math.abs(small[0]!.level - FIRE.gain * 0.2) < 1e-9 && big[0]!.level > small[0]!.level);
  // The other ship's fire is heard too, on the world bus.
  const hers = listen(new DamageWatch(1), two({}, { fires: [{ space: hold, size: 0.25 }] }), 1, FRAME).beds;
  assert.equal(hers[0]!.bus, 'world');

  const holes = holesUnder(1, 4);
  const deck = listen(new DamageWatch(1), two({ holes }), 1, FRAME, 0).beds.filter((b) => INRUSH_BEDS.includes(b.id));
  const below = listen(new DamageWatch(1), two({ holes }), 1, FRAME, 1).beds.filter((b) => INRUSH_BEDS.includes(b.id));
  assert.equal(below.length, 3, 'the three nearest holes');
  assert.ok(below[0]!.level > deck[0]!.level && Math.abs(deck[0]!.level / below[0]!.level - INRUSH.onDeck) < 1e-9);
  // Her holes are not heard rushing from the other ship.
  assert.equal(listen(new DamageWatch(1), two({}, { holes }), 1, FRAME, 1).beds.filter((b) => INRUSH_BEDS.includes(b.id)).length, 0);

  const sound = listen(new DamageWatch(1), two({ flooded: [0, 0] }), 1, FRAME).beds.filter((b) => b.id === BREAKUP.id);
  const sinking = listen(new DamageWatch(1), two({ flooded: [founderTonnes() / 2, founderTonnes() / 2] }), 1, FRAME).beds.filter((b) => b.id === BREAKUP.id);
  assert.equal(sound.length, 0);
  assert.ok(sinking.length === 1 && Math.abs(sinking[0]!.level - BREAKUP.gain) < 1e-9);
});

test('a blow heard too late is left out; the same seed hears the rigging part at the same moments', () => {
  const w = new DamageWatch(1);
  w.keepDamage([hit(0, 'hole', BESIDE)]);
  assert.equal(listen(w, two(), 2, 1).got.length, 0);
  const fell: Aftermath = { kind: 'aftermath', tick: 30, ship: 0, what: 'fell', id: 0, side: 1 };
  const times = (seed: number) => { const v = new DamageWatch(seed); v.keepDamage([fell]); return listen(v, two(), 1, 3).got.map((g) => g.t.toFixed(4)).join(); };
  assert.equal(times(5), times(5));
  assert.notEqual(times(5), times(6));
});

test('every take of damage exists', () => {
  const index = JSON.parse(readFileSync(new URL('../public/sound/index.json', import.meta.url), 'utf8')) as { sounds: Record<string, { files: string[] }> };
  for (const id of [...damageHits(), ...FIRE_BEDS, ...INRUSH_BEDS, BREAKUP.id]) assert.ok(index.sounds[id]?.files.length, id);
});

// The ticks the events carry are steps (30 a second); a blow at tick 30 is struck at 1 s.
assert.equal(30 * STEP_SECONDS, 1);
