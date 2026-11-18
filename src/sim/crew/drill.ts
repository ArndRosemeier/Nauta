/**
 * What the crew does for each act of an order (pure, N4.1): the drill. An act (orders.ts: the helm put over, one sail
 * set or taken in, one mast's yards swung) comes to one or more jobs (rules/crew.ts `JOBS`), each with the places it
 * is done at, the parts of the ship whose men do it, the hands it needs and the work it takes; a job may wait for
 * another of the same act (a sail is sheeted home only once it is loosed, the helm put down for a tack only when the
 * hands are at their stations). The places come from the rig's own lines: a man hauls at the pin his line is made
 * fast to, and lays out on the footrope of the yard he loosens.
 *
 * A job is kept small, as it lives in the state that travels to the other player (crew.ts `Task`): its name, what it
 * is done on (a sail, a mast) and which job it waits for. Its places, parts, hands and work follow from the first two
 * alone (`jobWork`), found again where they are needed.
 *
 * A sail's jobs move how far it is set, one share from furled to sheeted home (rules/rig.ts `HANGING`, `jobSpan`): the
 * crew's work on a sail is what sets it, a share at a time, and a sail left half set by a later order is taken on from
 * where it stands.
 */
import {
  GANGS, HELM_PARTS, JOBS, STATIONS_PARTS, WHEEL, type BySail, type Gang, type JobName, type Part,
} from '../rules/crew';
import { HANGING, type LineKind, type YardLevel } from '../rules/rig';
import type { Act } from '../orders';
import { rigPlan, sparOf } from '../ship/rig';
import { sailShare, type Sail, type SailSetting } from '../ship/sails';
import type { RigLine } from '../ship/lines';
import { MASTS } from '../ship/sailing';
import type { OrderKind } from '../orders';

/** One job of an act. */
export interface Job {
  readonly job: JobName;
  /** What it is done on: the sail (its place in the rig's sails) for a sail's jobs, the mast (its place in `MASTS`) for the braces, 0 for the helm and the stations. */
  readonly on: number;
  /** The job of the same act that must be done before this one's work starts (its place in the list), or null. */
  readonly after: number | null;
}

/** What a job takes, from its name and what it is done on. */
export interface JobWork {
  /** Hands it needs (skill) and seconds of work with them all there. */
  readonly need: number;
  readonly work: number;
  /** The crew places its men stand at, taken in turn. */
  readonly places: readonly string[];
  /** The parts of the ship that man it, in the order they are sent. */
  readonly parts: readonly Part[];
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

/** The jobs done by men out on the yard; the rest are hauled from the deck. */
const ON_THE_YARD: readonly JobName[] = ['loose', 'furl', 'reef'];

/** A job of a sail: its hands and work for the sail's yard, at the pins of its lines of the job's kinds (or along its yard), by its gang aloft (on the yard) or on deck. */
function sailWork(job: JobName, sail: Sail): JobWork {
  const row = JOBS[job], level = yardOf(sail)?.level ?? null, gang = GANGS[gangOf(sail)], aloft = ON_THE_YARD.includes(job);
  let places = aloft ? yardPlaces(yardOf(sail)!.id) : pins(ofKinds(sailLines(sail), row.lines));
  // A sail with none of the job's lines (a headsail run down by its own weight) is worked at its halliard.
  if (places.length === 0) places = pins(ofKinds(sailLines(sail), ['halliard']));
  return { need: bySail(row.hands, level), work: bySail(row.work, level), places, parts: aloft ? [gang.aloft!] : gang.deck };
}

/** How far a sail's job takes it: from and to, as shares from furled (0) to sheeted home (1); null for a job on no sail. */
export function jobSpan(job: JobName): readonly [from: number, to: number] | null {
  switch (job) {
    case 'loose': return [0, HANGING];
    case 'sheet': return [HANGING, 1];
    case 'clew': return [1, HANGING];
    case 'furl': return [HANGING, 0];
    case 'reef': return [HANGING, HANGING];
    case 'hoist': return [0, 1];
    case 'douse': return [1, 0];
    default: return null;
  }
}

/** The share of a job's work still to do with its sail at `share` (all of it for a job on no sail, or that does not move the sail). */
export function jobLeft(job: JobName, share: number): number {
  const span = jobSpan(job);
  if (!span || span[0] === span[1]) return 1;
  return Math.min(1, Math.max(0, (span[1] - share) / (span[1] - span[0])));
}

/** How far a job's sail is set with `toDo` of its `work` still to do. */
export function shareAt(job: JobName, toDo: number, work: number): number | null {
  const span = jobSpan(job);
  return span ? span[1] + (span[0] - span[1]) * (toDo / work) : null;
}

/** A job's work found from scratch (`jobWork` keeps it). */
function findWork(job: JobName, on: number): JobWork {
  const rig = rigPlan();
  switch (job) {
    case 'helm': return { need: bySail(JOBS.helm.hands, null), work: bySail(JOBS.helm.work, null), places: [WHEEL], parts: HELM_PARTS };
    case 'stations': {
      // Ready about (or ready to wear): every brace and the headsail sheets manned.
      const heads = new Set(rig.sails.filter((s) => s.kind === 'head').map((s) => s.id));
      const lines = rig.lines.filter((l) => !l.standing && (l.kind === 'brace' || (l.kind === 'sheet' && heads.has(l.serves))));
      return { need: bySail(JOBS.stations.hands, null), work: bySail(JOBS.stations.work, null), places: pins(lines), parts: STATIONS_PARTS };
    }
    case 'brace': {
      const mast = MASTS[on]!;
      const lines = rig.lines.filter((l) => l.kind === 'brace' && sparOf(rig, l.serves).mast === mast);
      return { need: bySail(JOBS.brace.hands, null), work: bySail(JOBS.brace.work, null), places: pins(lines), parts: GANGS[mast].deck };
    }
    default: return sailWork(job, rig.sails[on]!);
  }
}

const works = new Map<string, JobWork>();

/** What a job takes (its hands, work, places and parts), from its name and what it is done on; kept once found (a cache, not state). */
export function jobWork(job: JobName, on: number): JobWork {
  const key = `${job}:${on}`;
  let w = works.get(key);
  if (!w) { w = findWork(job, on); works.set(key, w); }
  return w;
}

/**
 * One sail set (with its reefs) or taken in, from how far it is set now: a square sail is loosed aloft and falls to hang
 * in its gear, then sheeted home; a reef taken in or shaken out is clewed up, reefed by the men on the yard, and sheeted
 * home again; taken in, it is clewed up and furled. A fore-and-aft sail is hoisted, or doused, or doused and hoisted
 * again for a reef. A sail part way is taken on from where it stands: what it has already passed is not done again.
 */
function sailDrill(sail: Sail, on: number, now: SailSetting, set: boolean, reefs: number): Job[] {
  const share = sailShare(now), reef = set && now.set && now.reefs !== reefs;
  const names: JobName[] = [];
  if (sail.kind === 'square') {
    if (!set) {
      if (share > HANGING) names.push('clew');
      if (share > 0) names.push('furl');
    } else {
      if (share < HANGING) names.push('loose');
      else if (reef && share > HANGING) names.push('clew');
      if (reef) names.push('reef');
      if (reef || share < 1) names.push('sheet');
    }
  } else if (!set) {
    if (share > 0) names.push('douse');
  } else {
    if (reef && share > 0) names.push('douse');
    if (reef || share < 1) names.push('hoist');
  }
  return names.map((job, k) => ({ job, on, after: k === 0 ? null : k - 1 }));
}

/** The jobs of one act, given the kind of order it is for and how her sails stand now. */
export function drill(act: Act, order: OrderKind, canvas: readonly SailSetting[]): Job[] {
  switch (act.kind) {
    case 'helm':
      // Ready about (or ready to wear): the hands at their stations, then the helm over.
      if (order !== 'tack' && order !== 'wear') return [{ job: 'helm', on: 0, after: null }];
      return [{ job: 'stations', on: 0, after: null }, { job: 'helm', on: 0, after: 0 }];
    case 'sail': return sailDrill(rigPlan().sails[act.sail]!, act.sail, canvas[act.sail]!, act.set, act.reefs);
    case 'yards': return [{ job: 'brace', on: act.mast, after: null }];
  }
}
