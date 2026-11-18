/**
 * What drawn things hold in memory: the bytes of their geometry's vertex, morph and index buffers (the HUD, the plan's
 * notes, the crew trial). A buffer shared by several meshes is counted once (`seen` across calls).
 */
import type { BufferGeometry, Object3D } from 'three/webgpu';

/** Bytes of the buffers of every mesh under `root`, each counted once among those in `seen`. */
export function geometryBytes(root: Object3D, seen: Set<ArrayBufferLike | ArrayBufferView> = new Set()): number {
  let n = 0;
  root.traverse((o) => {
    const g = (o as { geometry?: BufferGeometry }).geometry;
    if (!g) return;
    for (const a of [...Object.values(g.attributes), ...Object.values(g.morphAttributes).flat(), g.index]) {
      const array = a && 'array' in a ? (a.array as ArrayBufferView) : null;
      if (array && !seen.has(array)) { seen.add(array); n += array.byteLength; }
    }
  });
  return n;
}
