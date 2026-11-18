/**
 * Every line of the brig's rig as one list (pure, N3.2; ship.md: "every rope is a real line between two real
 * points"): what it is, its two ends, the blocks it leads through, where it is made fast and what it does. The
 * sailing model (N3.3), the crew who haul at its pin (N4), the damage that cuts it (N6) and the drawing (N3.6) read
 * this one list.
 *
 * A standing line runs from aloft down to a deadeye, a spar or her hull and serves the spar it holds. A running line
 * runs from the sail or spar it works, through its blocks, to a pin of the plan's rails (`plan.belays`, N2.1), one
 * line to a pin, chosen by the belaying plan in rules/rig.ts.
 */
import {
  BELAYING, BOBSTAYS, BOOM_SHEET_SHORT, BOW_FASTENINGS, BOWLINE_AT, BOWSPRIT_SHROUDS, BRACE_ON_MAIN, BRACE_QUARTER, BUNTLINE_OUT,
  JIB_BOOM, LINE_KINDS, MASTHEAD_SIDE, PEAK_HALLIARD_AT, STAY_ENDS, TOPGALLANT_SHROUDS, TOPGALLANT_SPREAD, TOPMAST_SHROUDS,
  TRESTLE_DEPTH, type LineAct, type LineKind, type MastName,
} from '../rules/rig';
import { BULWARK, PLANKING } from '../rules/ships';
import { crosstreeEnd, lowerMasthead, topgallantHounds, topmastHounds, type MastClimb } from './aloft';
import { hullEnds, hullHalfBreadth, sideTop } from './hull';
import type { Belay } from './plan';
import { corner, edgePoint, type Sail } from './sails';
import { atMark, onSpar, point, sideLetter, SIDES, type Deadeye, type MastGeometry, type RigPoint, type Spar } from './spars';
import { shipY } from './section';

/** What a line's end is made fast to: a spar, a sail's corner or edge, a deadeye, a pin, her hull, the futtock stave, the crosstrees. */
export interface LineEnd extends RigPoint {
  readonly on: 'spar' | 'sail' | 'deadeye' | 'belay' | 'hull' | 'stave' | 'crosstrees';
  /** The spar, sail, deadeye or pin (`plan.belays`) id; her hull's `stem` or `side`; the mast of a stave or crosstrees. */
  readonly id: string;
}

export interface RigLine {
  readonly id: string;
  readonly kind: LineKind;
  readonly standing: boolean;
  readonly diameter: number;
  /** What it does to what it serves, for the simulation, and in words. */
  readonly act: LineAct;
  readonly does: string;
  /** The spar it holds or works, or the sail it works. */
  readonly serves: string;
  /** Its side: -1 larboard, 1 starboard, 0 on the centreline. */
  readonly side: -1 | 0 | 1;
  /** Its two ends: the upper or working end first; a running line's second end is its pin. */
  readonly ends: readonly [LineEnd, LineEnd];
  /** The blocks and sheaves it leads through between them, in order from the first end. */
  readonly via: readonly RigPoint[];
  /** The pin it is made fast on (`plan.belays` id); null for a standing line. */
  readonly belay: string | null;
}

/** A line's end at a point, made fast to what `on` and `id` name. */
const endAt = (on: LineEnd['on'], id: string, p: RigPoint): LineEnd => ({ on, id, along: p.along, across: p.across, height: p.height });
const spar = (s: Spar, p: RigPoint): LineEnd => endAt('spar', s.id, p);
const sailEnd = (s: Sail, p: RigPoint): LineEnd => endAt('sail', s.id, p);

/** A line made from its kind's row. */
function line(id: string, kind: LineKind, serves: string, side: -1 | 0 | 1, ends: readonly [LineEnd, LineEnd], via: readonly RigPoint[] = [], belay: string | null = null): RigLine {
  const k = LINE_KINDS[kind];
  return { id, kind, standing: k.standing, diameter: k.diameter, act: k.act, does: k.does, serves, side, ends, via, belay };
}

/** A mast's spar by kind. */
const mastSpar = (spars: ReadonlyMap<string, Spar>, mast: MastName, part: 'mast' | 'topmast' | 'topgallant-mast') => spars.get(`${mast}-${part}`)!;
/** A point on a mast's forward or after face (`face` 1 or -1) at a height, on its spar. */
function face(s: Spar, g: MastGeometry, h: number, faceOf: 1 | -1): RigPoint {
  const axis = s.kind === 'mast' ? g.lowerAt : s.kind === 'topmast' ? g.topmastAt : g.topgallantAt;
  const half = s.kind === 'mast' ? MASTHEAD_SIDE / 2 : s.diameter / 2;
  return point(axis(h) + faceOf * half, 0, h);
}

/** The stays: each mast's forward support, the headsails' and staysails' stays among them. Upper end first. */
export function buildStays(spars: ReadonlyMap<string, Spar>, geometry: Readonly<Record<MastName, MastGeometry>>): RigLine[] {
  const fore = geometry.fore, main = geometry.main;
  const bowsprit = spars.get('bowsprit')!, jib = spars.get('jib-boom')!;
  const outboard = (t: number) => onSpar(jib, JIB_BOOM.doubling + (jib.length - JIB_BOOM.doubling) * t);
  const fm = mastSpar(spars, 'fore', 'mast'), ft = mastSpar(spars, 'fore', 'topmast'), fg = mastSpar(spars, 'fore', 'topgallant-mast');
  const mm = mastSpar(spars, 'main', 'mast'), mt = mastSpar(spars, 'main', 'topmast'), mg = mastSpar(spars, 'main', 'topgallant-mast');
  const head = (g: MastGeometry) => g.lowerHounds + TRESTLE_DEPTH / 2;
  const stem = bowsprit.marks.find((m) => m.name === 'stem')!.at;
  const stay = (id: string, s: Spar, upper: RigPoint, low: Spar, lower: RigPoint) => line(id, 'stay', s.id, 0, [spar(s, upper), spar(low, lower)]);
  return [
    stay('fore-stay', fm, face(fm, fore, head(fore), 1), bowsprit, onSpar(bowsprit, stem + STAY_ENDS.foreStayOut)),
    stay('fore-topmast-stay', ft, face(ft, fore, fore.topmastHounds, 1), bowsprit, atMark(bowsprit, 'cap')),
    stay('jib-stay', ft, face(ft, fore, fore.topmastHounds + STAY_ENDS.jibStayAbove, 1), jib, outboard(STAY_ENDS.jibTraveller)),
    stay('fore-topgallant-stay', fg, face(fg, fore, fore.topgallantHounds, 1), jib, outboard(STAY_ENDS.topgallantStayOut)),
    stay('flying-jib-stay', fg, face(fg, fore, fore.topgallantHounds + STAY_ENDS.flyingStayAbove, 1), jib, jib.head),
    stay('main-stay', mm, face(mm, main, head(main), 1), fm, face(fm, fore, fore.deck + STAY_ENDS.mainStayCollar, -1)),
    stay('main-topmast-stay', mt, face(mt, main, main.topmastHounds, 1), fm, face(fm, fore, fore.lowerHounds, -1)),
    stay('main-topgallant-stay', mg, face(mg, main, main.topgallantHounds, 1), ft, face(ft, fore, fore.topmastHounds, -1)),
  ];
}

/** A point on her side: her planking's outside at a place and height, out from it by `out`. */
const hullSide = (along: number, h: number, side: number, out = 0): LineEnd => endAt('hull', 'side', point(along, side * (hullHalfBreadth(along, h) + PLANKING.side + out), h));

/** The shrouds, futtock shrouds, topmast and topgallant shrouds, backstays, slings, and the bowsprit's standing rigging. */
export function buildStanding(spars: ReadonlyMap<string, Spar>, geometry: Readonly<Record<MastName, MastGeometry>>, deadeyes: readonly Deadeye[], climbs: readonly MastClimb[]): RigLine[] {
  const out: RigLine[] = [];
  const eye = (id: string): LineEnd => endAt('deadeye', id, deadeyes.find((x) => x.id === id)!);
  for (const mast of ['fore', 'main'] as const) {
    const g = geometry[mast], lower = mastSpar(spars, mast, 'mast'), topmast = mastSpar(spars, mast, 'topmast'), topgallant = mastSpar(spars, mast, 'topgallant-mast');
    for (const side of SIDES) {
      const s = sideLetter(side), climb = climbs.find((c) => c.mast === mast && c.side === side)!;
      deadeyes.filter((d) => d.id.startsWith(`${mast}-shroud-${s}`)).forEach((d, k) => {
        out.push(line(`${mast}-shroud-${s}${k + 1}`, 'shroud', lower.id, side, [spar(lower, lowerMasthead(g, side)), eye(d.id)]));
      });
      // The futtock stave lies across the shrouds where the climb's gait meets the futtock shrouds (`futtock.lo`).
      const staveHeight = climb.futtock.lo - shipY(0);
      for (let k = 0; k < TOPMAST_SHROUDS; k++) {
        const top = eye(`${mast}-top-${s}${k + 1}`);
        out.push(line(`${mast}-topmast-shroud-${s}${k + 1}`, 'topmast shroud', topmast.id, side, [spar(topmast, topmastHounds(g, side)), top]));
        const stave = endAt('stave', mast, point(top.along, climb.futtock.x, staveHeight));
        out.push(line(`${mast}-futtock-shroud-${s}${k + 1}`, 'futtock shroud', lower.id, side, [top, stave]));
      }
      const end = crosstreeEnd(g, side);
      for (let k = 0; k < TOPGALLANT_SHROUDS; k++) {
        const foot = endAt('crosstrees', mast, point(end.along + (2 * k - 1) * TOPGALLANT_SPREAD, end.across, end.height));
        out.push(line(`${mast}-topgallant-shroud-${s}${k + 1}`, 'topgallant shroud', topgallant.id, side, [spar(topgallant, topgallantHounds(g, side)), foot]));
      }
      // Two topmast backstays and a topgallant one, to their stools abaft the channel.
      out.push(line(`${mast}-topmast-backstay-${s}1`, 'backstay', topmast.id, side, [spar(topmast, topmastHounds(g, side)), eye(`${mast}-backstay-${s}1`)]));
      out.push(line(`${mast}-topmast-backstay-${s}2`, 'backstay', topmast.id, side, [spar(topmast, topmastHounds(g, side)), eye(`${mast}-backstay-${s}2`)]));
      out.push(line(`${mast}-topgallant-backstay-${s}`, 'backstay', topgallant.id, side, [spar(topgallant, topgallantHounds(g, side)), eye(`${mast}-backstay-${s}3`)]));
    }
    const yard = spars.get(`${mast}-yard`)!;
    out.push(line(`${mast}-yard-sling`, 'sling', yard.id, 0, [spar(yard, atMark(yard, 'slings')), spar(lower, face(lower, g, g.lowerHounds, 1))]));
  }
  // The bowsprit held down by its bobstays, sideways by its shrouds; the jib-boom by its guys and the martingale.
  const bowsprit = spars.get('bowsprit')!, jib = spars.get('jib-boom')!, striker = spars.get('dolphin-striker')!;
  const stem = bowsprit.marks.find((m) => m.name === 'stem')!.at, outside = (t: number) => onSpar(bowsprit, stem + (bowsprit.length - stem) * t);
  BOBSTAYS.forEach(([t, h], k) => out.push(line(`bobstay-${k + 1}`, 'bobstay', bowsprit.id, 0, [spar(bowsprit, outside(t)), endAt('hull', 'stem', point(hullEnds(h).fore, 0, h))])));
  for (const side of SIDES) {
    const s = sideLetter(side);
    BOWSPRIT_SHROUDS.forEach(([t, along], k) => out.push(line(`bowsprit-shroud-${s}${k + 1}`, 'bowsprit shroud', bowsprit.id, side, [spar(bowsprit, outside(t)), hullSide(along, sideTop(along) - BOW_FASTENINGS.under, side)])));
    out.push(line(`jib-boom-guy-${s}`, 'guy', jib.id, side, [spar(jib, jib.head), hullSide(BOW_FASTENINGS.cathead, sideTop(BOW_FASTENINGS.cathead), side, BOW_FASTENINGS.catheadOut)]));
    out.push(line(`martingale-back-rope-${s}`, 'back rope', striker.id, side, [spar(striker, striker.head), hullSide(BOW_FASTENINGS.backRope, sideTop(BOW_FASTENINGS.backRope) - BOW_FASTENINGS.under, side)]));
  }
  out.push(line('martingale-stay', 'martingale', jib.id, 0, [spar(jib, jib.head), spar(striker, striker.head)]));
  return out;
}

/** A running line before its pin is chosen. */
interface Unbelayed {
  readonly id: string;
  readonly kind: LineKind;
  readonly serves: string;
  readonly side: -1 | 0 | 1;
  readonly working: LineEnd;
  readonly via: readonly RigPoint[];
  /** Its row in the belaying plan (rules/rig.ts BELAYING). */
  readonly plan: string;
}

/** Every running line: each square sail's gear, the boom sail's, the headsails' and staysails'; each on a pin of its own. */
export function buildRunning(spars: ReadonlyMap<string, Spar>, geometry: Readonly<Record<MastName, MastGeometry>>, sails: readonly Sail[], stays: readonly RigLine[], belays: readonly Belay[]): RigLine[] {
  const todo: Unbelayed[] = [];
  const add = (id: string, kind: LineKind, serves: string, side: -1 | 0 | 1, working: LineEnd, via: readonly RigPoint[], plan: string) => todo.push({ id, kind, serves, side, working, via, plan });
  const main = geometry.main;
  for (const sail of sails.filter((s) => s.kind === 'square')) {
    const yard = spars.get(sail.on[0]!)!, y = yard.yard!, mast = yard.mast as MastName, g = geometry[mast], level = y.level;
    const below = level === 'course' ? null : spars.get(level === 'topsail' ? `${mast}-yard` : `${mast}-topsail-yard`)!;
    // What it hangs from aloft: the lower cap, the topmast's hounds, the topgallant's.
    const over = (side: number) => (level === 'course' ? lowerMasthead(g, side) : level === 'topsail' ? topmastHounds(g, side) : topgallantHounds(g, side));
    const mainLevel = level === 'course' ? lowerMasthead(main, 0) : level === 'topsail' ? topmastHounds(main, 0) : topgallantHounds(main, 0);
    for (const side of SIDES) {
      const s = sideLetter(side), arm = side > 0 ? yard.head : yard.heel, clew = corner(sail, `clew-${s}`), sid = `${sail.id}`;
      // Braces: the main yards' lead aft to her quarter, the fore yards' to the mainmast.
      const quarter = point(BRACE_QUARTER.along, side * hullHalfBreadth(BRACE_QUARTER.along, sideTop(BRACE_QUARTER.along)), sideTop(BRACE_QUARTER.along) + BULWARK.railThick + BRACE_QUARTER.up);
      const brace = mast === 'main' ? quarter : point(mainLevel.along, side * BRACE_ON_MAIN, mainLevel.height);
      add(`${sid}-brace-${s}`, 'brace', yard.id, side, spar(yard, arm), [brace], `${mast}-${level} brace`);
      if (level !== 'topgallant') add(`${sid}-lift-${s}`, 'lift', yard.id, side, spar(yard, arm), [over(side)], `${mast} lift`);
      if (below) {
        const sheave = side > 0 ? onSpar(below, below.length - below.yard!.arm) : onSpar(below, below.yard!.arm);
        add(`${sid}-sheet-${s}`, 'sheet', sail.id, side, sailEnd(sail, clew), [sheave, atMark(below, 'slings')], `${mast} sheet`);
        add(`${sid}-clewline-${s}`, 'clewline', sail.id, side, sailEnd(sail, clew), [atMark(yard, `quarter-${s}`), over(side)], `${mast} gear`);
      } else {
        add(`${sid}-sheet-${s}`, 'sheet', sail.id, side, sailEnd(sail, clew), [], `${mast}-course sheet`);
        add(`${sid}-tack-${s}`, 'tack', sail.id, side, sailEnd(sail, clew), [], `${mast}-course tack`);
        add(`${sid}-clewgarnet-${s}`, 'clewgarnet', sail.id, side, sailEnd(sail, clew), [atMark(yard, `quarter-${s}`), over(side)], `${mast} gear`);
      }
      if (level !== 'topgallant') {
        add(`${sid}-buntline-${s}`, 'buntline', sail.id, side, sailEnd(sail, edgePoint(sail, 'clew-p', 'clew-s', 1 / 2 + side * BUNTLINE_OUT)), [over(side)], `${mast} gear`);
        add(`${sid}-bowline-${s}`, 'bowline', sail.id, side, sailEnd(sail, edgePoint(sail, `head-${s}`, `clew-${s}`, BOWLINE_AT)), [], `${mast} bowline`);
      }
      if (level === 'topsail') add(`${sid}-reef-tackle-${s}`, 'reef tackle', sail.id, side, sailEnd(sail, edgePoint(sail, `head-${s}`, `clew-${s}`, sail.reefShare * sail.reefs)), [arm], `${mast} gear`);
    }
    if (level !== 'course') add(`${sail.id}-halliard`, 'halliard', yard.id, 0, spar(yard, atMark(yard, 'slings')), [over(0)], `${mast} halliard`);
  }
  // The boom sail: halliards at the throat and the peak, vangs, outhaul, brails, sheet and topping lifts.
  const boomSail = sails.find((s) => s.kind === 'boom')!, boom = spars.get('boom')!, gaff = spars.get('gaff')!, cap = lowerMasthead(main, 0);
  add('boom-sail-throat-halliard', 'halliard', boomSail.id, 0, spar(gaff, gaff.heel), [cap], 'boom halliard');
  add('boom-sail-peak-halliard', 'halliard', boomSail.id, 0, spar(gaff, onSpar(gaff, gaff.length * PEAK_HALLIARD_AT)), [cap], 'boom halliard');
  add('boom-sail-outhaul', 'outhaul', boomSail.id, 0, sailEnd(boomSail, corner(boomSail, 'clew')), [boom.head, boom.heel], 'boom gear');
  add('boom-sheet', 'sheet', boom.id, 0, spar(boom, onSpar(boom, boom.length - BOOM_SHEET_SHORT)), [], 'boom aft');
  for (const side of SIDES) {
    const s = sideLetter(side);
    add(`gaff-vang-${s}`, 'vang', gaff.id, side, spar(gaff, gaff.head), [], 'boom aft');
    add(`boom-sail-brail-${s}`, 'brail', boomSail.id, side, sailEnd(boomSail, edgePoint(boomSail, 'peak', 'clew', BOWLINE_AT)), [gaff.heel], 'boom gear');
    add(`boom-topping-lift-${s}`, 'topping lift', boom.id, side, spar(boom, boom.head), [lowerMasthead(main, side)], 'boom gear');
  }
  // Headsails and staysails: halliard and downhaul at the head, a sheet each side at the clew; the jib's traveller is hauled out.
  for (const sail of sails.filter((s) => s.kind === 'head' || s.kind === 'stay')) {
    const stay = stays.find((l) => l.id === sail.on[0])!, head = corner(sail, 'head'), what = sail.kind === 'head' ? 'head' : 'stay';
    add(`${sail.id}-halliard`, 'halliard', sail.id, 0, sailEnd(sail, head), [stay.ends[0]], `${what} halliard`);
    add(`${sail.id}-downhaul`, 'downhaul', sail.id, 0, sailEnd(sail, head), [corner(sail, 'tack')], `${what} downhaul`);
    for (const side of SIDES) add(`${sail.id}-sheet-${sideLetter(side)}`, 'sheet', sail.id, side, sailEnd(sail, corner(sail, 'clew')), [], `${what} sheet`);
  }
  const jib = sails.find((s) => s.id === 'jib')!;
  add('jib-outhaul', 'outhaul', jib.id, 0, sailEnd(jib, corner(jib, 'tack')), [spars.get('jib-boom')!.head], 'head downhaul');
  return belayAll(todo, belays);
}

/** Each running line its pin: the most constrained first, each on the first of its rails with a free pin on its side, nearest its place. */
function belayAll(todo: readonly Unbelayed[], belays: readonly Belay[]): RigLine[] {
  const taken = new Set<string>();
  const order = todo.map((t, i) => ({ t, i })).sort((a, b) => BELAYING[a.t.plan]!.rails.length - BELAYING[b.t.plan]!.rails.length || a.i - b.i);
  const chosen = new Map<string, Belay>();
  for (const { t } of order) {
    const row = BELAYING[t.plan];
    if (!row) throw new Error(`${t.id}: no belaying plan "${t.plan}"`);
    // Its own rails in order; when they are full, the free pin nearest its place on any rail.
    const free = belays.filter((b) => !taken.has(b.id) && (t.side === 0 || Math.sign(b.across) === t.side));
    const rank = (b: Belay) => { const k = row.rails.indexOf(b.rail); return k < 0 ? row.rails.length : k; };
    const pin = free.sort((a, b) => rank(a) - rank(b) || Math.abs(a.along - row.near) - Math.abs(b.along - row.near) || a.id.localeCompare(b.id))[0];
    if (!pin) throw new Error(`${t.id}: no free pin left on her side`);
    taken.add(pin.id);
    chosen.set(t.id, pin);
  }
  return todo.map((t) => {
    const pin = chosen.get(t.id)!;
    return line(t.id, t.kind, t.serves, t.side, [t.working, endAt('belay', pin.id, pin)], t.via, pin.id);
  });
}
