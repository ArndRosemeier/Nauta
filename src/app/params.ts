/**
 * What the page's address asks for (`?hud&hour=17`, `?eye=30&wind=6`, `?sea=gale`, `?yaw=70&pitch=-10`,
 * `?look=90,-5`, `?bench`, `?probe`, `?rig`, `?ship=hold`, `?quality=low`, `?walk`, `?motion=0.5`, `?brace=30`, `?sail`, `?glass=12`; two players:
 * `?room`, `?join=K7Q2ZP`, `?key=`, `?hub=`, `?seed=`, `?netcheck`). Pure: it takes the query string.
 */
import { SKILLS, type Skill } from '../sim/rules/captain';
import { DEGREE, HOURS_PER_DAY } from '../sim/units';
import { PITCH_LIMIT, type Look } from './look';
import { WIND_PRESETS } from '../sim/rules/wind';
import { CALM_LEAST } from '../sim/rules/body';
import { GLASS_POWER } from './glass';

/** The hour a game starts at when the address names none: a clear morning. */
const START_HOUR = 10;
/** Real minutes a game day takes when the address names none. */
const DAY_MINUTES = 24;
/** The longest day the address may ask for, real minutes. */
const DAY_MINUTES_MAX = 100000;
/** The captain's eye above the calm sea when the address names none, m (a brig's quarterdeck; the ship comes with N2). */
const EYE_HEIGHT = 4.5;
/** The lowest and highest eye the address may ask for, m: a diver's depth (the view from under the water) to high above a masthead. */
const EYE_LOWEST = -40;
const EYE_HIGHEST = 200;
/** Half a turn, degrees: the yaw the address may ask for runs from minus this to this. */
const HALF_TURN_DEGREES = 180;
/** The wind's force on the Beaufort scale when the address names none: a moderate breeze, a duel's weather. */
const WIND_FORCE = 4;
/** The force of a gale on the Beaufort scale: the roughest sea a ship is shown in (plan N1). */
const GALE_FORCE = 8;
/** The seas `?sea=` names, as the wind's force that raises them (`?wind=` wins when both are given). */
export const NAMED_SEAS: Readonly<Record<string, number>> = { calm: 0, breeze: WIND_FORCE, gale: GALE_FORCE };
/** How long `?bench` flies when it names no time, s (plan N1.9). */
export const BENCH_SECONDS = 60;
/** The shortest and longest flight `?bench=` may ask for, s. */
const BENCH_SHORTEST = 5;
const BENCH_LONGEST = 600;
/** The computer captain's skill when `?foe` names none. */
const FOE_SKILL: Skill = 'seasoned';
/** The largest seed the address may name: a whole 32-bit number. */
const SEED_MOST = 2 ** 32 - 1;
/**
 * The working addresses (docs/design/menu.md, "Addresses"): any of these names a scene or a tool, which opens as it
 * always has and skips the menu. Without them the page is the game: the title, then the menu. (`?hud`, `?quality=`,
 * `?motion=`, `?smoke=`, `?key=`, `?hub=`, `?notitle` and a room's `?join=` keep the menu.)
 */
export const TOOL_SWITCHES = [
  'sail', 'room', 'walk', 'ship', 'slice', 'crew', 'trial', 'bench', 'probe', 'netcheck', 'title', 'rig',
  'sea', 'wind', 'eye', 'hour', 'day', 'look', 'yaw', 'pitch', 'brace', 'glass', 'foe', 'seed', 'scars', 'down',
] as const;

/** Where `?look=` turns the eye: off the sun's (the moon's) bearing, clockwise, and up from level, both rad. */
export interface LookAtLight {
  readonly off: number;
  readonly up: number;
}

export interface Params {
  /** Show the line of numbers in the corner. */
  readonly hud: boolean;
  /** The hour the day starts at, 0..24. */
  readonly hour: number;
  /** Real minutes a game day takes; 0 stops the clock. */
  readonly dayMinutes: number;
  /** Show what the browser and device offer instead of the game (`?probe`, plan N0.5). */
  readonly probe: boolean;
  /** The eye's height over the calm sea, m (`?eye=30`). */
  readonly eye: number;
  /** The wind's force on the Beaufort scale, a whole number (`?wind=7`). */
  readonly wind: number;
  /** Whether the address names the wind (`?wind=`, or `?sea=` by its wind): then it wins over a match's own, sailing alone too. */
  readonly windAsked: boolean;
  /** Show the light rig's test bodies ahead of the captain (`?rig`, plan N1.5). */
  readonly rig: boolean;
  /** Where the captain looks at the start (`?yaw=70&pitch=-10`, degrees: yaw to the left of north, pitch up); null for the game's own start. */
  readonly look: Look | null;
  /** Stand on the brig (`?ship`, plan N2.4; `?slice`, the N2.0 slice's address, still works), at the standpoint named (`?ship=hold`; empty: the first). */
  readonly ship: string | null;
  /** The quality level asked for (`?quality=low`, src/app/quality.ts); null: chosen from measured frame time. */
  readonly quality: string | null;
  /** Look toward the sun or moon, turned and tilted (`?look=90,-5`, degrees; `?look` alone: straight at its bearing, level); it wins over `?yaw`. */
  readonly toLight: LookAtLight | null;
  /** Fly the bench's path and show the frame times and memory, for this many seconds (`?bench`, `?bench=30`); 0: no bench. */
  readonly bench: number;
  /** Walk her decks with two thumbs (`?walk`, plan N2.3), from the plan's station named (`?walk=surgeon`; empty: the quarterdeck); null: no walking. */
  readonly walk: string | null;
  /** How much of his body's motion the view takes (`?motion=0.1`, from `CALM_LEAST` to 1, plan N2.7); null: the device's own setting. */
  readonly motion: number | null;
  /** Her yards braced round, the boom and gaff swung with them (`?brace=30`, degrees: + the starboard yardarms aft), rad; until the sailing model (N3.3) braces them. */
  readonly brace: number;
  /** Sail her by orders (`?sail`, plan N3.5): the brig under way in a match on this machine, and the order panel; with the ship of `?ship` (and `?walk` if asked). */
  readonly sail: boolean;
  /** The working order panel of N3.5 beside the order fan (`?panel`): a test tool, with every order and the answers in words. */
  readonly panel: boolean;
  /** Open a room for a second captain at once (`?room`, plan N3.7). */
  readonly room: boolean;
  /** Join the room with this code at once (`?join=K7Q2ZP`, the link a room shows); null: none. */
  readonly join: string | null;
  /** Another GameHub app key (`?key=ghk_...`); null: the game's own (hub.ts `GAMEHUB_KEY`). */
  readonly key: string | null;
  /** Another GameHub server (`?hub=http://127.0.0.1:8787`, the checks' stand-in); null: GameHub itself. */
  readonly hub: string | null;
  /** The seed of a match sailed alone (`?seed=7`); null: the game's own. */
  readonly seed: number | null;
  /** The network check's bare page (`?netcheck`, tools/net/room.mjs): a match through the hub without drawing. */
  readonly netcheck: boolean;
  /**
   * The crew trial (`?crew`, plans N4.0 and N4.3): both crews of a match as they are drawn, the other crew where her
   * twin would lie off her bow (`?crew` or `?crew=twin`) or on her own deck too (`?crew=aboard`); null: no trial.
   */
  readonly crew: 'twin' | 'aboard' | null;
  /** Start the crew trial's measured run at once (`?trial`), instead of on its button. */
  readonly trial: boolean;
  /** The spyglass raised from the start, drawn out to this magnification (`?glass=12`; `?glass` alone: as it starts); null: lowered. */
  readonly glass: number | null;
  /** The other ship of a match sailed alone commanded by a computer captain at this skill (`?foe=master`; `?foe` alone: seasoned, plan N7.1); null: she sails on as she started. */
  readonly foe: Skill | null;
  /**
   * Powder smoke drawn at half resolution (`?smoke=half`, the trial of N5.5's next step): the scene into a
   * multisampled target of the shared post chain, its depth brought down to half resolution for the smoke; else the
   * smoke is drawn at full resolution in the main pass, straight to the canvas.
   */
  readonly halfSmoke: boolean;
  /** The game itself (plan N7.2): the title, then the menu, every match chosen there; false when the address names a tool or a scene (`TOOL_SWITCHES`). */
  readonly menu: boolean;
  /** Both ships drawn shot about by a stand-in for a fight's damage, seeded (`?scars=3`; app/scars.ts), to look at the damage drawn (plan N6.5); null: as the match has them. */
  readonly scars: number | null;
  /** The other ship going down from the start, a stand-in (`?sail&down`; app/scars.ts `goingDown`), to look at a ship sinking and what floats after (plan N6.5). */
  readonly down: boolean;
}

export function readParams(query: string): Params {
  const q = new URLSearchParams(query);
  const num = (name: string, fallback: number, min: number, max: number) => {
    const v = q.get(name), n = v === null || v === '' ? NaN : Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  const named = NAMED_SEAS[q.get('sea') ?? ''], force = q.has('wind') || named === undefined ? num('wind', WIND_FORCE, 0, WIND_PRESETS.length - 1) : named;
  return {
    hud: q.has('hud'), hour: num('hour', START_HOUR, 0, HOURS_PER_DAY) % HOURS_PER_DAY,
    dayMinutes: num('day', DAY_MINUTES, 0, DAY_MINUTES_MAX), probe: q.has('probe'), rig: q.has('rig'),
    ship: q.get('ship') ?? q.get('slice') ?? (q.has('crew') ? '' : null), quality: q.get('quality'), walk: q.get('walk'), eye: num('eye', EYE_HEIGHT, EYE_LOWEST, EYE_HIGHEST), wind: Math.round(force), windAsked: q.has('wind') || named !== undefined,
    look: q.has('yaw') || q.has('pitch')
      ? { yaw: num('yaw', 0, -HALF_TURN_DEGREES, HALF_TURN_DEGREES) * DEGREE, pitch: num('pitch', 0, -PITCH_LIMIT / DEGREE, PITCH_LIMIT / DEGREE) * DEGREE }
      : null,
    toLight: q.has('look') ? readLook(q.get('look') ?? '') : null,
    bench: q.has('bench') ? num('bench', BENCH_SECONDS, BENCH_SHORTEST, BENCH_LONGEST) : 0,
    motion: q.has('motion') ? num('motion', 1, CALM_LEAST, 1) : null,
    brace: num('brace', 0, -HALF_TURN_DEGREES, HALF_TURN_DEGREES) * DEGREE,
    sail: q.has('sail'), panel: q.has('panel'),
    room: q.has('room'), join: q.get('join') || null, key: q.get('key') || null, hub: q.get('hub') || null,
    seed: q.has('seed') ? Math.round(num('seed', 0, 0, SEED_MOST)) : null, netcheck: q.has('netcheck'),
    crew: q.has('crew') ? (q.get('crew') === 'aboard' ? 'aboard' : 'twin') : null, trial: q.has('trial'),
    glass: q.has('glass') ? num('glass', GLASS_POWER.start, GLASS_POWER.least, GLASS_POWER.most) : null,
    foe: q.has('foe') ? (SKILLS as readonly string[]).includes(q.get('foe') ?? '') ? (q.get('foe') as Skill) : FOE_SKILL : null,
    halfSmoke: q.get('smoke') === 'half',
    scars: q.has('scars') ? Math.round(num('scars', 1, 0, SEED_MOST)) : null,
    down: q.has('down'),
    menu: !TOOL_SWITCHES.some((name) => q.has(name)),
  };
}

/** `90,-5` as degrees off the light's bearing and up; a part missing or not a number is 0. */
function readLook(v: string): LookAtLight {
  const [off, up] = v.split(',').map((x) => (x.trim() === '' ? 0 : Number(x))).map((x) => (Number.isFinite(x) ? x : 0));
  return { off: (off ?? 0) * DEGREE, up: (up ?? 0) * DEGREE };
}

/** The address that brings another device into the room `code`: this page's own address, joining it instead of opening one. */
export function joinLink(href: string, code: string): string {
  const url = new URL(href);
  url.searchParams.delete('room');
  url.searchParams.set('join', code);
  // Flags stay flags (`?sail`, not `?sail=`).
  url.search = url.searchParams.toString().replace(/=(?=&|$)/g, '');
  return url.toString();
}
