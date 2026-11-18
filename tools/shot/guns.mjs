/**
 * A broadside drawn (plan N5.4a), by hand: `npm run shot:guns [-- <out dir> [dusk] [foe] [half]]` (run `npm run build` first;
 * not part of CI's slow checks). One page of the duel sailed alone (`?sail`, seed 1: force 3), run on only by the
 * check (`__nautaSail.onward`): her guns housed and lids shut from the gun standpoint; she beats to quarters and holds
 * for the word, closes to about 450 m, turns to bring the other brig abeam to starboard and runs on a minute (lids up,
 * guns run out); then the word, and the broadside in pieces of the match's clock: the flash through the port from the
 * gun standpoint, the whole side firing from 50 m off, the gun leaping back, and the fall of shot about her through the
 * glass from the crosstrees (splashes, white water, splinters); then her smoke (N5.5) hiding the other brig from
 * her rail and clearing on the wind, over half a minute. `larboard`: the other brig brought abeam to larboard instead
 * (the other tack's smoke, blown the other way; seen from 50 m off and aloft, the gun standpoint being on the
 * starboard side). `dusk`: the same at 20:00. `foe`: the other brig
 * commanded by the computer captain (`&foe=master`) instead, and her broadside received: through the glass as she
 * fires, then from 50 m off and over the rail as her shot arrives.
 * `drill` (N5.4b): instead of the broadside, the gun crews at their work through the first reload after the order to
 * beat to quarters (the men still crossing to their guns), then a minute on, every crew at its gun and every gun
 * ready (her captain crouched behind her), from the gun standpoint looking forward and aft and from the rail. The match does not keep men clear of the captain,
 * so the crews queue behind wherever he stands: the pictures show the guns with the men at them and the muster
 * round the eye, not a clean line of settled crews.
 * Each picture is `<out dir>/<name>.png`; fails if the page throws or a broadside never comes.
 */
import { mkdirSync } from 'node:fs';
import { openBrowser, openGame, shotSize, snap } from './browser.mjs';

const [out = 'shots/guns', ...words] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
/** A light wind (force 3), so the shot's splashes are not lost in white horses. */
const SEED = 1;
const HOUR = words.includes('dusk') ? 20 : 11;
const FOE = words.includes('foe');
/** `drill`: the starboard gun crews at their work through a reload. */
const DRILL = words.includes('drill');
/** `half`: the smoke drawn at half resolution through the post chain (`?smoke=half`, N5.5's trial). */
const HALF = words.includes('half');
/** Which side she fires: +1 the other brig abeam to starboard, -1 to larboard. */
const SIDE = words.includes('larboard') ? -1 : 1;
/** She turns to bring the other abeam once within this far, m, and runs on so long, s, for the guns to be run out. */
const TURN_AT = 450;
/** To larboard: the two close within so far (m) and pass, apart again by so far, before she turns. */
const PASSED = { close: 150, past: 220 };
const READYING = 60;
/** The match runs on in steps of so many seconds while waiting, at most so long. */
const WAIT = { step: 5, most: 900 };
const COMPASS = 360;
const ABEAM = 90;

/** The pictures of a broadside fired: each the standpoint (`glass-<standpoint>`: through the glass at her) and the seconds the match runs on before it; then her smoke. */
const FIRED = SIDE > 0
  ? [['gun', 0.08], ['50-m-off', 0.03], ['gun', 0.12], ['glass-crosstrees', 1], ['glass-crosstrees', 0.4], ['glass-rail', 1.5], ['50-m-off', 2], ['glass-rail', 5], ['50-m-off', 0.1], ['glass-rail', 20]]
  : [['50-m-off', 0.08], ['glass-crosstrees', 1.4], ['50-m-off', 2], ['glass-crosstrees', 5], ['50-m-off', 0.1], ['50-m-off', 20]];
/** The pictures of her broadside received, from the instant she is seen to fire. */
const RECEIVED = [['glass-crosstrees', 0], ['glass-crosstrees', 0.3], ['50-m-off', 0.4], ['rail', 0.4], ['50-m-off', 0.6]];

/** The drill's steps pictured after the broadside, and the views each is taken from (the crews stand half at each side's guns until a side bears: the starboard guns, the battery's second half, are looked at). */
const DRILL_STEPS = ['loading', 'running-out'];
/** After the last, the match runs on so long (s) for every crew to be at its guns and every gun ready, and is pictured again. */
const SETTLED = 60;
const DRILL_VIEWS = [['gun', 'yaw=0&pitch=-6'], ['gun', 'yaw=180&pitch=-6'], ['rail', 'yaw=100&pitch=-8']];
const STARBOARD = 9;
const MOST_WAIT = 60;

const t0 = performance.now(), served = await openBrowser();
const game = await openGame(served, `?ship&sail&seed=${SEED}&day=0&quality=high${DRILL ? '' : '&hud'}${FOE ? '&foe=master' : ''}${HALF ? '&smoke=half' : ''}`, shotSize('800x500'));
const { page } = game;
await page.addStyleTag({ content: `#version,#standpoints,#orders,#room${DRILL ? ',#bubbles,.nt-fire' : ''}{display:none!important}` });
const sail = (f, ...a) => page.evaluate(([fn, args]) => window.__nautaSail[fn](...args), [f, a]);
const scene = (q) => page.evaluate((query) => window.__nautaScene(query), `${q}&hour=${HOUR}&day=0`);
const say = async (w) => { const why = await sail('say', w); if (why) { console.error(`"${w}" refused: ${why}`); process.exitCode = 1; } };
let failed = false, k = 0;

/** The match runs on (half a second at a time) until a starboard gun is in `step` of her drill; false if none gets there in time. */
async function untilDrill(step) {
  for (let waited = 0; waited < MOST_WAIT; waited += 0.5) {
    if ((await sail('drill', 0)).slice(STARBOARD).includes(step)) return true;
    await sail('onward', 0.5, false);
  }
  return false;
}

/** A picture from `view` once the match has run on `dt` s more (a frame drawn at that moment). */
async function picture(view, dt, label = '') {
  if (view.startsWith('glass-')) {
    await scene(`ship=${view.slice('glass-'.length)}`);
    await page.evaluate(() => { window.__nautaSail.glass(4); window.__nautaSail.aimAtOther(); });
  } else {
    await page.evaluate(() => window.__nautaSail.glass(null));
    await scene(`ship=${view}`);
  }
  await sail('onward', dt || 0.001);
  const file = `${out}/${String(k++).padStart(2, '0')}${label}-${view.split('&')[0]}.png`;
  await snap(page, file);
  console.log(`${file} at ${((performance.now() - t0) / 1000).toFixed(0)} s`);
}

await sail('onward', 0);
if (FOE) {
  // Her broadside: waited for, then the next one caught as it comes.
  let waited = 0;
  while (waited < WAIT.most && !(await sail('firedAgo', 1) < WAIT.most)) { await sail('onward', WAIT.step, false); waited += WAIT.step; }
  while (waited < WAIT.most * 2) {
    await sail('onward', 1); waited += 1;
    const ago = await sail('firedAgo', 1);
    if (ago >= 0 && ago < 1) break;
  }
  if (!(await sail('firedAgo', 1) < 1)) { console.error('she never fired'); failed = true; }
  else for (const [view, dt] of RECEIVED) await picture(view, dt);
} else {
  await picture('gun', 0);
  await say('beat to quarters');
  await say('hold for my word');
  if (DRILL) {
    // The first reload after the order while the crews run to their guns, then the guns ready with the crews settled.
    for (const step of DRILL_STEPS) {
      if (!(await untilDrill(step))) { console.error(`no gun came to ${step}`); failed = true; continue; }
      for (const [view, look] of DRILL_VIEWS) await picture(`${view}${look ? `&${look}` : ''}`, 0, `-${step}`);
    }
    await sail('onward', SETTLED, false);
    for (const [view, look] of DRILL_VIEWS) await picture(`${view}${look ? `&${look}` : ''}`, 0, '-settled');
    await game.context.close();
    await served.close();
    process.exit(game.failed() || failed || process.exitCode ? 1 : 0);
  }
  let waited = 0;
  while (waited < WAIT.most && (await sail('apart')) > TURN_AT) { await sail('onward', WAIT.step, false); waited += WAIT.step; }
  // To larboard: the two start heading at each other square to the wind, so she cannot bring the other abeam to
  // larboard as they close (that heading is into the wind's eye); they pass, and then she bears away before the wind.
  if (SIDE < 0) {
    while (waited < WAIT.most && (await sail('apart')) > PASSED.close) { await sail('onward', WAIT.step, false); waited += WAIT.step; }
    while (waited < WAIT.most && (await sail('apart')) < PASSED.past) { await sail('onward', WAIT.step, false); waited += WAIT.step; }
  }
  const abeam = Math.round(((await sail('bearingOfOther')) - SIDE * ABEAM + COMPASS) % COMPASS);
  await say(`steer ${String(abeam).padStart(3, '0')}`);
  await sail('onward', READYING, false);
  console.log(`the other brig ${Math.round(await sail('apart'))} m off; fire`);
  await say('fire');
  for (const [view, dt] of FIRED) await picture(view, dt);
  if (!(await sail('firedAgo', 0) < READYING)) { console.error('her guns never fired'); failed = true; }
}
await game.context.close();
await served.close();
process.exit(game.failed() || failed || process.exitCode ? 1 : 0);
