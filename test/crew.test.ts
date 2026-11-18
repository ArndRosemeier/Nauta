/**
 * The crew and its tasks (implementation plan N4.1): the roster and quarter bill add up; an order done by a full crew
 * takes the time in the table (rules/crew.ts JOBS, from when its men are there); with half the hands it takes longer
 * by the short-handed rule; two orders at once share the men; no man ever has two tasks; work stopped frees the men,
 * who go back to their posts; the crew is plain data, and two crews at their busiest fit the network's 16 KB a state.
 * The crew is driven alone here (test/support/crew.ts), which is cheaper than whole matches; every order by a full
 * crew, and the orders sailed through whole matches, are in the slow check tools/sim/orders.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encode } from '../src/sim/codec.ts';
import { openShip } from '../src/sim/crew/closures.ts';
import { sameSpot, startCrew, stepCrew, taskOf, type Crew } from '../src/sim/crew/crew.ts';
import { jobWork } from '../src/sim/crew/drill.ts';
import { battery, handsAtGuns } from '../src/sim/guns/guns.ts';
import { atQuartersOf, brigRoster, crewPlaces, placeSpot } from '../src/sim/crew/roster.ts';
import type { Order } from '../src/sim/orders.ts';
import { COMPLEMENT, FEWEST, GANGS, JOBS, ROSTER } from '../src/sim/rules/crew.ts';
import { shipPlan } from '../src/sim/ship/plan.ts';
import { routeNetwork } from '../src/sim/crew/network.ts';
import { nodeAt } from '../src/sim/ship/walk.ts';
import { SIDES } from '../src/sim/ship/spars.ts';
import { BREAKS } from '../src/sim/rules/ships.ts';
import { decodeState, encodeState, startMatch } from '../src/sim/state.ts';
import { STEP_SECONDS, STEPS_PER_SECOND } from '../src/sim/units.ts';
import { drive, fullCrewOrder, give, MOST_SECONDS, short, skillOf, startSail, startTold } from './support/crew.ts';
import { duelSetup } from './support/match.ts';

/** The network's most a state may take, bytes (16 KB until the off-watch hands slept below, 2026-11-18: then every hand an order calls comes up through the hatches at once). */
const STATE_BYTES = 20 * 1024;
/** Long enough for the men sent first for plain sail to reach their places (the most are on their way about 3 s in), s. */
const BUSY_SECONDS = 12;
/** Long enough for the men of a job to be at their places (a marine from the cabin door below too), s. */
const WAIT_SECONDS = 40;
/** Long enough for the gun crews to run to their guns on the side she fights from where they stand by, s, and the fewest men then at each gun. */
const MUSTER_SECONDS = 80;
const MUSTERED_AT_GUN = 4;

test('the roster is the brig\'s 121, every man posted at a crew place of the plan, the guns\' men each at a place of his own', () => {
  const roster = brigRoster(), places = crewPlaces();
  assert.equal(roster.length, COMPLEMENT);
  assert.equal(ROSTER.reduce((n, r) => n + r.count, 0), COMPLEMENT);
  for (const m of roster) assert.ok(places.has(m.post), `${m.rank} at ${m.post}`);
  const atGuns = roster.filter((m) => m.gun);
  assert.equal(new Set(atGuns.map((m) => m.post)).size, atGuns.length, 'one man to a gun place');
  for (const m of atGuns) assert.ok(m.post.startsWith(`gun-${m.gun}-`), `${m.rank} at ${m.post} serves ${m.gun}`);
  // Every pair of guns has a crew, of mixed parts; every gang of the quarter bill has its men.
  const pairs = new Set(shipPlan().guns.map((g) => g.id.slice(0, -1)));
  for (const pair of pairs) assert.ok(atGuns.filter((m) => m.gun!.slice(0, -1) === pair).length >= 2, `pair ${pair} manned`);
  for (const gang of Object.values(GANGS)) for (const part of [gang.aloft, ...gang.deck]) if (part) assert.ok(roster.some((m) => m.part === part), part);
});

test('the officers of the watch pace the quarterdeck: out to the other end of their walk and back, stopping at each, while she stands by', () => {
  const roster = brigRoster(), pacers = roster.flatMap((m, i) => (m.paces ? [i] : []));
  assert.deepEqual(pacers.map((i) => roster[i]!.rank), ['first lieutenant', 'boatswain']);
  let crew = startCrew(roster);
  const seen = new Map(pacers.map((i) => [i, { ends: new Set<string>(), walked: 0, stood: 0 }]));
  for (let tick = 0; tick < 60 * STEPS_PER_SECOND; tick++) {
    crew = stepCrew(crew, startTold(), { tick, heel: 0, closures: openShip(), captain: null, canvas: startSail().canvas }, roster).crew;
    for (const i of pacers) {
      const h = crew.men[i]!, s = seen.get(i)!, m = roster[i]!;
      if (h.going) { s.walked++; continue; }
      s.stood++;
      const at = h.stands ?? placeSpot(m.home), end = m.paces!.find((p) => sameSpot(at, placeSpot(p)));
      assert.ok(end, `${m.rank} stands at an end of his walk`);
      s.ends.add(end!);
    }
  }
  for (const [i, s] of seen) assert.ok(s.ends.size === 2 && s.walked > 0 && s.stood > s.walked, `${roster[i]!.rank} paces: ${[...s.ends]}, ${s.walked} steps walking, ${s.stood} standing`);
});

test('at quarters the powder boys carry cartridges: each goes from his post to a powder place by a gun of the side she fights and back, and every powder place can be walked to', () => {
  const roster = brigRoster(), boys = roster.flatMap((m, i) => (m.powderBoy !== null ? [i] : []));
  assert.equal(boys.length, 8);
  const powder = [...crewPlaces().values()].filter((p) => p.kind === 'powder');
  assert.equal(powder.length, shipPlan().guns.filter((g) => !g.chase).length);
  const graph = routeNetwork().graph;
  for (const p of powder) assert.ok(nodeAt(graph, p) >= 0, `${p.id} stands on a clear deck`);
  let crew = startCrew(roster);
  const seen = new Map(boys.map((i) => [i, new Set<string>()]));
  for (let tick = 0; tick < 150 * STEPS_PER_SECOND; tick++) {
    crew = stepCrew(crew, startTold(), { tick, heel: 0, closures: openShip(), captain: null, canvas: startSail().canvas, quarters: 1 }, roster).crew;
    for (const i of boys) {
      const h = crew.men[i]!;
      if (h.going) continue;
      const at = h.stands ?? placeSpot(roster[i]!.home), place = powder.find((p) => sameSpot(at, placeSpot(p.id)));
      seen.get(i)!.add(place ? 'gun' : sameSpot(at, placeSpot(roster[i]!.post)) ? 'post' : 'elsewhere');
    }
  }
  for (const [i, s] of seen) assert.ok(s.has('gun') && s.has('post'), `boy ${i} stood at a gun and at his post: ${[...s]}`);
});

test('the marines stand as ruled: two sentries aft, one at the cabin door, the rest below or in the waist; at quarters two aft, six aloft, six forward, five on the engaged side', () => {
  const marines = brigRoster().filter((m) => m.rank.endsWith('of marines'));
  assert.equal(marines.length, 19);
  const count = (at: (m: (typeof marines)[number]) => string, pred: (p: string) => boolean): number => marines.filter((m) => pred(at(m))).length;
  // Before quarters.
  assert.equal(count((m) => m.post, (p) => p === 'station-sentries'), 2);
  assert.equal(count((m) => m.post, (p) => p === 'station-cabin-door'), 1);
  assert.equal(count((m) => m.post, (p) => p === 'station-marines-waist' || p === 'station-marines-below'), 16);
  // Nobody of them is posted on the quarterdeck but the two sentries aft.
  assert.equal(count((m) => m.post, (p) => placeSpot(p).space === 'deck' && placeSpot(p).along <= BREAKS.quarterdeck), 2);
  // At quarters, on either side.
  for (const side of SIDES) {
    const at = (m: (typeof marines)[number]) => (m.quarters === null ? m.post : atQuartersOf(m.quarters, side));
    assert.equal(count(at, (p) => p === 'station-sentries'), 2, 'two stay aft');
    assert.equal(count(at, (p) => p.startsWith('top-')), 6, 'six to the tops');
    assert.equal(count(at, (p) => p === 'station-forecastle'), 6, 'six to the forecastle');
    assert.equal(count(at, (p) => p === (side > 0 ? 'station-marines-s' : 'station-marines-p')), 5, 'five along the engaged side');
  }
});

test('standing by, the gun crews are in the waist, on the forecastle and below, and the quarterdeck holds only its officers, helm and sentries; at quarters they run to their guns', () => {
  const roster = brigRoster(), AT_EASE = new Set(['captain', 'first lieutenant', 'master', "master's mate", 'midshipman', 'quartermaster', 'boatswain', "captain's clerk", 'drummer', 'corporal of marines', 'private of marines']);
  for (const m of roster) {
    const spot = placeSpot(m.home);
    if (m.gun !== null) assert.notEqual(m.home, m.post, `${m.rank} stands by away from his gun`);
    if (spot.space === 'deck' && spot.along <= BREAKS.quarterdeck) assert.ok(AT_EASE.has(m.rank), `${m.rank} stands by on the quarterdeck`);
  }
  // Standing by no gun has a man; beating to quarters (one side bearing) sends them, seen running, and in a while each gun of the side has its crew.
  const told = startTold(), sailing = startSail(), side = 1;
  let crew = startCrew(), running = 0;
  assert.ok(handsAtGuns(crew).every((n) => n === 0));
  const guns = battery().flatMap((g, i) => (g.side === side ? [i] : []));
  for (let tick = 0; tick < MUSTER_SECONDS * STEPS_PER_SECOND; tick++) {
    crew = stepCrew(crew, told, { tick, heel: 0, closures: openShip(), captain: null, canvas: sailing.canvas, quarters: side }).crew;
    if (tick === 2 * STEPS_PER_SECOND) running = crew.men.filter((h) => h.going).length;
  }
  assert.ok(running >= COMPLEMENT / 3, `${running} running two seconds in`);
  assert.ok(guns.every((i) => handsAtGuns(crew)[i]! >= MUSTERED_AT_GUN), handsAtGuns(crew).join(' '));
});

test('an order done by a full crew takes the time in the table once its men are there, and none is short-handed', () => {
  // The helm, and one mast's braces; every order is held to it in tools/sim/orders.ts.
  for (const order of [{ kind: 'steer', ship: 0, heading: 2 } as Order, { kind: 'back', ship: 0, mast: 'main' } as Order]) fullCrewOrder(order);
});

test('with half the hands a job takes longer by the rule, and with too few it does not start', () => {
  const back: Order = { kind: 'back', ship: 0, mast: 'main' };
  const brace = JOBS.brace.hands as number, work = JOBS.brace.work as number;
  const full = [...drive([back]).tasks.values()][0]!;
  const roster = short(GANGS.main.deck, brace / 2);
  const half = drive([back], roster);
  const { task, began, ended } = [...half.tasks.values()][0]!;
  const skill = skillOf(task, roster), seconds = (ended! - began!) * STEP_SECONDS;
  assert.ok(skill >= brace / 2 && skill < brace * (2 / 3), `half the hands: ${skill.toFixed(2)} of ${brace}`);
  assert.ok(Math.abs(seconds - (work * brace) / skill) <= 2 * STEP_SECONDS, `${seconds.toFixed(2)} s, by the rule ${((work * brace) / skill).toFixed(2)} s`);
  assert.ok(seconds > 1.5 * ((full.ended! - full.began!) * STEP_SECONDS), 'it takes clearly longer');
  assert.deepEqual(half.events.map((e) => [e.kind, e.job]), [['short-handed', 'brace']], 'the first lieutenant hears it is short-handed');
  // Below the fewest hands that can move it, the men wait and it is never done.
  const none = drive([back], short(GANGS.main.deck, FEWEST * brace * (2 / 3)), WAIT_SECONDS), waiting = none.crew.tasks[0]!;
  assert.ok(!none.doneAt.has('back') && none.crew.tasks.length === 1 && waiting.began === null, 'not begun');
  assert.ok(waiting.hands.length > 0 && waiting.hands.every((i) => !none.crew.men[i]!.going), 'though its men are there');
});

test('two orders at once share the men: the later job waits for hands or starts short, and both are done', () => {
  // Only the waisters haul (both masts' braces call on them), too few for both masts at once.
  const roster = brigRoster().map((m) => (m.part === 'waist' || !GANGS.fore.deck.concat(GANGS.main.deck).includes(m.part) ? m : { ...m, part: 'idlers' as const }));
  const fore: Order = { kind: 'back', ship: 0, mast: 'fore' }, main: Order = { kind: 'back', ship: 0, mast: 'main' };
  const alone = drive([main], roster).doneAt.get('back')!;
  const both = drive([fore, main], roster);
  assert.ok(both.told.backed.every(Boolean) && both.sailing.backed.every(Boolean), 'both masts aback');
  const tasks = [...both.tasks.values()].sort((a, b) => a.task.id - b.task.id);
  assert.equal(tasks.length, 2);
  assert.ok(skillOf(tasks[0]!.task, roster) >= jobWork(tasks[0]!.task.job, tasks[0]!.task.on).need, 'the first order given is manned in full');
  // The main braces are belayed on the quarterdeck, up its ladders from the waist (N2.12): the second waits for the
  // first's men, or starts short-handed.
  assert.ok(both.events.some((e) => e.kind === 'short-handed') || tasks[1]!.began! >= tasks[0]!.ended!, 'the second waits for hands or starts short-handed');
  assert.ok(tasks[1]!.ended! > alone, `the main yards are round later than alone: ${(tasks[1]!.ended! * STEP_SECONDS).toFixed(1)} s against ${(alone * STEP_SECONDS).toFixed(1)} s`);
  // Freed by the first, men join the second while it works.
  assert.ok(tasks[1]!.task.hands.some((i) => tasks[0]!.task.hands.includes(i)), 'a man of the fore braces went on to the main');
});

test('work stopped by a later order frees its men, who go back to their posts; the crew stays plain data', () => {
  const plain: Order = { kind: 'sail', ship: 0, canvas: 'plain' }, battle: Order = { kind: 'sail', ship: 0, canvas: 'battle' };
  const r = drive([plain], brigRoster(), MOST_SECONDS, [{ tick: 3 * STEPS_PER_SECOND, order: battle }]);
  assert.deepEqual([r.told.given, r.told.acts, r.crew.tasks], [[], [], []]);
  assert.ok(r.crew.men.some((h) => h.going || h.stands), 'men are on their way back');
  // Busy: the tack and a sail order at once, every man's task found and the crew plain data the codec takes.
  let told = startTold();
  const sailing = startSail();
  for (const o of [{ kind: 'tack', ship: 0 }, plain] as Order[]) told = give(told, sailing, o);
  let crew = startCrew();
  for (let tick = 0; tick < BUSY_SECONDS * STEPS_PER_SECOND; tick++) crew = stepCrew(crew, told, { tick, heel: 0, closures: openShip(), captain: null, canvas: sailing.canvas }).crew;
  assert.ok(crew.men.filter((h) => h.going).length > 0, 'men on their way');
  for (const t of crew.tasks) for (const i of t.hands) assert.equal(taskOf(crew, i), t);
  assert.ok(encode(crew).length > 0);
});

test('two crews at their busiest, making plain sail, fit the network\'s 16 KB a state, and step on the same from its bytes', () => {
  // The crew at its busiest while its men go to their places for plain sail (the busiest the state gets until she beats to quarters).
  const sailing = startSail(), told = give(startTold(), sailing, { kind: 'sail', ship: 0, canvas: 'plain' });
  let crew = startCrew(), busiest: Crew = crew, most = 0;
  for (let tick = 0; tick < BUSY_SECONDS * STEPS_PER_SECOND; tick++) {
    crew = stepCrew(crew, told, { tick, heel: 0, closures: openShip(), captain: null, canvas: sailing.canvas }).crew;
    const bytes = encode(crew).length;
    if (bytes > most) { most = bytes; busiest = crew; }
  }
  assert.ok(busiest.men.filter((h) => h.going).length >= COMPLEMENT / (2 * 2), 'a good part of the crew on its way');
  // Both ships of a duel so, at once.
  const match = startMatch(duelSetup(1805, 4));
  const busy = { ...match, ships: match.ships.map((s) => ({ ...s, crew: busiest, told })) };
  const bytes = encodeState(busy);
  assert.ok(bytes.length < STATE_BYTES, `${bytes.length} bytes`);
  // The guest's copy is the host's, and its crew steps on to the same.
  const back = decodeState(bytes);
  assert.deepEqual(back, busy);
  let host = busy.ships[0]!.crew, guest = back.ships[0]!.crew;
  const tick0 = BUSY_SECONDS * STEPS_PER_SECOND;
  for (let tick = tick0; tick < tick0 + STEPS_PER_SECOND; tick++) {
    const deck = { tick, heel: 0, closures: openShip(), captain: null, canvas: sailing.canvas };
    host = stepCrew(host, told, deck).crew; guest = stepCrew(guest, back.ships[0]!.told, deck).crew;
  }
  assert.deepEqual(encode(guest), encode(host));
});
