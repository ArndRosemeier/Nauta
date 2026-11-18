/**
 * Under sail on the simulated sea (implementation plan N3.3): her sails steady her roll. Whole matches stepped (sea,
 * wind with its gusts, sailing and floating), in a file of their own: each run is a good part of a second, and a test
 * file has 5 s (docs/CHECKS.md). The heel in the strongest preset is in test/sailingGale.test.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEGREE } from '../src/sim/units.ts';
import { deg, rolling } from './support/sail.ts';

/** A force 5 beam sea: the wind, and the sea it raised, square across her. */
const BEAM_FORCE = 5;
let bare: ReturnType<typeof rolling> | null = null;

test('under bare poles in a force 5 beam sea she rolls hard, near her own roll period', () => {
  bare = rolling(BEAM_FORCE, 'bare', 90 * DEGREE);
  assert.ok(bare.most > 12 * DEGREE, `most ${deg(bare.most)}, swing ${deg(bare.swing)}`);
});

test('under battle sail in a force 5 beam sea she rolls clearly less than under bare poles, heeled steadily to leeward', () => {
  assert.ok(bare, 'bare poles were sailed first');
  const battle = rolling(BEAM_FORCE, 'battle', 90 * DEGREE);
  const why = `battle sail: mean ${deg(battle.mean)}, swing ${deg(battle.swing)}, most ${deg(battle.most)}; bare poles: swing ${deg(bare.swing)}, most ${deg(bare.most)}`;
  assert.ok(battle.swing < 0.7 * bare.swing, why);
  assert.ok(battle.most < 0.8 * bare.most, why);
  // The wind on her larboard beam heels her to starboard.
  assert.ok(battle.mean > 1 * DEGREE, why);
});
