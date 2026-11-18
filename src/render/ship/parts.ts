/**
 * What the ship's builders write into (plan N2.4): for each zone of her (zones.ts) one solid per material kind and
 * her ropes, so every zone is drawn as a handful of meshes and a zone that cannot be seen is not drawn at all. Doors
 * are their own small pieces, hinged, so the walker (N2.3) can swing them. Lanterns and the openings that let the
 * sky in are kept per zone, for the light below deck.
 */
import { Ropes } from './rope';
import { Solid } from './solid';

/** One zone's meshes, by kind. */
export class ZoneParts {
  readonly wood = new Solid();
  readonly iron = new Solid();
  readonly copper = new Solid();
  readonly glow = new Solid();
  readonly ropes = new Ropes();

  get triangles(): number {
    return this.wood.triangles + this.iron.triangles + this.copper.triangles + this.glow.triangles + this.ropes.triangles;
  }
}

/** A door: its panel built round its hinge (the hinge's axis is the panel's y), where the hinge stands, and the two zones it joins. */
export interface DoorPart {
  readonly id: string;
  readonly wood: Solid;
  readonly iron: Solid;
  /** The hinge's foot, ship space; the panel turns about +y there. */
  readonly hinge: readonly [number, number, number];
  /** The panel's turn about y when shut, rad (it lies in its bulkhead). */
  readonly shut: number;
  /** Which way it swings open: +1 or -1 about y. */
  readonly opens: number;
  readonly zones: readonly [string, string];
}

/** The parts of the whole ship, built at load. */
export class ShipParts {
  readonly zones = new Map<string, ZoneParts>();
  readonly doors: DoorPart[] = [];
  /** The spars that turn (swings.ts), each its own solids in ship space, turned by its frame as drawn. */
  readonly swings = new Map<string, ZoneParts>();

  /** The parts of a turning spar, made on first use. */
  swing(id: string): ZoneParts { return madeIn(this.swings, id); }

  /** The parts of a zone, made on first use. */
  zone(name: string): ZoneParts { return madeIn(this.zones, name); }

  get triangles(): number {
    let n = 0;
    for (const z of this.zones.values()) n += z.triangles;
    for (const d of this.doors) n += d.wood.triangles + d.iron.triangles;
    for (const z of this.swings.values()) n += z.triangles;
    return n;
  }
}

/** The parts under `key` in `map`, made on first use. */
function madeIn(map: Map<string, ZoneParts>, key: string): ZoneParts {
  let z = map.get(key);
  if (!z) { z = new ZoneParts(); map.set(key, z); }
  return z;
}
