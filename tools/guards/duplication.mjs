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

/** What the finders find under `dir`, as stable keys (names and files, never line numbers). */
export function duplicationFindings(dir = path.join(REPO, 'src')) {
  const rep = scanRepeated(dir, { displayBase: dir });
  const clones = rep.clones.clusters.map((c) => `clone: ${[...new Set(c.fns.map((f) => `${f.file}#${f.name}`))].sort().join(' + ')}`);
  const idioms = rep.idioms.idioms.map((d) => `idiom: [${d.names.join(' ')}] in ${[...new Set(d.at.map((a) => a.file))].sort().join(' + ')}`);
  const g = groupCandidates(scanTree(dir, { displayBase: dir }).functions);
  const names = [...g.tier1, ...g.tier2]
    .filter((p) => (p.status === 'compared' || p.status === 'confirmed') && p.sim >= DEFAULT_CONFIRM_FLOOR)
    .map((p) => `same name: ${[`${p.a.file}#${p.a.name}`, `${p.b.file}#${p.b.name}`].sort().join(' + ')}`);
  return [...new Set([...clones, ...idioms, ...names])].sort();
}

/** The ratchet: every problem as a line (none: the code holds no copy that is not accounted for). */
export function checkDuplication(findings, baseline) {
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
