/**
 * The walk check's tour aloft (implementation plan N3.11, part of `npm run walk:check`; `-- --aloft` for it alone):
 * in the same sea, the captain goes up every mast's shrouds on both sides to the top, up the topmast shrouds to the
 * crosstrees (the masthead), up the topgallant shrouds, across onto every yard's footrope and out to its yardarm and
 * back, down again to her deck; onto the bowsprit, out along it and out on both of the jib-boom's footropes to its
 * end, and back on deck. Each step is checked: on the shrouds he keeps to them, on a footrope to it, standing on a
 * top, the crosstrees or the bowsprit he stands where one may, his body never jumps and nothing stops being a number.
 * It fails if he sticks, if a masthead or a yardarm is not reached, or if he never had to hold on (not the sea the
 * check names).
 */
import { yardPoint, type Ladder } from '@futuremagic/figure';
import type { Captain } from '../../src/app/captain.ts';
import { LOOK_UP } from '../../src/sim/rules/walking.ts';
import type { RigPlan } from '../../src/sim/ship/rig.ts';
import type { Spot } from '../../src/sim/ship/plan.ts';
import { aloftWay, bowspritStep, chainOf, floorAloft, standsOn, surfaceOf, type Chain } from '../../src/sim/ship/aloftWalk.ts';
import { spotOf } from '../../src/sim/ship/deckWalk.ts';

type Intent = { forward: number; strafe: number; heading: number };

/** What the tour needs of the walk check: the captain, a step of her and of him, its failures and clock, its walking. */
export interface WalkTour {
  readonly captain: Captain;
  readonly rig: RigPlan;
  step(intent: Intent, planned?: null, pitch?: number): void;
  fail(why: string): void;
  time(): number;
  walkTo(goal: Spot, label: string): boolean;
  standStill(): void;
  at(s: Spot): string;
  readonly log: boolean;
}

/** Each part of the tour (up the shrouds, out along a yard) is done within this, s, or he is stuck. */
const PART_SECONDS = 180;
/** On the shrouds his body keeps within this of their line, m (it hangs out from them, sways as she rolls). */
const SHROUD_ZONE = 0.8;
/** On a footrope his body keeps within this of the rope where he is along it, m. */
const ROPE_ZONE = 0.9;
/** His body moves at most this far in one step, m (a step is a thirtieth of a second: a brisk walk is 0.05). */
const MOST_STEP = 0.15;
/** Out at a yardarm: within this of the footrope's end, m. */
const ARM_SLACK = 0.05;
/** Looking up to climb the shrouds over a top, rad past the look that does it. */
const LOOK_MORE = 0.1;
/** A push, and a small one aside (to choose the jib-boom's footrope on a side). */
const FULL = 1;
const ASIDE = 0.3;

export function aloftTour(tour: WalkTour) {
  const { captain: c, rig } = tour;
  const reached = new Set<string>();
  let asked = false, held = 0, gripped = 0;
  const last = { x: NaN, y: NaN, z: NaN, t: NaN };

  /** Each step while he climbs: on the shrouds, on a footrope, or between. */
  function checkClimbing(): void {
    const p = c.climber!.pos, on = c.aloft.on!, e = c.eye;
    if (![p.x, p.y, p.z, ...e].every(Number.isFinite)) { tour.fail('his body aloft is not a number'); return; }
    if (!(tour.time() - last.t < 2 / 30)) last.x = NaN;
    last.t = tour.time();
    if (Number.isFinite(last.x) && Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z) > MOST_STEP) tour.fail(`his body jumped ${Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z).toFixed(2)} m aloft at ${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}`);
    last.x = p.x; last.y = p.y; last.z = p.z;
    const grip = c.climber!.grip;
    if (grip > gripped) gripped = grip;
    if (grip > 1 / 2) held += 1 / 30;
    if (on.kind === 'chain') {
      const l = ladderAt(on.chain, on.y), off = offLine(l, p.x, p.y, p.z);
      if (off > SHROUD_ZONE) tour.fail(`off the shrouds (${on.chain.climb.mast} ${on.chain.tier}) by ${off.toFixed(2)} m`);
    } else if (on.kind === 'yard') {
      const yard = on.surface.yard!, q = { x: 0, y: 0, z: 0 };
      yardPoint(yard, on.s, 0, 0, q);
      const off = Math.hypot(p.x - q.x, p.z - q.z);
      if (off > ROPE_ZONE) tour.fail(`off ${on.surface.id} by ${off.toFixed(2)} m`);
      if (Math.abs(on.s) >= yard.reach - ARM_SLACK) reached.add(on.surface.id);
    }
  }

  /** Each step standing on a top, the crosstrees or the bowsprit: where one may stand, on its floor. */
  function checkStanding(): void {
    const w = c.walker, s = spotOf(w), surface = surfaceOf(rig, s.space)!;
    last.x = NaN;
    if (!standsOn(rig, surface, s.along, s.across)) tour.fail(`standing where one may not on ${surface.id} at ${tour.at(s)}`);
    if (Math.abs(w.floor - floorAloft(surface, s.along)) > 1e-6) tour.fail(`feet off ${surface.id}'s floor at ${tour.at(s)}`);
    if (surface.kind === 'crosstrees') reached.add(surface.id);
  }

  /** Steps until `done`, pushing as `intent` says (the look turned the way he faces while he climbs); false: stuck. */
  function until(label: string, done: () => boolean, intent: () => Intent, pitch = 0): boolean {
    const t0 = tour.time();
    while (!done()) {
      if (tour.time() - t0 > PART_SECONDS) { tour.fail(`stuck ${label}`); return false; }
      tour.step(intent(), null, pitch);
    }
    if (tour.log) console.log(`${tour.time().toFixed(1)} s  ${label}`);
    return true;
  }
  /** The look's yaw that faces a way across her (x, z), or the way he faces climbing. */
  const facingOr = (yaw: number) => c.facing ?? yaw;
  const toward = (x: number, z: number) => Math.atan2(-x, -z);
  /** Pushing straight on, or aside (+ right) relative to the way he faces. */
  const ahead = (yaw: number, forward = FULL) => () => ({ forward, strafe: 0, heading: facingOr(yaw) });
  const standing = (surface: string) => () => !c.aloft.active && c.walker.place === surface;
  const onChain = () => c.aloft.on?.kind === 'chain';
  const chainY = () => { const on = c.aloft.on; return on?.kind === 'chain' ? on.y : NaN; };

  /** Level with a yard's footrope: across onto it, out to its yardarm, back in and onto the shrouds again. */
  function outAlongYard(chain: Chain, wayId: string): boolean {
    const way = aloftWay(rig, wayId), yard = surfaceOf(rig, way.to.space)!.yard!, out = Math.sign(way.to.across - yard.x) || 1;
    // Aside toward the yard (forward of the shrouds): his right is (cos f, -sin f) facing f.
    const aside = () => { const f = c.facing ?? 0; return Math.sign(Math.sin(f)) || 1; };
    if (!until(`up ${chain.climb.mast} ${chain.tier} to ${wayId}`, () => chainY() >= way.at! - FOOTROPE_NEAR, ahead(0))) return false;
    if (!until(`across onto ${way.to.space}`, () => c.aloft.on?.kind === 'yard', () => ({ forward: 0, strafe: aside(), heading: facingOr(0) }))) return false;
    // Along the yard: the push aside that goes out (his right, facing the yard, is along `ax`, `az` signed).
    const along = (sign: number) => () => { const f = c.facing ?? 0, r = Math.cos(f) * yard.ax - Math.sin(f) * yard.az; return { forward: 0, strafe: sign * out * (Math.sign(r) || 1), heading: facingOr(0) }; };
    if (!until(`out to ${way.to.space}'s yardarm`, () => reached.has(way.to.space), along(1))) return false;
    return until(`back onto the shrouds from ${way.to.space}`, onChain, along(-1));
  }

  /** Up a mast's shrouds on a side, every yard and the crosstrees, and down again. */
  function mast(mastName: 'fore' | 'main', side: 1 | -1): void {
    const s = side > 0 ? 's' : 'p', lower = chainOf(rig, mastName, side, 'lower'), upper = chainOf(rig, mastName, side, 'upper'), top = chainOf(rig, mastName, side, 'topgallant');
    const outboard = toward(side, 0);
    if (!tour.walkTo(lower.below, `the ${mastName} shrouds, ${s}`)) return;
    asked = true;
    if (!until(`onto the ${mastName} shrouds, ${s}`, onChain, ahead(outboard))) return;
    if (!outAlongYard(lower, `${mastName}-yard-${s}`)) return;
    if (!until(`up onto the ${mastName} top`, standing(lower.above!), ahead(0))) return;
    tour.standStill();
    if (!until(`onto the ${mastName} topmast shrouds, ${s}`, onChain, ahead(outboard), LOOK_UP + LOOK_MORE)) return;
    if (!outAlongYard(upper, `${mastName}-topsail-yard-${s}`)) return;
    if (!until(`up onto the ${mastName} crosstrees`, standing(upper.above!), ahead(0))) return;
    tour.standStill();
    if (!until(`onto the ${mastName} topgallant shrouds, ${s}`, onChain, ahead(outboard), LOOK_UP + LOOK_MORE)) return;
    if (!outAlongYard(top, `${mastName}-topgallant-yard-${s}`)) return;
    if (!until(`down onto the ${mastName} crosstrees`, standing(upper.above!), ahead(0, -FULL))) return;
    if (!until(`over the ${mastName} crosstrees' rim, ${s}`, onChain, ahead(outboard))) return;
    if (!until(`down onto the ${mastName} top`, standing(lower.above!), ahead(0, -FULL))) return;
    if (!until(`over the ${mastName} top's rim, ${s}`, onChain, ahead(outboard))) return;
    if (!until(`down onto her deck from the ${mastName} shrouds, ${s}`, standing(lower.below.space), ahead(0, -FULL))) return;
    asked = false;
  }

  /** Onto the bowsprit, out on each of the jib-boom's footropes to its end and back, and down onto her deck. */
  function bowsprit(): void {
    const step = bowspritStep(1);
    if (!tour.walkTo(step, 'the bowsprit')) return;
    asked = true;
    tour.standStill();
    if (!until('onto the bowsprit', standing('bowsprit'), ahead(toward(-1, 0)))) return;
    for (const side of [1, -1] as const) {
      const rope = `jib-boom-footrope-${side > 0 ? 's' : 'p'}`, yard = surfaceOf(rig, rope)!.yard!;
      if (!until(`out along the bowsprit and onto ${rope}`, () => c.aloft.on?.kind === 'yard', () => ({ forward: FULL, strafe: c.aloft.active ? 0 : side * ASIDE, heading: c.facing ?? 0 }))) return;
      // Out along the boom: the push aside facing it (his right, facing (nx, nz), is along +s when the boom runs that way).
      const along = (sign: number) => () => { const f = c.facing ?? 0, r = Math.cos(f) * yard.ax - Math.sin(f) * yard.az; return { forward: 0, strafe: sign * (Math.sign(r) || 1), heading: facingOr(0) }; };
      if (!until(`out to the jib-boom's end on ${rope}`, () => reached.has(rope), along(1))) return;
      if (!until(`back onto the bowsprit from ${rope}`, standing('bowsprit'), along(-1))) return;
    }
    if (!until('back along the bowsprit and down onto her deck', standing('deck'), ahead(0, -FULL))) return;
    asked = false;
  }

  return {
    get asked() { return asked; },
    checkClimbing,
    checkStanding,
    run(): void {
      for (const m of ['main', 'fore'] as const) for (const side of [1, -1] as const) mast(m, side);
      bowsprit();
      if (gripped < 1) tour.fail('he never held on aloft: not the sea the check names');
      const goals = rig.surfaces.filter((x) => x.kind === 'footrope' || x.kind === 'crosstrees');
      const missed = goals.filter((x) => !reached.has(x.id));
      if (missed.length) tour.fail(`not reached aloft: ${missed.map((x) => x.id).join(', ')}`);
    },
    result: () => ({ reached: reached.size, goals: rig.surfaces.filter((x) => x.kind === 'footrope' || x.kind === 'crosstrees').length, held }),
  };
}

/** Within this of a footrope's height he steps across onto it (rules/walking.ts `FOOTROPE_REACH`, less a little). */
const FOOTROPE_NEAR = 0.3;

/** The ladder of a chain at a height. */
const ladderAt = (chain: Chain, y: number): Ladder => (chain.rim && y > chain.rim.lo ? chain.rim : chain.bottom);

/** How far a point is from a ladder's rungs' line at its height, in plan (m). */
function offLine(l: Ladder, x: number, y: number, z: number): number {
  const base = l.rim ? l.lo : l.floor, lean = (l.lean ?? 0) * (y - base);
  return Math.hypot(x - (l.x + l.nx * lean), z - (l.z + l.nz * lean));
}
