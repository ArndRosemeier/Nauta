import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error -- a plain script without types
import { breaches, disciplineBreaches, importsOf, readRules } from '../tools/guards/guards.mjs';
// @ts-expect-error -- a plain script without types
import { magicNumbers, ownerBreaches, seamProblems, seamRows } from '../tools/guards/discipline.mjs';
// @ts-expect-error -- a plain script without types
import { FINDERS, SOURCE_DIR, checkDuplication, duplicationFindings, readBaseline } from '../tools/guards/duplication.mjs';
// @ts-expect-error -- a plain script without types
import { scanTree } from '../tools/duplicate-candidates/find-duplicate-candidates.mjs';

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

// The source grows by whole files a day, and reading and tokenizing it is most of what the finders cost. It is done
// once, in a test of its own that also proves the finders see all of it (a file they could not read or parse would
// drop out of the ratchet unseen); then one test per finder, so no one test takes more than a share of the time
// (docs/CHECKS.md). The finders do not change what they were given.
const read = new Map();
test('the finders read the whole source: no file skipped, every one tokenized', () => {
  const tree = scanTree(SOURCE_DIR, { displayBase: SOURCE_DIR, cache: read });
  assert.deepEqual(tree.skipped, []);
  assert.ok(tree.filesScanned > 100 && tree.functions.length > 1000, `${tree.filesScanned} files, ${tree.functions.length} functions`);
});

for (const finder of FINDERS) {
  test(`the source holds no copy that is not accounted for (${finder})`, () => {
    assert.deepEqual(checkDuplication(duplicationFindings(undefined, [finder], read), readBaseline(), [finder]), []);
  });
}

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

test('the source keeps the change-friendly rules: named numbers, owned state, a true seam index', () => {
  assert.deepEqual(disciplineBreaches(readRules()), []);
});

test('a bare number is found; names, 0 1 2, indexes, strings and comments are not', () => {
  const src = [
    'export const BROADSIDE_RELOAD = 35; // 99 in a comment',
    'const TABLE = [[1, 12.5], [2, 40]] as const;',
    'export function reload(crew: number, p: number[]) {',
    '  const label = "takes 35 s", half = crew / 2 + p[3];',
    '  return crew < 6 ? BROADSIDE_RELOAD * 1.5 : BROADSIDE_RELOAD - 0;',
    '}',
  ].join('\n');
  assert.deepEqual(magicNumbers(src), [{ line: 5, text: '6' }, { line: 5, text: '1.5' }]);
});

test('state is changed by its owner alone', () => {
  const owners = [{ field: 'hull', owner: 'src/sim/damage.ts', what: "a ship's hull strength" }];
  const files = [
    { file: 'src/sim/damage.ts', text: 'ship.hull -= hit;' },
    { file: 'src/sim/guns.ts', text: 'if (ship.hull === 0) sink();\ntarget.hull -= 4;\nother.hull++;\nconst h = ship.hull;' },
  ];
  const found: string[] = ownerBreaches(owners, files);
  assert.deepEqual(found.map((l) => l.split(': ')[0]), ['src/sim/guns.ts:2', 'src/sim/guns.ts:3']);
});

test('a seam row must point at an export that exists', () => {
  const rows = seamRows('| What | The one place |\n| --- | --- |\n| Turning the look | `src/app/look.ts#turn` |\n| Sinking | `src/app/look.ts#sink` |\n| Nothing | `src/nope.ts#x` |\n');
  assert.equal(rows.length, 3);
  const found: string[] = seamProblems(rows, process.cwd());
  assert.equal(found.length, 2);
  assert.ok(found[0]!.includes('#sink') && found[1]!.includes('src/nope.ts'));
});
