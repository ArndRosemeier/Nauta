/**
 * The built game in headless Chromium, for the screenshot scripts (shot.mjs, sea.mjs): serves the production build
 * and renders with SwiftShader (no GPU needed), so it works in a cloud container; there use `?gl` and set
 * CHROMIUM_PATH. SHOT_GPU=1 renders on the machine's own GPU. SHOT_TIMEOUT=<ms> bounds every wait. SHOT_LOG=1 prints
 * every message of the page.
 */
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
  page.on('console', (m) => { if (m.type() === 'error' || process.env.SHOT_LOG) console.error(`[page] ${m.text()}`); });
  page.on('pageerror', (e) => { failed = true; console.error(`[page error] ${e.message}`); });
  await page.goto(base + (query.startsWith('?') ? query : '?' + query));
  await page.waitForFunction(() => window.__nautaReady === true, null, { timeout: TIMEOUT }).catch(() => { failed = true; console.error('page did not report ready'); });
  await page.addStyleTag({ content: '#loading{display:none!important}' });
  return { page, context, failed: () => failed };
}
