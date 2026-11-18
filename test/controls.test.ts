/**
 * The controls card (src/app/controls.ts): every row says what to press and what it does in both languages, its keys
 * are keys the player has, and the desk's list holds the mouse's two ways and the keys a captain needs most.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DESK_CONTROLS, TOUCH_CONTROLS, type ControlSection } from '../src/app/controls.ts';
import { DEFAULT_SETTINGS, KEY_ACTIONS, keyName } from '../src/app/settings.ts';
import { words } from '../src/app/words.ts';

const wordsOf = (list: readonly ControlSection[]) => list.flatMap((s) => [s.title, ...s.rows.flatMap((r) => [r.does, ...r.how.flatMap((h) => ('gesture' in h ? [h.gesture] : []))])]);
const keysOf = (list: readonly ControlSection[]) => list.flatMap((s) => s.rows.flatMap((r) => r.how.flatMap((h) => ('keys' in h ? h.keys : []))));

test('every row of the controls card is worded in English and German, and names keys the player has', () => {
  for (const list of [DESK_CONTROLS, TOUCH_CONTROLS]) {
    for (const w of wordsOf(list)) for (const lang of ['en', 'de'] as const) assert.ok(words(lang)[w], `${w} (${lang})`);
    for (const k of keysOf(list)) assert.ok(KEY_ACTIONS.includes(k), k);
  }
  assert.equal(keysOf(TOUCH_CONTROLS).length, 0, 'a tablet has no keys');
});

test('the desk list teaches the mouse taken and freed, the fan by click, and the keys most needed', () => {
  const desk = wordsOf(DESK_CONTROLS), keys = keysOf(DESK_CONTROLS);
  for (const w of ['ctlClickSea', 'ctlClickMan', 'ctlRightClick', 'ctlEsc'] as const) assert.ok(desk.includes(w), w);
  for (const k of ['forward', 'back', 'left', 'right', 'glass', 'fan', 'midshipman', 'steer', 'fire'] as const) assert.ok(keys.includes(k), k);
  assert.equal(keyName(DEFAULT_SETTINGS.keys.forward), 'W');
  assert.equal(keyName('ArrowUp'), '↑');
});
