import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error -- a plain script without types
import { breaches, importsOf, readRules } from '../tools/guards/guards.mjs';

test('the source keeps the layer rules', () => {
  assert.deepEqual(breaches(readRules()), []);
});

test('imports are found in every form', () => {
  assert.deepEqual(importsOf(`import a from 'x'; import { b } from "./y"; export * from '../z'; const c = await import('w');`), ['x', './y', '../z', 'w']);
});

test('a pure file that reaches the renderer or rolls unseeded dice is reported', () => {
  const base = mkdtempSync(join(tmpdir(), 'nauta-guards-'));
  mkdirSync(join(base, 'src/sim'), { recursive: true });
  mkdirSync(join(base, 'src/render'), { recursive: true });
  writeFileSync(join(base, 'src/sim/a.ts'), `import { Mesh } from 'three/webgpu';\nimport { v } from '../render/view';\n`);
  writeFileSync(join(base, 'src/render/view.ts'), `export const v = Math.random();\n`);
  const found: string[] = breaches(readRules(), base);
  assert.equal(found.length, 3);
  assert.ok(found.some((l) => l.includes('src/sim/a.ts') && l.includes('three/webgpu')));
  assert.ok(found.some((l) => l.includes('src/sim/a.ts') && l.includes('../render/view')));
  assert.ok(found.some((l) => l.includes('src/render/view.ts') && l.includes('Math.random')));
});
