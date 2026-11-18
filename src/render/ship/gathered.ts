/**
 * Vertices gathered on the CPU and handed to the GPU as one indexed geometry: what the ship's solids (solid.ts) and
 * her ropes (rope.ts) have in common.
 */
import { BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute } from 'three/webgpu';

/** Corners per triangle. */
const CORNERS = 3;

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

  /** The vertices as a geometry with the kind's attributes. */
  geometry(): BufferGeometry {
    const g = new BufferGeometry();
    for (const [name, size, data] of this.arrays) g.setAttribute(name, new Float32BufferAttribute(data, size));
    g.setIndex(new Uint32BufferAttribute(this.idx, 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}
