/**
 * Water rising in her, drawn (plan N6.5): the sea she has taken in (`Damage.flooded`, both halves) lies in her as one
 * surface, level with the world however she heels and pitches, at the height the simulation's measure of her inside
 * gives it (sim/damage/flood.ts `lyingOf`), out to the inside of her sides at the height it meets them. Under her
 * floors it is hidden; once it rises over the hold's floor it is seen there, then on her berth deck, and it runs to
 * her low side as she rolls.
 *
 * One mesh a ship, a grid along her and across her inside, its heights worked out on the page each frame it shows;
 * drawn with her iron's kind in bilge water's colour (dark, a little gloss), so no shader is compiled for it. Pure but
 * for three's maths, but for `WaterInside`, which owns the mesh.
 */
import { BufferGeometry, Float32BufferAttribute, Mesh, Uint32BufferAttribute, type Vector3 } from 'three/webgpu';
import { lyingOf } from '../../sim/damage/flood';
import { HULL_AFT, HULL_FORE, weatherDeck } from '../../sim/ship/hull';
import { insideBreadth } from '../../sim/ship/plan';
import { LOAD_WATERLINE } from '../../sim/rules/ships';
import { shipY, shipZ } from '../../sim/ship/section';
import { SHIP_IRON } from '../materials';
import { SOLID_STRIDES } from './solid';
import type { Kind } from '@futuremagic/stage';

/** The grid: stations along her and columns across her inside. */
const STATIONS = 72;
const COLUMNS = 10;
/** Times the edge is found again at the height the surface meets it (the surface slopes in her when she heels). */
const EDGE_PASSES = 3;
/** Less water than this is not drawn, t (it lies in her limbers, under everything). */
const LEAST_TONNES = 1;
/** It lies this far under her weather deck at most, m (water over it is the sea's). */
const UNDER_DECK = 0.05;
/** Bilge water: dark, brown-green with the dirt of her hold (linear RGB). */
const BILGE = [0.05, 0.055, 0.035] as const;
/** Numbers per position. */
const XYZ = 3;

/** Vertices in the grid. */
export const WATER_VERTICES = (STATIONS + 1) * (COLUMNS + 1);

/**
 * The water's surface in her (ship space) for `tonnes` in her, `up` the world's up in ship space: into `out`, a grid
 * of (STATIONS + 1) × (COLUMNS + 1) points, station by station from aft, each larboard to starboard. False: none to draw.
 */
export function waterSurface(tonnes: number, up: Vector3, out: Float32Array): boolean {
  if (!(tonnes >= LEAST_TONNES) || !(up.y > 0)) return false;
  const lie = lyingOf(tonnes), cy = shipY(lie.level), cz = shipZ(lie.along);
  // The surface: through her middle line at its level, square to the world's up.
  const yAt = (x: number, z: number) => cy - (up.x * x + up.z * (z - cz)) / up.y;
  const hAt = (x: number, z: number, along: number) => Math.min(yAt(x, z) + LOAD_WATERLINE, weatherDeck(along, x) - UNDER_DECK);
  for (let i = 0; i <= STATIONS; i++) {
    const along = HULL_AFT + ((HULL_FORE - HULL_AFT) * i) / STATIONS, z = shipZ(along);
    // Each side's edge: where the sloping surface meets the inside of her side.
    const edge = (side: number) => {
      let x = 0;
      for (let k = 0; k < EDGE_PASSES; k++) x = side * insideBreadth(along, hAt(x, z, along));
      return x;
    };
    const port = edge(-1), starboard = edge(1);
    for (let j = 0; j <= COLUMNS; j++) {
      const x = port + ((starboard - port) * j) / COLUMNS, k = (i * (COLUMNS + 1) + j) * XYZ;
      out[k] = x; out[k + 1] = hAt(x, z, along) - LOAD_WATERLINE; out[k + 2] = z;
    }
  }
  return true;
}

/**
 * A mesh of one of her kinds whose vertices are written on the page (the water in her, what floats after): never
 * culled (its bounds move), casting no shadow, hidden until there is something to show.
 */
export function unshownMesh(g: BufferGeometry, kind: Kind, name: string): Mesh {
  const m = new Mesh(g, kind.make());
  m.name = name;
  m.frustumCulled = false;
  m.castShadow = false;
  m.receiveShadow = kind.shadow.receive;
  m.visible = false;
  return m;
}

/** The water in one ship: its mesh (in her space, a child of her group), kept up with her damage and her heel. */
export class WaterInside {
  readonly mesh: Mesh;
  private readonly positions: Float32BufferAttribute;
  private readonly normals: Float32BufferAttribute;

  constructor() {
    const g = new BufferGeometry(), n = WATER_VERTICES;
    this.positions = new Float32BufferAttribute(new Float32Array(n * XYZ), XYZ);
    this.normals = new Float32BufferAttribute(new Float32Array(n * XYZ), XYZ);
    g.setAttribute('position', this.positions);
    g.setAttribute('normal', this.normals);
    const finish = new Float32Array(n * SOLID_STRIDES.finish!), grain = new Float32Array(n * SOLID_STRIDES.grain!), shade = new Float32Array(n * SOLID_STRIDES.shade!);
    for (let v = 0; v < n; v++) {
      finish.set(BILGE, v * SOLID_STRIDES.finish!);
      shade[v * SOLID_STRIDES.shade!] = 1;
    }
    g.setAttribute('finish', new Float32BufferAttribute(finish, SOLID_STRIDES.finish!));
    g.setAttribute('grain', new Float32BufferAttribute(grain, SOLID_STRIDES.grain!));
    g.setAttribute('shade', new Float32BufferAttribute(shade, SOLID_STRIDES.shade!));
    const index: number[] = [];
    for (let i = 0; i < STATIONS; i++) {
      for (let j = 0; j < COLUMNS; j++) {
        const a = i * (COLUMNS + 1) + j, b = a + COLUMNS + 1;
        // Facing up: aft to fore is -z, larboard to starboard +x.
        index.push(a, a + 1, b + 1, a, b + 1, b);
      }
    }
    g.setIndex(new Uint32BufferAttribute(index, 1));
    this.mesh = unshownMesh(g, SHIP_IRON, 'water inside');
  }

  /** Once a frame: `tonnes` in her, `up` the world's up in her space. */
  show(tonnes: number, up: Vector3): void {
    const shown = waterSurface(tonnes, up, this.positions.array as Float32Array);
    this.mesh.visible = shown;
    if (!shown) return;
    const nor = this.normals.array as Float32Array;
    for (let v = 0; v < WATER_VERTICES; v++) { nor[v * XYZ] = up.x; nor[v * XYZ + 1] = up.y; nor[v * XYZ + 2] = up.z; }
    this.positions.needsUpdate = this.normals.needsUpdate = true;
  }
}
