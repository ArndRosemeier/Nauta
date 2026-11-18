/**
 * What closes the ways through the ship (N4.2), plain data in a ship's state: ways shut (a ladder under wreckage, a
 * door jammed, a shroud shot away) and oblongs of a floor no body can cross (a gun run in across the gangway, a fallen
 * spar). This file owns it: guns (N5), damage (N6) and the crew ask it to change. Every change bumps `waysSerial`, so
 * men on their way see it and look for another way (going.ts). Pure.
 */
import type { Rect } from '../ship/plan';

/** An oblong of a space's floor (or a surface aloft) that no body crosses, named so it can be cleared again. */
export interface Block extends Rect {
  readonly id: string;
  readonly space: string;
}

/** The ways shut and the floors blocked on one ship. */
export interface Closures {
  /** Ids of the ways shut (plan.ways, rig.ways), sorted. */
  readonly waysClosed: readonly string[];
  /** The blocked oblongs, sorted by id. */
  readonly waysBlocked: readonly Block[];
  /** Counts the changes, so a route knows whether it was found under what holds now. */
  readonly waysSerial: number;
}

/** Every way open. */
export function openShip(): Closures {
  return { waysClosed: [], waysBlocked: [], waysSerial: 0 };
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The closures with a way shut. */
export function closeWay(c: Closures, way: string): Closures {
  if (c.waysClosed.includes(way)) return c;
  return { ...c, waysClosed: [...c.waysClosed, way].sort(byText), waysSerial: c.waysSerial + 1 };
}

/** The closures with a way open again. */
export function openWay(c: Closures, way: string): Closures {
  if (!c.waysClosed.includes(way)) return c;
  return { ...c, waysClosed: c.waysClosed.filter((w) => w !== way), waysSerial: c.waysSerial + 1 };
}

/** The closures with an oblong blocked (one of the same id is replaced). */
export function addBlock(c: Closures, block: Block): Closures {
  const rest = c.waysBlocked.filter((b) => b.id !== block.id);
  return { ...c, waysBlocked: [...rest, { ...block }].sort((a, b) => byText(a.id, b.id)), waysSerial: c.waysSerial + 1 };
}

/** The closures with a block cleared. */
export function clearBlock(c: Closures, id: string): Closures {
  if (!c.waysBlocked.some((b) => b.id === id)) return c;
  return { ...c, waysBlocked: c.waysBlocked.filter((b) => b.id !== id), waysSerial: c.waysSerial + 1 };
}
