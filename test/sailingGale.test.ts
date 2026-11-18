/**
 * In the strongest preset (implementation plan N3.3): under all the sail the crew will carry in a gale, her sails heel
 * her no further than the limit. Whole matches on the sea (test/support/sail.ts `rolling`), in a file of their own for
 * the time budget (docs/CHECKS.md).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLOSE_HAULED, HEEL_LIMIT } from '../src/sim/rules/sailing.ts';
import { DEGREE } from '../src/sim/units.ts';
import { STRONGEST } from './support/match.ts';
import { deg, rolling } from './support/sail.ts';

for (const [angle, name] of [[90 * DEGREE, 'on the beam'], [CLOSE_HAULED, 'close-hauled']] as const) {
  test(`in the strongest preset, under all the sail the crew will carry, she heels below the limit (${name})`, () => {
    const gale = rolling(STRONGEST, 'all', angle);
    assert.ok(gale.mean > 2 * DEGREE && gale.mean < HEEL_LIMIT, `mean heel ${deg(gale.mean)} (limit ${deg(HEEL_LIMIT)}), swing ${deg(gale.swing)}, most ${deg(gale.most)}`);
    assert.ok(gale.most < 2 * HEEL_LIMIT, `most ${deg(gale.most)}`);
  });
}
