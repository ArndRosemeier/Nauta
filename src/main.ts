/** The page: the view, the sky, the sea and the look, started behind the loading screen. */
import { GraphicsUnavailable } from '@futuremagic/stage';
import { readParams, type Params } from './app/params';
import { BenchRun } from './app/benchRun';
import { watchLook } from './app/lookInput';
import { standpoint, type Standpoint } from './app/standpoints';
import { showStandpoints } from './app/standpointBar';
import { showVersion } from './app/whatsNew';
import { Walking } from './app/walking';
import { QUALITY_LEVELS, QualityChooser, type QualityKnobs } from './app/quality';
import { showMotionSetting } from './app/motionSetting';
import { SoloMatch, sparAngles } from './app/soloMatch';
import { OrderPanel } from './app/orderPanel';
import { createView } from './render/view';
import { SkyView } from './render/skyView';
import { SeaView } from './render/seaView';
import { makeTestBodies } from './render/testBodies';
import { loadShip } from './render/ship/loadShip';
import { ShipView } from './render/ship/shipView';
import { Furnishings } from './render/ship/furnishings';
import { loadFittings } from './render/ship/fittings';
import { furnish } from './sim/ship/furnish';
import { shipPlan } from './sim/ship/plan';
import { SeaSound } from './audio/seaSound';
import { ShipSound } from './audio/shipSound';
import { CrewSound } from './audio/crewSound';
import { OPEN_AIR } from './audio/acoustics';
import { Vector3 } from 'three/webgpu';
import { DEGREE, MS_PER_SECOND } from './sim/units';
import { simTime } from './sim/state';
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
/** How far off the sun's light stands from what it lights, m (only its direction matters). */
const SUN_DISTANCE = 60;
/** Triangles are counted in thousands on the HUD. */
const THOUSAND = 1000;
/** Bytes in a megabyte, for the HUD. */
const MEGABYTE = 1 << 20;
/** Frames drawn after `__nautaScene` before it resolves: one, as everything it sets is in place before that frame. */
const SCENE_FRAMES = 1;
/** The moment of the sea a scene set for a shot shows, s after it started: foam that lingers has had time to form. */
const SHOT_SEA_TIME = 60;

declare global {
  interface Window {
    /** Set once the first frame with everything in it is drawn (the headless checks wait for it). */
    __nautaReady?: boolean;
    /**
     * Sets the scene from a query (`hour=6.3&day=0&sea=gale&eye=10&look=0,-6`: hour and day, wind or sea, eye, look) with
     * the clocks stopped and the sea started afresh, and resolves once it is drawn: `npm run shot:sea` takes its
     * shots on one page with it (tools/shot/sea.mjs).
     */
    __nautaScene?: (query: string) => Promise<void>;
  }
}

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function start(): Promise<void> {
  const params = readParams(location.search);
  const canvas = el<HTMLCanvasElement>('view'), hud = el('hud'), loading = el('loading');
  // `?ship`: the whole brig, built in a worker behind the loading screen (plan N2.4); the sun casts shadows then.
  // `?walk`: the captain walks her decks with two thumbs (plan N2.3), on the whole brig.
  const walking = params.walk !== null ? new Walking(canvas, params.walk || undefined) : null;
  const ship = params.ship !== null || walking || params.sail ? new ShipView(await loadShip(import.meta.env.BASE_URL)) : null;
  // `?sail`: the brig under way in a match on this machine, where the ship view lays her, commanded from the order panel (plan N3.5).
  const match = ship && params.sail ? new SoloMatch({ seed: MATCH_SEED, windForce: params.wind, windFrom: WIND_FROM, x: 0, z: 0, heading: 0 }) : null;
  if (ship && match) ship.poseFrom = (t) => match.pose(t);
  let where: Standpoint = standpoint(params.ship ?? '');
  const view = await createView(canvas, ship !== null);
  // Her fittings (plan N2.6): drawn as instances in her frame, each zone's into that zone of her.
  const furnished = ship ? new Furnishings(view.renderer, await loadFittings(import.meta.env.BASE_URL), furnish(shipPlan())) : null;
  if (ship && furnished) for (const [zone, draws] of furnished.zones) ship.addToZone(zone, draws.group);
  view.camera.position.set(0, params.eye, 0);
  const startLook = params.look ?? START_LOOK;
  view.camera.rotation.set(startLook.pitch, startLook.yaw, 0);
  // The sky and its light (environment map, the sun's colour node) before the warm-up: they are part of every lit shader's key.
  const sky = new SkyView(view.renderer, view.scene, view.sun, view.hemi, params.hour, params.dayMinutes);
  sky.update(0, null);
  // The wind and the sea of the match, on the clock `seaTime` (s); one shared clock comes with the simulation (N3.1).
  // The sea keeps the wind it is given, so it gets a copy of the mean wind, never the one `meanWind` writes into.
  // Sailing, the match's own wind and sea are the page's.
  let wind = match ? match.state.wind : makeWind(MATCH_SEED, params.wind, WIND_FROM), blowing = meanWind(wind, 0);
  let seaTime = 0, sea = match ? match.state.sea : startSea(MATCH_SEED, { speed: blowing.speed, toward: blowing.toward }, seaTime);
  /** The clocks stand still (a scene set for a shot); held: the scene is drawn and nothing is drawn until the next. */
  let still = false, held = false;
  /** Waiting for the scene set by `__nautaScene` to be drawn: frames still to draw, and what to call then. */
  let sceneFrames = 0, sceneDrawn: (() => void) | null = null;
  // The quality level: from the top, stepping down in the first seconds while frames are late (plan N1.8).
  const quality = new QualityChooser(params.quality);
  // The fine sea gets every level's bands at once, the level now first, so a change of level compiles nothing.
  const fineOf = (k: QualityKnobs) => ({ bands: k.fineSeaBands, texels: k.fineSeaSize });
  const seaView = new SeaView(sky, [fineOf(quality.knobs), ...QUALITY_LEVELS.map(fineOf)], sea.seaSeed);
  seaView.show(sea, wind, blowing.speed, seaTime, 0, view.camera, sky);
  // The fine sea's compute passes are built in the warm-up too, and run once before the first frame.
  await seaView.fine.warmUp(view.renderer);
  seaView.fine.run(view.renderer);
  // The sea's mesh is drawn as many tiles at once, a shader of its own: the warm-up builds it with the kinds.
  // So are her fittings' instanced draws, which three builds shaders of their own for.
  await furnished?.ready();
  await view.stage.warmUp([seaView.mesh, ...(furnished ? [...furnished.zones.values()].map((d) => d.group) : [])]);
  await view.stage.add(sky.dome);
  await view.stage.add(seaView.mesh);
  await view.stage.add(seaView.deep);
  if (params.rig) await view.stage.add(makeTestBodies(startLook.yaw, params.eye));
  if (ship) await view.stage.add(ship.group);
  // Her yards braced as the address asks (`?brace=30`), until the sailing model braces them (N3.3).
  if (ship) for (const id of ship.swingIds) ship.setBrace(id, params.brace);
  // On WebGPU, building a shader that reads the sky's environment map can leave it blank until it is drawn again.
  sky.redrawEnvironment();
  const input = watchLook(canvas, walking ? params.look ?? walking.startLook : ship ? where.look : startLook, view.radPerPixel, walking ? (e) => walking.input.owns(e) : undefined);
  /** The scene the address asks for: the hour and the day's pace, the wind and its sea, the eye, the look. */
  const setScene = (p: Params) => {
    sky.hour = p.hour; sky.dayMinutes = p.dayMinutes;
    if (p.wind !== wind.windForce) {
      wind = makeWind(MATCH_SEED, p.wind, WIND_FROM); blowing = meanWind(wind, seaTime);
      sea = startSea(MATCH_SEED, { speed: blowing.speed, toward: blowing.toward }, seaTime);
    }
    view.camera.position.y = p.eye;
    // The sky at once (the eye adapts at once with no time passed), so the look can find the sun.
    sky.update(0, view.camera);
    if (p.toLight) {
      const toward = sky.lightDirection;
      input.look = { yaw: Math.atan2(-toward.x, -toward.z) - p.toLight.off, pitch: p.toLight.up };
    } else if (p.look) input.look = { ...p.look };
  };
  if (params.toLight) setScene(params);
  window.__nautaScene = (query) => new Promise((done) => {
    const p = readParams(query);
    still = true; held = false; last = performance.now();
    // The sea started as on the page's load and looked at a little later, the same moment for every shot.
    wind = makeWind(MATCH_SEED, p.wind, WIND_FROM); blowing = meanWind(wind, 0);
    sea = startSea(MATCH_SEED, { speed: blowing.speed, toward: blowing.toward }, 0);
    seaTime = SHOT_SEA_TIME;
    setScene(p);
    sceneFrames = SCENE_FRAMES; sceneDrawn = done;
  });
  if (ship && !walking) showStandpoints(where, (s) => { where = s; input.look = s.look; });
  if (params.hud) hud.style.display = 'block';
  showVersion(el<HTMLButtonElement>('version'));
  // Walking: the calm view, how much of his body's motion the view takes (plan N2.7).
  if (walking) showMotionSetting(el<HTMLButtonElement>('motion'), params.motion, (s) => { walking.body.strength = s; });
  const orders = match ? new OrderPanel(match) : null;
  // Walking, the calm view's button has the top right corner: the panel stands below it.
  if (orders && walking) el('orders').classList.add('under-motion');
  const apply = (k: QualityKnobs) => { view.setRenderScale(k.renderScale); seaView.setCells(k.seaCells); seaView.fine.select(fineOf(k)); ship?.setQuality(k.ropeShadows, k.shipFarFrom); };
  apply(quality.knobs);
  document.addEventListener('visibilitychange', () => quality.interrupt());
  // The sea and the wind heard (N1.7): silent until the first tap or click, as browsers want.
  const sound = new SeaSound(import.meta.env.BASE_URL, MATCH_SEED);
  // The brig herself heard (N2.8): her timber, the water along her, the counter, the captain's feet, the room he is in.
  const shipSound = ship ? new ShipSound(sound.engine, MATCH_SEED) : null;
  // The crew at work heard (N4.6), sailing: the boatswain's calls for the orders given, feet, hauling, the bell; on her
  // without a match only the bell, by the page's clock.
  const crewSound = ship ? new CrewSound(sound.engine, MATCH_SEED, match?.ship ?? 0) : null;
  if (match && crewSound) match.on('events', (events) => crewSound.onEvents(events));
  const ear = new Vector3(), facing = new Vector3(), crown = new Vector3();
  // `?bench`: the fixed flight, measured once the quality level is chosen (plan N1.9).
  const bench = params.bench > 0 ? new BenchRun(el('bench'), params.bench, {
    settled: () => quality.chosen,
    memory: () => ({ gpu: view.renderer.info.memory.total, js: performance.memory?.usedJSHeapSize ?? null }),
    about: () => { const px = view.drawnSize(); return `${view.backend} · quality ${quality.knobs.name}, ${px.x}×${px.y} px · ${sky.clock} · force ${wind.windForce}`; },
    shaders: () => view.stage.hudLine(),
  }) : null;
  // The bench's sky stands still, so runs at one hour compare.
  if (bench) sky.dayMinutes = 0;

  let last = performance.now(), frames = 0, shown = last, ms = 0;
  view.renderer.setAnimationLoop(() => {
    // A still scene already on screen is not drawn again: the shot is taken without frames drawn beside it.
    if (held) return;
    const now = performance.now(), dt = still ? 0 : Math.min(MAX_FRAME_SECONDS, (now - last) / MS_PER_SECOND);
    if (window.__nautaReady && quality.frame(now - last)) apply(quality.knobs);
    last = now;
    const flight = bench?.fly(now);
    seaTime += dt;
    meanWind(wind, seaTime, blowing);
    if (match) {
      match.advance(seaTime);
      sea = match.state.sea;
      // Her yards, boom and gaff as the crew trims them: the order seen carried out aloft.
      for (const [id, angle] of sparAngles(match.state, match.ship)) ship?.setBrace(id, angle);
    } else sea = followWind(sea, { speed: blowing.speed, toward: blowing.toward }, seaTime);
    if (ship) {
      if (walking) {
        where = walking.walk(dt, ship.drawn, input);
        walking.swingDoors((id, angle) => ship.setDoor(id, angle));
      }
      ship.update(sea, seaTime, dt, view.camera, where, input.look, view.sun, sky.lightDirection, sky.gain, view.radPerPixel(), seaView.origin);
      furnished?.update(ship.group, view.camera, sky.lightDirection);
      sky.below = ship.below;
      seaView.sheltered = ship.below > 0;
    } else {
      const look = flight?.look ?? input.look;
      if (flight) view.camera.position.set(flight.x, flight.y, flight.z);
      view.camera.rotation.set(look.pitch, look.yaw, 0);
      view.sun.position.copy(view.sun.target.position).addScaledVector(sky.lightDirection, SUN_DISTANCE);
    }
    sky.update(dt, view.camera);
    seaView.show(sea, wind, blowing.speed, seaTime, dt, view.camera, sky);
    seaView.fine.run(view.renderer);
    view.camera.getWorldPosition(ear);
    view.camera.getWorldDirection(facing);
    crown.copy(view.camera.up).applyQuaternion(view.camera.quaternion);
    // Her own sound first: it gives the room the sea and the wind are heard through. Sailing, her way is the match's.
    const body = walking?.drawnBody, soles = body ? [body.feet.L, body.feet.R] : null;
    const sailing = match?.state.ships[match.ship] ?? null;
    const room = ship && shipSound ? shipSound.aboard(ship.drawn, sea, seaTime, dt, { eye: where.eye, off: where.off ?? false, onLadder: walking?.captain.onLadder ?? false, soles, way: sailing?.sailing.ahead ?? 0 }) : OPEN_AIR;
    if (ship && crewSound && match && sailing) crewSound.atWork(sailing, simTime(match.state), ship.drawn, where.eye, room);
    else if (ship && crewSound && !still) crewSound.bellAlone(seaTime, ship.drawn, room);
    sound.hear(sea, wind, seaTime, [ear.x, ear.y, ear.z], [facing.x, facing.y, facing.z], [crown.x, crown.y, crown.z], room);
    view.stage.frame();
    view.renderer.render(view.scene, view.camera);
    orders?.update(now);
    bench?.worked(performance.now() - now);
    frames++;
    if (sceneDrawn && --sceneFrames <= 0) { sceneDrawn(); sceneDrawn = null; held = true; }
    if (params.hud && now - shown >= HUD_EVERY_MS) {
      ms = (now - shown) / frames; frames = 0; shown = now;
      const px = view.drawnSize();
      hud.textContent = `${view.backend} · ${ms.toFixed(1)} ms · ${sky.clock} · force ${wind.windForce} · eye ${view.camera.position.y.toFixed(1)} m · sea ${seaView.tilesDrawn} tiles${ship ? ` · ship ${Math.round(ship.triangles / THOUSAND)}k tris (${Math.round(ship.trianglesDrawn / THOUSAND)}k drawn), ${Math.round(ship.bytes / MEGABYTE)} MB` : ''}${furnished ? ` · ${furnished.count} fittings, ${Math.round(furnished.triangles / THOUSAND)}k tris whole` : ''} · ${view.renderer.info.render.drawCalls} draws\nquality ${quality.knobs.name}, ${px.x} × ${px.y} px: ${quality.reason}\n${view.stage.hudLine()}\n${sound.engine.summary()}`;
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
    ? `Nauta needs WebGPU, which this browser does not offer (${err.why}). It runs in Safari on an iPad or Mac (iPadOS and macOS 26 or later) and in a current Chrome or Edge.`
    : `Nauta could not start: ${err instanceof Error ? err.message : String(err)}`;
  failed.style.display = 'grid';
  el('loading').remove();
  console.error(err);
});
