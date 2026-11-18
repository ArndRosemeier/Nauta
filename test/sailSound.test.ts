/**
 * The sound under sail (implementation plan N3.9): the wind in her rigging follows the apparent wind; loose canvas
 * flogs while a sail is let fall and until it is sheeted home, and it fills once; a tack can be followed with eyes shut
 * (her canvas shivers and flogs as she comes up, sails thunder aback, the yards creak round with the blocks squealing,
 * the sails fill on the new tack); a yard jumped by the browser checks is not heard; every sound has its take.
 * The sailing model alone (test/support/sail.ts), the sails "drawn" by a small stand-in of the drawing's easing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SailWatch, canvasPresence, sailSoundIds, type CanvasDrawn, type SailScene } from '../src/audio/sailHearing.ts';
import type { Heard, PlacedBed, PlacedShot } from '../src/audio/heard.ts';
import {
  ABACK, BLOCK_RUN, FILL, FLOG_BEDS, RIGGING_BEDS, YARD_CREAK, YARD_PERIOD, YARD_SPREAD,
} from '../src/audio/sailTuning.ts';
import { CLOSE_HAULED } from '../src/sim/rules/sailing.ts';
import { startMotion, toWorld } from '../src/sim/ship/motion.ts';
import { shipY, shipZ } from '../src/sim/ship/section.ts';
import { rigPlan } from '../src/sim/ship/rig.ts';
import { apparentSpeed, sailsStanding, startSailing, steerTo, type Sailing, type SailStanding } from '../src/sim/ship/sailing.ts';
import { STEP_SECONDS } from '../src/sim/units.ts';
import { sail, steadyWind } from './support/sail.ts';

const SEED = 11;
const FORCE = 5;
const WIND = steadyWind(FORCE, 0);
const POSE = startMotion(0, 0, 0).pose;
const SAILS = rigPlan().sails;
/** The drawing's numbers the stand-in follows (render/ship/sailsView.ts): the pressure that fills a sail, kN/m²; a shivering sail's belly; aback; easing, s. */
const FULL_PRESSURE = 0.015;
const SHIVER_KEEPS = 0.3;
const ABACK_DEPTH = { square: -0.3, foreAft: -0.7 } as const;
const FOLLOW = { belly: 0.5, shiver: 0.6 } as const;
/** Before the helm goes over she sails steadily for this long, s, then is heard tacking for this long. */
const STEADY = 8;
const TACKING = 50;

interface At<T> { readonly t: number; readonly v: T }

/** A small stand-in for the drawing: each sail's belly and shiver eased toward how it stands, set sails sheeted home. */
class Drawing {
  private readonly now: CanvasDrawn[] = [];
  next(s: Sailing, standing: readonly SailStanding[], dt: number): CanvasDrawn[] {
    standing.forEach((st, i) => {
      const set = s.canvas[i]!.set, square = SAILS[i]!.kind === 'square';
      const full = Math.min(1, Math.sqrt(st.pressure / FULL_PRESSURE));
      const fill = st.aback ? (square ? ABACK_DEPTH.square : ABACK_DEPTH.foreAft) * full : full * (st.shivering ? SHIVER_KEEPS : 1);
      const shiver = st.shivering ? 1 : 0, was = this.now[i];
      const kb = was ? 1 - Math.exp(-dt / FOLLOW.belly) : 1, ks = was ? 1 - Math.exp(-dt / FOLLOW.shiver) : 1;
      this.now[i] = {
        drop: set ? 1 : 0, roll: set ? 0 : 1, reef: 0,
        fill: (was?.fill ?? 0) + (fill - (was?.fill ?? 0)) * kb,
        shiver: (was?.shiver ?? 0) + (shiver - (was?.shiver ?? 0)) * ks,
      };
    });
    return this.now;
  }
}

/** A scene with the defaults of her on deck in a steady wind. */
const scene = (o: Partial<SailScene> & Pick<SailScene, 't'>): SailScene => ({
  dt: STEP_SECONDS, pose: POSE, wind: 8, aboard: true, through: 1, standing: null, drawn: null, ...o,
});

/** Sails `s` on for `seconds`, heard each step from `from` s on: the shots with their times, the flogging's level each step and the events. */
function heardSailing(watch: SailWatch, s: Sailing, seconds: number, from: number) {
  const shots: At<PlacedShot>[] = [], flog: At<number>[] = [], events: At<string>[] = [], drawing = new Drawing(), out: Heard = { shots: [], beds: [] };
  const end = sail(s, WIND, seconds, (now, dt, ev) => {
    const t = from + dt, standing = sailsStanding(now, WIND);
    watch.heard(scene({ t, wind: apparentSpeed(now, WIND), standing, drawn: drawing.next(now, standing, STEP_SECONDS) }), out);
    for (const shot of out.shots) shots.push({ t, v: shot });
    flog.push({ t, v: flogLevel(out.beds) });
    for (const e of ev) events.push({ t, v: e });
  });
  return { end, shots, flog, events };
}

/** The flogging heard now: the root of the sum of its beds' squares (their takes share at equal power). */
const flogLevel = (beds: readonly PlacedBed[]) => Math.sqrt(beds.filter((b) => (FLOG_BEDS as readonly string[]).includes(b.id)).reduce((a, b) => a + b.level ** 2, 0));
/** Each sail's middle in the world with her at POSE. */
const MIDDLES = SAILS.map((sl) => {
  const n = sl.corners.length, m = sl.corners.reduce((a, c) => [a[0] + c.at.across / n, a[1] + c.at.height / n, a[2] + c.at.along / n], [0, 0, 0]);
  return toWorld(POSE, m[0]!, shipY(m[1]!), shipZ(m[2]!));
});
/** The sail whose middle is nearest a place in the world. */
const nearestSail = (p: readonly number[]) => MIDDLES.reduce((best, m, i) => (Math.hypot(m[0] - p[0]!, m[1] - p[1]!, m[2] - p[2]!) < Math.hypot(MIDDLES[best]![0] - p[0]!, MIDDLES[best]![1] - p[1]!, MIDDLES[best]![2] - p[2]!) ? i : best), 0);
const times = (shots: readonly At<PlacedShot>[], id: string) => shots.filter((s) => s.v.id === id).map((s) => s.t);

test('a tack can be followed with eyes shut: shivering canvas flogs, sails thunder aback, the yards creak round with the blocks, the sails fill on the new tack', () => {
  const watch = new SailWatch(SEED);
  const start = startSailing({ heading: CLOSE_HAULED, speed: 2.5, canvas: 'battle' }, WIND, FORCE);
  const steady = heardSailing(watch, start, STEADY, 0);
  assert.equal(steady.shots.length, 0, `sailing steadily close-hauled nothing but the rigging is heard: ${steady.shots.map((s) => s.v.id).join(', ')}`);
  assert.ok(Math.max(...steady.flog.map((f) => f.v)) < 1e-3, 'no canvas flogs while every sail draws');
  const tack = heardSailing(watch, steerTo(steady.end, -CLOSE_HAULED, -1), TACKING, STEADY);
  const tacked = tack.events.find((e) => e.v === 'tacked')?.t;
  assert.ok(tacked !== undefined, 'she tacked');
  const aback = times(tack.shots, ABACK.id), creaks = times(tack.shots, YARD_CREAK.id), fills = times(tack.shots, FILL.id), blocks = times(tack.shots, BLOCK_RUN.id);
  const firstAback = aback[0] ?? Infinity;
  const flogging = tack.flog.filter((f) => f.t < firstAback).map((f) => f.v);
  assert.ok(Math.max(0, ...flogging) > 0.05, `her canvas shivers and flogs as she comes up, before anything goes aback (most ${Math.max(0, ...flogging).toFixed(3)})`);
  assert.ok(aback.length >= 2 && firstAback < tacked, `sails thunder aback before she is through the wind (${aback.map((t) => t.toFixed(1)).join(', ')}; tacked at ${tacked.toFixed(1)})`);
  // The boom swings as its sheet is trimmed while she comes up; the yards are braced round once she is through.
  const yards = tack.shots.filter((s) => s.v.id === YARD_CREAK.id && SAILS[nearestSail(s.v.at)]!.kind === 'square').map((s) => s.t);
  // The main yards are swung as she comes head to wind ("mainsail haul"), the fore yards once she is through ("tacked").
  const fore = tack.shots.filter((s) => s.v.id === YARD_CREAK.id && SAILS[nearestSail(s.v.at)]!.mast === 'fore').map((s) => s.t);
  assert.ok(fore.length > 0 && fore[0]! >= tacked, `the fore yards creak round once she is through (${fore.map((t) => t.toFixed(1)).join(', ')})`);
  assert.ok(yards.length >= 2 && yards[0]! > firstAback && yards[0]! < tacked + 10, `the yards creak round as she comes through (${yards.map((t) => t.toFixed(1)).join(', ')}; all creaks ${creaks.map((t) => t.toFixed(1)).join(', ')})`);
  assert.ok(blocks.some((t) => t >= yards[0]! && t <= yards.at(-1)! + YARD_PERIOD), `blocks squeal as the yards are braced (${blocks.map((t) => t.toFixed(1)).join(', ')})`);
  assert.ok(fills.some((t) => t > yards[0]!), `sails fill on the new tack once the yards come round (${fills.map((t) => t.toFixed(1)).join(', ')})`);
  assert.ok(tack.flog.at(-1)!.v < 1e-3, 'on the new tack, every sail drawing, no canvas flogs');
});

test('a sail set is heard: flogging while let fall until sheeted home, one fill as it comes taut, blocks while its lines run, then quiet', () => {
  const watch = new SailWatch(SEED), out: Heard = { shots: [], beds: [] };
  const topsail = SAILS.findIndex((s) => s.id === 'main-topsail');
  const standing: SailStanding[] = SAILS.map((s) => ({ id: s.id, area: 0, angle: 0, pressure: 0, aback: false, shivering: false }));
  standing[topsail] = { ...standing[topsail]!, area: 1, pressure: 2 * FULL_PRESSURE };
  // As sailsView draws it: the gaskets let go (rolled 1 to 0 in 5 s), then sheeted home (0 to 1 in 12 s); then it stands.
  const LOOSE = 5, SHEET = 12, AFTER = 5;
  const flog: number[] = [], fills: number[] = [], blocks: number[] = [];
  for (let t = 0; t <= LOOSE + SHEET + AFTER; t += STEP_SECONDS) {
    const roll = Math.max(0, 1 - t / LOOSE), drop = Math.min(1, Math.max(0, (t - LOOSE) / SHEET));
    const drawn = SAILS.map((_, i): CanvasDrawn => (i === topsail ? { drop, roll, reef: 0, fill: drop, shiver: 0 } : { drop: 0, roll: 1, reef: 0, fill: 0, shiver: 0 }));
    watch.heard(scene({ t, standing, drawn }), out);
    flog.push(flogLevel(out.beds));
    for (const s of out.shots) (s.id === FILL.id ? fills : s.id === BLOCK_RUN.id ? blocks : []).push(t);
  }
  const at = (t: number) => flog[Math.round(t / STEP_SECONDS)]!;
  assert.ok(at(0) < 1e-3, 'furled, nothing flogs');
  assert.ok(at(LOOSE) > at(LOOSE / 2) && at(LOOSE) > 0.2, `let fall, it flogs (${at(LOOSE).toFixed(2)})`);
  assert.ok(at(LOOSE + SHEET / 2) < at(LOOSE), 'less as it is sheeted home');
  assert.ok(flog.at(-1)! < 1e-3, 'sheeted home, it is quiet');
  assert.equal(fills.length, 1, 'it fills once');
  assert.ok(fills[0]! > LOOSE + SHEET / 2 && fills[0]! < LOOSE + SHEET, `as it comes taut (${fills[0]!.toFixed(1)} s)`);
  assert.ok(blocks.length >= 4 && blocks.every((t) => t <= LOOSE + SHEET), `blocks while its lines run, none after (${blocks.map((t) => t.toFixed(1)).join(', ')})`);
});

test('the wind in her rigging follows the apparent wind: silent in a calm, louder close-hauled than running, through her planking below, not off her', () => {
  const watch = new SailWatch(SEED), out: Heard = { shots: [], beds: [] };
  const level = (o: Partial<SailScene>) => {
    watch.heard(scene({ t: 0, ...o }), out);
    const ids = new Set(RIGGING_BEDS.flatMap((a) => ['a', 'b'].map((k) => `${a.id}-${k}`)));
    return Math.sqrt(out.beds.filter((b) => ids.has(b.id)).reduce((a, b) => a + b.level ** 2, 0));
  };
  const close = startSailing({ heading: CLOSE_HAULED, speed: 2.5 }, WIND, FORCE), running = startSailing({ heading: Math.PI, speed: 5 }, WIND, FORCE);
  const upWind = apparentSpeed(close, WIND), downWind = apparentSpeed(running, WIND);
  assert.ok(upWind > WIND.speed && downWind < WIND.speed, `she feels more wind close-hauled (${upWind.toFixed(1)} m/s) than the true ${WIND.speed.toFixed(1)}, less running (${downWind.toFixed(1)})`);
  assert.ok(level({ wind: 1 }) < 1e-3, 'a calm: silent');
  assert.ok(level({ wind: upWind }) > level({ wind: downWind }), 'close-hauled her rigging sings louder than running before it');
  assert.ok(level({ wind: 20 }) > level({ wind: upWind }), 'a gale louder still');
  assert.ok(Math.abs(level({ wind: upWind, through: 0.3 }) - 0.3 * level({ wind: upWind })) < 1e-9, 'below deck, the room\'s share of it');
  assert.equal(level({ wind: upWind, aboard: false }), 0, 'off her, her rigging is not all round the ear');
  assert.equal(canvasPresence(0), 0, 'canvas is silent in a calm');
});

test('yards braced at a steady rate creak about every period; a yard jumped in one frame is not heard', () => {
  const watch = new SailWatch(SEED), out: Heard = { shots: [], beds: [] };
  // The main yards alone braced round.
  const RATE = 0.12, SECONDS = 12, JUMP = 1;
  const creaks: number[] = [];
  const at = (angle: number, t: number) => {
    const standing = SAILS.map((s): SailStanding => ({ id: s.id, area: 1, angle: s.mast === 'main' && s.kind === 'square' ? angle : 0, pressure: FULL_PRESSURE, aback: false, shivering: false }));
    const drawn = SAILS.map((): CanvasDrawn => ({ drop: 1, roll: 0, reef: 0, fill: 1, shiver: 0 }));
    watch.heard(scene({ t, standing, drawn }), out);
    return out.shots.filter((s) => s.id === YARD_CREAK.id);
  };
  for (let t = 0; t <= SECONDS; t += STEP_SECONDS) for (const c of at(RATE * t, t)) { if (creaks.at(-1) !== t) creaks.push(t); assert.ok(c.gain > 0); }
  const gaps = creaks.slice(1).map((t, i) => t - creaks[i]!);
  assert.ok(gaps.length > 0 && gaps.every((g) => g >= YARD_PERIOD * (1 - YARD_SPREAD) - STEP_SECONDS && g <= YARD_PERIOD * (1 + YARD_SPREAD) + STEP_SECONDS), `a creak every ${gaps.map((g) => g.toFixed(2)).join(', ')} s`);
  // Standing still a while, then one frame's jump of a whole radian: no creak.
  for (let t = SECONDS; t <= 2 * SECONDS; t += STEP_SECONDS) at(RATE * SECONDS, t);
  assert.equal(at(RATE * SECONDS + JUMP, 2 * SECONDS + STEP_SECONDS).length, 0, 'the jump is not heard');
});

test('every sound under sail has its takes in the game, and the same frames give the same sounds', () => {
  const index = JSON.parse(readFileSync(new URL('../public/sound/index.json', import.meta.url), 'utf8')) as { sounds: Record<string, { files: string[] }> };
  for (const id of sailSoundIds()) assert.ok((index.sounds[id]?.files.length ?? 0) > 0, `${id} has a take`);
  const run = () => {
    const start = startSailing({ heading: CLOSE_HAULED, speed: 2.5, canvas: 'battle' }, WIND, FORCE);
    return heardSailing(new SailWatch(SEED), steerTo(start, -CLOSE_HAULED, -1), STEADY, 0).shots.map((s) => `${s.t.toFixed(3)} ${s.v.id} ${s.v.gain.toFixed(4)}`);
  };
  assert.deepEqual(run(), run());
});
