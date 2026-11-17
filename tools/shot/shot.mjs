/**
 * Headless screenshots: `npm run shot -- "<url query>" out.png [more pairs...]` (run `npm run build` first).
 * Serves the production build and renders in Chromium with SwiftShader (no GPU needed), so it works in a cloud
 * container; there use `?gl` and set CHROMIUM_PATH. SHOT_GPU=1 renders on the machine's own GPU. SHOT_WAIT=<ms>
 * waits after ready. SHOT_SIZE=<width>x<height> sets the view (default 1280x800; a tablet in landscape: 1180x820).
 * SHOT_DRAG=<dx>,<dy> drags a finger that far across the view before the picture (the touch look).
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium } from 'playwright';
import { preview } from 'vite';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 300000);
const args = process.argv.slice(2);
if (args.length < 2 || args.length % 2) {
  console.error('usage: npm run shot -- "<query>" out.png [...]');
  process.exit(2);
}
const [width, height] = (process.env.SHOT_SIZE ?? '1280x800').split('x').map(Number);
const drag = process.env.SHOT_DRAG ? process.env.SHOT_DRAG.split(',').map(Number) : null;

const server = await preview({ preview: { port: 5302, strictPort: false }, logLevel: 'silent' });
const base = server.resolvedUrls.local[0];
const gpu = !!process.env.SHOT_GPU;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  channel: gpu ? 'chromium' : undefined,
  args: [...(gpu ? ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] : ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader', '--use-gl=angle', '--ignore-gpu-blocklist']), '--mute-audio'],
});
let failed = false;
for (let i = 0; i < args.length; i += 2) {
  const query = args[i], out = args[i + 1];
  mkdirSync(dirname(out), { recursive: true });
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: !!drag });
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || process.env.SHOT_LOG) console.error(`[page] ${m.text()}`); });
  page.on('pageerror', (e) => { failed = true; console.error(`[page error] ${e.message}`); });
  await page.goto(base + (query.startsWith('?') ? query : '?' + query));
  await page.waitForFunction(() => window.__nautaReady === true, null, { timeout: TIMEOUT }).catch(() => { failed = true; console.error('page did not report ready'); });
  await page.addStyleTag({ content: '#loading{display:none!important}' });
  if (drag) {
    // A finger put down in the middle, moved in steps and lifted: the same pointer events a tablet sends.
    const x = width / 2, y = height / 2, steps = 8;
    const touch = (type, px, py) => page.evaluate(([t, a, b]) => {
      document.getElementById('view').dispatchEvent(new PointerEvent(t, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: a, clientY: b, bubbles: true }));
    }, [type, px, py]);
    await touch('pointerdown', x, y);
    for (let s = 1; s <= steps; s++) await touch('pointermove', x + (drag[0] * s) / steps, y + (drag[1] * s) / steps);
    await touch('pointerup', x + drag[0], y + drag[1]);
  }
  await page.waitForTimeout(Number(process.env.SHOT_WAIT ?? 0));
  await page.screenshot({ path: out, timeout: TIMEOUT });
  const hud = (await page.textContent('#hud', { timeout: TIMEOUT })) ?? '';
  console.log(`${out}: ${hud}`);
  await context.close();
}
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
