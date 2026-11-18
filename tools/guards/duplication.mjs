/**
 * The duplication ratchet (docs/CHECKS.md): the Toolbox finders run over src, and what they find is held against
 * tools/guards/duplication-baseline.json.
 *  - A copied function body (a clone) is never allowed: fold the two into one.
 *  - A repeated idiom or two alike functions of one name must be listed in the baseline with a reason (Arnd's OK
 *    for a real copy; "only the name matches" for a false alarm), and a listed entry that is no longer found must go.
 * After MasterWorld's tools/guards/guards.mjs (its duplication check).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIRM_FLOOR, groupCandidates, scanTree } from '../duplicate-candidates/find-duplicate-candidates.mjs';
import { scan as scanRepeated } from '../repeated-code/find-repeated-code.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '../..');
export const BASELINE_FILE = path.join(HERE, 'duplication-baseline.json');
/** The source the finders read. */
export const SOURCE_DIR = path.join(REPO, 'src');

/**
 * The two finders: copied bodies and repeated idioms (`repeated`), and alike functions of one name (`names`). Each
 * finding's key starts with the kind that finds it, so the ratchet can be held one finder at a time (the test suite
 * runs them as two tests, each inside one test's time, after a third that reads the source for both).
 */
export const FINDERS = ['repeated', 'names'];
const FINDER_OF = { 'clone: ': 'repeated', 'idiom: ': 'repeated', 'same name: ': 'names' };
const finderOf = (key) => Object.entries(FINDER_OF).find(([prefix]) => key.startsWith(prefix))?.[1];

/**
 * What the finders (`finders`, all by default) find under `dir`, as stable keys (names and files, never line numbers).
 * `cache`: a Map the caller keeps (`readSource`), so several calls read and tokenize each file once.
 */
export function duplicationFindings(dir = SOURCE_DIR, finders = FINDERS, cache = undefined) {
  const found = [];
  if (finders.includes('repeated')) {
    const rep = scanRepeated(dir, { displayBase: dir, cache });
    found.push(...rep.clones.clusters.map((c) => `clone: ${[...new Set(c.fns.map((f) => `${f.file}#${f.name}`))].sort().join(' + ')}`));
    found.push(...rep.idioms.idioms.map((d) => `idiom: [${d.names.join(' ')}] in ${[...new Set(d.at.map((a) => a.file))].sort().join(' + ')}`));
  }
  if (finders.includes('names')) {
    // Only the exact and the normalised names are held to the ratchet: the near-name tier is not built (nearNames).
    const g = groupCandidates(scanTree(dir, { displayBase: dir, cache }).functions, { nearNames: false });
    found.push(...[...g.tier1, ...g.tier2]
      .filter((p) => (p.status === 'compared' || p.status === 'confirmed') && p.sim >= DEFAULT_CONFIRM_FLOOR)
      .map((p) => `same name: ${[`${p.a.file}#${p.a.name}`, `${p.b.file}#${p.b.name}`].sort().join(' + ')}`));
  }
  return [...new Set(found)].sort();
}

/**
 * The ratchet: every problem as a line (none: the code holds no copy that is not accounted for). `finders`: the
 * finders that made `findings` (baseline entries of the others are not held against them).
 */
export function checkDuplication(findings, baseline, finders = FINDERS) {
  baseline = baseline.filter((b) => !finderOf(b.key) || finders.includes(finderOf(b.key)));
  const known = new Map(baseline.map((b) => [b.key, b])), found = new Set(findings), problems = [];
  for (const f of findings) {
    if (f.startsWith('clone: ')) problems.push(`COPY ${f}\n    The same body twice: keep one and call it from both places. A clone cannot be put in the baseline.`);
    else if (!known.has(f)) problems.push(`NEW ${f}\n    Fold it into one, or list it in tools/guards/duplication-baseline.json with a reason (npm run guards -- --keys prints the keys).`);
  }
  for (const b of baseline) {
    if (b.key.startsWith('clone: ')) problems.push(`NOT ALLOWED ${b.key}: a clone cannot be in the baseline.`);
    if (!b.reason || !b.reason.trim()) problems.push(`UNEXPLAINED ${b.key}: a baseline entry needs a reason.`);
    if (!found.has(b.key)) problems.push(`STALE ${b.key}\n    No longer found: delete its entry from tools/guards/duplication-baseline.json.`);
  }
  return problems;
}

export const readBaseline = () => JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
