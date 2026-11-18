/**
 * What the crew does for each act of an order (pure, N4.1): the drill. An act (orders.ts: the helm put over, one sail
 * set or taken in, one mast's yards swung) comes to one or more jobs (rules/crew.ts `JOBS`), each with the places it
 * is done at, the parts of the ship whose men do it, the hands it needs and the work it takes; a job may wait for
 * another of the same act (a sail is sheeted home only once it is loosed, the helm put down for a tack only when the
 * hands are at their stations). The places come from the rig's own lines: a man hauls at the pin his line is made
 * fast to, and lays out on the footrope of the yard he loosens.
 */
import {
  GANGS, HELM_PARTS, JOBS, STATIONS_PARTS, WHEEL, type BySail, type Gang, type JobName, type Part,
} from '../rules/crew';
import type { LineKind, YardLevel } from '../rules/rig';
import type { Act } from '../orders';
import { rigPlan, sparOf } from '../ship/rig';
import type { Sail, SailSetting } from '../ship/sails';
import type { RigLine } from '../ship/lines';
import { MASTS } from '../ship/sailing';
import type { OrderKind } from '../orders';

/** One job of an act, ready to be manned. */
export interface Job {
  readonly job: JobName;
  /** Hands it needs (skill) and seconds of work with them all there. */
  readonly need: number;
  readonly work: number;
  /** The crew places its men stand at, taken in turn. */
  readonly places: readonly string[];
  /** The parts of the ship that man it, in the order they are sent. */
  readonly parts: readonly Part[];
  /** The job of the same act that must be done before this one's work starts (its place in the list), or null. */
  readonly after: number | null;
}

/** A job's number for a sail's yard (or the number itself). */
const bySail = (n: BySail, level: YardLevel | null): number => (typeof n === 'number' ? n : n[level ?? 'topsail']);

/** Who works a sail: each mast's square sails, the headsails, the after sails (orders.ts once grouped them alike). */
export function gangOf(sail: Sail): Gang {
  return sail.kind === 'square' ? (sail.mast as Gang) : sail.kind === 'head' ? 'head' : 'after';
}

/** The yard a square sail is bent to, and its level; null for a fore-and-aft sail. */
function yardOf(sail: Sail): { id: string; level: YardLevel } | null {
  if (sail.kind !== 'square') return null;
  const yard = sparOf(rigPlan(), sail.on[0]!);
  return { id: yard.id, level: yard.yard!.level };
}

/** The running lines that work a sail (its own, and those of the spars it is bent to). */
const sailLines = (sail: Sail): RigLine[] => rigPlan().lines.filter((l) => !l.standing && (l.serves === sail.id || sail.on.includes(l.serves)));

/** The crew places at the pins of lines (one per line, in the rig's order). */
const pins = (lines: readonly RigLine[]): string[] => lines.flatMap((l) => (l.belay ? [`pin-${l.belay}`] : []));

const ofKinds = (lines: readonly RigLine[], kinds: readonly LineKind[] | null): RigLine[] => lines.filter((l) => kinds?.includes(l.kind));

/** The places along a yard, larboard and starboard in turn from the slings out, so its men lay out on both yardarms. */
function yardPlaces(yard: string): string[] {
  const along = rigPlan().places.filter((p) => p.kind === 'yard' && p.of === yard);
  const sides = [along.filter((p) => p.id.includes(`-${yard}-p`)), along.filter((p) => p.id.includes(`-${yard}-s`))];
  return Array.from({ length: Math.max(sides[0]!.length, sides[1]!.length) }, (_, k) => sides.flatMap((side) => (side[k] ? [side[k].id] : []))).flat();
}

/** A job of a sail: its hands and work for the sail's yard, at the pins of its lines of the job's kinds. */
function sailJob(job: JobName, sail: Sail, parts: readonly Part[], after: number | null): Job {
  const row = JOBS[job], level = yardOf(sail)?.level ?? null;
  let places = pins(ofKinds(sailLines(sail), row.lines));
  if (job === 'loose') places = yardPlaces(yardOf(sail)!.id);
  // A sail with none of the job's lines (a headsail run down by its own weight) is worked at its halliard.
  if (places.length === 0) places = pins(ofKinds(sailLines(sail), ['halliard']));
  return { job, need: bySail(row.hands, level), work: bySail(row.work, level), places, parts, after };
}

/**
 * One sail set (with its reefs) or taken in, from how it stands: a square sail is loosed aloft, then sheeted home; a
 * reef taken in or shaken out is clewed up, the men lay out, and it is sheeted home again; taken in, it is clewed up.
 * A fore-and-aft sail is hoisted, or doused, or doused and hoisted again for a reef.
 */
function sailDrill(sail: Sail, now: SailSetting, set: boolean, reefs: number): Job[] {
  const gang = GANGS[gangOf(sail)];
  const reef = set && now.set && now.reefs !== reefs;
  if (sail.kind === 'square') {
    const aloft = [gang.aloft!];
    if (!set) return [sailJob('clew', sail, gang.deck, null)];
    if (reef) return [sailJob('clew', sail, gang.deck, null), sailJob('loose', sail, aloft, 0), sailJob('sheet', sail, gang.deck, 1)];
    return [sailJob('loose', sail, aloft, null), sailJob('sheet', sail, gang.deck, 0)];
  }
  if (!set) return [sailJob('douse', sail, gang.deck, null)];
  if (reef) return [sailJob('douse', sail, gang.deck, null), sailJob('hoist', sail, gang.deck, 0)];
  return [sailJob('hoist', sail, gang.deck, null)];
}

/** The jobs of one act, given the kind of order it is for and how her sails stand now. */
export function drill(act: Act, order: OrderKind, canvas: readonly SailSetting[]): Job[] {
  const rig = rigPlan();
  switch (act.kind) {
    case 'helm': {
      const helm: Job = { job: 'helm', need: bySail(JOBS.helm.hands, null), work: bySail(JOBS.helm.work, null), places: [WHEEL], parts: HELM_PARTS, after: null };
      if (order !== 'tack' && order !== 'wear') return [helm];
      // Ready about (or ready to wear): every brace and the headsail sheets manned, then the helm over.
      const heads = new Set(rig.sails.filter((s) => s.kind === 'head').map((s) => s.id));
      const lines = rig.lines.filter((l) => !l.standing && (l.kind === 'brace' || (l.kind === 'sheet' && heads.has(l.serves))));
      const row = JOBS.stations;
      return [{ job: 'stations', need: bySail(row.hands, null), work: bySail(row.work, null), places: pins(lines), parts: STATIONS_PARTS, after: null }, { ...helm, after: 0 }];
    }
    case 'sail': {
      const sail = rig.sails[act.sail]!;
      return sailDrill(sail, canvas[act.sail]!, act.set, act.reefs);
    }
    case 'yards': {
      const mast = MASTS[act.mast]!, row = JOBS.brace;
      const lines = rig.lines.filter((l) => l.kind === 'brace' && sparOf(rig, l.serves).mast === mast);
      return [{ job: 'brace', need: bySail(row.hands, null), work: bySail(row.work, null), places: pins(lines), parts: GANGS[mast].deck, after: null }];
    }
  }
}
