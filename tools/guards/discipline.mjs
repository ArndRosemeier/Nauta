/**
 * Guards for code that stays easy to change (docs/ARCHITECTURE.md; Arnd 2026-11-17: one routine per responsibility,
 * named constants, "not needing to touch like 20 places to adjust a damage formula"):
 *  - magicNumbers: a number in the code has a name. Only 0, 1 and 2 and an index like `p[3]` may stand bare;
 *    every other number sits in a top-level `const UPPER_CASE = ...` (a value or a table), named for what it means.
 *  - ownerBreaches: a piece of state is changed in one file only, its owner (rules.json `owners`).
 *  - seamProblems: every row of docs/SEAMS.md ("the one place that does X") points at an export that exists.
 */
import fs from 'node:fs';
import path from 'node:path';
import { maskCode } from '../duplicate-candidates/find-duplicate-candidates.mjs';

/** Numbers that say nothing a name would add: none, one, twice or half as `/ 2`. */
const BARE = new Set([0, 1, 2]);
const NUMBER = /(?<![\w.$])(?:0[xob][\da-f_]+|\d[\d_]*\.?[\d_]*(?:e[+-]?\d+)?|\.\d[\d_]*(?:e[+-]?\d+)?)n?(?![\w$])/gi;
const NAMED = /^(?:export\s+)?const\s+[A-Z][A-Z0-9_]*\b/gm;

/** `masked` with every top-level `const UPPER_CASE = ...;` blanked (newlines kept, so line numbers hold). */
function withoutNamedConstants(masked) {
  let out = masked;
  for (const m of masked.matchAll(NAMED)) {
    let depth = 0, i = m.index;
    for (; i < masked.length; i++) {
      const c = masked[i];
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth--;
      else if (c === ';' && depth === 0) break;
    }
    out = out.slice(0, m.index) + masked.slice(m.index, i + 1).replace(/[^\n]/g, ' ') + out.slice(i + 1);
  }
  return out;
}

/** The unnamed numbers in a source text, as { line, text }. */
export function magicNumbers(source) {
  const code = withoutNamedConstants(maskCode(source));
  const found = [];
  for (const m of code.matchAll(NUMBER)) {
    const value = Number(m[0].replace(/_/g, '').replace(/n$/, ''));
    if (BARE.has(value)) continue;
    // An index into a tuple or an array (`p[3]`): the place, not a quantity.
    if (code[m.index - 1] === '[' && code[m.index + m[0].length] === ']' && /[\w)\]]/.test(code[m.index - 2] ?? '')) continue;
    found.push({ line: code.slice(0, m.index).split('\n').length, text: m[0] });
  }
  return found;
}

/** Writes to an owned field outside its owner: `owners` is [{ field, owner, what }], `files` is [{ file, text }]. */
export function ownerBreaches(owners, files) {
  const out = [];
  // Each file is masked once (masking is the costly part), then every owned field is looked for in its lines.
  const masked = files.map(({ file, text }) => ({ file, lines: maskCode(text).split('\n') }));
  for (const { field, owner, what } of owners) {
    const write = new RegExp(`\\.${field}\\s*(?:[-+*/%]?=(?!=)|\\+\\+|--)|(?:\\+\\+|--)\\s*[\\w.]*\\.${field}\\b`);
    for (const { file, lines } of masked) {
      if (file === owner) continue;
      lines.forEach((l, i) => {
        if (write.test(l)) out.push(`${file}:${i + 1}: changes .${field} (${what}); only ${owner} may: call it instead`);
      });
    }
  }
  return out;
}

/** The rows of docs/SEAMS.md as { what, file, name }: a row's second cell is `path#export` in backticks. */
export function seamRows(markdown) {
  return [...markdown.matchAll(/^\|\s*([^|]+?)\s*\|\s*`([^`#]+)#([^`]+)`\s*\|/gm)].map((m) => ({ what: m[1], file: m[2], name: m[3] }));
}

/** Rows of the seam index that point at nothing (`base`: the repository). */
export function seamProblems(rows, base) {
  const out = [];
  for (const { what, file, name } of rows) {
    const p = path.join(base, file);
    if (!fs.existsSync(p)) { out.push(`docs/SEAMS.md: "${what}" points at ${file}, which does not exist`); continue; }
    const exported = new RegExp(`export\\s+(?:default\\s+)?(?:async\\s+)?(?:function\\*?|const|let|class|interface|type|enum)\\s+${name}\\b`);
    if (!exported.test(fs.readFileSync(p, 'utf8'))) out.push(`docs/SEAMS.md: "${what}" points at ${file}#${name}, which that file does not export`);
  }
  return out;
}
