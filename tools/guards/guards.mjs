/**
 * The guards, run by `npm test` through test/guards.test.ts and by `npm run guards`: the layer rules of
 * tools/guards/rules.json against every file under src (the pure layers import no renderer, nothing uses unseeded
 * randomness), the change-friendly rules (discipline.mjs: named numbers, one owner per piece of state, the seam index),
 * and the duplication ratchet (duplication.mjs). `npm run guards -- --keys` prints what the duplicate
 * finders find now, as baseline entries to fill in.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDuplication, duplicationFindings, readBaseline } from './duplication.mjs';
import { magicNumbers, ownerBreaches, seamProblems, seamRows } from './discipline.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const posix = (p) => p.split(sep).join('/');

function files(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

/** The modules a source text imports (static, dynamic and re-exports). */
export function importsOf(text) {
  return [...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

/** Every breach of `rules` in the `src` tree under `base`, as `file: what` lines. */
export function breaches(rules, base = root) {
  const out = [];
  const under = (file, entry) => file === entry || file.startsWith(entry.endsWith('/') ? entry : entry + '/');
  for (const path of files(join(base, 'src'))) {
    const file = posix(relative(base, path)), text = readFileSync(path, 'utf8');
    for (const ban of rules.banEverywhere) if (text.includes(ban.text)) out.push(`${file}: ${ban.text} (${ban.why})`);
    if (!rules.pure.some((p) => under(file, p))) continue;
    for (const spec of importsOf(text)) {
      if (rules.banned.includes(spec)) out.push(`${file}: imports ${spec} (a pure layer draws nothing)`);
      if (!spec.startsWith('.')) continue;
      const target = posix(relative(base, resolve(dirname(path), spec)));
      if (rules.renderFolders.some((r) => under(target, r))) out.push(`${file}: imports ${spec} (a pure layer may not reach the renderer)`);
    }
  }
  return out;
}

/** The breaches of the change-friendly rules (discipline.mjs) in the `src` tree under `base`. */
export function disciplineBreaches(rules, base = root) {
  const sources = files(join(base, 'src')).map((p) => ({ file: posix(relative(base, p)), text: readFileSync(p, 'utf8') }));
  const out = [];
  for (const { file, text } of sources) {
    for (const n of magicNumbers(text)) out.push(`${file}:${n.line}: the number ${n.text} has no name (a top-level const in UPPER_CASE says what it means and is the one place to change it)`);
  }
  out.push(...ownerBreaches(rules.owners ?? [], sources));
  const seams = join(base, 'docs/SEAMS.md');
  out.push(...seamProblems(seamRows(readFileSync(seams, 'utf8')), base));
  return out;
}

export const readRules = () => JSON.parse(readFileSync(join(root, 'tools/guards/rules.json'), 'utf8'));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--keys')) {
    console.log(JSON.stringify(duplicationFindings().map((key) => ({ key, reason: '' })), null, 2));
    process.exit(0);
  }
  const found = [...breaches(readRules()), ...disciplineBreaches(readRules()), ...checkDuplication(duplicationFindings(), readBaseline())];
  for (const line of found) console.error(line);
  console.log(found.length ? `${found.length} problem(s)` : 'guards: ok');
  process.exit(found.length ? 1 : 0);
}
