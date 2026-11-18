/**
 * Speech bubbles and reports (implementation plan N4.5): the phrase book is whole in both languages, the reports
 * table gives each event to the right man, an order is seen going down the chain, and the bubbles keep their rules
 * (four at most, a cry first, nothing shown late, no man repeating himself). States are built for the purpose and
 * stepped once at most (CHECKS.md).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startDamage } from '../src/sim/damage.ts';
import { founderTonnes } from '../src/sim/damage/flood.ts';
import { noticed, WATER_MARKS } from '../src/sim/notices.ts';
import { VOCABULARY, type Order } from '../src/sim/orders.ts';
import { startMatch, type SimState } from '../src/sim/state.ts';
import { step, type SimEvent } from '../src/sim/step.ts';
import { PHRASES, phraseWords, TERMS, type Line, type Term } from '../src/app/speech/phrases.ts';
import { lookoutSays, PASS_DELAY, saysOf, whereTerm, type Say } from '../src/app/speech/reports.ts';
import { takerOf } from '../src/app/officers.ts';
import { ReportLog } from '../src/app/speech/reportLog.ts';
import { BubbleQueue, MOST_SHOWN, READ_LEAST, readSeconds, REPEAT_SECONDS } from '../src/app/speech/bubbles.ts';

const LANGUAGES = ['en', 'de'] as const;

/** Two ships lying still in a calm, 300 m apart, the other on our starboard beam. */
function pair(): SimState {
  return startMatch({ seed: 9, windForce: 0, windFrom: 0, ships: [{ x: 0, z: 0, heading: 0, canvas: 'bare' }, { x: 300, z: 0, heading: 0, canvas: 'bare' }] });
}

const placeholders = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

test('the phrase book has every line in English and German, with the same terms in both', () => {
  for (const [line, ph] of Object.entries(PHRASES)) {
    for (const lang of LANGUAGES) assert.ok(ph[lang].length > 0, `${line} in ${lang}`);
    const en = new Set(ph.en.flatMap(placeholders)), de = new Set(ph.de.flatMap(placeholders));
    assert.deepEqual([...de].filter((t) => !en.has(t)), [], `${line}: German names no term English lacks`);
  }
  for (const t of Object.values(TERMS)) for (const lang of LANGUAGES) assert.ok(t[lang].length > 0);
  assert.equal(phraseWords('aye.back', 'en', 'british', 0, { mast: 'fore' }), 'Back the fore topsail, sir.');
  assert.equal(phraseWords('aye.back', 'de', 'british', 0, { mast: 'main' }), 'Großmarssegel back, Herr Kapitän.');
  assert.match(phraseWords('aye', 'en', 'french', 0), /captain/, 'a French crew has its own turn of phrase');
});

test('every order the vocabulary has is answered by its taker, in words of its own', () => {
  for (const w of VOCABULARY) {
    const order = { kind: w.kind, ship: 0, heading: 0, canvas: 'plain', mast: 'main', shot: 'round', at: 'hull' } as unknown as Order;
    const says = saysOf({ kind: 'taken', tick: 0, ship: 0, order }, 0);
    assert.equal(says[0]!.voice, w.to, `${w.kind} is answered by the ${w.to}`);
    assert.ok(says[0]!.line in PHRASES, `${w.kind}: ${says[0]!.line} is in the phrase book`);
    for (const lang of LANGUAGES) assert.doesNotMatch(phraseWords(says[0]!.line, lang, 'british', 1, says[0]!.terms), /\{/);
  }
});

test('an order is seen going down the chain: the master answers, the boatswain passes it on', () => {
  const says = saysOf({ kind: 'taken', tick: 0, ship: 0, order: { kind: 'tack', ship: 0 } }, 0);
  assert.deepEqual(says.map((s) => [s.voice, s.line, s.kind]), [['master', 'aye.tack', 'answer'], ['boatswain', 'pass.tack', 'pass']]);
  const q = new BubbleQueue(1, 'en', 'british');
  q.add(says, 0);
  const first = q.viewAt(0);
  assert.deepEqual(first.came.map((b) => b.rank), ['Master']);
  assert.match(first.came[0]!.words, /Ready about/);
  const then = q.viewAt(PASS_DELAY);
  assert.deepEqual(then.came.map((b) => b.rank), ['Boatswain']);
  assert.equal(then.shown.length, 2, 'both on the view together');
  // Her order is not ours to answer.
  assert.deepEqual(saysOf({ kind: 'taken', tick: 0, ship: 1, order: { kind: 'tack', ship: 1 } }, 0), []);
});

test('a refused order is answered with why by the man it went to', () => {
  const r: SimEvent = { kind: 'refused', tick: 0, order: { kind: 'tack', ship: 0 }, code: 'no way', reason: 'she has no way on her' };
  assert.deepEqual(saysOf(r, 0).map((s) => [s.voice, s.line]), [['master', 'no way']]);
  assert.equal(phraseWords('no way', 'en', 'british', 0), 'She has no way on her, sir.');
  const quarters: SimEvent = { kind: 'refused', tick: 0, order: { kind: 'bear', ship: 0 }, code: 'not at quarters', reason: '' };
  assert.equal(saysOf(quarters, 0)[0]!.voice, 'gunner');
  assert.equal(takerOf({ kind: 'plug', ship: 0 }), 'carpenter');
});

test('a missed tack and a sail sighted are reported by the right man', () => {
  assert.deepEqual(saysOf({ kind: 'missed stays', tick: 0, ship: 0 }, 0).map((s) => [s.voice, s.kind]), [['master', 'cry']]);
  assert.deepEqual(saysOf({ kind: 'missed stays', tick: 0, ship: 1 }, 0).map((s) => [s.voice, s.line]), [['lookout', 'her missed stays']]);
  const s = pair(), first = noticed(s, step(s).state, 0);
  const sighted = first.find((n) => n.kind === 'sighted');
  assert.ok(sighted, 'the lookout sees her at the first step');
  const says = saysOf(sighted, 0);
  assert.deepEqual(says.map((x) => [x.voice, x.terms?.where]), [['lookout', 'starboard beam']]);
  assert.match(phraseWords(says[0]!.line, 'en', 'british', 0, says[0]!.terms), /on the starboard beam/);
  assert.equal(whereTerm(0.05), 'ahead');
  assert.equal(whereTerm(-Math.PI), 'astern');
});

test('her ports opening and our water rising past a mark are noticed once, by the lookout and the carpenter', () => {
  const s = pair();
  const herQuarters: SimState = { ...s, ships: s.ships.map((sh, i) => (i === 1 ? { ...sh, told: { ...sh.told, quarters: true } } : sh)) };
  const ports = noticed(s, herQuarters, 0).filter((n) => n.kind === 'ports');
  assert.equal(ports.length, 1);
  assert.deepEqual(saysOf(ports[0]!, 0).map((x) => x.voice), ['lookout']);
  assert.equal(noticed(herQuarters, herQuarters, 0).filter((n) => n.kind === 'ports').length, 0, 'once');
  const flooded = (t: number): SimState => ({ ...s, ships: s.ships.map((sh, i) => (i === 0 ? { ...sh, damage: { ...startDamage(), flooded: [t / 2, t / 2] } } : sh)) });
  const mark = WATER_MARKS[1]! * founderTonnes();
  const water = noticed(flooded(mark - 1), flooded(mark + 1), 0).filter((n) => n.kind === 'water');
  assert.deepEqual(water.map((n) => (n.kind === 'water' ? n.mark : -1)), [1]);
  assert.deepEqual(saysOf(water[0]!, 0).map((x) => [x.voice, x.line]), [['carpenter', 'water 1']]);
});

const sayOf = (voice: Say['voice'], line: Line, kind: Say['kind'], terms?: Record<string, Term>): Say => ({ voice, ship: 0, line, kind, ...(terms ? { terms } : {}) });

test('never more than four bubbles; a cry takes the place of one; stale ones are dropped, not shown late', () => {
  const q = new BubbleQueue(1, 'en', 'british');
  const voices = ['master', 'gunner', 'carpenter', 'lookout', 'boatswain'] as const;
  voices.forEach((v, i) => q.add([sayOf(v, 'light', 'report')], i * 0));
  const full = q.viewAt(0);
  assert.equal(full.shown.length, MOST_SHOWN);
  q.add([sayOf('first lieutenant', 'fire', 'cry')], 0);
  const cried = q.viewAt(0);
  assert.equal(cried.shown.length, MOST_SHOWN);
  assert.deepEqual(cried.came.map((b) => b.say.line), ['fire']);
  assert.equal(cried.went.length, 1, 'one gave way to the cry');
  // The boatswain's report waited past its time while the view was full: dropped.
  const later = q.viewAt(READ_LEAST + REPEAT_SECONDS);
  assert.ok(!later.came.some((b) => b.say.voice === 'boatswain'), 'a stale report is never shown');
});

test('a man says one thing at a time, his new answer first; reports are not repeated; variants do not repeat', () => {
  const q = new BubbleQueue(3, 'en', 'british');
  q.add([sayOf('master', 'light', 'report')], 0);
  q.viewAt(0);
  q.add([sayOf('master', 'aye.up', 'answer')], 1);
  const answered = q.viewAt(1);
  assert.deepEqual(answered.came.map((b) => b.say.line), ['aye.up'], 'his answer takes the place of his report');
  assert.equal(answered.shown.length, 1);
  q.add([sayOf('master', 'light', 'report')], 2);
  assert.equal(q.viewAt(2 + readSeconds('Up a point, sir.', false)).came.length, 0, 'the same report so soon is not said again');
  const words: string[] = [];
  for (let k = 0; k < 4; k++) {
    q.add([sayOf('gunner', 'aye', 'answer')], 100 + k * 10);
    words.push(q.viewAt(100 + k * 10).came[0]!.words);
  }
  for (let k = 1; k < words.length; k++) assert.notEqual(words[k], words[k - 1], 'never the same words twice running');
});

test('asked what he sees, the lookout gives her bearing, her heading and her sail; the midshipman runs with an order', () => {
  const s = pair(), asked = lookoutSays(s, 0);
  assert.deepEqual(asked.map((x) => [x.voice, x.line, x.terms?.where, x.terms?.canvas]), [['lookout', 'look out', 'starboard beam', 'under bare']]);
  assert.equal(phraseWords('look out', 'en', 'british', 0, asked[0]!.terms), 'She bears on the starboard beam, sir, crossing, under bare poles.');
  const ran = saysOf({ kind: 'sent', voice: 'master', ship: 0, order: { kind: 'tack', ship: 0 }, ask: null, via: 'midshipman', runner: true }, 0);
  assert.deepEqual(ran.map((x) => [x.voice, x.terms?.who]), [['midshipman', 'to master']]);
  assert.match(phraseWords(ran[0]!.line, 'de', 'british', 0, ran[0]!.terms), /Steuermann/);
  assert.deepEqual(saysOf({ kind: 'sent', voice: 'master', ship: 0, order: { kind: 'tack', ship: 0 }, ask: null, via: 'hail', runner: false }, 0), [], 'hailed: the master answers when it is taken');
});

test('every line said goes to the report log, newest first, even when it is never shown', () => {
  const q = new BubbleQueue(5, 'en', 'british'), log = new ReportLog();
  log.record(q.add([sayOf('lookout', 'sighted', 'report', { where: 'ahead' })], 0), 30);
  log.record(q.add(saysOf({ kind: 'taken', tick: 60, ship: 0, order: { kind: 'tack', ship: 0 } }, 0), 1), 60);
  log.record(q.add([sayOf('lookout', 'sighted', 'report', { where: 'ahead' })], 2), 90);
  assert.deepEqual(log.all.map((l) => [l.tick, l.rank]), [[60, 'Boatswain'], [60, 'Master'], [30, 'Lookout']], 'a report said again too soon is not logged twice');
  assert.match(log.all[2]!.words, /dead ahead/);
  // A report dropped stale from the view stays in the log, with the words it would have shown.
  q.viewAt(100);
  assert.equal(log.all.length, 3);
  log.clear();
  assert.equal(log.all.length, 0);
});
