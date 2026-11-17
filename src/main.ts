/** The page: the view, the sky and the look, started behind the loading screen. */
import { GraphicsUnavailable } from '@futuremagic/stage';
import { readParams } from './app/params';
import { watchLook } from './app/lookInput';
import { showVersion } from './app/whatsNew';
import { createView } from './render/view';
import { SkyView } from './render/skyView';
import { makeTestBodies } from './render/testBodies';
import { EYE_HEIGHT } from './render/view';
import { MS_PER_SECOND } from './sim/units';
import type { Look } from './app/look';

/** Where the captain looks at the start: a little above the horizon, toward the morning sun. */
const START_LOOK: Look = { yaw: -1.2, pitch: 0.12 };
/** The longest step of time one frame may take, seconds (a tab that slept does not jump the clock). */
const MAX_FRAME_SECONDS = 0.1;
/** How often the HUD's numbers are written anew, ms. */
const HUD_EVERY_MS = 500;
/** How long the loading screen takes to fade (the `transition` of #loading in index.html), ms, and a little more. */
const LOADING_FADE_MS = 700;

declare global {
  interface Window {
    /** Set once the first frame with everything in it is drawn (the headless checks wait for it). */
    __nautaReady?: boolean;
  }
}

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function start(): Promise<void> {
  const params = readParams(location.search);
  const canvas = el<HTMLCanvasElement>('view'), hud = el('hud'), loading = el('loading');
  const view = await createView(canvas, params.forceWebGL);
  // The sky and its light (environment map, the sun's colour node) before the warm-up: they are part of every lit shader's key.
  const sky = new SkyView(view.renderer, view.scene, view.sun, view.hemi, params.hour, params.dayMinutes);
  sky.update(0, null);
  await view.stage.warmUp();
  await view.stage.add(sky.dome);
  if (params.rig) await view.stage.add(makeTestBodies(START_LOOK.yaw, EYE_HEIGHT));
  const input = watchLook(canvas, START_LOOK, view.radPerPixel);
  if (params.hud) hud.style.display = 'block';
  showVersion(el<HTMLButtonElement>('version'));

  let last = performance.now(), frames = 0, shown = last, ms = 0;
  view.renderer.setAnimationLoop(() => {
    const now = performance.now(), dt = Math.min(MAX_FRAME_SECONDS, (now - last) / MS_PER_SECOND);
    last = now;
    view.camera.rotation.set(input.look.pitch, input.look.yaw, 0);
    sky.update(dt, view.camera);
    view.stage.frame();
    view.renderer.render(view.scene, view.camera);
    frames++;
    if (params.hud && now - shown >= HUD_EVERY_MS) {
      ms = (now - shown) / frames; frames = 0; shown = now;
      hud.textContent = `${view.backend} · ${ms.toFixed(1)} ms · ${sky.clock}\n${view.stage.hudLine()}`;
    }
    if (!window.__nautaReady) {
      window.__nautaReady = true;
      loading.style.opacity = '0';
      setTimeout(() => loading.remove(), LOADING_FADE_MS);
    }
  });
}

/** `?probe` shows what the device offers instead of the game (plan N0.5); its code loads only when asked for. */
const run = readParams(location.search).probe ? () => import('./probe/page').then((p) => p.runProbe()) : start;

run().catch((err: unknown) => {
  const failed = el('failed');
  failed.textContent = err instanceof GraphicsUnavailable
    ? `Nauta needs 3D graphics this browser does not offer (${err.why}). Try a current Chrome, Edge or Safari.`
    : `Nauta could not start: ${err instanceof Error ? err.message : String(err)}`;
  failed.style.display = 'grid';
  el('loading').remove();
  console.error(err);
});
