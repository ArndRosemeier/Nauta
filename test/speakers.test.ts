import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Speakers, type Point3, type Speaker, type Voice } from '../src/app/speech/speakers.ts';

const man = (voice: Voice, ship: number): Speaker => ({ voice, ship, head: (out: Point3) => { out.y = 1; return true; }, say: () => {}, hush: () => {} });

test('the last man put speaks for his voice; dropping him gives it back to the one before', () => {
  const s = new Speakers(), standIn = man('master', 0), drawn = man('master', 0), hers = man('master', 1);
  s.put(standIn);
  s.put(hers);
  assert.equal(s.find(0, 'master'), standIn);
  s.put(drawn);
  assert.equal(s.find(0, 'master'), drawn);
  assert.equal(s.find(1, 'master'), hers);
  assert.equal(s.find(0, 'gunner'), null);
  s.drop(drawn);
  assert.equal(s.find(0, 'master'), standIn);
});
