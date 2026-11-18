/**
 * The placement map of the scenario dialog (Arnd 2026-11-18: "a ship placement, with sensible default, on a map that
 * looks fitting"): a sea chart in brass and lacquer, the wind from the top, a ship drawn at her place and heading in
 * her side's colour. A finger or a mouse drags a ship to move her and her brass handle to turn her; the first ship put
 * by hand freezes the others where the start has them (sim/scenario.ts `setPlace`), and one button brings the start's
 * own places back. The geometry is placement.ts's; this draws and listens.
 */
import { navyOfShip, resetPlaces, setPlace, isPlaced, type Scenario } from '../sim/scenario';
import { defaultPlaces, type Placed, type StartTerms } from '../sim/start';
import { apartOnWater, DEGREE } from '../sim/units';
import { makeButton } from './button';
import { make } from './dom';
import { CHART, frameOf, fromChart, GRID_STEPS, gridOf, headingTo, roomFor, snapped, toChart, type Frame } from './placement';
import { rose } from './sheet';
import type { WordKey } from './words';

type Say = Readonly<Record<WordKey, string>>;
const SVG = 'http://www.w3.org/2000/svg';
/** How near a touch must land to a ship or her handle to take it, chart units. */
const GRAB = 30;
/** The handle stands this far ahead of her bow, chart units. */
const HANDLE = 40;
/** A ship's drawn size, chart units: for a finger to find, not to scale. */
const SHIP_LENGTH = 46;
/** Where the chart's furniture stands, chart units: the wind's arrow and its name, the compass rose, the scale bar, the labels. */
const LAYOUT = {
  windX: 34, windY: 70, windLabel: -44, rose: 58, roseFromRight: 70, roseDown: 12, edge: 16, barRise: 22, tick: 5, tickLength: 10, barLabelRise: 30,
  between: 8, handleRadius: 9, numberDrop: 5, gridLabelPush: 4, gridLabelRise: 6, handleBack: 18,
} as const;
/** The wind's arrow, down the page: its shaft and head, as a path. */
const WIND_ARROW = 'M0 -34 L0 28 M-8 16 L0 30 L8 16';
/** The scale bar is the longest round length that is no more than about this share of the chart's width. */
const BAR_SHARE = 8;
/** The distance between the sides is written to this many metres. */
const ROUND_APART = 10;
/** Metres in a kilometre. */
const KM = 1000;

/** A ship's hull from above, bow up, about the origin. */
const HULL = `M0 ${-SHIP_LENGTH / 2} C10 ${-SHIP_LENGTH / 5} 10 ${SHIP_LENGTH / 3} 7 ${SHIP_LENGTH / 2} L-7 ${SHIP_LENGTH / 2} C-10 ${SHIP_LENGTH / 3} -10 ${-SHIP_LENGTH / 5} 0 ${-SHIP_LENGTH / 2}Z`;

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, text = ''): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  if (text) e.textContent = text;
  return e;
}

/** What the map keeps between drawings: the ship picked. */
export interface MapSelection {
  index: number;
}

/** Metres written for a chart label: 500 m, 1 km. */
const metres = (m: number): string => (m >= KM ? `${m / KM} km` : `${m} m`);

/** The map, with its hint and its reset button, for `sc`; every ship put by hand calls `change` with the new scenario. */
export function placementMap(say: Say, sc: Scenario, terms: StartTerms, selection: MapSelection, change: (to: Scenario) => void): HTMLElement {
  const sides = sc.ships.map((s) => s.side), uniform = new Set(sides).size < 2 ? sides.map((_, i) => i % 2) : sides;
  const defaults = defaultPlaces(uniform, terms);
  const places: Placed[] = sc.ships.map((s, i) => ({ ...(s.at ?? defaults[i]!) }));
  const frame: Frame = frameOf(places);
  const box = make('div', 'scn-map');
  const chart = svg('svg', { viewBox: `0 0 ${CHART.width} ${CHART.height}`, class: 'scn-chart', role: 'img', 'aria-label': say.mapTitle });

  // The water: a lacquer-blue ground with gridlines at a round step, each labelled where it meets the edge.
  chart.append(svg('rect', { x: 0, y: 0, width: CHART.width, height: CHART.height, class: 'scn-water' }));
  const grid = gridOf(frame);
  for (const x of grid.xs) {
    const [px] = toChart(frame, x, 0);
    chart.append(svg('line', { x1: px, y1: 0, x2: px, y2: CHART.height, class: 'scn-grid' }), svg('text', { x: px + LAYOUT.gridLabelPush, y: CHART.height - LAYOUT.gridLabelRise, class: 'scn-gridtext' }, String(x)));
  }
  for (const z of grid.zs) {
    const [, py] = toChart(frame, 0, z);
    chart.append(svg('line', { x1: 0, y1: py, x2: CHART.width, y2: py, class: 'scn-grid' }));
  }
  // The wind: an arrow down the chart's left edge, with its name, and the compass rose in the corner.
  const wind = svg('g', { class: 'scn-wind', transform: `translate(${LAYOUT.windX} ${LAYOUT.windY})` });
  wind.append(svg('path', { d: WIND_ARROW }), svg('text', { x: 0, y: LAYOUT.windLabel, 'text-anchor': 'middle' }, say.mapWind));
  chart.append(wind);
  const compass = rose();
  compass.setAttribute('class', 'scn-rose');
  compass.setAttribute('x', String(CHART.width - LAYOUT.roseFromRight));
  compass.setAttribute('y', String(LAYOUT.roseDown));
  compass.setAttribute('width', String(LAYOUT.rose));
  compass.setAttribute('height', String(LAYOUT.rose));
  chart.append(compass);
  // The scale bar, a round length that fits about a sixth of the chart.
  const bar = GRID_STEPS.find((m) => m * frame.scale >= CHART.width / BAR_SHARE) ?? GRID_STEPS[GRID_STEPS.length - 1]!, along = bar * frame.scale;
  const rule = CHART.height - LAYOUT.barRise, top = rule - LAYOUT.tick, end = LAYOUT.edge + along;
  chart.append(svg('path', { d: `M${LAYOUT.edge} ${rule} h${along} M${LAYOUT.edge} ${top} v${LAYOUT.tickLength} M${end} ${top} v${LAYOUT.tickLength}`, class: 'scn-scale' }), svg('text', { x: LAYOUT.edge, y: CHART.height - LAYOUT.barLabelRise, class: 'scn-gridtext' }, metres(bar)));

  // How far apart the first two sides lie, as a dashed line between their middles.
  const order = [...new Set(uniform)], sideMiddle = (side: number) => {
    const mates = places.filter((_, i) => uniform[i] === side);
    return { x: mates.reduce((t, p) => t + p.x, 0) / mates.length, z: mates.reduce((t, p) => t + p.z, 0) / mates.length };
  };
  const between = svg('g', { class: 'scn-between' }), line = svg('line'), label = svg('text', { 'text-anchor': 'middle' });
  between.append(line, label);
  chart.append(between);
  const drawBetween = () => {
    if (order.length < 2) { between.setAttribute('visibility', 'hidden'); return; }
    const a = sideMiddle(order[0]!), b = sideMiddle(order[1]!), [x1, y1] = toChart(frame, a.x, a.z), [x2, y2] = toChart(frame, b.x, b.z);
    between.removeAttribute('visibility');
    line.setAttribute('x1', String(x1)); line.setAttribute('y1', String(y1)); line.setAttribute('x2', String(x2)); line.setAttribute('y2', String(y2));
    label.setAttribute('x', String((x1 + x2) / 2)); label.setAttribute('y', String((y1 + y2) / 2 - LAYOUT.between));
    label.textContent = `${Math.round(apartOnWater(a, b) / ROUND_APART) * ROUND_APART} ${say.mapApart}`;
  };

  // The ships, each a hull of her side's colour turned to her heading, her number beside her; the picked one has her handle.
  const parts = places.map((_, i) => {
    const g = svg('g', { class: `scn-vessel side-${sc.ships[i]!.side}` });
    const hull = svg('path', { d: HULL, class: 'scn-hull' }), no = svg('text', { class: 'scn-vesselno', 'text-anchor': 'middle' }, String(i + 1));
    const stem = svg('line', { class: 'scn-stem' }), handle = svg('circle', { r: LAYOUT.handleRadius, class: 'scn-handle' });
    g.append(stem, handle, hull, no);
    return { g, hull, no, stem, handle };
  });
  chart.append(...parts.map((p) => p.g));
  const draw = (i: number) => {
    const p = places[i]!, v = parts[i]!, [px, py] = toChart(frame, p.x, p.z), h = p.heading;
    v.hull.setAttribute('transform', `translate(${px} ${py}) rotate(${h / DEGREE})`);
    v.no.setAttribute('x', String(px)); v.no.setAttribute('y', String(py + LAYOUT.numberDrop));
    const hx = px + Math.sin(h) * (SHIP_LENGTH / 2 + HANDLE - LAYOUT.handleBack), hy = py - Math.cos(h) * (SHIP_LENGTH / 2 + HANDLE - LAYOUT.handleBack);
    v.stem.setAttribute('x1', String(px)); v.stem.setAttribute('y1', String(py)); v.stem.setAttribute('x2', String(hx)); v.stem.setAttribute('y2', String(hy));
    v.handle.setAttribute('cx', String(hx)); v.handle.setAttribute('cy', String(hy));
    v.g.classList.toggle('picked', selection.index === i);
    v.g.classList.toggle('yours', sc.ships[i]!.command.kind === 'you');
    v.g.dataset.navy = navyOfShip(sc, i);
  };
  const drawAll = () => { places.forEach((_, i) => draw(i)); drawBetween(); };
  drawAll();

  // Dragging: a ship by her hull moves her, the handle of the picked ship turns her.
  let drag: { index: number; kind: 'move' | 'turn'; moved: boolean } | null = null;
  const at = (e: PointerEvent): [number, number] => {
    const m = chart.getScreenCTM()!.inverse(), pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return [pt.x, pt.y];
  };
  chart.addEventListener('pointerdown', (e) => {
    const [x, y] = at(e);
    const handleOf = (i: number) => Math.hypot(Number(parts[i]!.handle.getAttribute('cx')) - x, Number(parts[i]!.handle.getAttribute('cy')) - y);
    let found: typeof drag = selection.index >= 0 && handleOf(selection.index) <= GRAB ? { index: selection.index, kind: 'turn', moved: false } : null;
    if (!found) {
      let best = GRAB;
      places.forEach((p, i) => { const [px, py] = toChart(frame, p.x, p.z), d = Math.hypot(px - x, py - y); if (d <= best) { best = d; found = { index: i, kind: 'move', moved: false }; } });
    }
    if (!found) return;
    drag = found;
    if (selection.index !== found.index) { selection.index = found.index; drawAll(); }
    chart.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  chart.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const [x, y] = at(e), [mx, mz] = fromChart(frame, x, y), p = places[drag.index]!;
    if (drag.kind === 'move') {
      const [sx, sz] = snapped(mx, mz);
      if ((sx === p.x && sz === p.z) || !roomFor(places, drag.index, sx, sz)) return;
      places[drag.index] = { ...p, x: sx, z: sz };
    } else {
      const heading = headingTo(p.x, p.z, mx, mz);
      if (heading === p.heading) return;
      places[drag.index] = { ...p, heading };
    }
    drag.moved = true;
    draw(drag.index);
    drawBetween();
  });
  const drop = () => {
    const d = drag;
    drag = null;
    if (d?.moved) change(setPlace(sc, d.index, places[d.index]!, defaults));
  };
  chart.addEventListener('pointerup', drop);
  chart.addEventListener('pointercancel', drop);

  const reset = makeButton(say.mapReset, () => change(resetPlaces(sc)));
  reset.className = 'nt-link scn-reset';
  reset.disabled = !isPlaced(sc);
  box.append(chart, make('p', 'nt-note scn-hint', say.mapHelp), reset);
  return box;
}
