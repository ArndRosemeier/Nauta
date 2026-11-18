/** Fire drawn (plan N6.5, render/fireView.ts and smoke.ts's fire rings): where a fire is seen, what it pours, where its puffs go. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { shipPlan } from '../src/sim/ship/plan.ts';
import { weatherDeck } from '../src/sim/ship/hull.ts';
import { shipY, shipZ } from '../src/sim/ship/section.ts';
import { startMotion } from '../src/sim/ship/motion.ts';
import { FireView, fireSeat } from '../src/render/fireView.ts';
import { FIRE_RINGS, MOST_PUFFS, SmokeView, type FirePuff } from '../src/render/smoke.ts';

const spaceOf = (id: string) => shipPlan().spaces.findIndex((s) => s.id === id);
const still = startMotion(0, 0, 0).pose;
/** A smoke that keeps what is poured into it. */
const kept = () => { const puffs: FirePuff[] = []; return { puffs, smoke: { pourPuff: (p: FirePuff) => puffs.push({ ...p, at: [...p.at] }) } as unknown as SmokeView }; };

test('a fire below burns on its floor and its smoke comes up the nearest opening of her weather deck', () => {
  const mess = shipPlan().spaces[spaceOf('messdeck')]!, seat = fireSeat(spaceOf('messdeck'));
  const along = (mess.aft + mess.fore) / 2;
  assert.ok(Math.abs(seat.floor[2] - shipZ(along)) < 1e-9, 'its middle along her');
  assert.ok(seat.floor[1] < shipY(weatherDeck(along, 0)), 'below her weather deck');
  assert.ok(seat.vent && seat.vent[1] > shipY(weatherDeck(-seat.vent[2], seat.vent[0])), 'its vent stands over her weather deck');
  assert.ok(seat.reach[0] > 0 && seat.reach[1] > 0);
  // On the open deck it vents where it is.
  const open = shipPlan().spaces.findIndex((s) => s.level === 'weather');
  if (open >= 0) assert.equal(fireSeat(open).vent, null);
});

test('a fire first seen has burnt a while: its smoke already stands; then it pours as it burns, the same on every machine', () => {
  const a = kept(), b = kept(), fires = [{ space: spaceOf('messdeck'), size: 1 }];
  new FireView(a.smoke).burn(0, fires, still, 100);
  new FireView(b.smoke).burn(0, fires, still, 100);
  assert.deepEqual(a.puffs, b.puffs, 'seeded alike');
  const soot = a.puffs.filter((p) => p.kind === 'soot' && p.life > 10), flames = a.puffs.filter((p) => p.kind === 'flame');
  assert.ok(soot.length > 30, `smoke out of her vent for its last life, ${soot.length} puffs`);
  assert.ok(soot.every((p) => p.t <= 100) && soot.some((p) => p.t < 80), 'born before');
  assert.equal(new Set(soot.map((p) => p.at.join())).size, soot.length, 'each puff its own scatter');
  assert.ok(flames.length > 0);
  // Big enough, flames come out of the vent too: some flames stand over her deck.
  const seat = fireSeat(spaceOf('messdeck'));
  assert.ok(flames.some((p) => p.at[1] > seat.floor[1] + 0.5));
  // A small fire shows none out of its vent.
  const c = kept();
  new FireView(c.smoke).burn(0, [{ space: spaceOf('messdeck'), size: 0.2 }], still, 100);
  assert.ok(c.puffs.filter((p) => p.kind === 'flame').every((p) => Math.abs(p.at[1] - seat.floor[1]) < 0.5));
  // Going on, a second's frames pour about a second's puffs, no heap.
  const view = new FireView(a.smoke), was = a.puffs.length;
  view.burn(0, fires, still, 200);
  const first = a.puffs.length;
  for (let k = 1; k <= 60; k++) view.burn(0, fires, still, 200 + k / 60);
  const second = a.puffs.length - first;
  assert.ok(first - was > second && second > 20 && second < 60, `${second} puffs in a second`);
  // The clock run on twenty seconds at once: what it poured meanwhile comes now, born when it was due.
  const before = a.puffs.length;
  view.burn(0, fires, still, 221);
  const jumped = a.puffs.slice(before).filter((p) => p.life > 10);
  assert.ok(jumped.length >= 25 && jumped.some((p) => p.t < 205), `${jumped.length} puffs of smoke over the jump`);
});

test('fires pour into rings of their own: never over the guns\' smoke, long smoke apart from flames', () => {
  const smoke = new SmokeView(new MeshBasicNodeMaterial()), look = (smoke as unknown as { look: { array: Float32Array } }).look.array;
  const puff = (life: number): FirePuff => ({ kind: 'soot', at: [0, 0, 0], t: 0, throwing: [0, 0, 0], radius: 1, life, density: 1, rise: 0, seed: 0 });
  for (let i = 0; i < FIRE_RINGS.short * 2; i++) smoke.pourPuff(puff(1));
  smoke.pourPuff(puff(30));
  const lifeAt = (i: number) => look[i * 4]!;
  for (let i = 0; i < MOST_PUFFS; i++) assert.equal(lifeAt(i), 1, 'the guns\' ring untouched');
  assert.equal(lifeAt(MOST_PUFFS), 30, 'soot first');
  assert.equal(lifeAt(MOST_PUFFS + FIRE_RINGS.long), 1, 'flames drawn over it');
  assert.equal(smoke.mesh.count, MOST_PUFFS + FIRE_RINGS.short + FIRE_RINGS.long);
});
