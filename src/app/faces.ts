/**
 * Faces (implementation plan, N4 "Faces"): the one place that decides what a man's face shows, from what he is doing
 * and what has just happened to him (the simulation's tasks and events, never a mood number). A table from cause to
 * expression (Actors' face units, 0..1), its strength, how long it lasts and how fast it comes and goes; the stronger
 * feeling wins and each fades in and out, never switches. Read by everything that draws a face: the crew's near pool
 * (N4.3), and later the gun crews (N5.4b) and the men under fire (N6.6). Pure.
 */
import type { JobName } from '../sim/rules/crew';
import type { Harm } from '../sim/rules/damage';

/** What a face can show. */
export type FaceCause = 'slack' | 'pain' | 'flinch' | 'fear' | 'shout' | 'strain' | 'squint' | 'joy' | 'dismay' | 'grim';

/** Both sides of a face unit (`eye-*-slit`: the left and the right). */
const both = (unit: string, w: number): Record<string, number> => ({ [unit.replace('*', 'left')]: w, [unit.replace('*', 'right')]: w });

/** One row of the table. */
export interface FaceRow {
  /** Actors' face units and their weights at full strength. */
  readonly units: Readonly<Record<string, number>>;
  readonly strength: number;
  /** How strong it is against the others: the strongest cause present wins. */
  readonly rank: number;
  /** Seconds it takes to come and to go. */
  readonly rise: number;
  readonly fall: number;
}

/**
 * The table. Strain hauling, heaving or running out a gun; narrowed eyes aloft; a flinch when shot passes close; fear and
 * shock just after a hit near him, then a set, grim face while the fight lasts; pain when wounded; slack when dead; a
 * shout calling an order down the chain; joy when she strikes, dismay when his own ship does.
 */
export const FACES: Readonly<Record<FaceCause, FaceRow>> = {
  slack: { units: { 'mouth-open': 0.25, ...both('eye-*-closure', 0.7) }, strength: 1, rank: 10, rise: 0.4, fall: 0.4 },
  pain: { units: { ...both('eyebrows-*-inner-up', 0.6), ...both('eyebrows-*-down', 0.5), ...both('eye-*-slit', 0.6), 'mouth-retraction': 0.7, 'neck-platysma': 0.5 }, strength: 1, rank: 9, rise: 0.2, fall: 2 },
  flinch: { units: { ...both('eye-*-closure', 0.8), 'mouth-retraction': 0.5, 'neck-platysma': 0.6, 'nose-compression': 0.3 }, strength: 1, rank: 8, rise: 0.06, fall: 0.5 },
  fear: { units: { ...both('eyebrows-*-inner-up', 0.7), ...both('eyebrows-*-up', 0.35), ...both('eye-*-opened-up', 0.6), 'mouth-retraction': 0.5, 'neck-platysma': 0.4 }, strength: 0.9, rank: 7, rise: 0.25, fall: 3 },
  shout: { units: { 'mouth-open': 0.75, ...both('eyebrows-*-up', 0.35), 'neck-platysma': 0.3 }, strength: 1, rank: 6, rise: 0.15, fall: 0.4 },
  strain: { units: { ...both('eyebrows-*-down', 0.55), 'mouth-compression': 0.6, ...both('eye-*-slit', 0.35), 'neck-platysma': 0.5, 'nose-compression': 0.25 }, strength: 0.85, rank: 5, rise: 0.4, fall: 0.8 },
  joy: { units: { 'mouth-corner-puller': 0.9, 'mouth-open': 0.4, 'mouth-upward-retraction': 0.3, ...both('eye-*-slit', 0.4), ...both('eyebrows-*-up', 0.2) }, strength: 1, rank: 4, rise: 0.5, fall: 3 },
  dismay: { units: { ...both('eyebrows-*-inner-up', 0.85), 'mouth-depression': 0.6, ...both('eye-*-slit', 0.15) }, strength: 0.9, rank: 4, rise: 1, fall: 3 },
  squint: { units: { ...both('eye-*-slit', 0.55), ...both('eyebrows-*-down', 0.25), 'nose-compression': 0.15 }, strength: 0.8, rank: 3, rise: 0.8, fall: 1.2 },
  grim: { units: { ...both('eyebrows-*-down', 0.4), 'mouth-compression': 0.45, 'mouth-depression': 0.2 }, strength: 0.7, rank: 2, rise: 2, fall: 4 },
};

/** Jobs that strain: hauling on a fall, heaving at the pumps, cutting, lifting the wounded. */
const STRAINING: ReadonlySet<JobName> = new Set(['brace', 'sheet', 'clew', 'hoist', 'douse', 'pump', 'cut', 'fetch', 'carry', 'tackle', 'fight']);
/** A flinch lasts this long after shot strikes near him, s; fear and shock this long, before they set into a grim face. */
export const FLINCH_SECONDS = 0.5;
export const FEAR_SECONDS = 6;
/** A man wounded but fighting on shows his pain this long, s, then a set face: only the badly hurt keep it (N6.6). */
export const PAIN_SECONDS = 8;
/** A gun's captain cries the word, and her crew flinch at her report, for this long after she fires, s. */
export const WORD_SECONDS = 0.5;

/** What is happening to a man now, as the simulation tells it. */
export interface FaceWhy {
  /** His task's job, at work (null: none, or not begun). */
  readonly job: JobName | null;
  /** Aloft or out on the rig, in the wind and spray. */
  readonly aloft: boolean;
  /** Seconds since shot struck near him (Infinity: never). */
  readonly sinceStruck: number;
  /** His ship is in a fight: at quarters, or struck already. */
  readonly fighting: boolean;
  readonly harm: Harm | null;
  /** Seconds since his hurt first showed (Infinity: not hurt). */
  readonly sinceHurt: number;
  /** Calling an order down the chain (his bubble passes one on). */
  readonly shouting: boolean;
  /** The fight is over: his ship won, lost, or neither (null). */
  readonly ended: 'won' | 'lost' | null;
  /** At his gun (app/gunDrill.ts): her work takes his strength now, whether he is her captain, and the seconds since she fired (Infinity: not just). Left out: not at a gun. */
  readonly gun?: { readonly strains: boolean; readonly captain: boolean; readonly sinceFired: number };
}

/** The causes present for a man now. */
export function facesNow(w: FaceWhy): FaceCause[] {
  const out: FaceCause[] = [];
  if (w.harm === 'killed') return ['slack'];
  if (w.harm === 'badly' || (w.harm && w.sinceHurt < PAIN_SECONDS)) out.push('pain');
  if (w.sinceStruck < FLINCH_SECONDS) out.push('flinch');
  if (w.sinceStruck < FEAR_SECONDS) out.push('fear');
  if (w.shouting) out.push('shout');
  if (w.gun?.captain && w.gun.sinceFired < WORD_SECONDS) out.push('shout');
  else if (w.gun && w.gun.sinceFired < FLINCH_SECONDS) out.push('flinch');
  if (w.gun?.strains) out.push('strain');
  if (w.job && STRAINING.has(w.job)) out.push('strain');
  if (w.ended === 'won') out.push('joy');
  if (w.ended === 'lost') out.push('dismay');
  if (w.aloft) out.push('squint');
  if (w.fighting && !w.ended) out.push('grim');
  return out;
}

/** A face as it moves: how strong each cause shows now (0..its strength). */
export type FaceState = Partial<Record<FaceCause, number>>;

/**
 * One frame of a face: the strongest cause present rises toward its strength, every other falls to nothing, each at
 * its own pace. Returns the face units to show (the causes' units by how strong each shows), written into `units`.
 */
export function stepFace(state: FaceState, present: readonly FaceCause[], dt: number, units: Record<string, number>): Record<string, number> {
  const wins = present.reduce<FaceCause | null>((best, c) => (best === null || FACES[c].rank > FACES[best].rank ? c : best), null);
  for (const k in units) units[k] = 0;
  for (const cause in FACES) {
    const c = cause as FaceCause, row = FACES[c], now = state[c] ?? 0, target = c === wins ? row.strength : 0;
    const next = target > now ? Math.min(target, now + (dt / row.rise) * row.strength) : Math.max(target, now - (dt / row.fall) * row.strength);
    if (next === 0) { delete state[c]; continue; }
    state[c] = next;
    for (const [u, w] of Object.entries(row.units)) units[u] = (units[u] ?? 0) + w * next;
  }
  return units;
}
