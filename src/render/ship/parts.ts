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

  /** The parts of a zone, made on first use. */
  zone(name: string): ZoneParts {
    let z = this.zones.get(name);
    if (!z) { z = new ZoneParts(); this.zones.set(name, z); }
    return z;
  }

  get triangles(): number {
    let n = 0;
    for (const z of this.zones.values()) n += z.triangles;
    for (const d of this.doors) n += d.wood.triangles + d.iron.triangles;
    return n;
  }
}
