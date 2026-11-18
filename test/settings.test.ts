import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, languageOf, readSettings, withKey } from '../src/app/settings.ts';
import { QualityChooser } from '../src/app/quality.ts';
import { DEFAULT_WALK_KEYS, keyPush, walkKeys } from '../src/app/thumbs.ts';
import { words } from '../src/app/words.ts';

test('settings read back from nothing, junk or an older build are the defaults', () => {
  assert.deepEqual(readSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(readSettings('junk'), DEFAULT_SETTINGS);
  assert.deepEqual(readSettings({ quality: 'ultra', motion: 0.7, sound: 'loud', keys: { forward: 3 }, language: 'fr' }), DEFAULT_SETTINGS);
});

test('settings out of bounds are brought inside them, a match length to its step', () => {
  const s = readSettings({ sound: { all: 2, crew: -1, sea: 0.3 }, fingerSpeed: 99, matchMinutes: 43, quality: 'low', motion: 0.5 });
  assert.equal(s.sound.all, 1);
  assert.equal(s.sound.crew, 0);
  assert.equal(s.sound.sea, 0.3);
  assert.equal(s.fingerSpeed, 3);
  assert.equal(s.matchMinutes, 45);
  assert.equal(s.quality, 'low');
  assert.equal(s.motion, 0.5);
});

test('a key given to one action is taken from the action that had it', () => {
  const s = withKey(DEFAULT_SETTINGS, 'forward', 'KeyS');
  assert.equal(s.keys.forward, 'KeyS');
  assert.equal(s.keys.back, 'KeyW');
  const walk = walkKeys(s.keys);
  assert.deepEqual(keyPush(new Set(['KeyS']), walk), { forward: 1, strafe: 0 });
  assert.deepEqual(keyPush(new Set(['ArrowUp']), walk), { forward: 1, strafe: 0 });
  assert.deepEqual(DEFAULT_WALK_KEYS.forward, ['KeyW', 'ArrowUp']);
});

test('the language follows the browser where the interface has it', () => {
  assert.equal(languageOf('de-AT'), 'de');
  assert.equal(languageOf('en-GB'), 'en');
  assert.equal(languageOf('fr'), 'en');
  assert.equal(languageOf(undefined), 'en');
  assert.notEqual(words('de').settings, words('en').settings);
});

test('the quality chosen in the settings is fixed mid-run, and auto measures again from the top', () => {
  const q = new QualityChooser(null);
  assert.equal(q.choose('low'), true);
  assert.equal(q.knobs.name, 'low');
  assert.equal(q.chosen, true);
  assert.equal(q.frame(1000), false);
  assert.equal(q.choose('auto'), true);
  assert.equal(q.knobs.name, 'high');
  assert.equal(q.chosen, false);
});
