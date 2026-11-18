/**
 * The gun crews' drill as it is seen (implementation plan N5.4b, app/gunDrill.ts): each man at a gun plays the motion of
 * his part in her crew for the step she is in, stands to when her crew is too short to work her, strains at the work
 * that takes his strength, and at her report her captain cries the word and the rest flinch.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUN_CLIPS, GUN_CLIP_NAMES, gunClip, gunStrains, gunWork, partOf, type GunWork } from '../src/app/gunDrill.ts';
import { FLINCH_SECONDS, WORD_SECONDS, facesNow, type FaceWhy } from '../src/app/faces.ts';
import { PACK_CLIPS } from '../src/app/crewLooks.ts';
import { battery, dismountGun, fireGun, gunAt, startGuns, stepGuns, type Battery } from '../src/sim/guns/guns.ts';
import { GUNS } from '../src/sim/rules/guns.ts';
import { brigRoster, pairOf, placeSpot } from '../src/sim/crew/roster.ts';
import { startCrew } from '../src/sim/crew/crew.ts';
import { startMatch, type SimShip } from '../src/sim/state.ts';
import { STEPS_PER_SECOND } from '../src/sim/units.ts';
import { musterCrew } from './support/muster.ts';
import { duelSetup } from './support/match.ts';

/** A gun's full crew. */
const FULL = 5;
const roster = brigRoster(), places = battery();
const base = startMatch(duelSetup(1805, 4)).ships[0]!;
/** The pair's crew of gun `gun`, all at her (her side bears: the pair's whole crew crosses to her), by their place in it (1 her captain). */
const crewOf = (gun: number) => {
  const id = places[gun]!.id, pair = roster.flatMap((m, i) => (m.gun !== null && pairOf(m.gun) === pairOf(id) ? [{ man: i, m }] : []));
  const own = pair.filter((c) => c.m.gun === id), rest = pair.filter((c) => c.m.gun !== id);
  return [...own, ...rest].slice(0, FULL).map((c, k) => ({ ...c, place: k + 1, at: placeSpot(`gun-${id}-${k + 1}`) }));
};
/** Her at quarters with her pair's crew at gun 0 and the rest at their posts, her battery as given. */
const atQuarters = (guns: Battery): SimShip => {
  const muster = musterCrew(), at = new Map(crewOf(0).map((c) => [c.man, c.at]));
  const crew = { ...muster, men: muster.men.map((h, i) => (at.has(i) ? { ...h, stands: at.get(i)! } : h)) };
  return { ...base, guns, crew, told: { ...base.told, quarters: true } };
};
const wants = (load: boolean, runOut: boolean) => places.map(() => ({ load: load ? ('round' as const) : null, runOut, train: 0, elevation: 0 }));

test('every motion of the drill table is in the pack, and the crowd bakes each of them', () => {
  for (const clip of GUN_CLIP_NAMES) assert.ok(PACK_CLIPS.includes(clip), clip);
  for (const step of Object.values(GUN_CLIPS)) for (const clip of Object.values(step)) assert.ok(clip === null || GUN_CLIP_NAMES.includes(clip));
  assert.deepEqual([1, 2, 3, 4, 5].map(partOf), ['captain', 'muzzle', 'muzzle', 'tackles', 'tackles']);
});

test('through a reload each man of a gun\'s crew plays his part: ramming at the muzzle, heaving her out at the tackles, her captain crouching once she is ready', () => {
  const crew = crewOf(0);
  assert.equal(crew.length, FULL, 'a pair\'s crew is five men');
  const seen = new Map<string, Set<string | null>>();
  let guns = startGuns();
  for (let k = 0; k < 40 * STEPS_PER_SECOND; k++) {
    guns = stepGuns(guns, places.map(() => FULL), wants(true, true));
    const ship = atQuarters(guns);
    for (const c of crew) {
      const w = gunWork(ship, c.man, c.m)!;
      assert.equal(w.gun, 0);
      assert.ok(w.working);
      const key = `${w.step}/${w.part}`;
      (seen.get(key) ?? seen.set(key, new Set()).get(key)!).add(gunClip(w));
    }
  }
  assert.deepEqual([...seen.get('ramming/muzzle')!], ['push']);
  assert.deepEqual([...seen.get('running-out/tackles')!], ['push']);
  assert.deepEqual([...seen.get('ready/captain')!], ['crouch']);
  assert.deepEqual([...seen.get('ready/tackles')!], [null]);
  assert.ok(seen.has('loading/muzzle') && seen.has('running-out/captain'));
  assert.equal(gunAt(guns, 0).drill, 'ready');
});

test('a gun with too few men at her, or dismounted, is not worked: her men stand to', () => {
  let guns = startGuns();
  while (gunAt(guns, 0).drill !== 'running-out') guns = stepGuns(guns, places.map(() => FULL), wants(true, true));
  const crew = crewOf(0), alone = crew[3]!;
  // One man at her, the rest of the crew standing by at their home places.
  const ship: SimShip = { ...atQuarters(guns), crew: { ...startCrew(), men: startCrew().men.map((h, i) => (i === alone.man ? { ...h, stands: alone.at } : h)) } };
  const w = gunWork(ship, alone.man, alone.m)!;
  assert.equal(w.step, 'running-out');
  assert.ok(!w.working && !gunStrains(w));
  assert.equal(gunClip(w), null);
  // The whole crew: she is worked, and her men strain.
  const full = gunWork(atQuarters(guns), crew[3]!.man, crew[3]!.m)!;
  assert.ok(full.working && gunStrains(full));
  assert.equal(gunClip(full), 'push');
  // Dismounted, nobody works her.
  const dead = gunWork(atQuarters(dismountGun(guns, 0)), crew[3]!.man, crew[3]!.m)!;
  assert.ok(!dead.working && gunClip(dead) === null);
  // A man at no gun (standing by at home) is none.
  assert.equal(gunWork(base, crew[0]!.man, crew[0]!.m), null);
});

test('she fires: the seconds since are her recoil gone, and her captain cries while the rest flinch, for a moment', () => {
  let guns = startGuns();
  while (gunAt(guns, 0).drill !== 'ready') guns = stepGuns(guns, places.map(() => FULL), wants(true, true));
  const fired = fireGun(guns, 0, FULL).guns, [captain, hand] = [crewOf(0).find((c) => c.place === 1)!, crewOf(0).find((c) => c.place === 4)!];
  const at = (g: Battery, c: typeof captain): GunWork => gunWork(atQuarters(g), c.man, c.m)!;
  assert.equal(gunWork(atQuarters(guns), hand.man, hand.m)!.sinceFired, Infinity, 'ready, she has not just fired');
  assert.ok(Math.abs(at(fired, hand).sinceFired) < 1 / STEPS_PER_SECOND);
  // Some steps into her recoil.
  let later = fired;
  const steps = Math.round(0.8 * STEPS_PER_SECOND);
  for (let k = 0; k < steps; k++) later = stepGuns(later, places.map(() => FULL), wants(true, true));
  assert.ok(Math.abs(at(later, hand).sinceFired - 0.8) < 2 / STEPS_PER_SECOND);
  assert.ok(at(later, hand).sinceFired < GUNS.carronade.recoil);
  const why = (c: typeof captain, sinceFired: number): FaceWhy => ({
    job: null, aloft: false, sinceStruck: Infinity, sinceHurt: Infinity, fighting: true, harm: null, shouting: false, ended: null,
    gun: { strains: false, captain: c.place === 1, sinceFired },
  });
  assert.ok(facesNow(why(captain, 0.1)).includes('shout') && !facesNow(why(captain, 0.1)).includes('flinch'));
  assert.ok(facesNow(why(hand, 0.1)).includes('flinch') && !facesNow(why(hand, 0.1)).includes('shout'));
  assert.deepEqual(facesNow(why(hand, Math.max(WORD_SECONDS, FLINCH_SECONDS) + 0.1)), ['grim'], 'then the set face of the fight');
  assert.deepEqual(facesNow({ ...why(hand, Infinity), gun: { strains: true, captain: false, sinceFired: Infinity } }), ['strain', 'grim']);
});
