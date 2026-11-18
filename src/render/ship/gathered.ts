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
}

/** One mesh's vertex arrays, named as the kind's attributes, with their numbers per vertex, and its triangles. */
export class Gathered {
  readonly idx: number[] = [];
  /** Each attribute's name, numbers per vertex and numbers. */
  private readonly arrays: [string, number, number[]][] = [];

  /** A new attribute's array: `name` as the kind reads it, `size` numbers per vertex. */
  protected array(name: string, size: number): number[] {
    const data: number[] = [];
    this.arrays.push([name, size, data]);
    return data;
  }

  get triangles(): number { return this.idx.length / CORNERS; }

  /** The vertices as typed arrays (what a worker sends). */
  packed(): Packed {
    return {
      attributes: this.arrays.map(([name, size, data]) => ({ name, size, data: new Float32Array(data) })),
      index: new Uint32Array(this.idx),
    };
  }

  /** The vertices as a geometry with the kind's attributes. */
  geometry(): BufferGeometry {
    return geometryOf(this.packed());
  }
}

/** The typed arrays (gathered here or in a worker) as a geometry. */
export function geometryOf(p: Packed): BufferGeometry {
  const g = new BufferGeometry();
  for (const a of p.attributes) g.setAttribute(a.name, new Float32BufferAttribute(a.data, a.size));
  g.setIndex(new Uint32BufferAttribute(p.index, 1));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** Triangles of packed vertices. */
export const packedTriangles = (p: Packed): number => p.index.length / CORNERS;
