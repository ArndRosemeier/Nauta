/**
 * The fittings made in AssetGenerator (assets/specs: prop_carronade_32, prop_deadeye, prop_belaying_pin,
 * prop_horn_lantern), packed with their ambient occlusion baked into the vertices (`ag.py pack --slots`, served as
 * public/ship/fittings.fmpk) and placed into her solids: each material slot goes to the kind that draws it, the baked
 * occlusion taken out of the colour into the solids' own.
 */
import { Matrix3, Matrix4, Vector3 } from 'three/webgpu';
import { decodePack, type PropModel } from '@futuremagic/props';
import type { Finish, Solid } from './solid';

/** Where the pack is served, under the page's base. */
export const FITTINGS_URL = 'ship/fittings.fmpk';

/** The packed models by name. */
export type Fittings = ReadonlyMap<string, PropModel>;

export async function loadFittings(base: string): Promise<Fittings> {
  const res = await fetch(`${base}${FITTINGS_URL}`);
  if (!res.ok) throw new Error(`the ship's fittings did not load (${res.status})`);
  return decodePack(new Uint8Array(await res.arrayBuffer()));
}

/** Which solid each material slot of a fitting goes into, and how its surface is finished there (paint 1: the packed colour is the surface). */
export interface SlotTarget {
  readonly solid: Solid;
  readonly paint: number;
  /** The colour to use in place of the packed one (a fitting painted to match her). */
  readonly rgb?: Finish['rgb'];
  /**
   * Each vertex keeps its packed colour (the spec's patterns, wear and baked shade) as its finish, instead of its
   * slot's one colour with the shade taken out into the solids' occlusion.
   */
  readonly own?: boolean;
}

const p = new Vector3(), n = new Vector3();
/** Numbers per vertex position. */
const XYZ = 3;

/**
 * Model `name` placed by `frame` (model space to ship space) into the solids `slots` names. The grain runs along
 * the model's longest axis. Slots without a target are left out.
 */
export function place(fittings: Fittings, name: string, frame: Matrix4, slots: Readonly<Record<string, SlotTarget>>, seed = 0): void {
  const m = fittings.get(name);
  if (!m) throw new Error(`the fittings pack has no ${name}`);
  const size = [m.max[0] - m.min[0], m.max[1] - m.min[1], m.max[2] - m.min[2]];
  const along = size.indexOf(Math.max(...size)), across = (along + 1) % XYZ;
  const normalM = new Matrix3().getNormalMatrix(frame);
  const count = m.positions.length / XYZ;
  // The pack bakes ambient occlusion into its colours: each slot's brightest colour is its own, unshaded, and how much
  // darker a vertex is, is its occlusion (which the kinds apply to the sky's light only, as it should be).
  const lum = (i: number) => m.colors[i * XYZ]! + m.colors[i * XYZ + 1]! + m.colors[i * XYZ + 2]!;
  const brightest = new Map<number, number>();
  for (let i = 0; i < count; i++) {
    const s = m.slots[i]!, b = brightest.get(s);
    if (b === undefined || lum(i) > lum(b)) brightest.set(s, i);
  }
  // Each slot's vertices are renumbered into the solid they go to.
  const remap = new Int32Array(count).fill(-1);
  for (let i = 0; i < count; i++) {
    const target = slots[m.slotNames[m.slots[i]!] ?? ''];
    if (!target) continue;
    p.fromArray(m.positions, i * XYZ);
    const u = p.getComponent(along), v = p.getComponent(across);
    p.applyMatrix4(frame);
    n.fromArray(m.normals, i * XYZ).applyMatrix3(normalM).normalize();
    const top = target.own ? i : brightest.get(m.slots[i]!)!;
    const f: Finish = { rgb: target.rgb ?? [m.colors[top * XYZ]!, m.colors[top * XYZ + 1]!, m.colors[top * XYZ + 2]!], paint: target.paint, seed };
    remap[i] = target.solid.vertex(p, n, f, u, v, target.own || lum(top) <= 0 ? 1 : lum(i) / lum(top));
  }
  for (let t = 0; t < m.indices.length; t += XYZ) {
    const a = m.indices[t]!, b = m.indices[t + 1]!, c = m.indices[t + 2]!;
    const sa = slots[m.slotNames[m.slots[a]!] ?? ''];
    if (!sa || remap[a]! < 0 || remap[b]! < 0 || remap[c]! < 0) continue;
    sa.solid.tri(remap[a]!, remap[b]!, remap[c]!);
  }
}
