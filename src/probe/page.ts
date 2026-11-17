/**
 * `?probe`: what this browser and device offer, shown on screen as text to copy (plan N0.5). The tablet has no
 * developer tools at hand, so everything the design needs to know (WebGPU, compute and its speed, float textures,
 * storage textures, limits, memory, screen and refresh) is measured here and written where a finger can copy it.
 */
import { formatBytes, formatReport, hzFromIntervals, medianOf, yesNo, type Row, type Section } from './report';
import { probeWebGL2, probeWebGPU, type Findings } from './gpu';
import { LABEL } from 'virtual:nauta/version';

/** How long the animation frames are watched to find the refresh rate, ms. */
const REFRESH_WATCH_MS = 1500;
/** A frame this much longer than the median counts as a hitch while the refresh is watched. */
const HITCH_FACTOR = 1.5;
/** Rounding of the refresh rate, Hz: one decimal tells 59.9 from 60. */
const HZ_DECIMALS = 1;
/** How long "Copied" stays on the button, ms. */
const COPIED_MS = 2000;

/** The times between animation frames over REFRESH_WATCH_MS, ms. */
function frameIntervals(): Promise<number[]> {
  return new Promise((done) => {
    const out: number[] = [];
    let last = -1, start = -1;
    const tick = (t: number) => {
      if (start < 0) start = t;
      else out.push(t - last);
      last = t;
      if (t - start < REFRESH_WATCH_MS) requestAnimationFrame(tick); else done(out);
    };
    requestAnimationFrame(tick);
  });
}

const media = (q: string) => matchMedia(q).matches;

/** The device and the screen, and the refresh rate measured. */
async function probeDevice(): Promise<Findings> {
  const nav = navigator as Navigator & { deviceMemory?: number; standalone?: boolean };
  const heap = (performance as Performance & { memory?: { jsHeapSizeLimit: number } }).memory;
  const dpr = devicePixelRatio, sw = screen.width, sh = screen.height;
  const intervals = await frameIntervals();
  const hz = hzFromIntervals(intervals), frameMs = medianOf(intervals);
  const hitches = intervals.filter((i) => i > frameMs * HITCH_FACTOR).length;
  const standalone = media('(display-mode: standalone)') || media('(display-mode: fullscreen)') || nav.standalone === true;
  const memory = nav.deviceMemory ? `${nav.deviceMemory} GB (rounded by the browser)` : 'not told by the browser';
  const device: Row[] = [
    ['user agent', nav.userAgent],
    ['platform', nav.platform || 'not told'],
    ['touch points', String(nav.maxTouchPoints)],
    ['CPU threads', String(nav.hardwareConcurrency || 'not told')],
    ['device memory', memory],
    ['JS heap limit', heap ? formatBytes(heap.jsHeapSizeLimit) : 'not told'],
    ['cross-origin isolated (threads)', yesNo(globalThis.crossOriginIsolated === true)],
    ['OffscreenCanvas', yesNo(typeof OffscreenCanvas !== 'undefined')],
  ];
  const display: Row[] = [
    ['screen', `${sw} × ${sh} CSS px at ${dpr}× = ${Math.round(sw * dpr)} × ${Math.round(sh * dpr)} px`],
    ['window', `${innerWidth} × ${innerHeight} CSS px`],
    ['orientation', screen.orientation?.type ?? 'not told'],
    ['refresh', `${hz.toFixed(HZ_DECIMALS)} Hz (median of ${intervals.length} frames, ${hitches} hitches)`],
    ['home-screen app', yesNo(standalone)],
    ['wide colour (P3)', yesNo(media('(color-gamut: p3)'))],
    ['high dynamic range', yesNo(media('(dynamic-range: high)'))],
    ['reduced motion asked', yesNo(media('(prefers-reduced-motion: reduce)'))],
  ];
  return {
    sections: [{ title: 'Device', rows: device }, { title: 'Display', rows: display }],
    summary: [
      ['screen', `${Math.round(sw * dpr)} × ${Math.round(sh * dpr)} px (${dpr}×), ${hz.toFixed(HZ_DECIMALS)} Hz`],
      ['device memory', memory],
    ],
  };
}

/** One probe's findings, or its failure as a line, so one broken question never hides the other answers. */
async function safely(name: string, run: () => Promise<Findings> | Findings): Promise<Findings> {
  try { return await run(); } catch (err) {
    const row: Row = [`${name} probe failed`, err instanceof Error ? err.message : String(err)];
    return { sections: [{ title: name, rows: [row] }], summary: [row] };
  }
}

/** Builds the probe's page in place of the game, runs every probe and shows the report. */
export async function runProbe(): Promise<void> {
  document.getElementById('loading')?.remove();
  document.getElementById('view')?.remove();
  const root = document.createElement('main'), bar = document.createElement('header'), out = document.createElement('pre');
  root.id = 'probe';
  const button = (label: string, onClick: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', onClick);
    bar.append(b);
    return b;
  };
  const title = document.createElement('h1');
  title.textContent = 'Nauta probe';
  bar.append(title);
  const copy = button('Copy report', () => {
    const done = () => { copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy report'; }, COPIED_MS); };
    navigator.clipboard?.writeText(out.textContent ?? '').then(done, () => selectAll(out));
  });
  button('Run again', () => location.reload());
  copy.disabled = true;
  out.textContent = 'Probing… (a few seconds; keep the page in front)';
  root.append(bar, out);
  document.body.append(root);

  const parts = [await safely('Device', probeDevice), await safely('WebGL 2', probeWebGL2), await safely('WebGPU', probeWebGPU)];
  const [device, gl, gpu] = parts;
  const summary: Section = { title: 'Summary', rows: [...gpu.summary, ...gl.summary, ...device.summary] };
  out.textContent = formatReport(`Nauta ${LABEL} probe, ${new Date().toISOString()}, ${location.href}`, [summary, ...gpu.sections, ...gl.sections, ...device.sections]);
  copy.disabled = false;
  window.__nautaReady = true;
}

/** Where the clipboard is refused: select the report, so the system's own Copy can take it. */
function selectAll(el: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(el);
  getSelection()?.removeAllRanges();
  getSelection()?.addRange(range);
}
