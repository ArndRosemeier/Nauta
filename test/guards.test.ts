import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error -- a plain script without types
import { breaches, importsOf, readRules } from '../tools/guards/guards.mjs';
// @ts-expect-error -- a plain script without types
import { checkDuplication, duplicationFindings, readBaseline } from '../tools/guards/duplication.mjs';

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

test('the source holds no copy that is not accounted for', () => {
  assert.deepEqual(checkDuplication(duplicationFindings(), readBaseline()), []);
});

test('two functions with one body are found, and a clone cannot be excused', () => {
  const base = mkdtempSync(join(tmpdir(), 'nauta-dup-'));
  const body = (name: string) => `export function ${name}(points: number[][], wind: number) {
  let sum = 0, weight = 0;
  for (const p of points) { const d = Math.hypot(p[0]! - wind, p[1]! + wind); if (d > 0.5) { sum += p[2]! / d; weight += 1 / d; } }
  for (const p of points) { if (p[2]! > sum) sum -= p[2]! * 0.25; else weight += 0.125; }
  return weight > 0 ? sum / weight : 0;
}\n`;
  writeFileSync(join(base, 'a.ts'), body('heelOf'));
  writeFileSync(join(base, 'b.ts'), body('listOf'));
  const found: string[] = duplicationFindings(base);
  const clone = found.find((f) => f.startsWith('clone: '));
  assert.ok(clone, `no clone in ${JSON.stringify(found)}`);
  assert.ok(checkDuplication(found, []).some((p: string) => p.startsWith('COPY')));
  assert.ok(checkDuplication(found, [{ key: clone, reason: 'please' }]).some((p: string) => p.startsWith('NOT ALLOWED')));
});

test('a listed finding needs a reason and must still be found', () => {
  const key = 'same name: a.ts#update + b.ts#update';
  assert.deepEqual(checkDuplication([key], [{ key, reason: 'only the name matches' }]), []);
  assert.ok(checkDuplication([key], [])[0].startsWith('NEW'));
  assert.ok(checkDuplication([key], [{ key, reason: ' ' }])[0].startsWith('UNEXPLAINED'));
  assert.ok(checkDuplication([], [{ key, reason: 'gone' }])[0].startsWith('STALE'));
});
