/**
 * The men under fire (implementation plan N6.6): the wounded carried below between their bearers, repair parties
 * crowded about their work and not inside one another, pain that passes for the lightly wounded and stays for the
 * badly hurt, and the violence setting: the same fall at each level, blood and stained shirts from plain up, the killed
 * taken below at mild. Each from a state built for the purpose (CHECKS.md).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { casualtiesOf } from '../src/app/scars.ts';
import { JOB_CLIPS, carryOf, manDrawn, manSeed, newManDrawn, type ManDrawn } from '../src/app/crewDrawn.ts';
import { FACES, PAIN_SECONDS, facesNow, type FaceWhy } from '../src/app/faces.ts';
import { LAID_SECONDS, SHOWN, TAKEN_SECONDS, TRAIL_EVERY, bloodOf, stainOf, stained, takenBelow } from '../src/app/violence.ts';
import { VIOLENCE_LEVELS } from '../src/app/settings.ts';
import { startDamage, type Damage } from '../src/sim/damage.ts';
import { atWork, NO_ACT } from '../src/sim/crew/crew.ts';
import { brigRoster } from '../src/sim/crew/roster.ts';
import { HARMS } from '../src/sim/rules/damage.ts';
import { parseOrder } from '../src/sim/orders.ts';
import { startMatch, type SimShip, type SimState } from '../src/sim/state.ts';
import { step } from '../src/sim/step.ts';
import { STEPS_PER_SECOND } from '../src/sim/units.ts';
import { musterCrew } from './support/muster.ts';

const roster = brigRoster();
const [WOUNDED, BADLY, KILLED] = [HARMS.indexOf('wounded'), HARMS.indexOf('badly'), HARMS.indexOf('killed')];
const hurtCode = (man: number, harm: number): number => man * HARMS.length + harm;
/** Two men nearer than this stand in one another, m. */
const APART = 0.25;

/** One ship lying still in a calm, her crew at quarters, with the damage `damage`. */
function lying(damage: Partial<Damage>): SimState {
  const state = startMatch({ seed: 5, windForce: 0, windFrom: 0, ships: [{ x: 0, z: 0, heading: Math.PI / 2, canvas: 'bare' }] });
  return { ...state, ships: state.ships.map((s) => ({ ...s, crew: musterCrew(), damage: { ...startDamage(), ...damage } })) };
}
/** The state stepped on for `seconds`, `each` called with the ship before and after every step. */
function run(state: SimState, seconds: number, each: (before: SimShip, after: SimShip) => void, orders = [] as ReturnType<typeof parseOrder>[]): SimState {
  let s = state;
  for (let k = 0; k < seconds * STEPS_PER_SECOND; k++) {
    const before = s.ships[0]!;
    s = step(s, k === 0 ? orders.filter((o): o is Exclude<typeof o, string> => typeof o !== 'string') : []).state;
    each(before, s.ships[0]!);
  }
  return s;
}
const drawn = (from: SimShip, to: SimShip, man: number, f = 1): ManDrawn => manDrawn(from, to, f, man, roster[man]!, manSeed(0, man), newManDrawn());

test('a badly wounded man is carried below held between his two bearers at their hip height, the bearers carrying', () => {
  const atGuns = roster.findIndex((m) => m.gun !== null && m.part !== 'waist'), hurt = hurtCode(atGuns, BADLY);
  let carried = 0, checked = 0;
  run(lying({ hurt: [hurt] }), 30, (_, after) => {
    const task = carryOf(after.crew, atGuns);
    if (!task || !after.crew.men[atGuns]!.going) return;
    carried++;
    const man = drawn(after, after, atGuns), [a, b] = task.hands.map((i) => drawn(after, after, i));
    assert.equal(man.clip, 'death', 'he lies');
    for (const bearer of [a!, b!]) assert.equal(bearer.clip, JOB_CLIPS.carry, 'the bearers walk carrying');
    if (a!.space === b!.space && a!.way === b!.way) {
      assert.ok(Math.hypot(man.x - (a!.x + b!.x) / 2, man.z - (a!.z + b!.z) / 2) < 1e-6, 'between them');
      assert.ok(man.y > Math.min(a!.y, b!.y) + 0.5, 'held up off the deck');
      checked++;
    }
  });
  assert.ok(carried > 0, 'he is carried');
  assert.ok(checked > 0, 'and was seen carried on one floor');
});

test('the men of a repair stand about its work, each clear of the others and facing it', () => {
  const orders = [parseOrder('hands to the pumps', 0)], seen = new Set<string>();
  run(lying({ flooded: [20, 20] }), 25, (_, after) => {
    const pump = after.crew.tasks.find((t) => t.act === NO_ACT && t.job === 'pump');
    if (!pump || atWork(after.crew, 'pump', pump.on) < 3) return;
    const at = pump.hands.filter((i) => !after.crew.men[i]!.going).map((i) => drawn(after, after, i));
    seen.add(String(at.length));
    for (let i = 0; i < at.length; i++) for (let j = i + 1; j < at.length; j++) {
      const a = at[i]!, b = at[j]!;
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > APART, 'two pump hands are not in one another');
    }
  }, orders);
  assert.ok(seen.size > 0, 'the pump party was seen at work');
});

const calm: FaceWhy = { job: null, aloft: false, sinceStruck: Infinity, fighting: true, harm: null, sinceHurt: Infinity, shouting: false, ended: null };

test('pain shows when a man is hurt: it passes for the lightly wounded and stays for the badly hurt; fire fighters strain', () => {
  assert.ok(facesNow({ ...calm, harm: 'wounded', sinceHurt: 1 }).includes('pain'));
  assert.ok(!facesNow({ ...calm, harm: 'wounded', sinceHurt: PAIN_SECONDS }).includes('pain'), 'a set face again');
  assert.ok(facesNow({ ...calm, harm: 'wounded', sinceHurt: PAIN_SECONDS }).includes('grim'));
  assert.ok(facesNow({ ...calm, harm: 'badly', sinceHurt: 1000 }).includes('pain'), 'the badly hurt keep it');
  assert.deepEqual(facesNow({ ...calm, harm: 'killed', sinceHurt: 1 }), ['slack']);
  assert.ok(FACES.pain.rank > FACES.fear.rank, 'pain wins over fear');
  assert.ok(facesNow({ ...calm, job: 'fight' }).includes('strain'));
});

test('each level shows more of the same fall: nothing at mild, a pool and drops at plain, more of both and spatter at unsparing', () => {
  const [mild, plain, unsparing] = VIOLENCE_LEVELS;
  for (const harm of ['wounded', 'badly', 'killed'] as const) assert.deepEqual(bloodOf(mild!, harm, 3), [], `no blood at mild (${harm})`);
  const widest = (level: typeof VIOLENCE_LEVELS[number], harm: 'badly' | 'killed') => Math.max(...bloodOf(level!, harm, 3).map((p) => p.r));
  for (const harm of ['badly', 'killed'] as const) {
    assert.equal(bloodOf(plain!, harm, 3).length, 1, 'a pool and nothing more');
    assert.ok(bloodOf(unsparing!, harm, 3).length > 1 && widest(unsparing!, harm) > widest(plain!, harm), 'more at unsparing');
  }
  assert.equal(bloodOf(plain!, 'wounded', 3).length, 1, 'drops where a wounded man was struck');
  assert.ok(bloodOf(unsparing!, 'wounded', 3)[0]!.r > bloodOf(plain!, 'wounded', 3)[0]!.r);
  assert.deepEqual(bloodOf(plain!, 'killed', 3), bloodOf(plain!, 'killed', 3), 'the same on every machine');
  assert.notDeepEqual(bloodOf(plain!, 'killed', 3), bloodOf(plain!, 'killed', 4), 'each man his own');
  assert.ok(!SHOWN[mild!].trail && !SHOWN[plain!].trail && SHOWN[unsparing!].trail);
  assert.ok(TRAIL_EVERY > 0);
});

test('shirts are stained by how badly their man is hurt, never at mild; the killed are taken below at mild only, after a while and by a fade', () => {
  for (const harm of ['wounded', 'badly', 'killed'] as const) {
    assert.equal(stainOf('mild', harm), 0);
    assert.ok(stainOf('plain', harm) > 0 && stainOf('unsparing', harm) >= stainOf('plain', harm));
  }
  assert.equal(stainOf('plain', null), 0);
  assert.ok(stainOf('plain', 'badly') > stainOf('plain', 'wounded'));
  assert.equal(stained('#e8e2d4', 0), '#e8e2d4');
  assert.equal(stained('#e8e2d4', 1), '#4a0c0a');
  const half = stained('#ffffff', 0.5);
  assert.ok(half.startsWith('#') && half.length === 7 && half !== '#ffffff');
  for (const level of ['plain', 'unsparing'] as const) assert.equal(takenBelow(level, 'killed', 1000), 0, 'they lie where they fell');
  assert.equal(takenBelow('mild', 'killed', 0), 0);
  assert.equal(takenBelow('mild', 'killed', LAID_SECONDS), 0, 'laid a while first');
  const half2 = takenBelow('mild', 'killed', LAID_SECONDS + TAKEN_SECONDS / 2);
  assert.ok(half2 > 0 && half2 < 1, 'carried out by a fade');
  assert.equal(takenBelow('mild', 'killed', 1000), 1);
  assert.equal(takenBelow('mild', 'badly', 1000), 0, 'the badly wounded are carried below by the match itself');
});

test('the casualties stand-in strikes down the same number of men on each ship, never the captain, as the state keeps them', () => {
  const start = startMatch({ seed: 5, windForce: 0, windFrom: 0, ships: [{ x: 0, z: 0, heading: 0, canvas: 'bare' }, { x: 100, z: 0, heading: 0, canvas: 'bare' }] });
  const a = casualtiesOf(start, 3), b = casualtiesOf(start, 3), c = casualtiesOf(start, 4);
  assert.deepEqual(a.ships.map((s) => s.damage.hurt), b.ships.map((s) => s.damage.hurt));
  assert.notDeepEqual(a.ships[0]!.damage.hurt, c.ships[0]!.damage.hurt);
  for (const ship of a.ships) {
    const hurt = ship.damage.hurt;
    assert.ok([...hurt].sort((p, q) => p - q).every((h, i) => h === hurt[i]), 'ascending');
    assert.equal(new Set(hurt.map((h) => Math.floor(h / HARMS.length))).size, hurt.length, 'each man once');
    assert.ok(hurt.every((h) => Math.floor(h / HARMS.length) !== 0), 'not the captain');
    for (const harm of [WOUNDED, BADLY, KILLED]) assert.ok(hurt.some((h) => h % HARMS.length === harm));
  }
  assert.equal(hurtCode(1, KILLED), 1 * HARMS.length + KILLED);
});
