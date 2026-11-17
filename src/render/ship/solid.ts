/**
 * The vertices of the ship's solid parts as her material kinds read them (materials.ts: SHIP_WOOD, SHIP_IRON,
 * SHIP_COPPER, SHIP_GLOW): position and normal in ship space, the paint or tint and how much paint covers the wood
 * (`finish`), the grain's coordinates in metres along and across it with the planks' width (`grain`), and the ambient
 * occlusion the builder knows and how worn an edge is (`shade`). One mesh per kind, so all her timber is one draw.
 */
import type { Vector3 } from 'three/webgpu';
import { Gathered } from './gathered';

/** How a surface is finished. */
export interface Finish {
  /** Paint colour or the wood's tint, linear RGB. */
  readonly rgb: readonly [number, number, number];
  /** How much of the wood the paint covers, 0 (bare, the tint multiplies the grain) to 1 (painted). */
  readonly paint: number;
  /** The width of the planks laid on it, m (their seams are drawn); 0 for one solid piece. */
  readonly plank?: number;
  /** A number that makes this piece's grain its own (each plank and timber looks different). */
  readonly seed?: number;
}

/** Numbers per attribute. */
const XYZ = 3;
const RGBA = 4;
const GRAIN = 4;
const SHADE = 2;

/** One kind's vertices, gathered and turned into a geometry. */
export class Solid extends Gathered {
  readonly pos = this.array('position', XYZ);
  readonly nor = this.array('normal', XYZ);
  readonly col = this.array('finish', RGBA);
  readonly grain = this.array('grain', GRAIN);
  readonly shade = this.array('shade', SHADE);

  get vertices(): number { return this.pos.length / XYZ; }

  /** A vertex: where, facing which way, finished how, its grain coordinates (m), ambient occlusion and edge wear (0..1). */
  vertex(p: Vector3, n: Vector3, f: Finish, u: number, v: number, ao = 1, wear = 0): number {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.col.push(f.rgb[0], f.rgb[1], f.rgb[2], f.paint);
    this.grain.push(u, v, f.plank ?? 0, f.seed ?? 0);
    this.shade.push(ao, wear);
    return this.vertices - 1;
  }

  tri(a: number, b: number, c: number): void { this.idx.push(a, b, c); }
  /** Two triangles; a, b, c, d go round the quad counter-clockwise seen from its front. */
  quad(a: number, b: number, c: number, d: number): void { this.idx.push(a, b, c, a, c, d); }
}

/** The attributes every solid kind's mesh carries (materials.ts). */
export const SOLID_ATTRIBUTES = ['position', 'normal', 'finish', 'grain', 'shade'] as const;
export const SOLID_STRIDES: Readonly<Record<string, number>> = { finish: RGBA, grain: GRAIN, shade: SHADE };
