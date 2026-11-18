/**
 * The guns' rules (implementation plan N5.1 and N5.2; docs/ARCHITECTURE.md: rules as data): each kind of gun's arcs,
 * its drill and its reload, how laying goes, and what short hands do to it. Read by src/sim/guns/.
 *
 * **First proposals** (design thread, "Design decisions for N5", 2026-11-18), tuned at gate G5 and in N7.5. The
 * muzzle speeds, arcs and reloads are the design thread's; how a reload is shared out over the drill and how fast a
 * gun is laid are this file's own, from the drill books of the time (a carronade's crew could fire about once a
 * minute and better, a long gun about as often), shortened for pace. Pure.
 */
import { DEGREE } from '../units';
import type { GunKind } from './ships';

/**
 * The drill, in order (the drill books' words): sponge out the bore after a round, load (cartridge, wad, shot, wad),
 * ram it home, run her out to the port, then she stands ready; fired, she leaps back on her breeching (the recoil) and
 * stands run in, foul, to be sponged. A loaded gun can be run in again without firing (she then stands loaded).
 * `housed` is run in, empty and clean: how she stands at the start and after sponging.
 * The working steps take the crew's hands; the waiting steps wait for an order (to load, to run out) or to be fired.
 */
export type DrillStep = 'housed' | 'loading' | 'ramming' | 'loaded' | 'running-out' | 'ready' | 'running-in' | 'recoil' | 'sponging';

/** The steps worked by the crew's hands, and the share of a reload's handwork each takes (they add up to one, tested). */
export type HandStep = 'sponging' | 'loading' | 'ramming' | 'running-out';
export const DRILL_SHARES: Readonly<Record<HandStep, number>> = {
  sponging: 0.25,
  loading: 0.3,
  ramming: 0.15,
  'running-out': 0.3,
};

/** One kind of gun. */
export interface GunRow {
  readonly what: string;
  /** How far she trains either way of square to her side, rad (at her port, on her slide or with handspikes). */
  readonly train: number;
  /** How far she depresses below and elevates above her deck's level, rad (the elevating screw or the quoin). */
  readonly depress: number;
  readonly elevate: number;
  /** Seconds from firing to standing ready again (run out, loaded) with her full crew: the recoil and the handwork. */
  readonly reload: number;
  /** Seconds she takes to leap back on her breeching and come to rest; no hands are needed for it. */
  readonly recoil: number;
  /** Seconds of full-crew work to run her in again without firing. */
  readonly runIn: number;
  /** How fast her full crew trains her and elevates her, rad/s (train tackles or handspikes; the screw or the quoin). */
  readonly trainRate: number;
  readonly elevateRate: number;
}

/**
 * The brig's two kinds (ship.md; design decisions for N5): the 32-pounder carronade on its slide, 8 a side, and the
 * long 6-pounder on its truck carriage, one a side in the foremost ports. Both elevate from 5° down to 11° up. The
 * carronade's slide pivots at the port and trains with its tackles, so it slews faster than the long gun, which is
 * levered round by handspikes.
 */
export const GUNS: Readonly<Record<GunKind, GunRow>> = {
  carronade: {
    what: '32-pounder carronade', train: 30 * DEGREE, depress: 5 * DEGREE, elevate: 11 * DEGREE,
    reload: 35, recoil: 1.5, runIn: 6, trainRate: 5 * DEGREE, elevateRate: 2 * DEGREE,
  },
  long6: {
    what: 'long 6-pounder', train: 20 * DEGREE, depress: 5 * DEGREE, elevate: 11 * DEGREE,
    reload: 30, recoil: 1.5, runIn: 6, trainRate: 3 * DEGREE, elevateRate: 2 * DEGREE,
  },
};

/**
 * Short hands (the design decision): a gun's full crew is a man at each of her crew places (the plan's `crew`); with
 * men missing, her handwork (the drill's hand steps, and laying her) stretches in proportion to the hands missing: each
 * missing share of her crew adds that share of the time, times STRETCH. So with two of five men missing a reload's
 * handwork takes 1.4 times as long. More men than her places do not hurry her.
 */
export const STRETCH = 1;
/** With fewer men than this at a gun she stops: no drill, no laying, no firing (one man cannot run out a gun). */
export const FEWEST_AT_GUN = 2;

/** What a gun is loaded with (orders.md: the gunner's "Shot: Round, Chain, Grape"); its flight is N5.2's. */
export type ShotKind = 'round' | 'chain' | 'grape';
