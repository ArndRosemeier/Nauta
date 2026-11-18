/**
 * The "walk everywhere" check (implementation plan N2.3; a slow check, docs/CHECKS.md): the captain walks a tour of
 * the whole brig while she rolls beam-on in the strongest sea a duel is fought in. The tour goes through every way of
 * the walk graph and back (every door both ways, every ladder up and down, every open join) and stands still in every
 * part of every space. Each step is checked against the plan itself, not against the walk graph the walker uses: his
 * feet on a floor (also carried through her pose into the world and back), clear of her side, every fitting,
 * coaming, mast, gun and bulkhead, through bulkheads only at an open door, never in a leaf's way, his head under the
 * beams; standing, he does not slide; on a ladder he keeps to it; and he never sticks.
 *
 *   npm run walk:check            the tour, a line for each part of it that failed, exit 1 on any failure
 *   npm run walk:check -- --log   and a line for every space and way as it is reached
 */
import { performance } from 'node:perf_hooks';
import { frameToLocal } from '@futuremagic/deck';
import { beaufortSpeed } from '../../src/sim/rules/beaufort.ts';
import { DUEL_FORCES } from '../../src/sim/rules/wind.ts';
import { BOWSPRIT_STEP } from '../../src/sim/rules/rig.ts';
import { BODY, DOOR } from '../../src/sim/rules/ships.ts';
import { EYE_BELOW_TOP } from '../../src/sim/rules/walking.ts';
import { startSea } from '../../src/sim/sea/sea.ts';
import { lyingStill, shipFrame, startMotion, stepMotion, toWorld, type ShipMotion } from '../../src/sim/ship/motion.ts';
import { floorAt, holds, insideBreadth, overheadAt, shipPlan, type Spot, type Way } from '../../src/sim/ship/plan.ts';
import { shipY } from '../../src/sim/ship/section.ts';
import { WALK_CELL, nodeAt } from '../../src/sim/ship/walk.ts';
import { rigObstacles, rigPlan, rigWalk } from '../../src/sim/ship/rig.ts';
import { doorAngle, doorLeaves, doorPasses, type DoorLeaf } from '../../src/sim/ship/doors.ts';
import { spotOf, underDoorHead } from '../../src/sim/ship/deckWalk.ts';
import { DEGREE, STEP_SECONDS } from '../../src/sim/units.ts';
import { Captain } from '../../src/app/captain.ts';

const LOG = process.argv.includes('--log');
const SEED = 1805;
/** She lies beam-on to the strongest duel sea, rolling hardest; she has no way on yet (sailing comes with N3.3). */
const WIND_TOWARD = 0.4;
const HEADING = WIND_TOWARD + Math.PI / 2;
/** Clearances the check holds his middle to, m: from a solid part, and the slack of the floor and the beams. */
const CLEAR = 0.15;
const SLACK = 1e-6;
/** How far he may drift standing still, m, and for how long he stands at each part of each space, s. */
const STILL_DRIFT = 0.01;
const STAND_SECONDS = 1;
/** A way's end reached within this, m; aiming this far ahead along a path, m. */
const ARRIVED = 0.12;
const LOOK_AHEAD = 0.5;
/** Without getting nearer his goal for this long he is stuck, s. */
const STUCK_SECONDS = 8;
/** On a ladder he keeps within this of its line (from the spot one stands at its foot to the one at its head), m. */
const LADDER_ZONE = 0.9;
/** She must roll at least this far beam-on in force 6 (about 10°), rad, or the check is not in the sea it claims. */
const LEAST_ROLL = 5 * DEGREE;
/** Beside the bowsprit's inboard part, m out from it. */
const BESIDE_BOWSPRIT = 0.5;

const plan = shipPlan(), graph = rigWalk(plan), planWays = new Set(plan.ways.map((w) => w.id)), solids = [...plan.obstacles, ...rigObstacles(rigPlan(plan))];
const spaces = new Map(plan.spaces.map((s) => [s.id, s]));
const sea = startSea(SEED, { speed: beaufortSpeed(DUEL_FORCES.most), toward: WIND_TOWARD }, 0);
let motion: ShipMotion = startMotion(0, 0, HEADING), t = 0;
const course = lyingStill(HEADING);
const start = plan.stations.find((s) => s.id === 'quarterdeck')!;
const captain = new Captain(plan, graph, start);
const failures: string[] = [];
let worstRoll = 0, nearest = Infinity, stood = 0;
const fail = (why: string) => { if (failures.length < 40) failures.push(`${t.toFixed(1)} s: ${why}`); };
const at = (s: Spot) => `${s.space} ${s.along.toFixed(2)}, ${s.across.toFixed(2)}`;

/** Distance from a point to an oblong in plan (0 inside). */
const toRect = (r: { aft: number; fore: number; port: number; starboard: number }, a: number, c: number) =>
  Math.hypot(Math.max(r.aft - a, 0, a - r.fore), Math.max(r.port - c, 0, c - r.starboard));
/** Distance from a point to a segment in plan, and how far along it (0..1). */
function toSegment(a: number, c: number, a0: number, c0: number, a1: number, c1: number): number {
  const da = a1 - a0, dc = c1 - c0, l2 = da * da + dc * dc, u = l2 > 0 ? Math.max(0, Math.min(1, ((a - a0) * da + (c - c0) * dc) / l2)) : 0;
  return Math.hypot(a - a0 - da * u, c - c0 - dc * u);
}

/** Within a door's doorway (its open width, along the way between its two ends). */
function inDoorway(leaf: DoorLeaf, a: number, c: number): boolean {
  const n = leaf.toward, depth = (a - leaf.middle[0]) * n[0] + (c - leaf.middle[1]) * n[1];
  const aside = (a - leaf.middle[0]) * n[1] - (c - leaf.middle[1]) * n[0];
  return Math.abs(aside) <= (DOOR.width - BODY.breadth) / 2 + SLACK && Math.abs(depth) <= Math.hypot(leaf.way.to.along - leaf.way.from.along, leaf.way.to.across - leaf.way.from.across) / 2 + SLACK;
}

let last: Spot | null = null, unasked = false;
/** The checks of one step while he walks. */
function checkWalking(): void {
  const w = captain.walker, s = spotOf(w), space = spaces.get(s.space)!, leaves = doorLeaves(plan);
  const doorway = leaves.find((l) => (l.way.from.space === s.space || l.way.to.space === s.space) && inDoorway(l, s.along, s.across));
  if (doorway && !doorPasses(captain.doors, doorway.id)) fail(`in ${doorway.id}'s doorway while it is not open`);
  // Feet on the floor of his space (in a doorway: of one of its two spaces), and the same carried into the world and back.
  if (!holds(space, s.along, s.across) && !doorway) fail(`outside ${space.id} at ${at(s)}`);
  const floor = shipY(floorAt(space, s.along, s.across));
  if (Math.abs(w.floor - floor) > SLACK) fail(`feet ${(w.floor - floor).toFixed(3)} m off the floor at ${at(s)}`);
  const world = toWorld(motion.pose, w.x, w.floor, w.z), back = frameToLocal(shipFrame(motion.pose), world[0], world[1], world[2]);
  if (Math.abs(back.y - floor) > CLEAR / 10 || Math.abs(back.x - w.x) > CLEAR / 10) fail(`fell through: his feet in the world are not on her floor at ${at(s)}`);
  // Her side at his feet and shoulders.
  const base = floorAt(space, s.along, s.across);
  for (const h of [base + BODY.height * 0.05, base + Math.min(w.height, BODY.height * 0.8)]) {
    const side = insideBreadth(s.along, h) - Math.abs(s.across);
    if (side < CLEAR) fail(`through her side (${side.toFixed(2)} m clear) at ${at(s)}`);
    nearest = Math.min(nearest, side);
  }
  // Every fitting, coaming, mast and gun on his level.
  for (const o of solids) {
    if (o.level !== space.level) continue;
    const d = toRect(o, s.along, s.across);
    if (d < CLEAR) fail(`into ${o.id} (${d.toFixed(2)} m clear) at ${at(s)}`);
    nearest = Math.min(nearest, d);
  }
  // Bulkheads: near one or across one only in an open doorway.
  for (const b of plan.bulkheads) {
    if (b.level !== space.level) continue;
    const [a0, c0, a1, c1] = b.athwart ? [b.at, b.from, b.at, b.to] : [b.from, b.at, b.to, b.at];
    const d = toSegment(s.along, s.across, a0, c0, a1, c1);
    const crossed = last && last.space !== s.space && b.between.includes(last.space) && b.between.includes(s.space);
    if ((d < CLEAR || crossed) && !(doorway && b.between.includes(doorway.way.from.space) && b.between.includes(doorway.way.to.space))) fail(`into the bulkhead between ${b.between.join(' and ')} (${d.toFixed(2)} m) at ${at(s)}`);
    if (!doorway) nearest = Math.min(nearest, d);
  }
  // The leaves: shut or swinging, never through him.
  for (const l of leaves) {
    if (l.way.from.space !== s.space && l.way.to.space !== s.space) continue;
    const swing = doorAngle(plan, captain.doors, l.id), c = Math.cos(swing), sn = Math.sin(swing);
    const la = l.shut[0] * c + l.toward[0] * sn, lc = l.shut[1] * c + l.toward[1] * sn;
    const d = toSegment(s.along, s.across, l.hinge[0], l.hinge[1], l.hinge[0] + la * l.width, l.hinge[1] + lc * l.width);
    if (d < BODY.breadth / 2 - SLACK * 1e4) fail(`${l.id}'s leaf through him (${d.toFixed(2)} m) at ${at(s)}`);
  }
  // His head under the beams (in a doorway, under its head).
  const underDoor = leaves.some((l) => (l.way.from.space === s.space || l.way.to.space === s.space) && underDoorHead(l, s.along, s.across));
  const head = w.floor + w.height, beams = shipY(overheadAt(space, s.along, s.across)), room = underDoor ? Math.min(beams, floor + DOOR.height) : beams;
  if (head > room + SLACK) fail(`head ${(head - room).toFixed(2)} m into the beams at ${at(s)}`);
  if (captain.eye[1] + EYE_BELOW_TOP > room + SLACK) fail(`eye above the beams at ${at(s)}`);
  last = s;
}

/** The checks of one step on a ladder: inside her, near the ladder's line. */
function checkClimbing(way: Way): void {
  const p = captain.climber!.pos, a = -p.z, c = p.x, f = way.from, h = way.to;
  const d = Math.min(toSegment(a, c, f.along, f.across, way.line!.head[0], way.line!.head[1]), toSegment(a, c, way.line!.head[0], way.line!.head[1], h.along, h.across));
  if (d > LADDER_ZONE) fail(`off ${way.id} by ${d.toFixed(2)} m`);
  // Heights above her base from ship space: shipY(0) is the base's ship-space height.
  const feet = p.y - shipY(0);
  if (Math.abs(c) > insideBreadth(a, feet) + SLACK && Math.abs(c) > insideBreadth(a, feet + BODY.height)) fail(`climbing out through her side on ${way.id}`);
  last = null;
}

/** One step of her and of him. */
function step(intent: { forward: number; strafe: number; heading: number }, planned: Way | null = null): void {
  motion = stepMotion(motion, sea, t, course);
  t += STEP_SECONDS;
  const p = motion.pose;
  if (![p.x, p.z, p.heave, p.heading, p.pitch, p.roll].every(Number.isFinite)) { fail('her pose is not a number: the check is not at sea'); return; }
  worstRoll = Math.max(worstRoll, Math.abs(p.roll));
  captain.update(intent, upOf(), STEP_SECONDS);
  const way = captain.ladder;
  if (way && way !== planned) { if (!unasked) fail(`climbed ${way.id} unasked at ${at(captain.spot)}`); unasked = true; }
  if (way) checkClimbing(way); else checkWalking();
}
const upOf = () => { const f = shipFrame(motion.pose), r = f.rotation; return { x: r[3]!, y: r[4]!, z: r[5]! }; };

const yawTo = (s: Spot, a: number, c: number) => Math.atan2(-(c - s.across), a - s.along);

/** The squares of a space's grid from his square to a goal's, by the walk graph's own squares (breadth first). */
function pathTo(goal: Spot): [number, number][] | null {
  const s = spotOf(captain.walker), g = graph.grids.get(s.space)!, sp = g.space;
  const col = (a: number) => Math.min(g.cols - 1, Math.floor((a - sp.aft) / WALK_CELL)), row = (c: number) => Math.min(g.rows - 1, Math.floor((c - sp.port) / WALK_CELL));
  const inGrid = (a: number, c: number) => holds(sp, a, c) && nodeAt(graph, { space: sp.id, along: a, across: c }) >= 0;
  // From a doorway's end beyond the grid, or to a goal in another space: straight there.
  if (!inGrid(s.along, s.across) || goal.space !== s.space || !inGrid(goal.along, goal.across)) return [[goal.along, goal.across]];
  const from = col(s.along) * g.rows + row(s.across), to = col(goal.along) * g.rows + row(goal.across);
  const prev = new Int32Array(g.cols * g.rows).fill(-1), queue = [from];
  prev[from] = from;
  for (let qi = 0; qi < queue.length && prev[to] === -1; qi++) {
    const i = queue[qi]!, cc = Math.floor(i / g.rows), rr = i % g.rows;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const nc = cc + dc, nr = rr + dr, k = nc * g.rows + nr;
      if (nc < 0 || nr < 0 || nc >= g.cols || nr >= g.rows || prev[k] !== -1 || g.node[k]! < 0) continue;
      // A diagonal only where both squares beside it are free too.
      if (dc && dr && (g.node[nc * g.rows + rr]! < 0 || g.node[cc * g.rows + nr]! < 0)) continue;
      prev[k] = i;
      queue.push(k);
    }
  }
  if (prev[to] === -1) return null;
  const out: [number, number][] = [];
  for (let i = to; i !== from; i = prev[i]!) out.push([sp.aft + (Math.floor(i / g.rows) + 0.5) * WALK_CELL, sp.port + ((i % g.rows) + 0.5) * WALK_CELL]);
  return out.reverse().concat([[goal.along, goal.across]]);
}

/** The length of a path from its point k on, m. */
const wayLeft = (path: readonly (readonly [number, number])[], k: number) => {
  let sum = 0;
  for (let i = k + 1; i < path.length; i++) sum += Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]);
  return sum;
};

/** Walk him to a spot of the space he is in (or straight on through a doorway or an open join to `straight`). */
function walkTo(goal: Spot, label: string, straight = false): boolean {
  const plot = () => (straight ? [[goal.along, goal.across] as [number, number]] : pathTo(goal));
  let path = plot(), on = captain.walker.place;
  if (!path) { fail(`no way on the graph to ${label} (${at(goal)}) from ${at(spotOf(captain.walker))}`); return false; }
  let best = Infinity, since = t, k = 0;
  for (;;) {
    const s = spotOf(captain.walker), d = Math.hypot(goal.along - s.along, goal.across - s.across);
    // Through a doorway into the goal's space: plot the way on from here.
    if (s.space !== on) {
      on = s.space;
      const next = plot();
      if (next) { path = next; k = 0; best = Infinity; }
    }
    if (d < ARRIVED && (s.space === goal.space || !straight || d < ARRIVED / 2)) return true;
    // Getting on means less of the way left (round what stands between, which may lead away from the goal first).
    const left = Math.hypot(path[k]![0] - s.along, path[k]![1] - s.across) + wayLeft(path, k);
    if (left < best - ARRIVED / 4) { best = left; since = t; }
    if (t - since > STUCK_SECONDS) { fail(`stuck on the way to ${label}, ${d.toFixed(2)} m short, at ${at(s)}`); return false; }
    while (k < path.length - 1 && Math.hypot(path[k]![0] - s.along, path[k]![1] - s.across) < LOOK_AHEAD) k++;
    const [ta, tc] = path[k]!;
    step({ forward: Math.min(1, d / LOOK_AHEAD + 1 / 2), strafe: 0, heading: yawTo(s, ta, tc) });
  }
}

/** Stand still a while: he must not slide. */
function standStill(): void {
  // He comes to a stop first (his pace eases off as it eased on), then stands.
  for (let i = 0; i < STAND_SECONDS / STEP_SECONDS; i++) step({ forward: 0, strafe: 0, heading: 0 });
  const a = spotOf(captain.walker);
  for (let i = 0; i < STAND_SECONDS / STEP_SECONDS; i++) step({ forward: 0, strafe: 0, heading: 0 });
  const b = spotOf(captain.walker), drift = Math.hypot(b.along - a.along, b.across - a.across);
  if (drift > STILL_DRIFT || a.space !== b.space) fail(`slid ${drift.toFixed(3)} m standing at ${at(a)}`);
  stood++;
}

/** Over a way from the end he stands at to its other end. */
function cross(way: Way, fromEnd: Spot, toEnd: Spot): boolean {
  if (!walkTo(fromEnd, `${way.id}'s end in ${fromEnd.space}`)) return false;
  if (way.kind !== 'ladder') return walkTo(toEnd, `through ${way.id} into ${toEnd.space}`, true);
  const up = fromEnd === way.from, line = way.line!;
  const ta = up ? line.foot[0] : fromEnd.along + line.down[0], tc = up ? line.foot[1] : fromEnd.across + line.down[1];
  const s = spotOf(captain.walker), heading = yawTo(s, ta, tc);
  let began = false;
  for (let i = 0; i < STUCK_SECONDS * 4 / STEP_SECONDS; i++) {
    step({ forward: captain.onLadder ? 0 : 1, strafe: 0, heading: captain.facing ?? heading }, way);
    if (captain.onLadder) began = true;
    else if (began) break;
    else if (i > STUCK_SECONDS / STEP_SECONDS) { fail(`${way.id} was not climbed ${up ? 'up' : 'down'} from ${at(s)}`); return false; }
  }
  const end = spotOf(captain.walker);
  if (end.space !== toEnd.space || Math.hypot(end.along - toEnd.along, end.across - toEnd.across) > ARRIVED) { fail(`off ${way.id} at ${at(end)}, not at ${at(toEnd)}`); return false; }
  return true;
}

// The decks' parts and ways (the rig's, aloft, are the captain's later, N3.11).
const deckNodes = graph.nodes.filter((n) => graph.grids.has(n.space)), deckEdges = graph.edges.filter((e) => planWays.has(e.way));
// The tour: from the quarterdeck through every way and back again (each way twice, once each way), standing still in every node of the graph.
const t0 = performance.now(), done = new Set<number>(), seenNode = new Set<number>(), crossed: string[] = [];
const nodeOf = (s: Spot) => nodeAt(graph, s);
/** A spot in the middle of a node: its free square nearest its squares' centre. */
function middleOf(node: number): Spot {
  const n = graph.nodes[node]!, g = graph.grids.get(n.space)!, sp = g.space;
  let sa = 0, sc = 0, count = 0;
  for (let i = 0; i < g.node.length; i++) if (g.node[i] === node) { sa += Math.floor(i / g.rows); sc += i % g.rows; count++; }
  let best = -1, bestD = Infinity;
  for (let i = 0; i < g.node.length; i++) {
    if (g.node[i] !== node) continue;
    const d = Math.hypot(Math.floor(i / g.rows) - sa / count, (i % g.rows) - sc / count);
    if (d < bestD) { bestD = d; best = i; }
  }
  return { space: sp.id, along: sp.aft + (Math.floor(best / g.rows) + 0.5) * WALK_CELL, across: sp.port + ((best % g.rows) + 0.5) * WALK_CELL };
}
function visit(node: number): void {
  if (!seenNode.has(node)) {
    seenNode.add(node);
    if (LOG) console.log(`${t.toFixed(1)} s  in ${graph.nodes[node]!.space}`);
    if (walkTo(middleOf(node), `the middle of ${graph.nodes[node]!.space}`)) standStill();
  }
  deckEdges.forEach((e, i) => {
    if (done.has(i) || (e.a !== node && e.b !== node)) return;
    done.add(i);
    const way = plan.ways.find((w) => w.id === e.way)!, forward = e.a === node;
    const [here, there] = forward ? [way.from, way.to] : [way.to, way.from];
    if (!cross(way, here, there)) return;
    crossed.push(`${way.id} ${forward ? 'out' : 'back'}`);
    if (LOG) console.log(`${t.toFixed(1)} s  ${way.kind} ${way.id} to ${there.space}`);
    const next = nodeOf(there);
    visit(next);
    if (cross(way, there, here)) crossed.push(`${way.id} ${forward ? 'back' : 'out'}`);
  });
}
visit(nodeOf(start));
// Back on deck, forward round the bowsprit's heel to where one gets onto it, across her aft of the heel, and aft again.
const bowsprit = rigObstacles(rigPlan(plan))[0]!;
const forward: Spot[] = [
  { space: 'deck', along: bowsprit.aft + 1, across: bowsprit.port - BESIDE_BOWSPRIT }, { space: 'deck', along: BOWSPRIT_STEP.along, across: -BOWSPRIT_STEP.across },
  { space: 'deck', along: bowsprit.aft + 1, across: bowsprit.starboard + BESIDE_BOWSPRIT }, { space: 'deck', along: BOWSPRIT_STEP.along, across: BOWSPRIT_STEP.across },
  { space: 'deck', along: start.along, across: start.across },
];
if (spotOf(captain.walker).space !== 'deck') fail(`the tour ended in ${spotOf(captain.walker).space}, not on deck`);
else for (const goal of forward) if (walkTo(goal, `the bowsprit's side at ${at(goal)}`)) standStill();

const ladders = plan.ways.filter((w) => w.kind === 'ladder');
const climbedBoth = ladders.filter((l) => crossed.filter((c) => c.startsWith(`${l.id} `)).length >= 2).length;
const spacesSeen = new Set([...seenNode].map((n) => graph.nodes[n]!.space));
if (worstRoll < LEAST_ROLL) fail(`she rolled only ${(worstRoll / DEGREE).toFixed(1)}°: not the strongest duel sea beam-on`);
if (seenNode.size < deckNodes.length) fail(`stood in ${seenNode.size} of ${deckNodes.length} parts of her spaces`);
if (crossed.length < deckEdges.length * 2) fail(`crossed ${crossed.length} of ${deckEdges.length * 2} ways`);
console.log(`walk everywhere: force ${DUEL_FORCES.most} beam-on, rolling up to ${(worstRoll / DEGREE).toFixed(1)}°; ${(t / 60).toFixed(1)} simulated minutes in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
console.log(`  ${spacesSeen.size} of ${plan.spaces.length} spaces (${seenNode.size} of ${deckNodes.length} parts, standing still in ${stood}), ${climbedBoth} of ${ladders.length} ladders up and down, ${crossed.length} of ${deckEdges.length * 2} ways crossed; nearest a solid part ${nearest.toFixed(2)} m`);
if (failures.length) {
  console.log(`FAILED (${failures.length}${failures.length >= 40 ? '+' : ''}):\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('  ok: never fell through, stuck, slid or passed through a solid part');
