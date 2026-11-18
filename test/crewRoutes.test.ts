import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decode, encode } from '../src/sim/codec.ts';
import { addBlock, closeWay, openShip } from '../src/sim/crew/closures.ts';
import { routeNetwork } from '../src/sim/crew/network.ts';
import { findRoute, routeTime, type Conditions, type Route } from '../src/sim/crew/route.ts';
import { PACE, SMART } from '../src/sim/rules/routes.ts';
import { QUARTERDECK, WAY_STANDOFF } from '../src/sim/rules/ships.ts';
import { floorAt, shipPlan, type Spot } from '../src/sim/ship/plan.ts';
import { rigPlan } from '../src/sim/ship/rig.ts';
import { pace } from './support/pace.ts';

const plan = shipPlan();
const rig = rigPlan(plan);
const net = routeNetwork();
const calm: Conditions = { heel: 0, haste: 'walk', closures: openShip() };
const stations = [...plan.stations, ...rig.stations];
const station = (id: string): Spot => stations.find((s) => s.id === id)!;
const ways = (r: Route | null) => (r ? r.legs.flatMap((l) => (l.way ? [l.way] : [])) : []);
const deck = plan.spaces.find((s) => s.id === 'deck')!;
/** A hand reckoning and the route's time agree within this share. */
const HAND = 0.05;
/** The wheel to the capstan is no longer than the straight line by more than this share. */
const BENDS = 1.1;
/** Routes timed, and the sine and cosine pairs one may take found again. */
const ROUTES_TIMED = 10;
const PAIRS_PER_ROUTE = 10_000;
const near = (got: number, want: number, share = HAND) => assert.ok(Math.abs(got - want) <= share * want, `${got.toFixed(2)} s, by hand ${want.toFixed(2)} s`);

test('any station reaches any other, aloft and below, and every crew place is reached from the quarterdeck', () => {
  for (const a of stations) for (const b of stations) if (a !== b) assert.ok(findRoute(a, b, calm), `${a.id} to ${b.id}`);
  const q = station(QUARTERDECK);
  for (const p of [...plan.places, ...rig.places]) assert.ok(findRoute(q, p, calm), p.id);
});

test('a route is plain data, the same every time, and its legs join end to end', () => {
  const r = findRoute(station('magazine'), station('masthead'), calm)!;
  assert.deepEqual(decode(encode(r)), r);
  assert.deepEqual(findRoute(station('magazine'), station('masthead'), calm), r);
  assert.deepEqual(ways(r).slice(0, 2), ['magazine-ladder', 'after-ladder']);
  for (let i = 1; i < r.legs.length; i++) {
    const a = r.legs[i - 1]!, b = r.legs[i]!;
    assert.equal(a.ends, b.space);
    assert.deepEqual(a.line.slice(-2), b.line.slice(0, 2), `leg ${i}`);
  }
});

test('route times match hand reckonings: up the main shrouds to the top, the wheel to the capstan, the fore ladder to the waist', () => {
  // Up the starboard main shrouds: the deck at the shroud place to the top's floor; the futtock shrouds from their
  // lowest ratline to the top's rim are hung back from, the rest is ratlines; then across the top to its middle.
  const foot = plan.places.find((p) => p.id === 'shroud-main-s')!, top = rig.surfaces.find((s) => s.id === 'main-top')!;
  const futtock = rig.climbs.find((c) => c.mast === 'main' && c.side === 1)!.futtock;
  const height = top.points[0]!.height - floorAt(deck, foot.along, foot.across), overhang = futtock.floor - futtock.lo;
  const onTop = rig.ways.find((w) => w.id === 'main-shrouds-s')!.to.across;
  near(routeTime(findRoute(foot, station('main-top'), calm)!, 0, 'walk'), (height - overhang) / PACE.ratlinesUp + overhang / PACE.overhangUp + onTop / PACE.aloft);
  // The wheel to the capstan on the open quarterdeck: at the walking pace over the route's own line, which bends only
  // round the A carronades and the buckets (her tumblehome brings them inboard there, N2.12).
  const wheel = station('wheel'), capstan = station(QUARTERDECK), aft = findRoute(wheel, capstan, calm)!;
  near(routeTime(aft, 0, 'walk'), aft.legs[0]!.length / PACE.walk);
  assert.ok(aft.legs.length === 1 && aft.legs[0]!.length < Math.hypot(capstan.along - wheel.along, capstan.across - wheel.across) * BENDS, 'nearly straight');
  // From the fore ladder's foot up to the waist: the ladder's height, then round the fore hatch's starboard coaming
  // a body's half breadth (0.3 m) clear of it, and across to the waist.
  const ladder = plan.ways.find((w) => w.id === 'fore-ladder')!, hatch = plan.obstacles.find((o) => o.id === 'fore-hatch')!, waist = station('waist');
  const clear = 0.3, side = hatch.starboard + clear;
  const walk = Math.abs(side - ladder.to.across) + Math.abs(ladder.to.along - (hatch.aft - clear)) + Math.hypot(hatch.aft - clear - waist.along, side - waist.across);
  near(routeTime(findRoute(ladder.from, waist, calm)!, 0, 'walk'), (ladder.rise * ladder.steps) / PACE.ladderUp + walk / PACE.walk);
  assert.ok(Math.abs(ladder.to.along - (hatch.fore + WAY_STANDOFF)) < clear, 'the ladder\'s head is forward of the hatch');
});

test('a shut ladder reroutes, wreckage across the deck sends men below, and a shut door leaves a cabin unreached', () => {
  const messdeck: Spot = { space: 'messdeck', along: 6, across: 1.5 };
  assert.deepEqual(ways(findRoute(messdeck, station('waist'), calm)), ['fore-ladder']);
  const shut = { ...calm, closures: closeWay(openShip(), 'fore-ladder') };
  const round = findRoute(messdeck, station('waist'), shut)!;
  assert.ok(!ways(round).includes('fore-ladder') && ways(round).includes('after-ladder'), ways(round).join(' '));
  assert.ok(routeTime(round, 0, 'walk') > routeTime(findRoute(messdeck, station('waist'), calm)!, 0, 'walk'));
  // A fallen spar across the whole deck abaft the foremast: from the bow to the wheel by the berth deck.
  const bow: Spot = { space: 'deck', along: 17, across: 1.5 };
  const wreck = { ...calm, closures: addBlock(openShip(), { id: 'spar', space: 'deck', aft: 6, fore: 7, port: -deck.starboard, starboard: deck.starboard }) };
  // Over the open deck the only ways are the ladders down from the forecastle and up to the quarterdeck (N2.12).
  assert.ok(ways(findRoute(bow, station('wheel'), calm)).every((w) => /^(forecastle|quarterdeck)-ladder-[ps]$/.test(w)));
  const below = ways(findRoute(bow, station('wheel'), wreck));
  assert.ok(below.indexOf('fore-ladder') >= 0 && below.indexOf('fore-ladder') <= 1, below.join(' '));
  assert.ok(below.some((w) => w === 'after-ladder' || w === 'companion-ladder'), below.join(' '));
  assert.equal(findRoute(station('waist'), station('surgeon'), { ...calm, closures: closeWay(openShip(), 'cockpit-door') }), null);
});

test('she heels: men go aloft by the weather shrouds, and every way takes longer', () => {
  const quarterdeck = station(QUARTERDECK), top = station('main-top');
  // Heel + is starboard down, so the larboard shrouds are the weather ones.
  assert.ok(ways(findRoute(quarterdeck, top, { ...calm, heel: 0.2 })).includes('main-shrouds-p'));
  assert.ok(ways(findRoute(quarterdeck, top, { ...calm, heel: -0.2 })).includes('main-shrouds-s'));
  const r = findRoute(station('wheel'), station('surgeon'), calm)!;
  assert.ok(routeTime(r, 0.2, 'walk') > routeTime(r, 0, 'walk') * (1 + HAND));
  // Smartly is faster, and stooping on the berth deck slower than the open deck.
  assert.ok(routeTime(r, 0, 'smart') < routeTime(r, 0, 'walk') / Math.min(...Object.values(SMART)) * (1 + HAND));
  const berth = findRoute({ space: 'messdeck', along: 6, across: 1.5 }, { space: 'messdeck', along: 10, across: 1.5 }, calm)!;
  assert.ok(routeTime(berth, 0, 'walk') > berth.legs[0]!.length / PACE.walk * (1 + HAND));
});

test('a route found again to a place already walked to costs little', () => {
  const guns = plan.places.filter((p) => p.kind === 'gun').slice(0, ROUTES_TIMED), pins = plan.places.filter((p) => p.kind === 'pin');
  const find = () => { for (let i = 0; i < guns.length; i++) findRoute(guns[i]!, pins[(i * 7) % pins.length]!, calm); };
  find();
  // About 0.1 ms a route on the cloud machine, as long as some 3,000 sine and cosine pairs; the first route to a
  // place lays its floor's distance field, about a millisecond, and is not timed here.
  const t0 = performance.now(); find(); const once = performance.now() - t0;
  const share = pace(find, guns.length * PAIRS_PER_ROUTE);
  assert.ok(share < 1, `${share.toFixed(2)} of ${PAIRS_PER_ROUTE} pairs a route (${(once / guns.length).toFixed(3)} ms)`);
  assert.ok(net.portals.length > 0);
});
