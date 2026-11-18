/**
 * The crew drawn (implementation plan N4.3): every man of the match drawn on her, apart from his shipmates, playing a
 * motion of the pack by what he does; the animation rate and the near pool by the quality table's knobs; faces from
 * what the simulation says; the looks of both crews from the roster, the same on every machine; the voices are men.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OUTFITS, type CharacterCatalog } from '@actors/generator';
import { CAPTAIN_CLEAR, DUCK, FULL, JOB_CLIPS, LYING, MEDIUM, POOL_STICK, RUNNING, SLEEPING, WALKING, duckTo, choosePool, dueThisFrame, manDrawn, manSeed, newManDrawn, poolLevel, stepAside, stepAt, type ManDrawn, type PoolCandidate } from '../src/app/crewDrawn.ts';
import { BERTH_HEADROOM, BREAKS } from '../src/sim/rules/ships.ts';
import { shipY } from '../src/sim/ship/section.ts';
import { heightAt, routeNetwork } from '../src/sim/crew/network.ts';
import { floorApart } from '../src/app/officers.ts';
import { crewPlaces, placeSpot } from '../src/sim/crew/roster.ts';
import { FACES, FEAR_SECONDS, facesNow, stepFace, type FaceState, type FaceWhy } from '../src/app/faces.ts';
import { PACK_CLIPS, PACK_GARMENTS, PACK_HAIR, crowdKinds, figureOf, fullLook, navyOf, wearing } from '../src/app/crewLooks.ts';
import { voiceMan } from '../src/app/officers.ts';
import { VOICES } from '../src/app/speech/speakers.ts';
import { QUALITY_LEVELS } from '../src/app/quality.ts';
import { openShip } from '../src/sim/crew/closures.ts';
import { stepCrew, taskOf, type Crew } from '../src/sim/crew/crew.ts';
import { brigRoster } from '../src/sim/crew/roster.ts';
import { startMatch, type SimShip } from '../src/sim/state.ts';
import { STEPS_PER_SECOND } from '../src/sim/units.ts';
import { give, startSail, startTold } from './support/crew.ts';
import { musterCrew } from './support/muster.ts';
import { STAND_BY_CLIPS, attentiveClip } from '../src/app/standBy.ts';
import { duelSetup } from './support/match.ts';
import { CLIMBED, crewLadder } from '../src/app/ladders.ts';

const roster = brigRoster(), knobs = QUALITY_LEVELS[0]!.crew;
const ship = startMatch(duelSetup(1805, 4)).ships[0]!;
const drawnAll = (from: SimShip, to: SimShip, f = 1): ManDrawn[] => roster.map((m, i) => manDrawn(from, to, f, i, m, manSeed(0, i), newManDrawn()));
/** Two men nearer than this stand in one another, m. */
const APART = 0.2;
/** Sleepers in hammocks 14 inches apart (a row), or one tier over another: nearer than this they would lie in one another, m. */
const SLEEPERS_APART = 0.3;

test('at their posts every man is drawn somewhere of his own, playing a motion of the pack', () => {
  const men = drawnAll(ship, ship);
  for (const d of men) {
    assert.ok([d.x, d.y, d.z, d.yaw].every(Number.isFinite));
    assert.ok(PACK_CLIPS.includes(d.clip) || d.clip === SLEEPING, d.clip);
    assert.equal(d.way, null);
  }
  // Several men share a post: the first stands on it, the rest around it, not inside one another.
  for (let i = 0; i < men.length; i++) for (let j = i + 1; j < men.length; j++) {
    const a = men[i]!, b = men[j]!;
    if (a.space === b.space) assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > (a.clip === SLEEPING && b.clip === SLEEPING ? SLEEPERS_APART : APART), `${roster[i]!.rank} ${i} and ${roster[j]!.rank} ${j} at ${a.x.toFixed(2)}, ${a.z.toFixed(2)}`);
  }
});

test('the men who share the captain\'s post stand clear of him', () => {
  const men = drawnAll(ship, ship), captain = men[0]!, room = 2;
  roster.forEach((m, i) => {
    if (i === 0 || m.post !== roster[0]!.post) return;
    const d = men[i]!;
    assert.ok(Math.hypot(d.x - captain.x, d.z - captain.z) >= room - 0.05, `${m.rank} ${i} is ${Math.hypot(d.x - captain.x, d.z - captain.z).toFixed(2)} m from the captain`);
  });
});

test('nobody visible just stands about: every man with nothing to do is busy at his place, the sentries on watch', () => {
  const men = drawnAll(ship, ship), idle = ['idle', 'arms folded'];
  roster.forEach((m, i) => assert.ok(!idle.includes(men[i]!.clip), `${m.rank} ${i} at ${m.home} plays ${men[i]!.clip}`));
  assert.ok(roster.every((m, i) => m.home.startsWith('station-sentries') || m.home.startsWith('station-cabin-door') || men[i]!.clip !== 'pistol idle'), 'only sentries keep a pistol ready');
  // The hands off watch sleep below, each in a hammock of his own; the others have a job on deck or at a station below.
  roster.forEach((m, i) => assert.equal(men[i]!.clip === SLEEPING, m.bunk !== null, `${m.rank} ${i} at ${m.home}`));
  assert.ok(roster.filter((m) => m.bunk !== null).length >= 50, 'most of the crew is asleep');
});

test('a sleeper lies athwart her in his hammock under the deck beams, his head inboard, over the floor of his space', () => {
  const men = drawnAll(ship, ship);
  roster.forEach((m, i) => {
    if (!m.bunk) return;
    const d = men[i]!, floor = placeSpot(m.home);
    assert.equal(d.space, m.bunk.space);
    assert.equal(d.space, floor.space, `${m.rank} ${i} sleeps where his home is`);
    assert.ok(Math.abs(-d.z - m.bunk.along) < 1e-9 && Math.abs(d.x - m.bunk.across) < 1e-9);
    assert.ok(m.bunk.height >= 0.5 && m.bunk.height + 0.3 <= BERTH_HEADROOM, `${m.rank} ${i} lies ${m.bunk.height} m over the floor`);
  });
  // No two hammocks are slung in one place.
  const taken = new Set(roster.flatMap((m) => (m.bunk ? [`${m.bunk.space}|${m.bunk.along.toFixed(2)}|${m.bunk.across}|${m.bunk.height}`] : [])));
  assert.equal(taken.size, roster.filter((m) => m.bunk).length);
});

test('a man called out of his hammock rolls out and drops: lying while he is above the floor, on his feet at the end of the first metre', () => {
  const i = roster.findIndex((m) => m.bunk && m.bunk.space === 'messdeck'), m = roster[i]!;
  const first = drawnAll(ship, ship)[i]!, floor = placeSpot(m.home);
  assert.equal(first.clip, SLEEPING);
  let crew = ship.crew, onFloor = false, sawWalking = false;
  const told = startTold(), sailing = startSail(), side = 1;
  for (let tick = 0; tick < 30 * STEPS_PER_SECOND && !onFloor; tick++) {
    crew = stepCrew(crew, told, { tick, heel: 0, closures: openShip(), captain: null, canvas: sailing.canvas, quarters: side }).crew;
    const at = { ...ship, crew }, d = manDrawn(at, at, 1, i, m, manSeed(0, i), newManDrawn());
    if (!crew.men[i]!.going) continue;
    if (d.clip === SLEEPING) assert.ok(d.y > shipY(heightAt(routeNetwork(), floor)) - 1e-9, 'lying he is not below the floor');
    else sawWalking = true;
    // Far from his hammock he is on the floor.
    if (floorApart({ ...floor, along: -d.z, across: d.x, space: d.space }, floor) >= 1.5) { assert.ok(Math.abs(d.y - shipY(heightAt(routeNetwork(), { ...floor, along: -d.z, across: d.x, space: d.space }))) < 0.05, 'on the floor'); onFloor = true; }
  }
  assert.ok(sawWalking && onFloor, 'he got up and went');
});

test('at quarters nobody just stands: the gun crews are ready at their guns, the marines armed, the rest alert', () => {
  const at = { ...ship, crew: musterCrew() };
  const men = drawnAll(at, at), plain = ['idle'];
  roster.forEach((m, i) => assert.ok(!plain.includes(men[i]!.clip), `${m.rank} ${i} at ${m.post} plays ${men[i]!.clip}`));
  const gunClips = new Set(roster.flatMap((m, i) => (m.gun !== null ? [men[i]!.clip] : [])));
  assert.ok(gunClips.size >= 3, [...gunClips].join(', '));
  assert.ok(STAND_BY_CLIPS.includes(attentiveClip(0)) && attentiveClip(0) !== 'idle');
});

test('the men are drawn on the deck of their place, never against the face of a break where a body sinks into the raised deck', () => {
  const men = drawnAll(ship, ship), deckOf = (a: number) => (a <= BREAKS.quarterdeck ? 0 : a >= BREAKS.forecastle ? 2 : 1), breakClear = 0.5;
  roster.forEach((m, i) => {
    const home = placeSpot(m.home), d = men[i]!, along = -d.z;
    if (home.space !== 'deck' || d.space !== 'deck') return;
    assert.equal(deckOf(along), deckOf(home.along), `${m.rank} ${i} left his deck`);
    // (A man whose own place is at a break stands there: a ladder's foot.)
    // A man shared round a place keeps clear of the ladders (a man at a place of his own, the carpenter at the pumps beside the quarterdeck ladder, is where the plan puts him).
    const own = Math.abs(home.along - along) < 1e-6 && Math.abs(home.across - d.x) < 1e-6;
    if (!own) for (const c of crewPlaces().values()) if (c.kind === 'ladder' && c.space === 'deck') assert.ok(Math.hypot(c.along - along, c.across - d.x) >= 0.7 - 1e-6, `${m.rank} ${i} at the foot of ${c.id}`);
    if (Math.abs(home.along - BREAKS.quarterdeck) >= breakClear && Math.abs(home.along - BREAKS.forecastle) >= breakClear) {
      for (const at of [BREAKS.quarterdeck, BREAKS.forecastle]) assert.ok(Math.abs(along - at) >= breakClear - 1e-6, `${m.rank} ${i} against a break at ${along.toFixed(2)}`);
    }
  });
});

test('a man standing still steps aside for the captain: kept the captain\'s room from him, and left alone when clear', () => {
  const man = newManDrawn(), eye = { x: 1, z: 2 };
  Object.assign(man, { x: 1.3, y: 0, z: 2 });
  stepAside(man, eye);
  assert.ok(Math.abs(Math.hypot(man.x - eye.x, man.z - eye.z) - CAPTAIN_CLEAR) < 1e-9 && man.z === 2 && man.x > eye.x, 'pushed straight out');
  Object.assign(man, { x: 1 + 2 * CAPTAIN_CLEAR, z: 2 });
  stepAside(man, eye);
  assert.equal(man.x, 1 + 2 * CAPTAIN_CLEAR);
  Object.assign(man, { x: 1, z: 2 });
  stepAside(man, eye);
  assert.ok(Math.hypot(man.x - eye.x, man.z - eye.z) >= CAPTAIN_CLEAR - 1e-9, 'a man on the captain\'s very spot is moved too');
});

test('making sail, men on their way walk or run and men at work play their job\'s motion; between two steps they are between', () => {
  const sailing = startSail(), told = give(startTold(), sailing, { kind: 'sail', ship: 0, canvas: 'plain' });
  let crew: Crew = ship.crew, before = crew;
  const seconds = 4;
  for (let tick = 0; tick < seconds * STEPS_PER_SECOND; tick++) {
    before = crew;
    crew = stepCrew(crew, told, { tick, heel: 0, closures: openShip(), captain: null, canvas: sailing.canvas }).crew;
  }
  const from = { ...ship, crew: before }, to = { ...ship, crew };
  const men = drawnAll(from, to);
  const going = men.filter((_, i) => crew.men[i]!.going);
  assert.ok(going.length > 0 && going.every((d) => d.clip === 'walk' || d.clip === 'jog'));
  crew.tasks.filter((t) => t.began !== null).forEach((t) => t.hands.forEach((i) => { if (!crew.men[i]!.going) assert.equal(men[i]!.clip, JOB_CLIPS[t.job]); }));
  // Halfway between the two steps, a man walking on one floor is halfway between where each step has him.
  const a = drawnAll(from, from), b = drawnAll(to, to), half = drawnAll(from, to, 1 / 2);
  half.forEach((h, i) => {
    if (a[i]!.space !== b[i]!.space || a[i]!.way !== b[i]!.way) return;
    assert.ok(Math.abs(h.z - (a[i]!.z + b[i]!.z) / 2) < 1e-9 && Math.abs(h.x - (a[i]!.x + b[i]!.x) / 2) < 1e-9);
  });
  assert.ok(taskOf(crew, crew.tasks[0]!.hands[0]!));
});

test('a man on a ladder or the shrouds is drawn climbing, on the rungs of his way, and never runs there or aloft (Arnd 2026-11-18)', () => {
  const sailing = startSail(), told = give(startTold(), sailing, { kind: 'sail', ship: 0, canvas: 'plain' });
  let crew: Crew = ship.crew, climbing = 0, onWays = 0;
  for (let tick = 0; tick < 25 * STEPS_PER_SECOND; tick++) {
    crew = stepCrew(crew, told, { tick, heel: 0, closures: openShip(), captain: null, canvas: sailing.canvas }).crew;
    if (tick % STEPS_PER_SECOND) continue;
    const now = { ...ship, crew };
    for (const d of drawnAll(now, now)) {
      if (d.way !== null || routeNetwork().surfaces.has(d.space)) assert.notEqual(d.clip, RUNNING, `no one runs on a way or aloft (${d.way ?? d.space})`);
      if (d.way !== null) onWays++;
      if (!d.climb) continue;
      climbing++;
      assert.ok(CLIMBED.has(d.climb.kind) && d.way === d.climb.kind);
      const on = crewLadder(d.climb, d.y);
      assert.ok(on && on.h >= 0 && on.h <= on.ladder.hi - (on.ladder.rim ? on.ladder.lo : on.ladder.floor) + 1, `${d.climb.way}: his feet are on its rungs`);
      assert.ok(d.climbEase >= 0 && d.climbEase <= 1);
    }
  }
  assert.ok(onWays > 0 && climbing > 0, 'men climb in making sail');
});

test('men are placed again less often far off and out of sight, spread evenly over the frames', () => {
  assert.equal(stepAt(knobs, 1, true), knobs.steps[0]);
  assert.equal(stepAt(knobs, 1e4, true), knobs.steps[knobs.steps.length - 1]);
  assert.equal(stepAt(knobs, 1, false), knobs.hiddenStep);
  const step = 4, due = Array.from({ length: step }, (_, frame) => roster.filter((_, i) => dueThisFrame(frame, step, i)).length);
  assert.equal(due.reduce((s, n) => s + n, 0), roster.length);
  assert.ok(Math.max(...due) - Math.min(...due) <= 1, 'the same few each frame');
});

test('the near pool takes the men who matter first, then the nearest seen within reach, at most its size; a man in it keeps his place a little longer', () => {
  const man = (i: number, distance: number, seen = true, matters = false): PoolCandidate => ({ man: i, distance, seen, matters });
  const men = [man(1, 2), man(2, 1), man(3, knobs.poolTo + 1), man(4, 0.5, false), man(5, 30, true, true)];
  assert.deepEqual(choosePool(men, knobs, new Set(), knobs.pool), [5, 2, 1]);
  assert.deepEqual(choosePool(men, knobs, new Set([3]), knobs.pool), [5, 2, 1, 3]);
  assert.deepEqual(choosePool(men, knobs, new Set(), 2), [5, 2]);
  const many = Array.from({ length: knobs.pool * 2 }, (_, i) => man(i, i / 10));
  assert.equal(choosePool(many, knobs, new Set(), knobs.pool * 2).length, knobs.pool);
  assert.equal(poolLevel(knobs, knobs.fullTo / 2, MEDIUM), FULL);
  assert.equal(poolLevel(knobs, knobs.fullTo + POOL_STICK / 2, MEDIUM), MEDIUM);
  assert.equal(poolLevel(knobs, knobs.fullTo + POOL_STICK / 2, FULL), FULL);
  assert.equal(poolLevel({ ...knobs, fullTo: 0 }, 0, MEDIUM), MEDIUM);
});

const calm: FaceWhy = { job: null, aloft: false, sinceStruck: Infinity, fighting: false, harm: null, sinceHurt: Infinity, shouting: false, ended: null };

test('a face shows what is happening to the man, the strongest feeling winning, and comes and goes at its own pace', () => {
  assert.deepEqual(facesNow(calm), []);
  assert.deepEqual(facesNow({ ...calm, harm: 'killed', job: 'brace' }), ['slack']);
  assert.ok(facesNow({ ...calm, job: 'brace', aloft: true }).includes('strain'));
  assert.ok(facesNow({ ...calm, sinceStruck: 0 }).includes('flinch') && !facesNow({ ...calm, sinceStruck: FEAR_SECONDS }).includes('fear'));
  assert.deepEqual(facesNow({ ...calm, fighting: true, ended: 'lost' }), ['dismay']);
  const state: FaceState = {}, units: Record<string, number> = {};
  const dt = FACES.strain.rise / 2;
  stepFace(state, ['strain', 'squint'], dt, units);
  assert.ok(Math.abs(state.strain! - FACES.strain.strength / 2) < 1e-9, 'half risen');
  assert.equal(state.squint, undefined, 'the weaker cause does not show');
  assert.ok(units['mouth-compression']! > 0);
  for (let t = 0; t < FACES.strain.fall * 2; t += dt) stepFace(state, [], dt, units);
  assert.deepEqual(state, {});
  assert.ok(Object.values(units).every((w) => w === 0));
});

const catalog = { outfits: OUTFITS, hair: PACK_HAIR.map((id) => ({ id })) as unknown as CharacterCatalog['hair'] };

test('both crews\' looks come from the roster and their seed, tell rank and navy apart, and wear only what the pack holds', () => {
  const kinds = crowdKinds(catalog, [roster, roster]);
  // Room in its kind for every man, whichever navy the first ship is given.
  for (const first of ['british', 'french'] as const) {
    const wanted = new Map<string, number>();
    for (const ship of [0, 1]) roster.forEach((m, i) => { const k = figureOf(ship, i, m, navyOf(ship, first)).kind; wanted.set(k, (wanted.get(k) ?? 0) + 1); });
    for (const [id, n] of wanted) assert.ok((kinds.find((k) => k.id === id)?.max ?? 0) >= n, `${id} holds ${n}`);
  }
  // Another navy changes a man's dress, never his build or skin.
  const british = figureOf(0, 7, roster[7]!, 'british'), french = figureOf(0, 7, roster[7]!, 'french');
  assert.notEqual(british.kind, french.kind);
  assert.deepEqual([british.build, british.skinTone, british.scale], [french.build, french.skinTone, french.scale]);
  for (const k of kinds) for (const g of k.look.outfit!) assert.ok(PACK_GARMENTS.includes(g), g);
  for (const ship of [0, 1]) roster.forEach((m, i) => {
    const f = figureOf(ship, i, m), look = fullLook(catalog, f);
    assert.deepEqual(f, figureOf(ship, i, m));
    assert.ok(kinds.some((k) => k.id === f.kind));
    for (const g of look.outfit!) assert.ok(PACK_GARMENTS.includes(g), g);
    assert.ok(look.hair === null || PACK_HAIR.includes(look.hair!), String(look.hair));
  });
  const captain = (ship: number) => figureOf(ship, 0, roster[0]!);
  assert.notEqual(captain(0).kind, captain(1).kind, 'the navies dress apart');
  assert.notEqual(figureOf(0, 0, roster[0]!).dress, figureOf(0, roster.length - 1, roster[roster.length - 1]!).dress);
  // Two men who wear the same differ in their colours alone.
  const byWear = new Map<string, number>();
  roster.forEach((m, i) => byWear.set(wearing(figureOf(0, i, m)), i));
  assert.ok(byWear.size < roster.length);
});

test('every voice of the bubbles is a man of the roster of his rank', () => {
  const men = VOICES.map((v) => voiceMan(v));
  assert.equal(new Set(men).size, VOICES.length);
  assert.equal(roster[voiceMan('lookout')]!.post, 'top-main-p');
  assert.equal(roster[voiceMan('master')]!.rank, 'master');
});

test('shot striking near a man makes him duck for a moment, each man a little apart; a man walking, lying, asleep or holding on does not', () => {
  const seeds = [0, 1, 2, 3];
  for (const seed of seeds) {
    assert.equal(duckTo('talk', Infinity, seed, false), 'talk', 'no shot near: his own clip');
    assert.equal(duckTo('talk', 0.5, seed, false), DUCK, 'ducking by half a second after');
    assert.equal(duckTo('talk', 2, seed, false), 'talk', 'up again after');
    for (const clip of [WALKING, RUNNING, LYING, SLEEPING, JOB_CLIPS.carry]) assert.equal(duckTo(clip, 0.5, seed, false), clip, `${clip} goes on`);
    assert.equal(duckTo('interact', 0.5, seed, true), 'interact', 'on a ladder or aloft he holds on');
  }
  assert.notEqual(duckTo('talk', 0, 0, false), duckTo('talk', 0, 3, false), 'a man whose turn is later has not ducked yet at the instant');
});
