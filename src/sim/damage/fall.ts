/**
 * What of her rig still stands (pure, implementation plan N6.2): from the spars that have broken (`Damage.fallen`),
 * the lines cut and the sails' holes, which spars are down (broken, or stepped on one that is down), which lines are
 * gone (cut, or made fast to what is down), which sails can still stand and how much each still draws; and which spars
 * are due to fall now (a part with `STRUCK_DOWN` wounds; the weather side's shrouds or the stays gone with the wind on
 * them), and what lies alongside dragging her. damage.ts keeps what fell and calls these; nothing here changes anything.
 */
import {
  FALL_WIND, FALLS_AT_PART, RENT_AREA, SPLIT, STRUCK_DOWN, SUPPORT_LOST, WRECK_DRAG,
} from '../rules/damage';
import { hullHalfBreadth, sheer } from '../ship/hull';
import { rigPlan } from '../ship/rig';
import { sailArea } from '../ship/sails';
import { sparParts } from './meet';

/** What of her rig stands: by rig plan place, each spar down, each line gone, each sail unable to stand, and the share of its drive each sail keeps (0 to 1). */
export interface Standing {
  readonly down: readonly boolean[];
  readonly gone: readonly boolean[];
  readonly sailDown: readonly boolean[];
  readonly draws: readonly number[];
}

/** The rig's ties, worked out once: each spar's place by id, its parent, its parts, and the standing lines holding it by side (-1, 0 the stays, 1). */
interface Ties {
  readonly spar: ReadonlyMap<string, number>;
  readonly parent: readonly number[];
  readonly firstPart: readonly number[];
  readonly holds: readonly (readonly [readonly number[], readonly number[], readonly number[]])[];
  readonly lineSpars: readonly (readonly number[])[];
  readonly lineSails: readonly (readonly number[])[];
  readonly serves: readonly number[];
  /** Each sail's spars and stays (line places), and its sheets and halliards (line places). */
  readonly sailOn: readonly { readonly spars: readonly number[]; readonly stays: readonly number[]; readonly gear: readonly number[] }[];
  readonly sailFull: readonly number[];
}
let ties: Ties | null = null;
/** Line kinds a sail cannot draw without. */
const GEAR = new Set(['sheet', 'halliard']);

function makeTies(): Ties {
  const rig = rigPlan(), parts = sparParts();
  const spar = new Map(rig.spars.map((s, i) => [s.id, i]));
  const sail = new Map(rig.sails.map((s, i) => [s.id, i]));
  const line = new Map(rig.lines.map((l, i) => [l.id, i]));
  const firstPart = rig.spars.map((s) => parts.findIndex((p) => p.spar === s.id));
  const holds = rig.spars.map(() => [[], [], []] as [number[], number[], number[]]);
  rig.lines.forEach((l, i) => {
    const s = spar.get(l.serves);
    if (s === undefined || !l.standing || l.act !== 'holds' || (l.side === 0 && l.kind !== 'stay')) return;
    holds[s]![l.side + 1]!.push(i);
  });
  return {
    spar,
    parent: rig.spars.map((s) => (s.on === null ? -1 : spar.get(s.on)!)),
    firstPart,
    holds,
    lineSpars: rig.lines.map((l) => l.ends.filter((e) => e.on === 'spar').map((e) => spar.get(e.id)!)),
    lineSails: rig.lines.map((l) => l.ends.filter((e) => e.on === 'sail').map((e) => sail.get(e.id)!)),
    serves: rig.lines.map((l) => spar.get(l.serves) ?? -1),
    sailOn: rig.sails.map((s) => ({
      spars: s.on.filter((id) => spar.has(id)).map((id) => spar.get(id)!),
      stays: s.on.filter((id) => line.has(id)).map((id) => line.get(id)!),
      gear: rig.lines.flatMap((l, i) => (GEAR.has(l.kind) && (l.serves === s.id || s.on.includes(l.serves)) ? [i] : [])),
    })),
    sailFull: rig.sails.map((s) => sailArea(s)),
  };
}
const tiesOf = (): Ties => (ties ??= makeTies());

/** Whether a line is made fast to, or holds or works, a spar that is down: knotting it again would hold nothing. */
export function lostWith(standing: Standing, line: number): boolean {
  const t = tiesOf(), serves = t.serves[line]!;
  return t.lineSpars[line]!.some((s) => standing.down[s]) || (serves >= 0 && standing.down[serves]!);
}

/** The spar (rig plan place) a part (`sparParts` place) is of. */
export const sparOfPart = (part: number): number => tiesOf().spar.get(sparParts()[part]!.spar)!;

/** Each ship's last answer, by what it was worked out from (a step asks for it again and again while nothing changes). */
const known = new WeakMap<readonly number[], { fallen: readonly number[]; rent: readonly number[]; standing: Standing }>();

/** What of her rig stands, from the parts broken (`fallen`), the lines cut and each sail's holes. */
export function standingOf(fallen: readonly number[], cut: readonly number[], rent: readonly number[]): Standing {
  const was = known.get(cut);
  if (was && was.fallen === fallen && was.rent === rent) return was.standing;
  const t = tiesOf(), rig = rigPlan();
  const broken = new Set(fallen.map(sparOfPart)), cutSet = new Set(cut);
  // Spars are listed after the spar they stand on, so one pass carries a fall up the mast.
  const down: boolean[] = [];
  t.parent.forEach((p, i) => { down[i] = broken.has(i) || (p >= 0 && down[p]!); });
  const tiedDown = (l: number): boolean => cutSet.has(l) || t.lineSpars[l]!.some((s) => down[s]) || (t.serves[l]! >= 0 && down[t.serves[l]!]!);
  const sailDown = t.sailOn.map((s) => s.spars.some((x) => down[x]) || s.stays.some(tiedDown));
  const gone = rig.lines.map((_, l) => tiedDown(l) || t.lineSails[l]!.some((s) => sailDown[s]));
  const draws = t.sailOn.map((s, i) => {
    if (sailDown[i] || s.gear.some((l) => gone[l])) return 0;
    const lost = (rent[i]! * RENT_AREA) / t.sailFull[i]!;
    return lost > SPLIT ? 0 : 1 - lost;
  });
  const standing = { down, gone, sailDown, draws };
  known.set(cut, { fallen, rent, standing });
  return standing;
}

/** A spar due to fall: the part it breaks at (`sparParts` place) and the side it goes over (-1 larboard, 1 starboard). */
export interface Fall {
  readonly part: number;
  readonly side: -1 | 1;
}

/** What she feels of the wind for her rig: the apparent wind across her (m/s, + from larboard: the air moving to starboard), and whether a mast's square sails are aback (0 fore, 1 main; asked only when its stays are lost). */
export interface RigWind {
  readonly across: number;
  readonly aback: (mast: number) => boolean;
}

/** The masts in the order `RigWind.aback` gives them. */
const MAST_ORDER = ['fore', 'main'] as const;

/**
 * The spars due to fall now (each once, the lowest break of a spar first): a part with STRUCK_DOWN wounds; a spar whose
 * weather side has lost more than SUPPORT_LOST of its shrouds and backstays with the wind across her at FALL_WIND or
 * more, or that share of its stays with its mast's square sails aback. Each goes over its lee side.
 */
export function fallsDue(standing: Standing, wounds: readonly number[], wind: RigWind): Fall[] {
  const t = tiesOf(), rig = rigPlan(), out: Fall[] = [], due = new Set<number>();
  // The wind from starboard (the air moving to larboard) presses the rig to larboard: it goes over that side.
  const weather: -1 | 1 = wind.across < 0 ? 1 : -1, lee = -weather as -1 | 1;
  let run = 0;
  for (let k = 0; k < wounds.length; k++) {
    run = k > 0 && wounds[k] === wounds[k - 1] ? run + 1 : 1;
    const s = sparOfPart(wounds[k]!);
    if (run === STRUCK_DOWN && !standing.down[s] && !due.has(s)) { due.add(s); out.push({ part: wounds[k]!, side: lee }); }
  }
  const lost = (lines: readonly number[]): boolean => lines.length > 0 && lines.filter((l) => standing.gone[l]).length > lines.length * SUPPORT_LOST;
  rig.spars.forEach((spar, i) => {
    if (standing.down[i] || due.has(i)) return;
    const [larboard, stays, starboard] = t.holds[i]!, side = weather === 1 ? starboard : larboard;
    const windOn = Math.abs(wind.across) >= FALL_WIND && lost(side);
    const mast = MAST_ORDER.indexOf(spar.mast as (typeof MAST_ORDER)[number]);
    const aback = mast >= 0 && lost(stays) && wind.aback(mast);
    if (windOn || aback) { due.add(i); out.push({ part: t.firstPart[i]! + FALLS_AT_PART, side: lee }); }
  });
  return out;
}

/** What lies alongside dragging her: where (m forward of the mainmast, m across, + starboard) and how hard (kN per (m/s)² of water past it). */
export interface Wreck {
  readonly along: number;
  readonly across: number;
  readonly drag: number;
}

/** A fall lying alongside (`Damage.alongside`: part × 2, + 1 on her starboard side) as the drag it puts on her: what broke and everything it carried. */
export function wreckOf(code: number): Wreck {
  const t = tiesOf(), rig = rigPlan(), part = Math.floor(code / 2), side = code % 2 === 1 ? 1 : -1, root = sparOfPart(part);
  const carried: boolean[] = [];
  let drag = 0;
  t.parent.forEach((p, i) => {
    carried[i] = i === root || (p >= 0 && carried[p]!);
    if (carried[i]) drag += WRECK_DRAG[rig.spars[i]!.kind];
  });
  const along = sparParts()[part]!.from[0];
  return { along, across: side * hullHalfBreadth(along, sheer(along)), drag };
}

let aloft: ReadonlyMap<string, number> | null = null;
/** The spar (rig plan place) a space aloft stands on: a yard's footropes on the yard, a top on its lower mast, the crosstrees on the topmast; -1 for any other space. */
export function sparUnder(space: string): number {
  if (!aloft) {
    const rig = rigPlan(), t = tiesOf(), map = new Map<string, number>();
    for (const p of [...rig.places, ...rig.stations]) {
      const id = 'kind' in p && p.kind === 'yard' ? p.of : p.space.endsWith(TOP) ? p.space.replace(TOP, '-mast') : p.space.endsWith(CROSSTREES) ? p.space.replace(CROSSTREES, '-topmast') : null;
      const s = id === null ? undefined : t.spar.get(id);
      if (s !== undefined) map.set(p.space, s);
    }
    aloft = map;
  }
  return aloft.get(space) ?? -1;
}
/** How the plan names a top and the crosstrees: `fore-top`, `main-crosstrees`. */
const TOP = '-top';
const CROSSTREES = '-crosstrees';
