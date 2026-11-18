/**
 * The title drawn in a worker (plan N7.7): the page hands it the title's canvas, and it draws the picture every frame
 * the display shows, while the page itself is busy building the game's shaders and ship. What the finger does comes
 * as messages (title.ts).
 */
import { FramePace, TitleScene } from './scene';
import type { ToTitle } from './title';
import { MS_PER_SECOND as MS } from '../sim/units';

/** A frame's time where the worker has no frame clock of its own, ms. */
const FRAME_MS = 16;

const worker = self as unknown as DedicatedWorkerGlobalScope;
let scene: TitleScene | null = null;
let running = true;
let drawn = false;
let pace = new FramePace(1);

/** The next frame: the display's own pace where the worker has it, else about 60 a second. */
const next = (f: () => void) => (typeof worker.requestAnimationFrame === 'function' ? worker.requestAnimationFrame(f) : setTimeout(f, FRAME_MS));

function drawFrame(): void {
  if (!running || !scene) return;
  const now = performance.now();
  if (!pace.due(now)) { next(drawFrame); return; }
  scene.frame(now / MS);
  if (!drawn) { drawn = true; worker.postMessage({ at: performance.timeOrigin + performance.now() }); }
  next(drawFrame);
}

worker.onmessage = (e: MessageEvent<ToTitle>) => {
  const m = e.data;
  if (m.kind === 'start') {
    scene = new TitleScene(m.canvas, (w, h) => new OffscreenCanvas(w, h));
    pace = new FramePace(m.fps);
    scene.resize(m.w, m.h);
    drawFrame();
  } else if (m.kind === 'size') scene?.resize(m.w, m.h);
  else if (m.kind === 'aim') scene?.aim(m.x, m.height);
  else if (m.kind === 'fire') scene?.fire(m.n);
  else running = false;
};
