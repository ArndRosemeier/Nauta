/**
 * The ladders a body climbs as the figure sees them (@futuremagic/figure `Ladder`, ship space): a deck ladder's foot and
 * head, a mast's shrouds with the futtock shrouds over their rim, and which of them a man is on at a height. The captain
 * climbs them played out (captain.ts, aloftClimb.ts); the crew's men climb them by their height along the way
 * (`crewLadder`, drawn by render/crew/climbRig.ts).
 */
import type { Ladder, OnLadder } from '@futuremagic/figure';
import { shipY, shipZ } from '../sim/ship/section';
import { shipPlan, type Way } from '../sim/ship/plan';
import { aloftWay } from '../sim/ship/aloftWalk';
import { rigPlan } from '../sim/ship/rig';

/** A ladder's two halves for the figure, in ship space: from its foot (on at the bottom) and at its head (off at the top). */
export function ladderOf(way: Way): { foot: Ladder; head: Ladder } {
  const line = way.line!, [fa, fc, fh] = line.foot, [ha, hc, hh] = line.head;
  const y0 = shipY(fh), y1 = shipY(hh), rung = way.rise;
  // Into the ladder's "wall" is the way it climbs: toward its head, in ship space (x across, z aft).
  const nx = line.toward[1], nz = -line.toward[0];
  const common = { nx, nz, halfWidth: way.width / 2, rung, lean: Math.hypot(ha - fa, hc - fc) / (hh - fh) };
  return {
    foot: { ...common, x: fc, z: shipZ(fa), lo: y0 + rung, hi: y1, floor: y0, rim: false },
    head: { ...common, x: hc, z: shipZ(ha), lo: y1, hi: y1, floor: y1, rim: false },
  };
}

/** The ladder of a climb at a height `y` (ship space), and the feet's height over its base there: the one over the rim once above its start. */
export function ladderAt(bottom: Ladder, rim: Ladder | null, y: number): OnLadder {
  const l = rim && y > rim.lo ? rim : bottom;
  return { ladder: l, h: y - (l.rim ? l.lo : l.floor) };
}

/** What a man on a way is climbing: the way (its id and kind, as the route's leg has them) and whether he goes up it. */
export interface CrewClimb {
  readonly way: string;
  readonly kind: string;
  readonly up: boolean;
}

/** The kinds of way a man climbs hand over hand: a deck ladder, a mast's shrouds, the topmast shrouds. */
export const CLIMBED = new Set(['ladder', 'shrouds', 'topmast shrouds']);

const deckLadders = new Map<string, Ladder>();

/** Where a man on `c` with his feet at `y` (ship space) is on its ladders, or null (not a way he climbs). */
export function crewLadder(c: CrewClimb, y: number): OnLadder | null {
  if (c.kind === 'ladder') {
    let l = deckLadders.get(c.way);
    if (!l) {
      const way = shipPlan().ways.find((w) => w.id === c.way);
      if (!way?.line) return null;
      l = ladderOf(way).foot;
      deckLadders.set(c.way, l);
    }
    return { ladder: l, h: Math.max(0, y - l.floor) };
  }
  if (c.kind !== 'shrouds' && c.kind !== 'topmast shrouds') return null;
  const [bottom, rim] = aloftWay(rigPlan(), c.way).ladders;
  if (!bottom) return null;
  const on = ladderAt(bottom, rim ?? null, y);
  return { ladder: on.ladder, h: Math.max(0, on.h) };
}
