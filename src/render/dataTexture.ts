/**
 * A data texture made ready to sample: how it is filtered (each texel read alone, or blended with its neighbours) and
 * uploaded on first use. One place for the ship's maps and tables (shipMaterials.ts, sailMaterial.ts, hullNode.ts).
 */
import type { DataTexture, MagnificationTextureFilter } from 'three/webgpu';

/** `t` filtered by `filter` both near and far, and uploaded on first use. */
export function filtered(t: DataTexture, filter: MagnificationTextureFilter): DataTexture {
  t.magFilter = filter;
  t.minFilter = filter;
  t.needsUpdate = true;
  return t;
}
