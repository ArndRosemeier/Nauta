/**
 * The built game in headless Chromium, for the screenshot scripts (shot.mjs, sea.mjs): serves the production build
 * and renders WebGPU with SwiftShader (no GPU needed), so it works in a cloud container; there set CHROMIUM_PATH.
 * The software GPU cannot present WebGPU to a canvas, so a stand-in swap chain (swapchain.js) is injected and `snap`
 * paints the last frame for the picture. SHOT_GPU=1 renders on the machine's own GPU and presents normally. SHOT_TIMEOUT=<ms> bounds every wait. SHOT_LOG=1 prints
 * every message of the page.
 */
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { preview } from 'vite';

/** How long any one wait may take, ms. */
export const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 300000);

/** The view's size from SHOT_SIZE=<width>x<height> (default `fallback`, 1280x800; a tablet in landscape: 1180x820). */
export function shotSize(fallback = '1280x800') {
  const [width, height] = (process.env.SHOT_SIZE ?? fallback).split('x').map(Number);
  return { width, height };
}

/** The build served and a browser started; `close` ends both. */
export async function openBrowser() {
  const server = await preview({ preview: { port: 5302, strictPort: false }, logLevel: 'silent' });
  const base = server.resolvedUrls.local[0];
  const gpu = !!process.env.SHOT_GPU;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    channel: gpu ? 'chromium' : undefined,
    args: [...(gpu ? ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] : ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader', '--use-gl=angle', '--ignore-gpu-blocklist']), '--mute-audio'],
  });
  return { base, browser, close: async () => { await browser.close(); await server.close(); } };
}

/**
 * The game at `query` in a new page, once it reports ready and with the loading screen gone. `failed()` tells
 * whether the page has thrown or never got ready.
 */
export async function openGame({ base, browser }, query, viewport, hasTouch = false) {
  const context = await browser.newContext({ viewport, hasTouch });
  const page = await context.newPage();
  let failed = false;
  // The software GPU cannot present WebGPU to a canvas: a stand-in swap chain does (swapchain.js).
  if (!process.env.SHOT_GPU) await page.addInitScript({ path: fileURLToPath(new URL('./swapchain.js', import.meta.url)) });
  // Errors, and three's warnings (a shader node that failed to build is only warned about, and the mesh is not drawn).
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && m.text().startsWith('THREE.')) || process.env.SHOT_LOG) console.error(`[page] ${m.text()}`); });
  page.on('pageerror', (e) => { failed = true; console.error(`[page error] ${e.message}`); });
  await page.goto(base + (query.startsWith('?') ? query : '?' + query), { timeout: TIMEOUT });
  await page.waitForFunction(() => window.__nautaReady === true, null, { timeout: TIMEOUT }).catch(() => { failed = true; console.error('page did not report ready'); });
  await page.addStyleTag({ content: '#loading{display:none!important}' });
  return { page, context, failed: () => failed };
}

/**
 * A finger put down in the middle of a view `size` big, moved by `dx`, `dy` in steps and lifted: the same pointer
 * events a tablet sends (the touch look).
 */
export async function drag(page, size, [dx, dy]) {
  const x = size.width / 2, y = size.height / 2, steps = 8;
  const touch = (type, px, py) => page.evaluate(([t, a, b]) => {
    document.getElementById('view').dispatchEvent(new PointerEvent(t, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: a, clientY: b, bubbles: true }));
  }, [type, px, py]);
  await touch('pointerdown', x, y);
  for (let s = 1; s <= steps; s++) await touch('pointermove', x + (dx * s) / steps, y + (dy * s) / steps);
  await touch('pointerup', x + dx, y + dy);
}

/**
 * Waits for `n` more of the page's frames. Where the stand-in swap chain paces them (swapchain.js) each waits for the
 * GPU, so two after a change of the view's size or a drag see the frame in flight finished and the next one, drawn at
 * the new size and look, sent; `snap` then waits for that one.
 */
export async function frames(page, n = 2) {
  await page.evaluate((count) => new Promise((done) => {
    const next = (left) => (left ? requestAnimationFrame(() => next(left - 1)) : done());
    next(count);
  }), n);
}

/** The page's picture in `path`: the last frame painted first where the stand-in swap chain draws (swapchain.js). */
export async function snap(page, path) {
  if (!process.env.SHOT_GPU) await page.evaluate(() => window.__presentWebGPU?.());
  await page.screenshot({ path, timeout: TIMEOUT });
}
