import { test } from 'node:test';
import assert from 'node:assert/strict';
import { joinLink, readParams } from '../src/app/params.ts';
import { DEGREE } from '../src/sim/units.ts';

/** A brace the address asks for, degrees. */
const BRACED = 30;

test('no query: WebGPU, no HUD, a morning that moves', () => {
  assert.deepEqual(readParams(''), { hud: false, hour: 10, dayMinutes: 24, probe: false, rig: false, ship: null, quality: null, eye: 4.5, wind: 4, windAsked: false, look: null, toLight: null, bench: 0, walk: null, motion: null, brace: 0, sail: false, panel: false, room: false, join: null, key: null, hub: null, seed: null, netcheck: false, crew: null, trial: false, glass: null, foe: null, halfSmoke: false, scars: null, down: false, end: null, menu: true });
});

test('the query sets the backend, the HUD, the hour, the day length, the eye and the wind', () => {
  assert.deepEqual(readParams('?hud&hour=17.5&day=0&eye=30&wind=7'), { hud: true, hour: 17.5, dayMinutes: 0, probe: false, rig: false, ship: null, quality: null, eye: 30, wind: 7, windAsked: true, look: null, toLight: null, bench: 0, walk: null, motion: null, brace: 0, sail: false, panel: false, room: false, join: null, key: null, hub: null, seed: null, netcheck: false, crew: null, trial: false, glass: null, foe: null, halfSmoke: false, scars: null, down: false, end: null, menu: false });
});

test('nonsense falls back, and numbers are held to their range', () => {
  assert.equal(readParams('?hour=noon').hour, 10);
  assert.equal(readParams('?hour=24').hour, 0);
  assert.equal(readParams('?hour=-3').hour, 0);
  assert.equal(readParams('?day=-1').dayMinutes, 0);
  assert.equal(readParams('?eye=-90').eye, -40);
  assert.equal(readParams('?wind=12').wind, 8);
  assert.equal(readParams('?sail').sail, true);
  assert.equal(readParams('?wind=2.6').wind, 3);
});

test('?probe asks for the probe page instead of the game', () => {
  assert.equal(readParams('?probe').probe, true);
});

test('?rig shows the light rig test bodies', () => {
  assert.equal(readParams('?rig').rig, true);
});

test('?yaw and ?pitch set where the captain looks at the start, in degrees', () => {
  const look = readParams('?yaw=90&pitch=-10').look!;
  assert.ok(Math.abs(look.yaw - Math.PI / 2) < 1e-12 && Math.abs(look.pitch + Math.PI / 18) < 1e-12);
  assert.equal(readParams('?pitch=-200').look!.pitch, -1.5);
});

test('?ship stands on the brig, at the standpoint named; ?slice still works', () => {
  assert.equal(readParams('?ship').ship, '');
  assert.equal(readParams('?ship=hold').ship, 'hold');
  assert.equal(readParams('?slice=below').ship, 'below');
  assert.equal(readParams('').ship, null);
});

test('?quality names a level, or leaves the choice to measuring', () => {
  assert.equal(readParams('?quality=low').quality, 'low');
  assert.equal(readParams('').quality, null);
});

test('?sea names a sea by the wind that raises it, and ?wind wins over it', () => {
  assert.equal(readParams('?sea=calm').wind, 0);
  assert.equal(readParams('?sea=breeze').wind, 4);
  assert.equal(readParams('?sea=gale').wind, 8);
  assert.equal(readParams('?sea=gale&wind=2').wind, 2);
  assert.ok(readParams('?sea=gale').windAsked && readParams('?wind=2').windAsked && !readParams('?sail').windAsked, 'named winds win over a match\'s own');
  assert.equal(readParams('?sea=storm').wind, 4);
});

test('?look turns the eye off the light and tilts it, in degrees', () => {
  const look = readParams('?look=90,-6').toLight!;
  assert.ok(Math.abs(look.off - Math.PI / 2) < 1e-12 && Math.abs(look.up + (6 * Math.PI) / 180) < 1e-12);
  assert.deepEqual(readParams('?look').toLight, { off: 0, up: 0 });
  assert.deepEqual(readParams('?look=x,').toLight, { off: 0, up: 0 });
});

test('?bench flies for 60 s, or the seconds named within its range', () => {
  assert.equal(readParams('?bench').bench, 60);
  assert.equal(readParams('?bench=30').bench, 30);
  assert.equal(readParams('?bench=1').bench, 5);
  assert.equal(readParams('').bench, 0);
});

test('the address braces her yards round, in degrees, held to a half turn', () => {
  assert.equal(readParams('?brace=30').brace, BRACED * DEGREE);
  assert.equal(readParams('?brace=-30').brace, -BRACED * DEGREE);
});

test('two players: open a room, join one by its code, another key or server, a seed', () => {
  const p = readParams('?room&join=K7Q2ZP&key=ghk_x&hub=http://127.0.0.1:8787&seed=12.4&netcheck');
  assert.equal(p.room, true);
  assert.equal(p.join, 'K7Q2ZP');
  assert.equal(p.key, 'ghk_x');
  assert.equal(p.hub, 'http://127.0.0.1:8787');
  assert.equal(p.seed, 12);
  assert.equal(p.netcheck, true);
  assert.equal(readParams('?join=').join, null);
});

test('the link a room shows joins it on the same page, with the same key', () => {
  assert.equal(joinLink('https://arndrosemeier.github.io/Nauta/?sail&room&key=ghk_x', 'K7Q2ZP'), 'https://arndrosemeier.github.io/Nauta/?sail&key=ghk_x&join=K7Q2ZP');
});

test('?crew is the crew trial on her deck: her twin\'s crew off her bow, or both aboard; ?trial starts its run', () => {
  assert.deepEqual([readParams('?crew').crew, readParams('?crew').ship], ['twin', '']);
  assert.equal(readParams('?crew=aboard').crew, 'aboard');
  assert.equal(readParams('?crew=aboard&ship=waist').ship, 'waist');
  assert.equal(readParams('?crew&trial').trial, true);
  assert.equal(readParams('?ship').crew, null);
});

test('the plain address is the game with its menu; every working address skips it, the settings of a visit do not', () => {
  assert.equal(readParams('').menu, true);
  for (const q of ['?hud', '?quality=low', '?motion=0.5', '?join=K7Q2ZP', '?notitle', '?smoke=half', '?key=ghk_x']) assert.equal(readParams(q).menu, true, q);
  for (const q of ['?sail&foe=master', '?walk', '?ship=hold', '?hud&day=0', '?bench', '?probe', '?title', '?crew', '?room', '?sea=gale', '?eye=30']) assert.equal(readParams(q).menu, false, q);
});

test('?end names a ship lost from the first step: mine or hers, and how (plan N6.7); the menu stays', () => {
  assert.deepEqual(readParams('?sail&end=her-struck').end, { ship: 1, how: 'struck' });
  assert.deepEqual(readParams('?sail&end=me-sunk').end, { ship: 0, how: 'sunk' });
  assert.deepEqual(readParams('?sail&end=her-blew-up').end, { ship: 1, how: 'blew up' });
  assert.deepEqual(readParams('?end=her-burnt').end, { ship: 1, how: 'burnt' });
  for (const junk of ['', 'her', 'me-drowned', 'it-sunk', 'her-blew', '-sunk']) assert.equal(readParams(`?sail&end=${junk}`).end, null, junk);
  assert.equal(readParams('?end=her-struck').menu, true, 'on the plain address the game and its menu play it');
});
