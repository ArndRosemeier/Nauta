/** The page: the view, the sky, the sea and the look, started behind the loading screen. */
import { GraphicsUnavailable } from '@futuremagic/stage';
import { readParams } from './app/params';
import { watchLook } from './app/lookInput';
import { showVersion } from './app/whatsNew';
import { createView } from './render/view';
import { SkyView } from './render/skyView';
import { SeaView } from './render/seaView';
import { DEGREE, MS_PER_SECOND } from './sim/units';
import { makeWind, meanWind } from './sim/wind';
import { followWind, startSea } from './sim/sea/sea';
import type { Look } from './app/look';

/** Where the captain looks at the start: a little above the horizon, toward the morning sun. */
const START_LOOK: Look = { yaw: -1.2, pitch: 0.12 };
/** The longest step of time one frame may take, seconds (a tab that slept does not jump the clock). */
const MAX_FRAME_SECONDS = 0.1;
/** How often the HUD's numbers are written anew, ms. */
const HUD_EVERY_MS = 500;
/** The match's seed until matches exist (N3.1): the same wind and sea on every load. */
const MATCH_SEED = 1805;
/** The bearing the wind blows from until matches exist, rad: west-south-west, the Atlantic's prevailing wind. */
const WIND_FROM = 247.5 * DEGREE;
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
  view.camera.position.set(0, params.eye, 0);
  view.camera.rotation.set(START_LOOK.pitch, START_LOOK.yaw, 0);
  const sky = new SkyView(view.scene, view.renderer, params.hour, params.dayMinutes);
  // The wind and the sea of the match, on the clock `seaTime` (s); one shared clock comes with the simulation (N3.1).
  // The sea keeps the wind it is given, so it gets a copy of the mean wind, never the one `meanWind` writes into.
  const wind = makeWind(MATCH_SEED, params.wind, WIND_FROM), blowing = meanWind(wind, 0);
  let seaTime = 0, sea = startSea(MATCH_SEED, { speed: blowing.speed, toward: blowing.toward }, seaTime);
  const seaView = new SeaView();
  seaView.show(sea, seaTime, view.camera, sky.light);
  // The sea's mesh is drawn as many tiles at once, a shader of its own: the warm-up builds it with the kinds.
  await view.stage.warmUp([seaView.mesh]);
  await view.stage.add(sky.dome);
  await view.stage.add(seaView.mesh);
  const input = watchLook(canvas, START_LOOK, view.radPerPixel);
  if (params.hud) hud.style.display = 'block';
  showVersion(el<HTMLButtonElement>('version'));

  let last = performance.now(), frames = 0, shown = last, ms = 0;
  view.renderer.setAnimationLoop(() => {
    const now = performance.now(), dt = Math.min(MAX_FRAME_SECONDS, (now - last) / MS_PER_SECOND);
    last = now;
    view.camera.rotation.set(input.look.pitch, input.look.yaw, 0);
    sky.update(dt, view.camera);
    seaTime += dt;
    meanWind(wind, seaTime, blowing);
    sea = followWind(sea, { speed: blowing.speed, toward: blowing.toward }, seaTime);
    seaView.show(sea, seaTime, view.camera, sky.light);
    view.stage.frame();
    view.renderer.render(view.scene, view.camera);
    frames++;
    if (params.hud && now - shown >= HUD_EVERY_MS) {
      ms = (now - shown) / frames; frames = 0; shown = now;
      hud.textContent = `${view.backend} · ${ms.toFixed(1)} ms · ${sky.clock} · force ${params.wind} · eye ${params.eye} m · sea ${seaView.tilesDrawn} tiles\n${view.stage.hudLine()}`;
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
