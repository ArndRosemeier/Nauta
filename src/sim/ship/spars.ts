/**
 * The brig's spars (pure, N3.2): the spar table of rules/rig.ts turned into spars placed in her, each a chain of
 * segments between the places it can break (ship.md: "so a hit breaks it at a real place"), and the deadeyes her
 * shrouds and backstays are set up to. Places as in the plan: m forward of the mainmast, m across (+ starboard),
 * heights m above her base. Masts are measured up their height; their rake (3° at most) makes them 0.1 % longer.
 */
import {
  BOOM, BOWSPRIT, BREAK_SHARES, CHANNEL, BACKSTAYS, GAFF, JIB_BOOM, MAST_RAKE, MAST_SPARS, MASTHEAD_SIDE, STRIKER,
  TOP_DEADEYES, TOPMAST_SHROUDS, CROSSTREES_DEPTH, TRESTLE_DEPTH, YARD_HANG, YARDS, type MastName, type YardLevel,
} from '../rules/rig';
import { FORE_SHROUDS, MAIN_CHANNEL, MAIN_SHROUDS, MAIN_TOP, MASTS, PLANKING } from '../rules/ships';
import { hullEnds, hullHalfBreadth, sideTop, weatherDeck } from './hull';

/** A point of her rig. */
export interface RigPoint {
  readonly along: number;
  readonly across: number;
  readonly height: number;
}

export const point = (along: number, across: number, height: number): RigPoint => ({ along, across, height });
/** The point a share `t` of the way from `a` to `b`. */
export const between = (a: RigPoint, b: RigPoint, t: number): RigPoint =>
  point(a.along + (b.along - a.along) * t, a.across + (b.across - a.across) * t, a.height + (b.height - a.height) * t);
export const distance = (a: RigPoint, b: RigPoint): number => Math.hypot(a.along - b.along, a.across - b.across, a.height - b.height);

export type SparKind = 'mast' | 'topmast' | 'topgallant mast' | 'yard' | 'bowsprit' | 'jib-boom' | 'striker' | 'boom' | 'gaff';

/** A place on a spar where it can break: its name and how far from the heel, m. */
export interface SparMark {
  readonly name: string;
  readonly at: number;
}

/** A spar. A yard lies square and hoisted: its heel the larboard yardarm, its head the starboard one. */
export interface Spar {
  readonly id: string;
  readonly name: string;
  readonly kind: SparKind;
  readonly mast: MastName | 'bowsprit';
  readonly heel: RigPoint;
  readonly head: RigPoint;
  readonly length: number;
  readonly diameter: number;
  /** The places it can break, heel first and head last: each two neighbours are the ends of a segment. */
  readonly marks: readonly SparMark[];
  /** The spar it is fixed to (null: stepped in her). */
  readonly on: string | null;
  /** A yard: which, where its middle hangs hoisted and lowered (heights), how far it braces round (rad), its yardarms (m). */
  readonly yard: { readonly level: YardLevel; readonly hoisted: number; readonly lowered: number; readonly brace: number; readonly arm: number } | null;
  /** The boom and gaff: how far they swing out either side, rad. */
  readonly swing: number | null;
}

/** The point `at` metres from a spar's heel, on its axis. */
export const onSpar = (s: Spar, at: number): RigPoint => between(s.heel, s.head, at / s.length);
/** The entry of a list by its name (a spar's mark, a sail's corner); `owner` names the list when there is none. */
export function named<T extends { readonly name: string }>(list: readonly T[], name: string, owner: string): T {
  const found = list.find((k) => k.name === name);
  if (!found) throw new Error(`${owner} has no ${name}`);
  return found;
}
/** The point at a named mark of a spar. */
export const atMark = (s: Spar, name: string): RigPoint => onSpar(s, named(s.marks, name, s.id).at);

/** A mast's heights (above her base) and where its spars' axes stand along her at a height. */
export interface MastGeometry {
  readonly mast: MastName;
  readonly deck: number;
  readonly heel: number;
  readonly lowerHounds: number;
  readonly lowerHead: number;
  readonly topFloor: number;
  readonly topmastHounds: number;
  readonly topmastHead: number;
  readonly crosstrees: number;
  readonly topgallantHounds: number;
  readonly truck: number;
  /** The lower mast's axis along her at a height; the topmast's and topgallant mast's, which stand ahead of the one below. */
  readonly lowerAt: (h: number) => number;
  readonly topmastAt: (h: number) => number;
  readonly topgallantAt: (h: number) => number;
}

/** A mast's heights and axes from the spar table. */
export function mastGeometry(mast: MastName): MastGeometry {
  const row = MAST_SPARS[mast], m = MASTS[mast];
  const deck = weatherDeck(m.along, 0), heel = m.step;
  const lowerHead = heel + row.lower.length, lowerHounds = lowerHead - row.lower.head;
  const topmastHead = lowerHounds + row.topmast.length, topmastHounds = topmastHead - row.topmast.head;
  const truck = topmastHounds + row.topgallant.length;
  const lowerAt = (h: number) => m.along - (h - deck) * MAST_RAKE[mast];
  // A topmast stands through the cap ahead of the square masthead; a topgallant mast ahead of the topmast's head.
  const topmastAhead = (MASTHEAD_SIDE + row.topmast.diameter) / 2, topgallantAhead = topmastAhead + (row.topmast.diameter + row.topgallant.diameter) / 2;
  return {
    mast, deck, heel, lowerHounds, lowerHead, topFloor: lowerHounds + TRESTLE_DEPTH + MAIN_TOP.thick,
    topmastHounds, topmastHead, crosstrees: topmastHounds + CROSSTREES_DEPTH, topgallantHounds: truck - row.topgallant.pole, truck,
    lowerAt, topmastAt: (h) => lowerAt(h) + topmastAhead, topgallantAt: (h) => lowerAt(h) + topgallantAhead,
  };
}

/** A spar from its parts. */
function spar(id: string, name: string, kind: SparKind, mast: Spar['mast'], heel: RigPoint, head: RigPoint, diameter: number, marks: [string, number][], on: string | null, extra: Partial<Pick<Spar, 'yard' | 'swing'>> = {}): Spar {
  const length = distance(heel, head);
  return { id, name, kind, mast, heel, head, length, diameter, marks: marks.map(([n, at]) => ({ name: n, at })), on, yard: extra.yard ?? null, swing: extra.swing ?? null };
}
/** A mast's spar, its marks given as heights over its heel and measured up its raked axis. */
function raked(id: string, name: string, kind: SparKind, mast: MastName, heel: RigPoint, head: RigPoint, diameter: number, heights: [string, number][], on: string | null): Spar {
  const stretch = distance(heel, head) / (head.height - heel.height);
  return spar(id, name, kind, mast, heel, head, diameter, heights.map(([n, h]) => [n, h * stretch]), on);
}

/** A mast's three spars and its three yards. */
function mastSpars(g: MastGeometry): Spar[] {
  const row = MAST_SPARS[g.mast], m = g.mast;
  const lower = raked(`${m}-mast`, `${m} mast`, 'mast', m, point(g.lowerAt(g.heel), 0, g.heel), point(g.lowerAt(g.lowerHead), 0, g.lowerHead), row.lower.partners, [
    ['heel', 0], ['partners', g.deck - g.heel], ['middle', (g.deck + g.lowerHounds) / 2 - g.heel], ['hounds', g.lowerHounds - g.heel], ['cap', g.lowerHead - g.heel],
  ], null);
  const topmast = raked(`${m}-topmast`, `${m} topmast`, 'topmast', m, point(g.topmastAt(g.lowerHounds), 0, g.lowerHounds), point(g.topmastAt(g.topmastHead), 0, g.topmastHead), row.topmast.diameter, [
    ['heel', 0], ['cap', g.lowerHead - g.lowerHounds], ['middle', (g.lowerHead + g.topmastHounds) / 2 - g.lowerHounds], ['hounds', g.topmastHounds - g.lowerHounds], ['head', g.topmastHead - g.lowerHounds],
  ], lower.id);
  const topgallant = raked(`${m}-topgallant-mast`, `${m} topgallant mast`, 'topgallant mast', m, point(g.topgallantAt(g.topmastHounds), 0, g.topmastHounds), point(g.topgallantAt(g.truck), 0, g.truck), row.topgallant.diameter, [
    ['heel', 0], ['cap', g.topmastHead - g.topmastHounds], ['hounds', g.topgallantHounds - g.topmastHounds], ['truck', g.truck - g.topmastHounds],
  ], topmast.id);
  const out = [lower, topmast, topgallant];
  for (const y of YARDS.filter((r) => r.mast === m)) {
    const hang = YARD_HANG[y.level];
    const [carrier, hounds, below] = y.level === 'course' ? [lower, g.lowerHounds, g.lowerHounds] : y.level === 'topsail' ? [topmast, g.topmastHounds, g.lowerHead] : [topgallant, g.topgallantHounds, g.topmastHead];
    const hoisted = hounds + hang.hoisted, lowered = y.level === 'course' ? hoisted : below + hang.lowered;
    const axis = y.level === 'course' ? g.lowerAt : y.level === 'topsail' ? g.topmastAt : g.topgallantAt;
    // A yard hangs before its mast, touching it.
    const along = axis(hoisted) + (carrier.diameter + y.diameter) / 2;
    const names = ['arm-p', 'quarter-p', 'slings', 'quarter-s', 'arm-s'];
    out.push(spar(y.id, y.name, 'yard', m, point(along, -y.length / 2, hoisted), point(along, y.length / 2, hoisted), y.diameter,
      BREAK_SHARES.yard.map((t, i) => [names[i]!, t * y.length]), carrier.id, { yard: { level: y.level, hoisted, lowered, brace: y.brace, arm: y.arm } }));
  }
  return out;
}

/** The bowsprit, jib-boom and dolphin striker; the boom and gaff. */
function otherSpars(main: MastGeometry): Spar[] {
  const heel = point(BOWSPRIT.heel, 0, weatherDeck(BOWSPRIT.heel, 0) + BOWSPRIT.over);
  const dirA = Math.cos(BOWSPRIT.steeve), dirH = Math.sin(BOWSPRIT.steeve);
  const along = (p: RigPoint, t: number) => point(p.along + dirA * t, p.across, p.height + dirH * t);
  // Where it passes over the stem: the stem's face at the height it is there.
  const roughStem = (hullEnds(heel.height).fore - heel.along) / dirA;
  const stem = (hullEnds(heel.height + dirH * roughStem).fore - heel.along) / dirA;
  const bowsprit = spar('bowsprit', 'bowsprit', 'bowsprit', 'bowsprit', heel, along(heel, BOWSPRIT.length), BOWSPRIT.diameter, [
    ['heel', 0], ['stem', stem], ['middle', stem + (BOWSPRIT.length - stem) * BREAK_SHARES.middle], ['cap', BOWSPRIT.length],
  ], null);
  // The jib-boom lies on top of the bowsprit, through its cap.
  const lift = (BOWSPRIT.diameter + JIB_BOOM.diameter) / 2;
  const jHeel = along(point(heel.along, 0, heel.height + lift / dirA), BOWSPRIT.length - JIB_BOOM.doubling);
  const jib = spar('jib-boom', 'jib-boom', 'jib-boom', 'bowsprit', jHeel, along(jHeel, JIB_BOOM.length), JIB_BOOM.diameter, [
    ['heel', 0], ['cap', JIB_BOOM.doubling], ['middle', JIB_BOOM.doubling + (JIB_BOOM.length - JIB_BOOM.doubling) * BREAK_SHARES.middle], ['end', JIB_BOOM.length],
  ], bowsprit.id);
  const cap = bowsprit.head;
  const striker = spar('dolphin-striker', 'dolphin striker', 'striker', 'bowsprit', cap, point(cap.along, 0, cap.height - STRIKER.length), STRIKER.diameter, [['heel', 0], ['foot', STRIKER.length]], bowsprit.id);
  // The boom's jaws round the mainmast's after side over the deck, the gaff's under the hounds; both reach aft.
  const jaws = main.deck + BOOM.jaws;
  const bHeel = point(main.lowerAt(jaws) - MAST_SPARS.main.lower.partners / 2, 0, jaws);
  const boom = spar('boom', 'main boom', 'boom', 'main', bHeel, point(bHeel.along - BOOM.length * Math.cos(BOOM.rise), 0, jaws + BOOM.length * Math.sin(BOOM.rise)), BOOM.diameter, [
    ['jaws', 0], ['middle', BOOM.length * BREAK_SHARES.middle], ['end', BOOM.length],
  ], 'main-mast', { swing: BOOM.swing });
  const gJaws = main.lowerHounds + GAFF.jaws;
  const gHeel = point(main.lowerAt(gJaws) - MAST_SPARS.main.lower.hounds / 2, 0, gJaws);
  const gaff = spar('gaff', 'main gaff', 'gaff', 'main', gHeel, point(gHeel.along - GAFF.length * Math.cos(GAFF.peak), 0, gJaws + GAFF.length * Math.sin(GAFF.peak)), GAFF.diameter, [
    ['jaws', 0], ['middle', GAFF.length * BREAK_SHARES.middle], ['peak', GAFF.length],
  ], 'main-mast', { swing: GAFF.swing });
  return [bowsprit, jib, striker, boom, gaff];
}

/** Every spar of her rig: the fore and main masts with their yards, the bowsprit and its booms, the main boom and gaff. */
export function buildSpars(fore: MastGeometry, main: MastGeometry): Spar[] {
  return [...mastSpars(fore), ...mastSpars(main), ...otherSpars(main)];
}

/** A deadeye a shroud or backstay is set up to: in a channel (or a backstay's stool) on her side, or in a top's rim. */
export interface Deadeye extends RigPoint {
  readonly id: string;
  readonly mast: MastName;
  readonly side: 1 | -1;
  readonly on: 'channel' | 'top';
}

/** The side letter of an id: p for larboard (port), s for starboard. */
export const sideLetter = (side: number): string => (side > 0 ? 's' : 'p');
export const SIDES = [-1, 1] as const;

/** A deadeye's place on her side: the channel's outer edge at its top, the deadeye's middle just over it. */
function seat(along: number, top: number, width: number, side: 1 | -1): RigPoint {
  return point(along, side * (hullHalfBreadth(along, top) + PLANKING.side + width - CHANNEL.seatIn), top + CHANNEL.seatUp);
}

/** Her deadeyes: the lower shrouds' and the backstays' on her sides, the topmast shrouds' in the tops. */
export function buildDeadeyes(geometry: Readonly<Record<MastName, MastGeometry>>): Deadeye[] {
  const out: Deadeye[] = [];
  for (const mast of ['fore', 'main'] as const) {
    const g = geometry[mast], top = MAST_SPARS[mast].top;
    for (const side of SIDES) {
      const s = sideLetter(side);
      (mast === 'main' ? MAIN_SHROUDS : FORE_SHROUDS).forEach((along, k) => {
        const p = mast === 'main' ? seat(along, MAIN_CHANNEL.top, MAIN_CHANNEL.width, side) : seat(along, sideTop(along) - CHANNEL.underTop, CHANNEL.width, side);
        out.push({ id: `${mast}-shroud-${s}${k + 1}`, mast, side, on: 'channel', ...p });
      });
      BACKSTAYS[mast].forEach((along, k) => {
        out.push({ id: `${mast}-backstay-${s}${k + 1}`, mast, side, on: 'channel', ...seat(along, sideTop(along) - CHANNEL.underTop, CHANNEL.width, side) });
      });
      for (let k = 0; k < TOPMAST_SHROUDS; k++) {
        const along = g.lowerAt(g.topFloor) + (k - (TOPMAST_SHROUDS - 1) / 2) * TOP_DEADEYES.spread;
        out.push({ id: `${mast}-top-${s}${k + 1}`, mast, side, on: 'top', ...point(along, side * (top.breadth / 2 - TOP_DEADEYES.in), g.topFloor) });
      }
    }
  }
  return out;
}
