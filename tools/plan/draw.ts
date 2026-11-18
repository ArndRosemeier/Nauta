/**
 * Drawings of the brig's plan (N2.1), for Arnd and for checking by eye: the sheer and body plan from the table of
 * offsets, the three levels with their spaces, openings, fittings, guns and ways, and the walk graph's map.
 * `npx tsx tools/plan/draw.ts [outDir]` writes plan-lines.svg, plan-decks.svg and plan-walk.svg (default:
 * docs/design/ship/).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BODY, BODY_STATIONS, MASTS, PORTS } from '../../src/sim/rules/ships.ts';
import {
  designWaterline, HULL_AFT, HULL_FORE, hullBottom, hullHalfBreadth, keelBottom, sheer, sideTop,
} from '../../src/sim/ship/hull.ts';
import { berthDeck, floorAt, insideBreadth, shipPlan, type Space } from '../../src/sim/ship/plan.ts';
import { nodeAt, reachable, walkGraph, WALK_CELL } from '../../src/sim/ship/walk.ts';

const out = process.argv[2] ?? 'docs/design/ship';
const plan = shipPlan();
const S = 34; // px per metre
const PAD = 60;
const INK = '#2b2b2b', MUTED = '#8a8a8a', PAPER = '#f7f4ee', WATER = '#4f7fa8', HULL = '#e8d9bf', ROOM = '#f3ead8';
const LEVEL_FILL: Record<string, string> = { weather: '#efe3cb', berth: '#f3ead8', hold: '#e2d2b0' };
const X = (along: number) => PAD + (along - HULL_AFT) * S;
const W = Math.ceil((HULL_FORE - HULL_AFT) * S + 2 * PAD);

const text = (x: number, y: number, s: string, size = 12, anchor = 'start', fill = INK, weight = 'normal') =>
  `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="Helvetica,Arial,sans-serif" font-size="${size}" text-anchor="${anchor}" fill="${fill}" font-weight="${weight}">${s}</text>`;
const poly = (pts: [number, number][], fill: string, stroke = INK, width = 1, extra = '') =>
  `<polygon points="${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" ${extra}/>`;
const line = (pts: [number, number][], stroke = INK, width = 1, extra = '') =>
  `<polyline points="${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}" fill="none" stroke="${stroke}" stroke-width="${width}" ${extra}/>`;
const svg = (h: number, body: string[]) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${h}" width="${W}" height="${h}"><rect width="${W}" height="${h}" fill="${PAPER}"/>${body.join('')}</svg>`;
const steps = (a: number, b: number, n: number) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);

// ---- The lines: sheer plan and body plan --------------------------------------------------------------------------
export function lines(): string {
  const o: string[] = [], base = 330, Y = (h: number) => base - h * S;
  o.push(text(PAD, 30, 'The brig: sheer and body plan from the table of offsets (Admiralty draught ZAZ4607, 1802)', 18, 'start', INK, 'bold'));
  o.push(text(PAD, 50, 'Metres; heights above her base, places forward of the mainmast. Grey: stations read off the body plan.', 12, 'start', MUTED));
  // Hull outline in profile: bottom edge and top of side.
  const as = steps(HULL_AFT, HULL_FORE, 400);
  o.push(poly([...as.map((a) => [X(a), Y(sideTop(a))] as [number, number]), ...as.slice().reverse().map((a) => [X(a), Y(hullBottom(a))] as [number, number])], HULL));
  o.push(line(steps(-8.98, 17.92, 20).map((a) => [X(a), Y(keelBottom(a))]), INK, 3));
  o.push(line(as.map((a) => [X(a), Y(sheer(a))]), '#b33', 1.5));
  o.push(line(as.map((a) => [X(a), Y(berthDeck(a))]), '#b33', 1, 'stroke-dasharray="6 4"'));
  o.push(line([[X(HULL_AFT), Y(designWaterline(HULL_AFT))], [X(HULL_FORE), Y(designWaterline(HULL_FORE))]], WATER, 1.5));
  for (const s of BODY_STATIONS) o.push(line([[X(s.along), Y(hullBottom(s.along))], [X(s.along), Y(sideTop(s.along))]], MUTED, 0.6));
  for (const [mark, along, sill, top, width] of PORTS) {
    o.push(`<rect x="${X(along - width / 2)}" y="${Y(top)}" width="${width * S}" height="${(top - sill) * S}" fill="#333"/>`);
    o.push(text(X(along), Y(top) - 4, mark, 10, 'middle', MUTED));
  }
  for (const [name, m] of Object.entries(MASTS)) {
    o.push(line([[X(m.along), Y(m.step)], [X(m.along), Y(sheer(m.along) + 3)]], '#9c7a52', 5));
    o.push(text(X(m.along), Y(sheer(m.along) + 3) - 6, `${name}mast`, 11, 'middle'));
  }
  o.push(text(X(HULL_FORE) - 4, Y(designWaterline(HULL_FORE)) - 6, 'load waterline', 11, 'end', WATER));
  o.push(text(X(-6), Y(sheer(-6)) - 6, 'weather deck', 11, 'middle', '#b33'));
  o.push(text(X(-6), Y(berthDeck(-6)) + 14, 'berth deck', 11, 'middle', '#b33'));
  // Half-breadth plan below: the load waterline and the top breadth, starboard half.
  const hb = 640, Yb = (x: number) => hb - x * S;
  o.push(line([[X(HULL_AFT), hb], [X(HULL_FORE), hb]], MUTED, 0.6));
  o.push(line(as.map((a) => [X(a), Yb(hullHalfBreadth(a, sheer(a)))]), INK, 1.2));
  o.push(line(as.map((a) => [X(a), Yb(hullHalfBreadth(a, designWaterline(a)))]), WATER, 1.2));
  for (const h of [1.5, 2.3, 3.1]) o.push(line(as.map((a) => [X(a), Yb(hullHalfBreadth(a, h))]), MUTED, 0.6));
  o.push(text(PAD, hb - 5.2 * S, 'Half-breadth plan: top breadth (black), load waterline (blue), waterlines at 1.5, 2.3 and 3.1 m', 12, 'start', MUTED));
  // Body plan: after body on the left, fore body on the right of a centreline.
  const cx = W - PAD - 6 * S, by = 960, Yc = (h: number) => by - h * S;
  o.push(text(cx - 6 * S, Yc(8) - 10, 'Body plan: after body left, fore body right', 12, 'start', MUTED));
  o.push(line([[cx, Yc(0)], [cx, Yc(7.8)]], MUTED, 0.6));
  for (const s of BODY_STATIONS) {
    const side = s.along < 5.91 ? -1 : 1, hs = steps(hullBottom(s.along), sideTop(s.along), 60);
    o.push(line(hs.map((h) => [cx + side * hullHalfBreadth(s.along, h) * S, Yc(h)]), s.name === '⊗' ? INK : '#6a5a40', s.name === '⊗' ? 1.6 : 0.8));
  }
  o.push(line([[cx - 5 * S, Yc(designWaterline(0))], [cx + 5 * S, Yc(designWaterline(0))]], WATER, 0.8));
  return svg(1000, o);
}

// ---- The decks -----------------------------------------------------------------------------------------------------
/** A level's plan: her inside at its floor, the spaces, openings and obstacles, and optionally the walk graph over it. */
function levelPlan(oy: number, level: Space['level'], title: string, walk: boolean): string[] {
  const o: string[] = [], Yp = (x: number) => oy + x * S;
  const spaces = plan.spaces.filter((s) => s.level === level);
  const h = (a: number) => {
    const s = spaces.find((x) => a >= x.aft && a <= x.fore) ?? spaces[0]!;
    return floorAt(s, a, 0) + BODY.height / 2;
  };
  const lo = Math.min(...spaces.map((s) => s.aft)), hi = Math.max(...spaces.map((s) => s.fore));
  const as = steps(Math.max(lo, HULL_AFT), Math.min(hi, HULL_FORE), 300).filter((a) => insideBreadth(a, h(a)) > 0);
  o.push(poly([...as.map((a) => [X(a), Yp(-insideBreadth(a, h(a)))] as [number, number]), ...as.slice().reverse().map((a) => [X(a), Yp(insideBreadth(a, h(a)))] as [number, number])], LEVEL_FILL[level]!));
  o.push(text(PAD, oy - 5 * S, title, 15, 'start', INK, 'bold'));
  for (const s of spaces) {
    const half = Math.max(...steps(s.aft, s.fore, 10).map((a) => insideBreadth(a, h(a))));
    const p = Math.max(s.port, -half), q = Math.min(s.starboard, half);
    o.push(`<rect x="${X(s.aft)}" y="${Yp(p)}" width="${(s.fore - s.aft) * S}" height="${(q - p) * S}" fill="none" stroke="${MUTED}" stroke-width="0.6" stroke-dasharray="3 3"/>`);
    if (!walk) o.push(text(X((s.aft + s.fore) / 2), Yp((p + q) / 2) + 4, s.name.length > 14 && s.fore - s.aft < 3 ? s.name.split(' ')[0]! : s.name, 9, 'middle'));
  }
  for (const b of plan.bulkheads.filter((x) => x.level === level)) {
    o.push(b.athwart ? line([[X(b.at), Yp(b.from)], [X(b.at), Yp(b.to)]], INK, 1.6) : line([[X(b.from), Yp(b.at)], [X(b.to), Yp(b.at)]], INK, 1.6));
  }
  if (walk) {
    const graph = walkGraph(plan);
    const start = nodeAt(graph, plan.stations.find((s) => s.id === 'quarterdeck')!), seen = reachable(graph, start);
    for (const s of spaces) {
      const g = graph.grids.get(s.id)!;
      for (let c = 0; c < g.cols; c++) for (let r = 0; r < g.rows; r++) {
        const n = g.node[c * g.rows + r]!;
        if (n < 0) continue;
        o.push(`<rect x="${X(s.aft + c * WALK_CELL)}" y="${Yp(s.port + r * WALK_CELL)}" width="${WALK_CELL * S + 0.3}" height="${WALK_CELL * S + 0.3}" fill="${seen.has(n) ? '#8fbf8a' : '#d66'}" opacity="0.55"/>`);
      }
    }
  }
  for (const ob of plan.obstacles.filter((x) => x.level === level)) {
    const opening = plan.openings.find((x) => x.id === ob.id);
    const fill = ob.id.startsWith('gun') ? '#3b3b3b' : opening ? (opening.kind === 'skylight' ? '#cfe0ea' : '#9c7a52') : '#c9b08a';
    const half = insideBreadth((ob.aft + ob.fore) / 2, h((ob.aft + ob.fore) / 2)), p = Math.max(ob.port, -half), q = Math.min(ob.starboard, half);
    o.push(`<rect x="${X(ob.aft)}" y="${Yp(p)}" width="${(ob.fore - ob.aft) * S}" height="${(q - p) * S}" fill="${fill}" stroke="${INK}" stroke-width="0.6"/>`);
  }
  const spaceLevel = (id: string) => plan.spaces.find((s) => s.id === id)!.level;
  for (const w of plan.ways) {
    const a = spaceLevel(w.from.space) === level, b = spaceLevel(w.to.space) === level;
    if (!a && !b) continue;
    const colour = w.kind === 'ladder' ? '#2d6cdf' : w.kind === 'door' ? '#c2410c' : '#15803d';
    if (a && b) o.push(line([[X(w.from.along), Yp(w.from.across)], [X(w.to.along), Yp(w.to.across)]], colour, 2.2));
    for (const [on, spot] of [[a, w.from], [b, w.to]] as const) if (on) o.push(`<circle cx="${X(spot.along)}" cy="${Yp(spot.across)}" r="3.2" fill="${colour}"/>`);
    if (w.kind === 'ladder' && b) o.push(text(X(w.to.along), Yp(w.to.across) - 6, '▲', 9, 'middle', colour));
    if (w.kind === 'ladder' && a && !b) o.push(text(X(w.from.along), Yp(w.from.across) - 6, '▼', 9, 'middle', colour));
  }
  if (walk) for (const p of plan.places.filter((x) => spaceLevel(x.space) === level)) o.push(`<circle cx="${X(p.along)}" cy="${Yp(p.across)}" r="1.8" fill="#111"/>`);
  for (const st of plan.stations.filter((x) => spaceLevel(x.space) === level)) {
    o.push(`<circle cx="${X(st.along)}" cy="${Yp(st.across)}" r="5" fill="none" stroke="#7c3aed" stroke-width="2"/>`);
    if (walk) o.push(text(X(st.along) + 7, Yp(st.across) - 6, st.name.replace(/^the /, ''), 9, 'start', '#7c3aed'));
  }
  return o;
}

function decks(walk: boolean): string {
  const o: string[] = [];
  o.push(text(PAD, 30, walk
    ? 'The walk graph: where the captain (1.78 m, 0.5 m across the shoulders) can stand and the ways between'
    : 'Her decks from the 1812 inboard profile and deck plans: spaces, openings, fittings, guns, ways', 18, 'start', INK, 'bold'));
  o.push(text(PAD, 50, walk
    ? 'Green: floor his middle reaches from the quarterdeck. Blue: ladders (▲ up, ▼ down), orange: doors, green lines: open floor. Black dots: crew places; violet: stations.'
    : 'Dark: guns; brown: hatches, ladderways, scuttles; pale blue: skylight; buff: fittings. Lines: bulkheads. Blue: ladders, orange: doors, green: open floor; violet: stations.', 12, 'start', MUTED));
  o.push(...levelPlan(260, 'weather', 'Weather deck (flush)', walk));
  o.push(...levelPlan(620, 'berth', 'Berth deck (1.6 m under the beams)', walk));
  o.push(...levelPlan(980, 'hold', 'Hold and platforms (about 1.2 m under the beams)', walk));
  return svg(1200, o);
}

mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, 'plan-lines.svg'), lines());
writeFileSync(path.join(out, 'plan-decks.svg'), decks(false));
writeFileSync(path.join(out, 'plan-walk.svg'), decks(true));
console.log(`wrote plan-lines.svg, plan-decks.svg, plan-walk.svg to ${out}`);
