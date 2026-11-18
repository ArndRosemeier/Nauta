/**
 * What her officers notice between two states (implementation plan N4.5, docs/design/orders.md "What you are told
 * without asking"): the things a man reports that no step raises as an event of its own, because they are not a deed
 * but a change seen. A sail sighted, her ports opened, our side ready, the guns bearing while they wait for the word,
 * the water in the well rising past a mark, the wind shifting or freshening, her drawing ahead or dropping astern while
 * the master keeps her on the beam. Pure, and kept nowhere: each is a mark
 * crossed between the state before a step and the state after it, so nothing new is held in the match's state and
 * every machine notices the same. The reports table (app/speech/reports.ts) gives each to the man who says it.
 */
import { angleDiff } from '@futuremagic/core';
import { sideReports } from './captain/sight';
import { founderTonnes } from './damage/flood';
import { waterIn } from './end';
import { POINT } from './rules/orders';
import type { SimState } from './state';
import { simTime } from './state';
import { bearingTo } from './units';
import { meanWind } from './wind';

/** Something an officer of ship `ship` notices. `side` is -1 larboard, 1 starboard; `off` her bearing off our bow, rad (+ starboard). */
export type Notice =
  | { readonly kind: 'sighted'; readonly tick: number; readonly ship: number; readonly off: number }
  | { readonly kind: 'ports'; readonly tick: number; readonly ship: number }
  | { readonly kind: 'side ready'; readonly tick: number; readonly ship: number; readonly side: -1 | 1 }
  | { readonly kind: 'guns bear'; readonly tick: number; readonly ship: number; readonly side: -1 | 1 }
  | { readonly kind: 'water'; readonly tick: number; readonly ship: number; readonly mark: number }
  | { readonly kind: 'wind'; readonly tick: number; readonly how: 'shifts' | 'freshens' | 'eases' }
  | { readonly kind: 'off beam'; readonly tick: number; readonly ship: number; readonly how: OffBeam };

/** Where she lies against our beam: drawing ahead of it or dropping astern of it. */
export type OffBeam = 'ahead' | 'astern';

/** The water marks the carpenter reports as the water passes them rising, as shares of what founders her: some, gaining, settling. */
export const WATER_MARKS: readonly number[] = [0.08, 0.3, 0.6];
/** How far back the master compares the wind with, s: a shift or a change of strength over about a minute is what he feels. */
const WIND_MEMORY = 60;
/** A shift of the wind he reports: a point. */
const WIND_SHIFT = POINT;
/** A change of the wind's strength he reports, as a share of what it was a minute ago: up a quarter, or down a fifth. */
const FRESHENS = 1.25;
const EASES = 0.8;
/**
 * How far forward or abaft our beam she may lie while the master keeps her on it (orders.md "Keep her") before he
 * reports her drawing ahead or dropping astern: two points. He holds her bearing with the helm only; her distance
 * along our side is the captain's business with sail.
 */
const OFF_BEAM = 2 * POINT;
/** Abeam: a quarter turn off the bow, rad. */
const ABEAM = Math.PI / 2;
/** The index of the larboard and starboard reports in `sideReports`, and their sides. */
const SIDES = [[0, -1], [1, 1]] as const;

/** Her bearing off ship `ship`'s bow, rad (+ starboard), and whether there is another ship at all. */
export function herOff(s: SimState, ship: number): number | null {
  const other = s.ships[1 - ship];
  if (s.ships.length < 2 || !other) return null;
  const me = s.ships[ship]!.motion.pose, her = other.motion.pose;
  return angleDiff(s.ships[ship]!.sailing.heading, bearingTo(me, her));
}

/** Where she lies against our beam while ship `ship`'s master keeps her on it: ahead or astern of it, or null (near abeam, or no such order). */
function offBeam(s: SimState, ship: number): OffBeam | null {
  const off = s.ships[ship]?.told.keep?.kind === 'abeam' ? herOff(s, ship) : null;
  if (off === null) return null;
  const abaft = Math.abs(off) - ABEAM;
  if (abaft < -OFF_BEAM) return 'ahead';
  return abaft > OFF_BEAM ? 'astern' : null;
}

/** The wind's shift and its strength now against a minute ago, at time `t`. */
function windChange(s: SimState, t: number): { shift: number; ratio: number } {
  const now = meanWind(s.wind, t), was = meanWind(s.wind, Math.max(0, t - WIND_MEMORY));
  return { shift: Math.abs(angleDiff(now.from, was.from)), ratio: was.speed > 0 ? now.speed / was.speed : 1 };
}

/**
 * What the officers of ship `ship` notice as the match goes from `before` to `after` (one step on). `firstLook`: the
 * first step they look round in (the match's first, or the first a page sees): the lookout reports her sail then.
 */
export function noticed(before: SimState, after: SimState, ship: number, firstLook = before.tick === 0): Notice[] {
  const out: Notice[] = [], tick = before.tick, mine = after.ships[ship], was = before.ships[ship];
  if (!mine || !was) return out;
  const off = herOff(after, ship), offBefore = herOff(before, ship);
  // The lookout: her sail at the first look; her ports opening.
  if (off !== null && firstLook) out.push({ kind: 'sighted', tick, ship, off });
  const her = after.ships[1 - ship], herWas = before.ships[1 - ship];
  if (off !== null && her && herWas && her.told.quarters && !herWas.told.quarters) out.push({ kind: 'ports', tick, ship });
  // The gunner: a side all ready; ready guns bearing on her while they wait for a word.
  if (off !== null && offBefore !== null) {
    const now = sideReports(mine, off, off), then = sideReports(was, offBefore, offBefore);
    for (const [i, side] of SIDES) {
      const a = now[i], b = then[i];
      if (a.mounted > 0 && a.ready === a.mounted && b.ready < b.mounted) out.push({ kind: 'side ready', tick, ship, side });
      if (mine.told.firing !== 'bear' && a.readyBearing > 0 && b.readyBearing === 0) out.push({ kind: 'guns bear', tick, ship, side });
    }
  }
  // The carpenter: the water rising past a mark.
  const full = founderTonnes();
  WATER_MARKS.forEach((m, mark) => {
    if (waterIn(mine.damage) > m * full && waterIn(was.damage) <= m * full) out.push({ kind: 'water', tick, ship, mark });
  });
  // The master keeping her on the beam: her drawing ahead of it or dropping astern of it (also as the order is given).
  const beam = offBeam(after, ship);
  if (beam && beam !== offBeam(before, ship)) out.push({ kind: 'off beam', tick, ship, how: beam });
  // The master: the wind shifting a point, freshening or easing over the last minute.
  const w = windChange(after, simTime(after)), v = windChange(before, simTime(before));
  if (w.shift >= WIND_SHIFT && v.shift < WIND_SHIFT) out.push({ kind: 'wind', tick, how: 'shifts' });
  if (w.ratio >= FRESHENS && v.ratio < FRESHENS) out.push({ kind: 'wind', tick, how: 'freshens' });
  if (w.ratio <= EASES && v.ratio > EASES) out.push({ kind: 'wind', tick, how: 'eases' });
  return out;
}
