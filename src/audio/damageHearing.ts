/**
 * What is heard of damage (plan N6.8), decided from the step's `hit` and `aftermath` events (N6.1, N6.2) and the ships'
 * damage as it stands: each blow where in her it struck, heard after it by the speed of sound (a crash of splintering
 * timber close by, a dull thud far off; splinters scattering; a gun struck ringing; a line parting; canvas torn); a
 * spar going with its crack, groan and splash, its rigging parting after it; her magazine going up. As long as they
 * last: each fire crackling in its space, the sea rushing in at each hole under her waterline (heard aboard her), her
 * timbers breaking up as she founders. Blows close to the captain, and a mast going, jolt him.
 *
 * Her own sounds (hits on the ship the ear is aboard) go on the body bus: her timber is beside the ear, never muffled.
 * The other ship's go on the world bus. With eyes shut, where she was hit is told by where each sound stands.
 *
 * Pure and seeded: `DamageSound` (damageSound.ts) plays it. World axes are the sea's; ship space is section.ts's; a
 * place in her is damage's (along, across, height above her base).
 */
import { hash3i, hashToFloat } from '@futuremagic/core';
import { founderTonnes } from '../sim/damage/flood';
import { sparParts, type Place } from '../sim/damage/meet';
import { openHoles, type Aftermath, type Damage, type Hit } from '../sim/damage';
import { SPEED_OF_SOUND } from '../sim/rules/guns';
import { LOAD_WATERLINE } from '../sim/rules/ships';
import { toWorld, type ShipPose } from '../sim/ship/motion';
import { floorAt, rectCentre, shipPlan } from '../sim/ship/plan';
import type { SimEvent } from '../sim/step';
import { STEP_SECONDS } from '../sim/units';
import {
  BLOWS_A_STEP, BREAKUP, CANVAS, EXPLODE, FALL_JOLT, FIRE, FIRE_BEDS, FIRE_HEIGHT, FIRES_HEARD, HIT_FAR, HIT_JOLT, HIT_NEAR,
  HIT_NEAR_TO_FAR, INRUSH, INRUSH_BEDS, INRUSH_HEARD, IRON, LODGED_GAIN, LODGED_PITCH, MAST_FALL, RIGGING_PARTS, RIGGING_SECONDS,
  ROPE, SPAR_PITCH, SPLINTERS, SPLINTERS_REACH,
} from './damageTuning';
import { DueSounds, nearest, worldDistance, type DueShot } from './due';
import { farShare, type Jolt } from './gunHearing';
import { clearHeard, type Heard, type PlacedBed } from './heard';
import type { SlapKind } from './tuning';

type Vec3 = readonly [number, number, number];

/** A ship as the damage is heard on her: her pose as drawn and her damage now. */
export interface HeardShip {
  readonly pose: ShipPose;
  readonly damage: Damage;
}

/** One frame of damage heard. */
export interface DamageScene {
  /** The match's clock as drawn, s. */
  readonly t: number;
  /** The ear in the world, and in ship space of the ship it is aboard (or -1 off every ship), and 1 when below her deck. */
  readonly ear: Vec3;
  readonly earShip: Vec3;
  readonly aboard: number;
  readonly below: number;
  /** Every ship of the match. */
  readonly ships: readonly HeardShip[];
}

/** What a frame gives: the sounds to start and the beds to hold, and the jolts to the captain's body. */
export interface DamageHeard extends Heard {
  readonly shots: DueShot[];
  readonly jolts: Jolt[];
}

/** The seeded draws, each its own stream. */
const DRAW = { rigging: 1 } as const;

/** A place in her as ship space. */
export const shipSpaceOf = (p: Place): Vec3 => [p[1], p[2] - LOAD_WATERLINE, -p[0]];
/** A place in her in the world at her pose. */
const worldOf = (pose: ShipPose, p: Place): Vec3 => toWorld(pose, p[1], p[2] - LOAD_WATERLINE, -p[0]);

let spaceMiddles: readonly Place[] | null = null;
/** Each space of her plan's middle, at FIRE_HEIGHT over its floor (where its fire is heard). */
function spaceMiddle(space: number): Place | null {
  spaceMiddles ??= shipPlan().spaces.map((s) => { const c = rectCentre(s); return [c.along, c.across, floorAt(s, c.along, c.across) + FIRE_HEIGHT] as Place; });
  return spaceMiddles[space] ?? null;
}

/** A spar part's middle (where it broke and fell from). */
function partMiddle(part: number): Place | null {
  const p = sparParts()[part];
  return p ? [(p.from[0] + p.to[0]) / 2, (p.from[1] + p.to[1]) / 2, (p.from[2] + p.to[2]) / 2] : null;
}

/** What each kind of blow sounds like (null: none of its own: a man struck is shown, his cry is a bubble; a fire started is its bed). */
function blowOf(what: Hit['what']): { kind: SlapKind; pitch: number; gain: number } | null {
  switch (what) {
    case 'hole': return { kind: HIT_NEAR, pitch: 1, gain: 1 };
    case 'lodged': return { kind: HIT_NEAR, pitch: LODGED_PITCH, gain: LODGED_GAIN };
    case 'spar': return { kind: HIT_NEAR, pitch: SPAR_PITCH, gain: 1 };
    case 'splinters': return { kind: SPLINTERS, pitch: 1, gain: 1 };
    case 'gun': return { kind: IRON, pitch: 1, gain: 1 };
    case 'line': case 'steering': return { kind: ROPE, pitch: 1, gain: 1 };
    case 'sail': return { kind: CANVAS, pitch: 1, gain: 1 };
    case 'man': case 'fire': return null;
  }
}

export class DamageWatch {
  private readonly fresh: (Hit | Aftermath)[] = [];
  private readonly due = new DueSounds();
  private readonly jolts: { at: number; jolt: Jolt }[] = [];
  /** Sounds started so far (each draws its own seeded values). */
  private n = 0;

  constructor(private readonly seed: number) {}

  /** A step's events: the blows and what followed are kept to be heard. */
  keepDamage(events: readonly SimEvent[]): void {
    for (const e of events) if (e.kind === 'hit' || e.kind === 'aftermath') this.fresh.push(e);
  }

  /** One frame: the sounds to start (with their delays), the beds to hold, the jolts. */
  struckAt(s: DamageScene, out: DamageHeard): DamageHeard {
    clearHeard(out);
    out.jolts.length = 0;
    this.blows(s);
    for (const e of this.fresh) if (e.kind === 'aftermath') this.followed(e, s);
    this.fresh.length = 0;
    this.due.take(s.t, out.shots);
    for (let i = this.jolts.length - 1; i >= 0; i--) {
      const j = this.jolts[i]!;
      if (j.at > s.t) continue;
      this.jolts.splice(i, 1);
      out.jolts.push(j.jolt);
    }
    s.ships.forEach((ship, k) => this.lasting(ship, k, s, out.beds));
    return out;
  }

  /** The step's blows: of each kind in each step of each ship the nearest few, each heard where and when it struck. */
  private blows(s: DamageScene): void {
    const groups = new Map<string, { e: Hit; where: Vec3; d: number }[]>();
    for (const e of this.fresh) {
      if (e.kind !== 'hit') continue;
      const ship = s.ships[e.ship];
      if (!ship || !blowOf(e.what)) continue;
      const where = worldOf(ship.pose, e.at), key = `${e.ship}:${e.tick}:${blowOf(e.what)!.kind.id}`;
      const list = groups.get(key) ?? [];
      list.push({ e, where, d: worldDistance(where, s.ear) });
      groups.set(key, list);
    }
    for (const list of groups.values()) {
      for (const { e, where, d } of nearest(list, BLOWS_A_STEP)) this.blow(e, where, d, s);
    }
  }

  private blow(e: Hit, where: Vec3, d: number, s: DamageScene): void {
    const b = blowOf(e.what)!, at = e.tick * STEP_SECONDS + d / SPEED_OF_SOUND, hers = e.ship === s.aboard, bus = hers ? 'body' : 'world';
    if (b.kind === HIT_NEAR) {
      const far = farShare(d, HIT_NEAR_TO_FAR);
      if (far < 1) this.due.keep(at, HIT_NEAR, where, bus, b.pitch, b.gain * (1 - far));
      if (far > 0) this.due.keep(at, HIT_FAR, where, bus, b.pitch, b.gain * far);
    } else if (b.kind !== SPLINTERS || d <= SPLINTERS_REACH) this.due.keep(at, b.kind, where, bus, b.pitch, b.gain);
    if (hers && (e.what === 'hole' || e.what === 'lodged' || e.what === 'gun' || e.what === 'spar')) {
      const p = shipSpaceOf(e.at), x = s.earShip[0] - p[0], z = s.earShip[2] - p[2], near = Math.hypot(x, s.earShip[1] - p[1], z);
      if (near <= HIT_JOLT.reach) this.jolts.push({ at, jolt: { x, z, strength: HIT_JOLT.strength * Math.min(HIT_JOLT.near / Math.max(near, 1), 1) } });
    }
  }

  /** What followed: a spar going with its rigging, her magazine going up (fires, the water and breaking up are beds). */
  private followed(e: Aftermath, s: DamageScene): void {
    const ship = s.ships[e.ship];
    if (!ship) return;
    const hers = e.ship === s.aboard, bus = hers ? 'body' : 'world', when = e.tick * STEP_SECONDS;
    if (e.what === 'fell') {
      const mid = partMiddle(e.id);
      if (!mid) return;
      const where = worldOf(ship.pose, mid), at = when + worldDistance(where, s.ear) / SPEED_OF_SOUND;
      this.due.keep(at, MAST_FALL, where, bus, 1, 1);
      for (let k = 0; k < RIGGING_PARTS; k++) this.due.keep(at + this.seeded(DRAW.rigging) * RIGGING_SECONDS, ROPE, where, bus, 1, 1);
      if (hers) this.jolts.push({ at, jolt: { x: -(e.side ?? 1), z: 0, strength: FALL_JOLT } });
    } else if (e.what === 'blew up') {
      const where = toWorld(ship.pose, 0, 0, 0);
      this.due.keep(when + worldDistance(where, s.ear) / SPEED_OF_SOUND, EXPLODE, where, bus, 1, 1);
    }
  }

  /** What lasts on a ship: her fires, the sea rushing in at her holes (aboard her), her breaking up. */
  private lasting(ship: HeardShip, k: number, s: DamageScene, beds: PlacedBed[]): void {
    const d = ship.damage, hers = k === s.aboard, bus = hers ? 'body' : 'world';
    if (d.fires.length > 0) {
      const fires = d.fires.flatMap((f) => {
        const mid = spaceMiddle(f.space);
        if (!mid) return [];
        const where = worldOf(ship.pose, mid);
        return [{ f, where, d: worldDistance(where, s.ear) }];
      });
      for (const { f, where } of nearest(fires, FIRES_HEARD)) {
        beds.push({ id: FIRE_BEDS[f.space % FIRE_BEDS.length]!, key: `fire:${k}:${f.space}`, level: FIRE.gain * Math.sqrt(f.size), at: where, ref: FIRE.ref, glide: FIRE.glide, bus });
      }
    }
    if (hers) {
      const holes = openHoles(d).flatMap((h) => {
        const where = worldOf(ship.pose, h.at), head = -where[1];
        return head > 0 ? [{ h, where, head, d: worldDistance(where, s.ear) }] : [];
      });
      const share = s.below > 1 / 2 ? 1 : INRUSH.onDeck;
      for (const { h, where, head } of nearest(holes, INRUSH_HEARD)) {
        beds.push({ id: INRUSH_BEDS[h.code % INRUSH_BEDS.length]!, key: `inrush:${h.code}`, level: INRUSH.gain * share * Math.sqrt(Math.min(head / INRUSH.fullHead, 1)), at: where, ref: INRUSH.ref, glide: INRUSH.glide, bus: 'body' });
      }
    }
    const water = (d.flooded[0] + d.flooded[1]) / founderTonnes(), breaking = d.blownUp ? 1 : Math.min(Math.max((water - BREAKUP.from) / (1 - BREAKUP.from), 0), 1);
    if (breaking > 0) beds.push({ id: BREAKUP.id, key: `breakup:${k}`, level: BREAKUP.gain * breaking, at: toWorld(ship.pose, 0, 0, 0), ref: BREAKUP.ref, glide: BREAKUP.glide, bus });
  }

  private seeded(stream: number): number {
    return hashToFloat(hash3i(this.seed, stream, this.n++, 0));
  }
}

/** Every take the damage is heard with (fetched when sound opens: the hits; the beds when first heard). */
export const damageHits = (): string[] => [HIT_NEAR, HIT_FAR, SPLINTERS, IRON, ROPE, CANVAS, MAST_FALL, EXPLODE].map((k) => k.id);
