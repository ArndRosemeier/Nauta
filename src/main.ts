/** The page: the view, the sky, the sea and the look, started behind the loading screen. */
import { GraphicsUnavailable } from '@futuremagic/stage';
// The title first (plan N7.7): it is up and drawing in its worker before three.js and the game are even evaluated.
import './title/boot';
import './ui/nauta.css';
import { readParams, type Params } from './app/params';
import { BenchRun } from './app/benchRun';
import { watchLook } from './app/lookInput';
import { watchWalk } from './app/walkInput';
import { Spectator, watchCaption } from './app/spectator';
import type { Hull } from './app/freeCam';
import { NO_PUSH } from './app/thumbs';
import { DuelSession } from './net/duel';
import { MouseTaker, keepBrowserMenusAway } from './app/mouse';
import { keyCap, onKeyPress } from './app/dom';
import { standpoint, type Standpoint } from './app/standpoints';
import { showStandpoints } from './app/standpointBar';
import { Walking } from './app/walking';
import { QUALITY_LEVELS, QualityChooser, levelNamed, type QualityKnobs } from './app/quality';
import { SettingsStore } from './app/settingsStore';
import { matchMinutes } from './app/terms';
import { SettingsMenu } from './app/settingsPanel';
import { words } from './app/words';
import { walkKeys } from './app/thumbs';
import { KEY_ACTIONS, type KeyAction, type Settings } from './app/settings';
import { Channel } from './audio/channel';
import { OrderPanel } from './app/orderPanel';
import { Speech } from './app/speaking';
import { ReportsPanel } from './app/reportsPanel';
import { OrderFan } from './app/orderFan';
import { Midshipman } from './app/midshipman';
import { midshipmanStart, quarterdeck, type Officer } from './app/officers';
import { lookBearing } from './app/look';
import { spotOf } from './sim/ship/deckWalk';
import type { Spot } from './sim/ship/plan';
import { sailsSeen } from './app/sailsSeen';
import { PageMatch, pageSeconds, rudderAngle, sparAngles } from './app/pageMatch';
import { RoomPanel } from './app/roomPanel';
import { Menu } from './app/menu';
import { FirstCommand } from './app/firstCommand';
import { createView } from './render/view';
import { SkyView } from './render/skyView';
import { SeaView } from './render/seaView';
import { makeTestBodies } from './render/testBodies';
import { loadShip } from './render/ship/loadShip';
import { ShipView } from './render/ship/shipView';
import type { SailHeard, SailsSummary } from './render/ship/sailsView';
import { Furnishings } from './render/ship/furnishings';
import { HammocksStowed } from './app/hammocks';
import { loadFittings } from './render/ship/fittings';
import { furnish } from './sim/ship/furnish';
import { shipPlan } from './sim/ship/plan';
import { Spyglass } from './app/glass';
import { watchGlass } from './app/glassInput';
import { earthDrop } from './render/earth';
import { DEV, VERSION } from 'virtual:nauta/version';
import { Offline } from './offline/register';
import { SprayView } from './render/spray';
import { GUNFIRE, SHOT_IN_FLIGHT, SMOKE, SPRAY } from './render/materials';
import { GunsView } from './render/ship/gunsView';
import { setFrenchFlags } from './render/ship/sailMaterial';
import type { Navy } from './app/crewLooks';
import { SHIPS_DRAWN, lightThrough } from './render/ship/shipMaterials';
import { casualtiesOf, goingDown, scarsOf } from './app/scars';
import { GunfireView, fallInSea } from './render/gunfire';
import { SmokeView, useSmokeDepth } from './render/smoke';
import { FireView } from './render/fireView';
import { FlotsamView } from './render/flotsam';
import { HalfSmoke } from './render/halfSmoke';
import { gunsSeen } from './app/gunsSeen';
import { ShotsSeen, type Flash, type Strike } from './app/shotsSeen';
import { battery, gunAt } from './sim/guns/guns';
import { toShip, toWorld, type ShipPose } from './sim/ship/motion';
import { shipY, shipZ } from './sim/ship/section';
import { SeaSound } from './audio/seaSound';
import { pageEngine } from './audio/pageEngine';
import { handOver } from './title/title';
import { ShipSound } from './audio/shipSound';
import { CrewSound } from './audio/crewSound';
import { beatingToQuarters } from './sim/guns/gunnery';
import { SailSound } from './audio/sailSound';
import { GunSound } from './audio/gunSound';
import { DamageSound } from './audio/damageSound';
import { OPEN_AIR } from './audio/acoustics';
import { CrewView, type OtherCrewAt } from './render/crew/crewView';
import { VOICES } from './app/speech/speakers';
import { CaptainView } from './render/captain/captainView';
import { CrewTrialRun } from './app/crewTrialRun';
import { formatBytes } from './probe/report';
import { Vector3 } from 'three/webgpu';
import { DEGREE, MS_PER_SECOND, STEPS_PER_SECOND, apartOnWater, bearingTo, wrapBearing } from './sim/units';
import { simTime } from './sim/state';
import { parseOrder } from './sim/orders';
import { apparentSpeed } from './sim/ship/sailing';
import { makeWind, meanWind, windAt } from './sim/wind';
import { followWind, startSea, surfaceAt } from './sim/sea/sea';
import type { Look } from './app/look';

/** The Escape key's code. */
const ESCAPE = 'Escape';
/** The actions of the keys that give an order or open a fan: a watcher gives none, so these keys do nothing for him (the others walk, look, work the glass and open the reports). */
const NOT_ORDER_KEYS: readonly KeyAction[] = ['forward', 'back', 'left', 'right', 'glass', 'reports'];
/** Where the captain looks at the start: a little above the horizon, toward the morning sun. */
const START_LOOK: Look = { yaw: -1.2, pitch: 0.12 };
/** The longest step of time one frame may take, seconds (a tab that slept does not jump the clock). */
const MAX_FRAME_SECONDS = 0.1;
/** The checks' flight (`__nautaWatch.fly`) steps the eye at the simulation's step, s. */
const DRIVE_STEP = 1 / STEPS_PER_SECOND;
/** How often the HUD's numbers are written anew, ms. */
const HUD_EVERY_MS = 500;
/** The match's seed until matches exist (N3.1): the same wind and sea on every load. */
const MATCH_SEED = 1805;
/** The bearing the wind blows from until matches exist, rad: west-south-west, the Atlantic's prevailing wind. */
const WIND_FROM = 247.5 * DEGREE;
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
/** Where the crew trial looks from her quarterdeck: forward over her waist, her twin's crew off the starboard bow in view. */
const CREW_LOOK: Look = { yaw: -0.25, pitch: -0.1 };
/** Where the trial draws the other crew (`?crew`): off her starboard bow, about 80 m off, in her ship space (x, z), m. */
const TWIN_OFFSET = { x: 40, z: -70 } as const;
/** The browser checks' jumps run the match on by this much at a time, s: within what one pump of the match catches up (net/duel.ts MOST_STEPS). */
const JUMP_PIECE = 1;
/** The checks aim the glass this high over the other ship's waterline, m: about her lower yards, so hull and sails are in the field. */
const AIM_HEIGHT = 10;

declare global {
  interface Window {
    /** Set once the first frame with everything in it is drawn (the headless checks wait for it). */
    __nautaReady?: boolean;
    /**
     * Sets the scene from a query (`hour=6.3&day=0&sea=gale&eye=10&look=0,-6`: hour and day, wind or sea, eye, look; on
     * the brig `ship=bow`, the standpoint) with
     * the clocks stopped and the sea started afresh, and resolves once it is drawn: `npm run shot:sea` takes its
     * shots on one page with it (tools/shot/sea.mjs).
     */
    __nautaScene?: (query: string) => Promise<void>;
    /**
     * Sailing (`?sail`), for the browser checks: `say` an order in words (as the order panel takes them; answers why
     * not, or ''), and run the match `onward` by so many seconds at once (the sails as drawn catch up with it on the next
     * frame), resolving once that frame is drawn, then holding the page until the next (no frame drawn beside the
     * picture), or at once when `draw` is false; `sails`: how her sails are drawn
     * (set, furled, aback, shivering); `aback`: how many of her sails the match has aback now; `windFrom`: the
     * bearing the mean wind blows from, degrees (tools/shot/sails.mjs).
     */
    __nautaSail?: {
      say: (words: string) => string; onward: (seconds: number, draw?: boolean) => Promise<void>; sails: () => SailsSummary; aback: () => number; windFrom: () => number;
      /** Turns the look onto the other ship from where the last frame put the eye (the browser checks' glass shots) and says how far off she is, m; -1: no other ship. */
      aimAtOther: () => number;
      /** The other ship's compass bearing from hers, degrees; -1: no other ship. */
      bearingOfOther: () => number;
      /** How far apart the two ships' middles are as the match stands, m; -1: no other ship. */
      apart: () => number;
      /** The glass at the eye at once, drawn out to `power`, or lowered (null); and what the HUD says of the other ship. */
      glass: (power: number | null) => void;
      other: () => { drawn: number; near: boolean; apart: number; draws: number; mine: number } | null;
      /** Seconds since a gun of ship `index` was last seen to fire (Infinity: none yet): checks catch a broadside as it comes. */
      firedAgo: (index: number) => number;
      /** The eye put at `eye` (her space) looking `yaw` and `pitch` (rad), for checks that stand beside something (tools/shot/men.mjs). */
      eyeAt: (eye: [number, number, number], yaw: number, pitch: number) => void;
      /** Where each gun of ship `index` is in her drill now, in battery order (the drill check waits for a step). */
      drill: (index: number) => string[];
    };
    /**
     * Walking (`?walk`), for shots: the captain pushed by the left thumb (`forward`, `strafe`: -1..1) for so many
     * seconds at once, looking `pitch` (rad, + up) and `yaw` (rad on her, 0 forward), without drawing in between (app/walking.ts `drive`); answers where
     * he is then (on deck, on the shrouds, out on a yard).
     */
    /** The order fan (`?sail`), for the browser checks: open a man's fan and choose items in it by id (app/orderFan.ts `openForCheck`), light one up as under the finger. */
    __nautaFan?: {
      open: (who: Officer, choose?: string[]) => string; lightUp: (id: string) => void;
      /** Where the officers are on the view now, CSS px from its top left (the checks put the mouse on one). */
      men: () => readonly { who: Officer; x: number; y: number; seen: boolean }[];
      /** Where each card of the officer row is on the screen, CSS px (the checks click one). */
      cards: () => readonly { who: Officer; x: number; y: number }[];
    };
    /** The crews drawn (N4.3), for the browser checks: what they hold and where. */
    __nautaCrew?: CrewView;
    /**
     * Watching a battle (`?watch`, plan N7.8), for the browser checks: `company` glides the eye to a ship or both (or leaves it); `flyFor`
     * holds a push (forward, strafe, climb; -1..1; `boost`) for so many seconds at once without drawing, looking `yaw` and `pitch`
     * (rad, the world's) if given; answers where the eye is (x, y, z) and the ships' distances from it.
     */
    __nautaWatch?: {
      company: (to: 'british' | 'both' | 'french' | 'stay') => void;
      flyFor: (seconds: number, push?: { forward?: number; strafe?: number; climb?: number; boost?: boolean }, look?: { yaw?: number; pitch?: number }) => { eye: number[]; apart: number[] };
    };
    __nautaWalk?: { drive: (forward: number, strafe: number, seconds: number, pitch?: number, yaw?: number) => string; press: (forward?: number, strafe?: number) => void };
  }
}

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function start(): Promise<void> {
  const params = readParams(location.search);
  // The player's settings (plan N7.3), kept on the device; the address sets a few for this visit only.
  const visit: Partial<Settings> = { ...(params.quality ? { quality: params.quality } : {}), ...(params.motion !== null ? { motion: params.motion } : {}), ...(params.hud ? { frameTimes: true } : {}) };
  const settings = new SettingsStore(visit);
  const canvas = el<HTMLCanvasElement>('view'), hud = el('hud'), loading = el('loading');
  // The game kept on the device for use without a network (plan N7.6): begun once the game has started, so its fetches never compete with the start.
  const offline = new Offline(!DEV, titleWaits);
  // `?ship`: the whole brig, built in a worker behind the loading screen (plan N2.4); the sun casts shadows then.
  // `?walk`: the captain walks her decks with two thumbs (plan N2.3), on the whole brig.
  // The plain address (plan N7.2): the game itself, the captain walking her decks in every match the menu starts.
  const walking = params.walk !== null || params.menu ? new Walking(canvas, params.walk || undefined) : null;
  // The walking thumb and keys: the captain's, or, watching a battle (plan N7.8), the free camera's.
  const stick = walking?.input ?? (params.watch ? watchWalk(canvas) : null);
  // `?sail`: the brig under way in a match, where the ship view lays her, commanded from the order panel (plan N3.5);
  // alone at first, or with a second captain in a room (`?room` opens one, `?join=K7Q2ZP` joins one; plan N3.7).
  const sailing = params.sail || params.room || params.join !== null || params.menu || params.crew !== null || params.watch !== null;
  const build = params.ship !== null || walking || sailing ? await loadShip(import.meta.env.BASE_URL) : null;
  const ship = build ? new ShipView(build) : null;
  /**
   * Seconds the browser checks have run the match on ahead of the page's clock (`__nautaSail.onward`). Once a check runs
   * it on, the page's clock stands (`pinned`, the page's seconds then): only the check's jumps move the match, so it is
   * in the same state at each picture on a fast machine and a slow one.
   */
  let ahead = 0, pinned: number | null = null;
  /** The captain's pause in a match played alone (plan N7.2): the page's clock when it began, and the seconds paused before. */
  let pausedAt: number | null = null, paused = 0;
  /** The match's clock, s: the page's less the pauses, or where the browser checks have run it to. The bubbles keep it too. */
  const matchClock = (): number => (pinned ?? pausedAt ?? pageSeconds()) - paused + ahead;
  const match = ship && sailing ? new PageMatch(VERSION, params.seed, matchClock, params.windAsked ? params.wind : null, params.foe, matchMinutes(settings.now.match), params.casualties === null ? undefined : (state) => casualtiesOf(state, params.casualties!)) : null;
  // The other captain's ship, where the match has her (plan N3.8): the whole of her outside from the same build, her
  // far level beyond, sunk by the earth's curve far off.
  // `?watch` (plan N7.8): the match is a battle of two computer captains, none of the ships mine.
  if (match && params.watch) match.useSession(new DuelSession({ build: VERSION, now: matchClock, seed: params.seed ?? undefined, windForce: params.windAsked ? params.wind : undefined, watch: { first: params.watch.british, second: params.watch.french }, minutes: matchMinutes(settings.now.match) }), 'british');
  const other = build && match ? new ShipView(build, 1) : null;
  if (ship && match) ship.poseFrom = () => match.pose(match.ship)!;
  if (other && match) other.poseFrom = () => match.pose(match.other) ?? match.pose(match.ship)!;
  // `?down` (N6.5): the other ship goes down off her beam from the start, a stand-in to look at a ship sinking and what floats after.
  if (other && match && params.down) other.poseFrom = (t) => goingDown(match.pose(match.ship)!, match.pose(match.other) ?? match.pose(match.ship)!, t);
  // The spyglass (plan N3.8), held steady against her motion as the hands can.
  const glass = ship ? new Spyglass(MATCH_SEED, params.glass) : null;
  if (ship) ship.steadying = glass;
  let where: Standpoint = standpoint(params.ship ?? '');
  // `?smoke=half` (N5.5 trial): the smoke drawn at half resolution against the scene's depth, the scene through the post chain.
  const halfSmoke = params.halfSmoke && match ? new HalfSmoke() : null;
  useSmokeDepth(halfSmoke ? halfSmoke.depth.texture : null);
  const view = await createView(canvas, ship !== null, halfSmoke ? (colour) => halfSmoke.over(colour) : undefined);
  if (halfSmoke && view.post) halfSmoke.readDepthOf(view.post);
  const drawHalfSmoke = () => halfSmoke?.between(view.renderer, view.camera);
  // Her fittings (plan N2.6): drawn as instances in her frame, each zone's into that zone of her.
  const fittings = ship ? await loadFittings(import.meta.env.BASE_URL) : null;
  const furnished = ship && fittings ? new Furnishings(view.renderer, fittings, furnish(shipPlan())) : null;
  if (ship && furnished) for (const [zone, draws] of furnished.zones) ship.addToZone(zone, draws.group);
  // The other ship's fittings on her weather deck (plan N3.8): she is seen only from outside.
  const herFittings = other && fittings ? new Furnishings(view.renderer, fittings, furnish(shipPlan()), true) : null;
  if (other && herFittings) for (const [zone, draws] of herFittings.zones) other.addToZone(zone, draws.group);
  // The hammocks in the waist's nettings, stowed as each ship goes to quarters (plan N2.9).
  const myHammocks = new HammocksStowed(), herHammocks = new HammocksStowed();
  // Her guns and port lids, moving as the match works them (plan N5.4a); the other ship's too.
  const guns = ship && fittings ? new GunsView(view.renderer, fittings, furnish(shipPlan())) : null;
  if (ship && guns) ship.addMoving(guns.draws.group);
  const herGuns = other && fittings ? new GunsView(view.renderer, fittings, furnish(shipPlan()), 1) : null;
  if (other && herGuns) other.addMoving(herGuns.draws.group);
  const note = loading.querySelector('.title-note')!;
  // Walking, his own body (plan N2.7): an Actors figure from the crew's pack, his head not drawn.
  if (walking && ship) note.textContent = 'dressing the captain';
  const captain = walking && ship ? await CaptainView.load(view.renderer, import.meta.env.BASE_URL, ship.group) : null;
  // Sailing, both crews (plan N4.3): crowd figures for every man, a near pool of full characters for the men of hers
  // near the captain; the six he gives orders to among them. Mustering is timed for the trial (`?crew`, N4.0).
  const mustered = performance.now();
  const otherCrew: OtherCrewAt = params.crew === 'aboard' ? { aboard: true } : params.crew ? { offset: TWIN_OFFSET } : null;
  const startCrew = QUALITY_LEVELS[Math.max(0, levelNamed(params.quality ?? settings.now.quality))]!.crew;
  const crew = match && ship ? await CrewView.load(view.renderer, import.meta.env.BASE_URL, match.state.ships.map((_, i) => (i === match.ship ? ship : i === match.other ? other : null)), startCrew, otherCrew,
    (what) => { note.textContent = what; }) : null;
  const musterSeconds = (performance.now() - mustered) / MS_PER_SECOND;
  if (crew) window.__nautaCrew = crew;
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
  let seaTime = match ? match.frame().time : 0, sea = match ? match.state.sea : startSea(MATCH_SEED, { speed: blowing.speed, toward: blowing.toward }, seaTime);
  /** The clocks stand still (a scene set for a shot); held: the scene (or a check's jump, `__nautaSail.onward`) is drawn and nothing is drawn until the next. */
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
  // So are her fittings' instanced draws, which three builds shaders of their own for, and the spray from her bow (N2.5).
  for (const w of seaView.wakes) await w.compile(view.renderer);
  const spray = ship ? new SprayView(SPRAY.make()) : null;
  // Gunfire (plan N5.4a): flashes, puffs, splinters and the balls in flight, both ships' as the match fires them.
  const fireDrawn = match ? new GunfireView(GUNFIRE.make(), SHOT_IN_FLIGHT.make()) : null;
  // Powder smoke (N5.5): poured from the ports as the guns fire, drifting with the wind.
  const smoke = match ? new SmokeView(SMOKE.make()) : null;
  // Fire (N6.5): flames and soot where she burns, poured into the smoke's ring.
  const burning = smoke ? new FireView(smoke) : null;
  // What floats after a ship goes down (N6.5): her loose wood coming up where she sank.
  const flotsam = match ? new FlotsamView(SHIPS_DRAWN) : null;
  const shots = match ? new ShotsSeen() : null;
  if (match && shots) match.on('events', (events) => shots.take(events));
  if (match && crew) match.on('events', (events) => crew.onEvents(events));
  await furnished?.ready();
  await herFittings?.ready();
  await guns?.ready();
  await herGuns?.ready();
  const fittingGroups = [furnished, herFittings].flatMap((f) => (f ? [...f.zones.values()].map((d) => d.group) : []));
  const gunGroups = [guns, herGuns].flatMap((g) => (g ? [g.draws.group] : []));
  await view.stage.warmUp([seaView.mesh, ...(spray ? [spray.mesh] : []), ...(fireDrawn ? [fireDrawn.bits, fireDrawn.balls] : []), ...(smoke && !halfSmoke ? [smoke.mesh] : []), ...(flotsam ? [flotsam.mesh] : []), ...fittingGroups, ...gunGroups]);
  // The crews' shaders, a few men at each level of detail wearing between them all the crew wears, at full speed
  // behind the loading screen (docs/SHADERS.md rule 5), as MasterWorld warms its townsfolk.
  // The cap stays open (share 1) until the crews are in: before the first frame no frame frees a slot.
  // (Set through Object.assign: the owner guard keeps the name `share` for N4.2's men on their way, not the Stage's cap.)
  const capShare = view.stage.cap.share, capTo = (share: number) => Object.assign(view.stage.cap, { share });
  if (captain) {
    capTo(1);
    note.textContent = 'building the captain\'s shaders';
    await view.stage.prepare(captain.group);
  }
  if (crew) {
    capTo(1);
    await crew.warm((o) => view.stage.prepare(o, { everyCaster: true }), (what) => { note.textContent = what; });
  }
  // The other navy's coats too, when the menu may choose it (menu.md, "Your navy"): dressed in them, built, and back,
  // so a match of either navy builds nothing while it is drawn.
  // (The crews' are built for both navies in crew.warm.)
  if (params.menu && captain) {
    capTo(1);
    note.textContent = 'building the other navy\'s coats';
    await captain.changeCoat('french');
    await view.stage.prepare(captain.group);
    await captain.changeCoat('british');
  }
  await view.stage.add(sky.dome);
  await view.stage.add(seaView.mesh);
  await view.stage.add(seaView.deep);
  if (params.rig) await view.stage.add(makeTestBodies(startLook.yaw, params.eye));
  if (ship) await view.stage.add(ship.group);
  // Her yards braced as the address asks (`?brace=30`), until the sailing model braces them (N3.3).
  if (ship) for (const id of ship.swingIds) ship.setBrace(id, params.brace);
  // `?scars=3`: both ships drawn shot about by a stand-in for a fight's damage (plan N6.5), instead of the match's.
  const scarred = params.scars !== null ? [scarsOf(params.scars, 0), scarsOf(params.scars, 1)] as const : null;
  if (other) await view.stage.add(other.group);
  if (spray) await view.stage.add(spray.mesh);
  if (flotsam) await view.stage.add(flotsam.mesh);
  if (fireDrawn) { await view.stage.add(fireDrawn.bits); await view.stage.add(fireDrawn.balls); }
  if (smoke && halfSmoke && view.post) {
    capTo(1); // its shaders are new to the cap, which no frame opens before the first
    await halfSmoke.warm(view.renderer, view.camera, smoke.mesh, () => view.draw(drawHalfSmoke));
  } else if (smoke) await view.stage.add(smoke.mesh);
  if (crew) {
    note.textContent = 'bringing the crews aboard';
    for (const g of crew.groups) await view.stage.add(g);
  }
  if (captain) await view.stage.add(captain.group);
  capTo(capShare);
  const crewMemory = crew?.memory();
  // On WebGPU, building a shader that reads the sky's environment map can leave it blank until it is drawn again.
  sky.redrawEnvironment();
  // Pointers not for looking: the walking thumb's, and a finger the order fan holds.
  let fan: OrderFan | null = null;
  const leaveView = (e: PointerEvent) => (stick?.owns(e) ?? false) || (fan?.owns(e) ?? false);
  // The mouse on a desk: free (drag to look, click a man) or taken for looking by a click on the sea (mouse.ts); never in the menu or under a sheet.
  const mouse = new MouseTaker(canvas, () => !document.body.classList.contains('in-menu') && !document.querySelector('.nt-backdrop'));
  const glassButton = el<HTMLButtonElement>('glass-button');
  const glassInput = glass ? watchGlass(canvas, glassButton, glass, leaveView, () => settings.now.keys.glass) : null;
  const input = watchLook(canvas, walking ? params.look ?? walking.startLook : crew ? CREW_LOOK : ship ? where.look : startLook, view.radPerPixel, leaveView, () => (glassInput?.pinching ?? false) || (fan?.holdsLook ?? false),
    (by) => { const s = settings.now; return by === 'mouse' ? { speed: s.mouseSpeed, inverted: s.mouseInverted } : { speed: s.fingerSpeed, inverted: false }; }, () => mouse.taken);
  const glassField = el('glass');
  // Watching a battle (plan N7.8): the free camera and its controls; while it is active the captain is not drawn and no order is given.
  const hullsNow = (): Hull[] => (match ? match.state.ships.flatMap((_, i) => { const p = match.pose(i); return p ? [{ x: p.x, z: p.z, heading: p.heading }] : []; }) : []);
  const spectator = ship && match ? new Spectator({ hulls: hullsNow, spoken: () => words(settings.now.language), push: () => stick?.push() ?? NO_PUSH, desk: () => matchMedia('(hover: hover) and (pointer: fine)').matches, orderKey: (code) => KEY_ACTIONS.some((a) => !NOT_ORDER_KEYS.includes(a) && settings.now.keys[a] === code) }) : null;
  if (spectator) window.__nautaWatch = {
    company: (to) => spectator.choose(to),
    flyFor: (seconds, push = {}, look = {}) => {
      input.look = { yaw: look.yaw ?? input.look.yaw, pitch: look.pitch ?? input.look.pitch };
      spectator.forced = { push: { forward: push.forward ?? 0, strafe: push.strafe ?? 0 }, climb: push.climb ?? 0, boost: push.boost ?? false };
      for (let t = 0; t < seconds; t += DRIVE_STEP) { const f = spectator.eyeFor(DRIVE_STEP, input.look, hullsNow(), (x, z) => surfaceAt(sea, x, z, seaTime).height); input.look = f.look; }
      spectator.forced = null;
      const [x, y, z] = spectator.eye;
      return { eye: [x, y, z], apart: hullsNow().map((h) => Math.hypot(h.x - x, h.z - z)) };
    },
  };
  const watching = (caption: string | null) => {
    if (!spectator) return;
    if (caption === null) spectator.leaveBattle(); else input.look = spectator.begin(hullsNow(), caption);
  };
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
    // On the brig: the standpoint the query names (`ship=bow`). Sailing, the match keeps its own clock, wind and sea.
    if (ship && p.ship !== null) { where = standpoint(p.ship); input.look = where.look; }
    setScene(p);
    sceneFrames = SCENE_FRAMES; sceneDrawn = done;
  });
  if (ship && !walking && !params.watch) showStandpoints(where, (s) => { where = s; input.look = s.look; });
  if (walking && ship) window.__nautaWalk = { drive: (forward, strafe, seconds, pitch, yaw) => walking.drive({ forward, strafe }, seconds, ship.drawn, input, pitch, yaw), press: (forward, strafe) => { walking.pressed = forward === undefined ? null : { forward, strafe: strafe ?? 0 }; } };
  let showHud = false;
  // The settings that need no more than the page above: the HUD, the calm view (plan N2.7), the walking thumb and
  // keys, the glass button's word.
  settings.watch((s) => {
    showHud = s.frameTimes || params.crew !== null;
    hud.style.display = showHud ? 'block' : 'none';
    if (walking) walking.body.strength = s.motion;
    stick?.layout(walkKeys(s.keys), s.thumb);
    glassButton.replaceChildren(words(s.language).glass, keyCap(s.keys.glass));
  });
  // The order fan (plan N4.4); the working panel of N3.5 beside it only when asked for (`?panel`).
  const orders = match && params.panel ? new OrderPanel(match) : null;
  /** Where the captain stands on her: his walker's spot; at a standpoint aboard, the quarterdeck; off her, nowhere. */
  const captainSpot = (): Spot | null => (spectator?.watching ? null : walking ? spotOf(walking.captain.walker) : where.off ? null : quarterdeck());
  // The men speaking (plan N4.5): bubbles over them for answers, orders passed down, reports and cries, spoken by the
  // men of her crew who have those voices (N4.3): the six the captain addresses, the boatswain, the surgeon.
  const speech = match && ship ? new Speech(document.body, match, settings.now.language, matchClock) : null;
  if (speech && crew) for (const voice of VOICES) speech.speakers.put(crew.speaker(voice, match!.ship));
  settings.watch((s) => { if (speech) speech.language = s.language; });
  const midshipman = new Midshipman(midshipmanStart());
  if (match && ship && crew) fan = new OrderFan(canvas, {
    session: match,
    men: () => (spectator?.watching ? [] : crew.onScreen(view.camera, canvas.clientWidth, canvas.clientHeight)),
    captain: captainSpot,
    bearingLooked: () => lookBearing(input.look, ship.drawn.heading),
    heel: () => ship.drawn.roll,
    closures: () => match.state.ships[match.ship]!.closures,
    midshipman,
    addressed: (who) => crew.addressed(who, pageSeconds()),
    thumb: (e) => stick?.owns(e) ?? false,
    settings: () => settings.now,
    wording: () => words(settings.now.language),
    taken: () => mouse.taken,
  });
  mouse.whenTakenOrFreed((taken) => { if (!taken) fan?.freed(); });
  fan?.onSent((e) => speech?.sent(e));
  const pointing = new Vector3();
  if (fan && crew) { const f = fan; window.__nautaFan = { open: (who, choose) => f.openForCheck(who, choose), lightUp: (id) => f.lightUp(id), cards: () => f.cardsForCheck(), men: () => crew.onScreen(view.camera, canvas.clientWidth, canvas.clientHeight) }; }
  // Every line the men said, in a sheet opened by the Reports tag or its key (Arnd, 2026-11-18).
  if (speech) new ReportsPanel(speech.log, settings);
  /** Seconds of the last jump the sails as drawn are still to catch up with, and what to call when the frame after is drawn. */
  let jump = 0, jumped: (() => void) | null = null;
  /** The captain's body is hidden while a battle is watched (no captain on it). */
  let captainHidden = false;
  if (match) window.__nautaSail = {
    say: (words) => { const o = parseOrder(words, match.ship); if (typeof o === 'string') return o; match.give(o); return ''; },
    onward: (seconds, draw = true) => new Promise((done) => {
      // The match runs on piece by piece, each pumped at once: one jump of minutes would leave it running late instead.
      pinned ??= pageSeconds();
      for (let left = seconds; left > 0; left -= JUMP_PIECE) { ahead += Math.min(JUMP_PIECE, left); match.frame(); }
      jump += seconds;
      // Drawn: the frames start again for the one that catches up, and hold after it, as for a scene set for a shot (no
      // frame is drawn beside the picture; on the checks' software GPU each costs seconds).
      if (draw) { jumped = done; held = false; last = performance.now(); } else done();
    }),
    sails: () => ship!.sails.summary(),
    aback: () => sailsSeen(match.state, match.ship)?.standing.filter((st) => st.aback).length ?? 0,
    windFrom: () => blowing.from / DEGREE,
    // The other ship's compass bearing from hers, degrees (-1 with none): checks turn her to bring the guns to bear.
    bearingOfOther: () => {
      const a = match.pose(match.ship), b = match.other >= 0 ? match.pose(match.other) : null;
      return a && b ? wrapBearing(bearingTo(a, b)) / DEGREE : -1;
    },
    aimAtOther: () => {
      const her = match.other >= 0 ? match.pose(match.other) : null;
      if (!her || !ship) return -1;
      // Her bearing and height from the eye, turned into her own ship's frame (the look is taken in it).
      const eye = view.camera.position, dx = her.x - eye.x, dz = her.z - eye.z, h = ship.drawn.heading;
      const x = dx * Math.cos(h) + dz * Math.sin(h), z = -dx * Math.sin(h) + dz * Math.cos(h), d = Math.hypot(dx, dz);
      input.look = { yaw: Math.atan2(-x, -z), pitch: Math.atan2(AIM_HEIGHT - earthDrop(d) - eye.y, d) };
      return d;
    },
    apart: () => {
      const a = match.pose(match.ship), b = match.other >= 0 ? match.pose(match.other) : null;
      return a && b ? apartOnWater(a, b) : -1;
    },
    glass: (power) => {
      if (!glass) return;
      glass.up = power !== null;
      glass.raised = glass.up ? 1 : 0;
      if (power !== null) glass.power = power;
    },
    other: () => (other?.group.visible ? { drawn: other.trianglesDrawn, near: other.nearDrawn, apart: Math.round(other.group.position.distanceTo(view.camera.position)), draws: view.renderer.info.render.drawCalls, mine: ship?.trianglesDrawn ?? 0 } : null),
    eyeAt: (eye, yaw, pitch) => { where = { name: 'check', eye, look: { yaw, pitch } }; input.look = { yaw, pitch }; },
    drill: (index) => { const guns = match.state.ships[index]?.guns; return guns ? battery().map((_, g) => gunAt(guns, g).drill) : []; },
    firedAgo: (index) => Math.min(Infinity, ...battery().map((_, g) => shots?.firedFor(index, g, seaTime) ?? Number.NaN).filter(Number.isFinite)),
  };
  if (match && !params.menu && !params.watch) {
    const rooms = new RoomPanel(params, VERSION, pageSeconds, () => match.session, (s) => match.useSession(s), () => words(settings.now.language), () => matchMinutes(settings.now.match));
    match.onChange(() => rooms.refresh());
    settings.watch((s, before) => { if (before && before.language !== s.language) rooms.refresh(); });
  }
  const apply = (k: QualityKnobs) => {
    view.setRenderScale(k.renderScale); seaView.setCells(k.seaCells); seaView.fine.select(fineOf(k)); ship?.setQuality(k);
    for (const w of seaView.wakes) w.levels = k.wakeLevels;
    if (fireDrawn) fireDrawn.plenty = k.gunfireShare;
    if (smoke) smoke.plenty = k.gunfireShare;
  };
  apply(quality.knobs);
  // The quality the player chose (plan N7.3): a level fixed, or measured again from the top for `auto`.
  settings.watch((s, before) => {
    const changed = before ? before.quality !== s.quality : s.quality !== 'auto' && !settings.setByAddress('quality');
    if (changed && quality.choose(s.quality)) apply(quality.knobs);
  });
  const settingsMenu = new SettingsMenu(settings, { qualityNow: () => `${quality.knobs.name} · ${quality.reason}` });
  // Escape: a sheet closes itself; the mouse taken is freed by the browser (and nothing more); an open fan or the
  // pointing arm is put away; otherwise, in play, the captain's pause (or the settings) opens, as the rose would.
  onKeyPress(() => ESCAPE, () => {
    if (document.querySelector('.nt-backdrop') || mouse.justFreed) return;
    if (fan?.escape()) return;
    if (!document.body.classList.contains('in-menu')) settingsMenu.press();
  });
  document.addEventListener('visibilitychange', () => quality.interrupt());
  // The sea and the wind heard (N1.7): silent until the first tap or click, as browsers want (the title's tap opens it).
  const sound = new SeaSound(pageEngine(), MATCH_SEED);
  // The plain address: the menu over the live view (plan N7.2, docs/design/menu.md); it chooses every match the page runs.
  let skyMinutes = sky.dayMinutes;
  // Your first command (plan N7.4): the first lieutenant's lessons over the match the menu starts for it.
  const first = params.menu && match && speech ? new FirstCommand({
    speech, fan, myShip: () => match.ship, captain: captainSpot, yaw: () => input.look.yaw, glassUp: () => glass?.up ?? false, glassButton,
    officersSeen: () => crew?.onScreen(view.camera, canvas.clientWidth, canvas.clientHeight) ?? [], wording: () => words(settings.now.language),
  }) : null;
  const menu = params.menu && match ? new Menu({
    params, build: VERSION, settings, settingsMenu, match, now: matchClock, engine: sound.engine, offline,
    sky: (hour, dayMinutes) => { sky.hour = hour; sky.dayMinutes = skyMinutes = dayMinutes; },
    pause: (on) => {
      if (on && pausedAt === null) pausedAt = pageSeconds();
      else if (!on && pausedAt !== null) { paused += pageSeconds() - pausedAt; pausedAt = null; }
      sky.dayMinutes = on ? 0 : skyMinutes;
    },
    firstCommand: (session) => { if (session) first?.start(session); else first?.stop(); },
    watching,
  }) : null;
  // Her navy's coats and colours (menu.md, "Your navy"): the flags of both ships, his own coat and both crews' dress
  // changed when a match of the other navy begins (the warm-up built both navies' coats, so nothing compiles).
  if (match) {
    let dressed: Navy = 'british';
    const dress = () => {
      const navy = match.navy;
      setFrenchFlags(navy === 'french', match.herNavy === 'french');
      if (navy === dressed) return;
      dressed = navy;
      void captain?.changeCoat(navy);
      crew?.changeNavy(match.ship === 0 ? navy : match.herNavy);
    };
    match.onChange(dress);
    // `?watch` began its match before this: the French ship flies her own colours from the start.
    if (params.watch) dress();
  }
  if (params.watch) watching(watchCaption(words(settings.now.language), params.watch.british, params.watch.french));
  // The brig herself heard (N2.8): her timber, the water along her, the counter, the captain's feet, the room he is in.
  // Each part of the sound at the player's level (plan N7.3): the whole is the engine's master volume.
  const shipPart = new Channel(sound.engine), crewPart = new Channel(sound.engine), battlePart = new Channel(sound.engine);
  settings.watch((s) => {
    sound.engine.setVolume('master', s.sound.all);
    sound.level = s.sound.sea; shipPart.level = s.sound.ship; crewPart.level = s.sound.crew; battlePart.level = s.sound.battle;
  });
  const shipSound = ship ? new ShipSound(shipPart, MATCH_SEED) : null;
  // The crew at work heard (N4.6), sailing: the boatswain's calls for the orders given, feet, hauling, the bell; on her
  // without a match only the bell, by the page's clock.
  const crewSound = ship ? new CrewSound(crewPart, MATCH_SEED, match?.ship ?? 0) : null;
  if (match && crewSound) match.on('events', (events) => crewSound.onEvents(events));
  // Her sails and rigging heard (N3.9): the wind in the rigging on her always; canvas, blocks and yards when a match sails her.
  const sailSound = ship ? new SailSound(shipPart, MATCH_SEED) : null;
  // Gunfire heard (N5.6), both ships' guns as the match fires them.
  const gunSound = ship && match ? new GunSound(battlePart) : null;
  if (match && gunSound) match.on('events', (events) => gunSound.onFired(events));
  // Damage heard (N6.8): blows where each ship was struck, masts going, fires, the sea coming in, breaking up.
  const damageSound = ship && match ? new DamageSound(battlePart, MATCH_SEED) : null;
  if (match && damageSound) match.on('events', (events) => damageSound.onDamage(events));
  const drawnSails: SailHeard[] = [];
  let aloft = meanWind(wind, 0);
  const ear = new Vector3(), facing = new Vector3(), crown = new Vector3(), gust = meanWind(wind, 0);
  /** Her way through the water, sailed by a match (`?sail`); still without one. Her wake follows it (N2.5). */
  const way = { ahead: 0, leeway: 0 }, herWay = { ahead: 0, leeway: 0 };
  // `?bench`: the fixed flight, measured once the quality level is chosen (plan N1.9).
  const bench = params.bench > 0 ? new BenchRun(el('bench'), params.bench, {
    settled: () => quality.chosen,
    memory: () => ({ gpu: view.renderer.info.memory.total, js: performance.memory?.usedJSHeapSize ?? null }),
    about: () => { const px = view.drawnSize(); return `${view.backend} · quality ${quality.knobs.name}, ${px.x}×${px.y} px · ${sky.clock} · force ${wind.windForce}`; },
    shaders: () => view.stage.hudLine(),
  }) : null;
  // The bench's sky stands still, so runs at one hour compare.
  if (bench) sky.dayMinutes = 0;
  // `?crew`: the trial's measured run, started by its button or by `?trial` (plan N4.0).
  const trial = crew && params.crew ? new CrewTrialRun(el('bench'), {
    settled: () => quality.chosen,
    about: () => { const px = view.drawnSize(); return `${view.backend} · quality ${quality.knobs.name}, ${px.x}×${px.y} px · ${sky.clock} · force ${wind.windForce} · crews ${params.crew}`; },
    shaders: () => view.stage.hudLine(),
  }, params.trial) : null;
  if (trial) sky.dayMinutes = 0;

  let last = performance.now(), frames = 0, shown = last, ms = 0;
  view.renderer.setAnimationLoop(() => {
    // A still scene already on screen is not drawn again: the shot is taken without frames drawn beside it.
    if (held) return;
    const now = performance.now(), dt = still ? 0 : Math.min(MAX_FRAME_SECONDS, (now - last) / MS_PER_SECOND);
    if (window.__nautaReady && quality.frame(now - last)) apply(quality.knobs);
    last = now;
    const flight = bench?.fly(now);
    const between = match?.frame() ?? null;
    if (match && between) {
      // The match's clock is the page's: the sea, the wind and both ships drawn at the moment the match is drawn at.
      seaTime = between.time;
      wind = match.state.wind;
      meanWind(wind, seaTime, blowing);
      sea = match.state.sea;
      // Her yards, boom and gaff as the crew trims them: the order seen carried out aloft.
      for (const [id, angle] of sparAngles(match.state, match.ship)) ship?.setBrace(id, angle);
      ship?.setRudder(rudderAngle(match.state, match.ship));
    } else {
      seaTime += dt;
      meanWind(wind, seaTime, blowing);
      sea = followWind(sea, { speed: blowing.speed, toward: blowing.toward }, seaTime);
    }
    const phase = trial?.phaseAt(now) ?? null;
    if (phase) input.look = { ...CREW_LOOK };
    // Her sails as the match says they stand (furled when no match sails her).
    const seen = ship && match ? sailsSeen(match.state, match.ship) : null;
    // The glass raised or lowered, and the view magnified as far as it is (ship views pick their detail by it).
    if (glass) {
      glass.step(dt);
      view.magnify(glass.magnification);
      glassField.style.opacity = String(glass.raised);
      if (ship) ship.zoom = glass.magnification;
      if (other) other.zoom = glass.magnification;
    }
    if (ship) {
      // The sails drawn as they stand, the flags in the true wind; after a jump of the browser checks, the sails as
      // drawn catch up with it at once.
      ship.sails.stand(seen?.standing ?? null, seen?.canvas ?? null);
      ship.sails.blow(windAt(wind, ship.drawn.x, ship.drawn.z, seaTime));
      if (jump > 0) ship.sails.follow(jump);
      if (spectator?.watching) {
        // Watching a battle (plan N7.8): the free eye in the world, flown by the viewer, carried along with the ships.
        const flown = spectator.eyeFor(dt, input.look, hullsNow(), (x, z) => surfaceAt(sea, x, z, seaTime).height);
        where = flown.where; input.look = flown.look;
      } else if (walking) {
        where = walking.walk(dt, ship.drawn, input);
        walking.swingDoors((id, angle) => ship.setDoor(id, angle));
      }
      // No captain on a battle's ships: his body is not drawn.
      if (captain && !!spectator?.watching !== captainHidden) { captainHidden = !captainHidden; captain.group.visible = !captainHidden; }
      // Her damage drawn as the match has it (plan N6.5): holes, bulwarks smashed out, her canvas holed.
      ship.showDamage(scarred?.[0] ?? (match ? match.state.ships[match.ship]?.damage ?? null : null));
      lightThrough(view.hemi);
      ship.update(sea, seaTime, dt, view.camera, where, glass ? glass.aim(input.look) : input.look, sky.gain, view.radPerPixel(), seaView.origin);
      furnished?.stowHammocks(myHammocks.after(!!match?.state.ships[match.ship]?.told.quarters, dt + jump));
      furnished?.update(ship.group, view.camera, sky.lightDirection);
      // Her guns as the match has them: run out and in, leaping back when fired, trained; her lids up and down.
      shots?.watch(match!.state);
      const mine = match?.state.ships[match.ship];
      guns?.moveGuns(ship.group, view.camera, match && mine && shots ? gunsSeen(mine, (g) => shots.firedFor(match.ship, g, seaTime)) : null, seaTime, sky.lightDirection);
      if (other && match) {
        // The other ship as her match says she sails: her sails and yards as her crew has them, her flags in the wind where she is.
        other.group.visible = match.other >= 0;
        if (other.group.visible) {
          const hers = sailsSeen(match.state, match.other);
          other.sails.stand(hers?.standing ?? null, hers?.canvas ?? null);
          other.sails.blow(windAt(wind, other.drawn.x, other.drawn.z, seaTime));
          for (const [id, angle] of sparAngles(match.state, match.other)) other.setBrace(id, angle);
          other.setRudder(rudderAngle(match.state, match.other));
          other.showDamage(scarred?.[1] ?? match.state.ships[match.other]?.damage ?? null);
          if (jump > 0) other.sails.follow(jump);
          other.follow(sea, seaTime, dt, view.camera);
          herFittings?.stowHammocks(herHammocks.after(!!match.state.ships[match.other]?.told.quarters, dt + jump));
          herFittings?.update(other.group, view.camera, sky.lightDirection);
          const her = match.state.ships[match.other];
          herGuns?.moveGuns(other.group, view.camera, her && shots ? gunsSeen(her, (g) => shots.firedFor(match.other, g, seaTime)) : null, seaTime);
        }
      }
      ship.shade(view.sun, sky.lightDirection, other);
      // The orders: the midshipman on his way, the fan judged anew; the officers drawn; the captain's arm pointing or his hand at his mouth.
      fan?.onFrame(now, dt);
      const arm = fan?.arm;
      if (captain && walking?.drawnBody && !spectator?.watching) captain.draw(dt, walking.drawnBody, walking.captain.walker, walking.captain.climber, view.camera, arm ? { ...arm, toward: view.camera.getWorldDirection(pointing) } : null);
      // Both crews (N4.3): every man as the match has him, the pool near the captain.
      if (crew && match && between) {
        crew.crews = phase?.crews ?? 2;
        crew.poolInUse = phase && !phase.pool ? 0 : startCrew.pool;
        crew.everyFrame = phase?.everyFrame ?? false;
        crew.noShadows = phase?.noShadows ?? false;
        crew.animate(dt, { state: between, mine: match.ship, camera: view.camera, knobs: quality.knobs.crew, zoom: glass?.magnification ?? 1, midshipman: midshipman.where(), captain: captainSpot(), now: pageSeconds(), violence: settings.now.violence });
      }
      jump = 0;
      sky.below = ship.below;
      seaView.sheltered = ship.below > 0;
    } else {
      const look = flight?.look ?? input.look;
      if (flight) view.camera.position.set(flight.x, flight.y, flight.z);
      view.camera.rotation.set(look.pitch, look.yaw, 0);
      view.sun.position.copy(view.sun.target.position).addScaledVector(sky.lightDirection, SUN_DISTANCE);
    }
    sky.update(dt, view.camera);
    speech?.drawBubbles(view.camera);
    first?.frame();
    // Each ship's way through the water, as her match sails her; her wake and spray follow it (N2.5, N3.8).
    const mine = match?.state.ships[match.ship]?.sailing, hers = match && match.other >= 0 ? match.state.ships[match.other]?.sailing : undefined;
    way.ahead = mine?.ahead ?? 0; way.leeway = mine?.leeway ?? 0;
    herWay.ahead = hers?.ahead ?? 0; herWay.leeway = hers?.leeway ?? 0;
    const herWater = other?.group.visible ? other.water(herWay) : null;
    seaView.show(sea, wind, blowing.speed, seaTime, dt, view.camera, sky, [ship?.water(way) ?? null, herWater]);
    if (ship && spray) {
      const bow = ship.bow(way);
      const from = [{ slams: ship.slams, bow }, ...(other && herWater ? [{ slams: other.slams, bow: other.bow(herWay) }] : [])];
      spray.show(from, windAt(wind, bow.stem[0], bow.stem[2], seaTime, gust), seaTime, dt, seaView.origin);
    }
    // Going down (N6.5): what floats after each ship that has sunk.
    if (match && flotsam) {
      if (ship) flotsam.show(0, ship.drawn, sea, seaTime, seaView.origin);
      if (other && match.other >= 0) flotsam.show(1, other.drawn, sea, seaTime, seaView.origin);
    }
    // Fire (N6.5): her fires' flames and soot, poured before the smoke is shown so they are drawn this frame.
    if (match && burning) {
      const mine = scarred?.[0] ?? match.state.ships[match.ship]?.damage, hers = scarred?.[1] ?? (match.other >= 0 ? match.state.ships[match.other]?.damage : undefined);
      if (ship && mine) burning.burn(0, mine.fires, ship.drawn, seaTime);
      if (other && hers) burning.burn(1, hers.fires, other.drawn, seaTime);
    }
    // Gunfire (N5.4a): flashes and first puffs at the muzzles, the balls in flight, splashes where they fall (spray
    // and white water on the sea), splinters where they strike.
    if (match && shots && fireDrawn) {
      const seen = shots.sightsAt(seaTime), struck = seen.strikes.map((s) => strikeInWorld(s, match.pose(s.ship)));
      const longSix = (f: Flash) => battery()[f.gun]?.gun === 'long6';
      fireDrawn.showGunfire(seaTime, blowing, seaView.origin, seen.flashes, struck.filter((s) => s !== null), seen.balls, longSix);
      smoke?.showSmoke(seaTime, blowing, seaView.origin, seen.flashes, longSix);
      if (spray) fallInSea(seen.splashes, spray, seaView.wakes, [ship?.drawn ?? null, other?.group.visible ? other.drawn : null], fireDrawn.plenty);
    }
    for (const w of seaView.wakes) w.laySplashes(seaTime, seaView.origin.x, seaView.origin.z);
    seaView.fine.run(view.renderer);
    for (const w of seaView.wakes) w.fill(view.renderer);
    view.camera.getWorldPosition(ear);
    view.camera.getWorldDirection(facing);
    crown.copy(view.camera.up).applyQuaternion(view.camera.quaternion);
    // Her own sound first: it gives the room the sea and the wind are heard through. Sailing, her way is the match's.
    const body = walking?.drawnBody, soles = body ? [body.feet.L, body.feet.R] : null;
    const sailing = match?.state.ships[match.ship] ?? null;
    // The ear in her space: the standpoint's own, or (a free eye in the world, plan N7.8) where it lies on her.
    const earEye: readonly [number, number, number] = ship && spectator?.watching ? toShip(ship.drawn, where.eye[0], where.eye[1], where.eye[2]) : where.eye;
    const herRoom = ship && shipSound ? shipSound.aboard(ship.drawn, sea, seaTime, dt, { eye: earEye, off: where.off ?? false, onLadder: walking?.captain.onLadder ?? false, soles, way: sailing?.sailing.ahead ?? 0 }) : OPEN_AIR;
    // Gunfire (N5.6): the reports, shot passing and falling, her own guns jolting the deck under him; deafened by a
    // broadside close by, the rest is heard through a dull room.
    const gunfire = gunSound && match ? gunSound.roar({ t: seaTime, ear: [ear.x, ear.y, ear.z], earShip: earEye, aboard: where.off ? -1 : match.ship, below: herRoom.below }, herRoom) : null;
    for (const j of gunfire?.jolts ?? []) walking?.body.jolt(j.x, j.z, j.strength);
    const room = gunfire?.room ?? herRoom;
    if (damageSound && match && ship) {
      const ships = match.state.ships.map((s, i) => ({ pose: (i === match.ship ? ship.drawn : match.pose(i)) ?? ship.drawn, damage: s.damage }));
      for (const j of damageSound.struck({ t: seaTime, ear: [ear.x, ear.y, ear.z], earShip: earEye, aboard: where.off ? -1 : match.ship, below: herRoom.below, ships })) walking?.body.jolt(j.x, j.z, j.strength);
    }
    if (crewSound && match) { const mine = match.state.ships[match.ship]; crewSound.drum = !!mine && beatingToQuarters(mine.told, mine.guns); }
    if (ship && crewSound && match && sailing) crewSound.atWork(sailing, simTime(match.state), ship.drawn, earEye, room);
    else if (ship && crewSound && !still) crewSound.bellAlone(seaTime, ship.drawn, room);
    // Her sails and rigging (N3.9): the rigging by the wind she feels aloft, the canvas as it is drawn; the wind on the
    // ear, aboard her, is the apparent wind too.
    const aboard = !(where.off ?? false);
    if (ship && sailSound) {
      aloft = windAt(wind, ship.drawn.x, ship.drawn.z, seaTime, aloft);
      sailSound.aloft({ t: seaTime, dt, pose: ship.drawn, aboard, wind: sailing ? apparentSpeed(sailing.sailing, aloft) : aloft.speed, standing: seen?.standing ?? null, drawn: seen ? ship.sails.heard(drawnSails) : null }, room);
    }
    sound.hear(sea, wind, seaTime, [ear.x, ear.y, ear.z], [facing.x, facing.y, facing.z], [crown.x, crown.y, crown.z], room, sailing && aboard ? sailing.sailing : undefined);
    view.stage.frame();
    view.draw(halfSmoke ? drawHalfSmoke : undefined);
    fan?.nameAimed();
    orders?.update(now);
    bench?.worked(performance.now() - now);
    trial?.measured(now, performance.now() - now, crew?.stats.ms ?? 0, view.renderer.info.render.drawCalls);
    frames++;
    if (jumped && jump === 0) { jumped(); jumped = null; held = true; }
    if (sceneDrawn && --sceneFrames <= 0) { sceneDrawn(); sceneDrawn = null; held = true; }
    if (showHud && now - shown >= HUD_EVERY_MS) {
      ms = (now - shown) / frames; frames = 0; shown = now;
      const px = view.drawnSize();
      hud.textContent = `${view.backend} · ${ms.toFixed(1)} ms · ${sky.clock} · force ${wind.windForce} · eye ${view.camera.position.y.toFixed(1)} m · sea ${seaView.tilesDrawn} tiles${ship ? ` · ship ${Math.round(ship.triangles / THOUSAND)}k tris (${Math.round(ship.trianglesDrawn / THOUSAND)}k drawn), ${Math.round(ship.bytes / MEGABYTE)} MB` : ''}${furnished ? ` · ${furnished.count} fittings, ${Math.round(furnished.triangles / THOUSAND)}k tris whole` : ''}${other?.group.visible ? ` · other ship ${Math.round(other.trianglesDrawn / THOUSAND)}k drawn` : ''}${glass?.up ? ` · glass ×${glass.power.toFixed(0)}` : ''} · ${view.renderer.info.render.drawCalls} draws\nquality ${quality.knobs.name}, ${px.x} × ${px.y} px: ${quality.reason}\n${view.stage.hudLine()}\n${sound.engine.summary()}\n${offline.line(formatBytes)}${match ? `\n${match.line()}` : ''}${crew ? `\n${crewLine(crew, musterSeconds, crewMemory!, view.renderer.info.memory.total)}` : ''}`;
    }
    if (!window.__nautaReady) {
      window.__nautaReady = true;
      void offline.start();
      // The title fades into the deck (plan N7.7), or with the menu to come asks for a tap first (N7.2).
      if (menu) menu.ready(); else handOver();
    }
  });
}

/** Shot striking a ship (shotsSeen.ts `Strike`) in the world as she lies at `pose`, and which way out of her side; null: no such ship. */
function strikeInWorld(s: Strike, pose: ShipPose | null): { s: Strike; at: Vector3; out: Vector3 } | null {
  if (!pose) return null;
  const [along, across, height] = s.at, at = new Vector3(...toWorld(pose, across, shipY(height), shipZ(along)));
  const side = new Vector3(...toWorld(pose, across + Math.sign(across || 1), shipY(height), shipZ(along))).sub(at).normalize();
  return { s, at, out: side };
}

/** The crew's HUD line (plans N4.0, N4.3): men drawn, the pool, men placed this frame, the crew's page time, what the crew holds and how long mustering took. */
function crewLine(crew: CrewView, musterSeconds: number, held: ReturnType<CrewView['memory']>, gpuBytes: number): string {
  const s = crew.stats;
  const pack = performance.getEntriesByType('resource').filter((e) => e.name.includes('/packs/')).reduce((n, e) => n + ((e as PerformanceResourceTiming).encodedBodySize || 0), 0);
  return `crew ${s.total} men · ${s.drawn} drawn · pool ${s.pool} · ${s.placed} placed this frame · crew work ${s.ms.toFixed(1)} ms\n`
    + `pack ${formatBytes(pack)} fetched · mustered in ${musterSeconds.toFixed(1)} s · figures ${formatBytes(held.figures)} + atlas ${formatBytes(held.atlas)} · pool ${formatBytes(held.pool)} · workbench ${formatBytes(held.workbench)} · GPU memory ${formatBytes(gpuBytes)}${performance.memory ? ` · heap ${formatBytes(performance.memory.usedJSHeapSize)}` : ''}`;
}

/** Whether the title still waits for its tap: a newer version of the game may restart the page now (offline/register.ts). */
function titleWaits(): boolean {
  return document.getElementById('loading') !== null;
}

/**
 * `?probe` shows what the device offers instead of the game (plan N0.5), `?netcheck` runs a match through the hub
 * without drawing (the network check, plan N3.7); their code loads only when asked for.
 */
// The browser's own menus and navigation stay off the game from the first frame of the title (mouse.ts).
keepBrowserMenusAway();
const asked = readParams(location.search);
// `?title`: the title alone (title/boot.ts), nothing behind it.
const titleAlone = new URLSearchParams(location.search).has('title');
const run = titleAlone ? () => { void new Offline(!DEV, titleWaits).start(); return Promise.resolve(); } : asked.probe ? () => import('./probe/page').then((p) => p.runProbe())
  : asked.netcheck ? () => import('./app/netCheck').then((p) => p.runNetCheck(asked)) : start;

run().catch((err: unknown) => {
  const failed = el('failed');
  failed.textContent = err instanceof GraphicsUnavailable
    ? `Nauta needs WebGPU, which this browser does not offer (${err.why}). It runs in Safari on an iPad or Mac (iPadOS and macOS 26 or later) and in a current Chrome or Edge.`
    : `Nauta could not start: ${err instanceof Error ? err.message : String(err)}`;
  failed.style.display = 'grid';
  handOver(true);
  console.error(err);
});
