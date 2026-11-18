import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readTimes, shardsOf, unfinished } from './shards.mjs';

test('files are dealt into the shards in turn: the same list gives the same shards, each in the list order', () => {
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  assert.deepEqual(shardsOf(files, 3), [['a', 'd', 'g'], ['b', 'e'], ['c', 'f']]);
  assert.deepEqual(shardsOf(files, 3), shardsOf([...files], 3));
  assert.deepEqual(shardsOf(['a', 'b'], 3), [['a'], ['b']], 'no empty shard');
});

test("the reporter's lines give every finished test, and the test a stopped shard was in", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'nauta-shards-')), file = path.join(dir, 'times.jsonl');
  const start = (name) => JSON.stringify({ start: { file: 'x.test.ts', name } });
  const end = (name) => JSON.stringify({ file: 'x.test.ts', name, seconds: 0.1, ok: true });
  try {
    writeFileSync(file, [start('one'), end('one'), start('group'), start('two')].join('\n') + '\n');
    assert.deepEqual(readTimes(file).map((t) => t.name), ['one']);
    assert.deepEqual(unfinished(file), { file: 'x.test.ts', name: 'two' });
    writeFileSync(file, [start('one'), end('one')].join('\n') + '\n');
    assert.equal(unfinished(file), null);
    assert.deepEqual(readTimes(path.join(dir, 'none.jsonl')), [], 'a shard that died before reporting has no times');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
