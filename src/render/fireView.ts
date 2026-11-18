/**
 * Fire drawn (plan N6.5): each fire the simulation keeps (`Damage.fires`: a space of the plan and the share of it
 * alight) burns with flames on its floor, spread from the space's middle over as much of it as is alight, and black
 * soot rising from them; its smoke pours out of the nearest opening of her weather deck (hatch, ladderway, scuttle)
 * and drifts down the wind, and once it holds half its space the flames show there too. Both ships, the fires'
 * puffs going into the smoke's ring (smoke.ts `SmokeView.pourPuff`); the char it leaves on her decks is damageMarks.ts's.
 *
 * Seeded: the puffs' scatter comes from a seed per ship, fire and puff.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import type { Fire } from '../sim/damage/fire';
import { floorsUnder, shipPlan, type Space } from '../sim/ship/plan';
import { weatherDeck } from '../sim/ship/hull';
import { shipY, shipZ } from '../sim/ship/section';
import { toWorld, type ShipPose } from '../sim/ship/motion';
import type { FirePuff, SmokeView } from './smoke';
import { openingsOn } from './ship/zones';

/** Where a fire is seen: its floor's middle (ship space), how far its flames reach either way (m, along and across), and its vent on the weather deck (ship space), or null. */
export interface FireSeat {
  readonly floor: readonly [number, number, number];
  readonly reach: readonly [number, number];
  readonly vent: readonly [number, number, number] | null;
}

/**
 * Puffs a second at full size: flames on the floor, soot rising from them, soot out of the vent, and flames out of
 * it once the fire holds half its space; their lives (s), first radii (m), densities and rises (m/s). Rates and
 * lives fit the fires' rings (smoke.ts `FIRE_RINGS`) with two ships each burning in two places.
 */
const FLAMES = { rate: 12, life: [0.5, 1], radius: [0.25, 0.45], density: 0.5, rise: [1.2, 2.2] } as const;
const SOOT = { rate: 3, life: [3, 5], radius: [0.5, 0.9], density: 0.7, rise: [0.3, 0.5] } as const;
const VENT_SOOT = { rate: 3, life: [18, 28], radius: [1.4, 2.4], density: 0.95, rise: [0.6, 1.1] } as const;
const VENT_FLAMES = { rate: 24, life: [0.4, 0.9], radius: [0.25, 0.5], density: 0.5, rise: [1.8, 3] } as const;
/** The fire's share of its space from which flames show at its vent. */
const FLAMES_OUT = 0.5;
/** Puffs leave the vent this high over the deck, m, and are thrown up at this speed, m/s, scattered by this much. */
const VENT_UP = 0.3;
const VENT_THROW = 1.5;
const SCATTER = 0.4;
/** Flames stand this high off the floor, m. */
const FLAME_UP = 0.2;
/** Seeds of the scatter. */
const FIRE_SEED = 'fire';
const SCATTER_SEED = 100;

let seats: Map<number, FireSeat> | null = null;

/** Where a fire in space `space` (the plan's place) is seen. */
export function fireSeat(space: number): FireSeat {
  seats ??= new Map();
  const known = seats.get(space);
  if (known) return known;
  const plan = shipPlan(), s: Space = plan.spaces[space]!;
  const along = (s.aft + s.fore) / 2, across = (s.port + s.starboard) / 2;
  const floor = floorsUnder(plan, along, across).find((f) => f.space === s)?.floor ?? weatherDeck(along, across);
  // Her weather deck's openings, the nearest along her (a fire on the open deck vents where it is).
  const vents = openingsOn(plan, 'weather');
  const near = s.level === 'weather' ? null : vents.reduce<(typeof vents)[number] | null>((best, o) => (!best || Math.abs((o.aft + o.fore) / 2 - along) < Math.abs((best.aft + best.fore) / 2 - along) ? o : best), null);
  const vent = near ? (() => {
    const va = (near.aft + near.fore) / 2, vx = (near.port + near.starboard) / 2;
    return [vx, shipY(weatherDeck(va, vx) + near.coaming + VENT_UP), shipZ(va)] as const;
  })() : null;
  const seat: FireSeat = { floor: [across, shipY(floor + FLAME_UP), shipZ(along)], reach: [(s.fore - s.aft) / 2, (s.starboard - s.port) / 2], vent };
  seats.set(space, seat);
  return seat;
}

/** Each ship's fires poured into the smoke's ring as they burn. */
export class FireView {
  /** The share of a puff owed by each ship's fire and kind, carried from frame to frame, and the clock when each last poured. */
  private readonly owed = new Map<string, number>();
  private readonly poured = new Map<string, number>();
  private readonly at: [number, number, number] = [0, 0, 0];

  constructor(private readonly smoke: SmokeView) {}

  /** Once a frame: ship `ship`'s `fires` as she lies (`pose`) at the clock's `t`. */
  burn(ship: number, fires: readonly Fire[], pose: ShipPose, t: number): void {
    for (const f of fires) {
      const seat = fireSeat(f.space), reach = Math.sqrt(Math.min(1, f.size));
      const onFloor = (rng: Rng): [number, number, number] => [
        seat.floor[0] + (rng.float() - 1 / 2) * 2 * seat.reach[1] * reach, seat.floor[1], seat.floor[2] + (rng.float() - 1 / 2) * 2 * seat.reach[0] * reach,
      ];
      this.pourFire(ship, f, 'flames', FLAMES, 'flame', f.size, t, pose, onFloor);
      this.pourFire(ship, f, 'soot', SOOT, 'soot', f.size, t, pose, onFloor);
      const vent = seat.vent;
      if (!vent) continue;
      const atVent = (rng: Rng): [number, number, number] => [vent[0] + (rng.float() - 1 / 2) * SCATTER, vent[1], vent[2] + (rng.float() - 1 / 2) * SCATTER];
      this.pourFire(ship, f, 'vent soot', VENT_SOOT, 'soot', f.size, t, pose, atVent, VENT_THROW);
      if (f.size >= FLAMES_OUT) this.pourFire(ship, f, 'vent flames', VENT_FLAMES, 'flame', f.size, t, pose, atVent, VENT_THROW);
    }
  }

  /**
   * The puffs of one kind a fire owes since it last poured, each placed by `where` (ship space) and set going in the
   * world, born when it was due. A fire seen for the first time (a match joined while it burns, `?scars`), or after
   * the clock jumped, has burnt meanwhile: what it poured in the last life of its puffs is poured now as born then, so
   * its smoke already stands down the wind (from where she is now).
   */
  private pourFire(ship: number, f: Fire, name: string, k: Pour, kind: FirePuff['kind'], size: number, t: number, pose: ShipPose, where: (rng: Rng) => [number, number, number], up = 0): void {
    const key = `${ship}:${f.space}:${name}`, rate = k.rate * size;
    const from = Math.max(this.poured.get(key) ?? -Infinity, t - k.life[1]);
    this.poured.set(key, t);
    if (!(t > from)) return;
    // Puffs owed are due one every 1 / rate s: the first after `from` a fraction carried from before.
    let owed = (this.owed.get(key) ?? 0) + rate * (t - from);
    const n = Math.floor(owed);
    owed -= n;
    this.owed.set(key, owed);
    for (let i = 0; i < n; i++) this.emit(ship, f, name, k, kind, t - (owed + n - 1 - i) / rate, pose, where, up);
  }

  /** One puff born at `born`, seeded by when (with the ship, the space and its kind), so every machine scatters alike. */
  private emit(ship: number, f: Fire, name: string, k: Pour, kind: FirePuff['kind'], born: number, pose: ShipPose, where: (rng: Rng) => [number, number, number], up: number): void {
    const rng = new Rng(deriveSeed(ship, FIRE_SEED, f.space, name, Math.round(born * MS_PER_SECOND)));
    const [x, y, z] = where(rng);
    toWorld(pose, x, y, z, this.at);
    this.smoke.pourPuff({
      kind, at: this.at, t: born, throwing: [(rng.float() - 1 / 2) * SCATTER, up * (1 / 2 + rng.float()), (rng.float() - 1 / 2) * SCATTER],
      radius: rng.range(k.radius[0], k.radius[1]), life: rng.range(k.life[0], k.life[1]), density: k.density, rise: rng.range(k.rise[0], k.rise[1]), seed: rng.float() * SCATTER_SEED,
    });
  }
}

/** How one kind of puff is poured: a second at full size, lives, first radii, density, rises. */
interface Pour {
  readonly rate: number;
  readonly life: readonly [number, number];
  readonly radius: readonly [number, number];
  readonly density: number;
  readonly rise: readonly [number, number];
}
/** Milliseconds in a second (the seed's moment). */
const MS_PER_SECOND = 1000;
