/**
 * Vertices gathered on the CPU and handed to the GPU as one indexed geometry: what the ship's solids (solid.ts) and
 * her ropes (rope.ts) have in common. The ship is built in a worker (shipWorker.ts), so what is gathered is packed
 * into typed arrays (`packed`), sent across, and made into a geometry on the page (`geometryOf`).
 */
import { BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute } from 'three/webgpu';

/** Corners per triangle. */
const CORNERS = 3;

/** A mesh's vertices and triangles as typed arrays, ready to be sent from a worker and drawn. */
export interface Packed {
  readonly attributes: readonly { readonly name: string; readonly size: number; readonly data: Float32Array }[];
  readonly index: Uint32Array;
  /** The runs of `index` drawn for a named piece (`Gathered.tagged`): its name, where it starts and ends (index places). */
  readonly runs?: readonly Run[];
}

/** A run of a mesh's index drawn for one named piece (a spar that can fall, plan N6.5): [name, from, to]. */
export type Run = readonly [string, number, number];

/** One mesh's vertex arrays, named as the kind's attributes, with their numbers per vertex, and its triangles. */
export class Gathered {
  readonly idx: number[] = [];
  /** The runs drawn for named pieces. */
  private readonly runs: Run[] = [];
  /** Each attribute's name, numbers per vertex and numbers. */
  private readonly arrays: [string, number, number[]][] = [];

  /** A new attribute's array: `name` as the kind reads it, `size` numbers per vertex. */
  protected array(name: string, size: number): number[] {
    const data: number[] = [];
    this.arrays.push([name, size, data]);
    return data;
  }

  get triangles(): number { return this.idx.length / CORNERS; }

  /** What `draw` gathers here, named `name` (a spar of hers that can fall, plan N6.5: the triangles can be told apart later). */
  tagged<T>(name: string, draw: () => T): T {
    const from = this.idx.length, out = draw();
    if (this.idx.length > from) this.runs.push([name, from, this.idx.length]);
    return out;
  }

  /** The vertices as typed arrays (what a worker sends). */
  packed(): Packed {
    return {
      attributes: this.arrays.map(([name, size, data]) => ({ name, size, data: new Float32Array(data) })),
      index: new Uint32Array(this.idx),
      ...(this.runs.length ? { runs: [...this.runs] } : {}),
    };
  }

  /** The vertices as a geometry with the kind's attributes. */
  geometry(): BufferGeometry {
    return geometryOf(this.packed());
  }
}

/** Geometries made from packed arrays: both ships drawn from one build share them (plan N3.8), so her buffers are on the GPU once. */
const made = new WeakMap<Packed, BufferGeometry>();

/** The typed arrays (gathered here or in a worker) as a geometry; the same arrays give the same geometry. */
export function geometryOf(p: Packed): BufferGeometry {
  const known = made.get(p);
  if (known) return known;
  const g = new BufferGeometry();
  made.set(p, g);
  for (const a of p.attributes) g.setAttribute(a.name, new Float32BufferAttribute(a.data, a.size));
  g.setIndex(new Uint32BufferAttribute(p.index, 1));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** Triangles of packed vertices. */
export const packedTriangles = (p: Packed): number => p.index.length / CORNERS;
