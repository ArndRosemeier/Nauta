/** Textures that tile across a surface: repeated both ways, mipmapped, filtered along a pixel's long side. */
import { LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, type Texture } from 'three/webgpu';

/** Makes `t` tile: repeat both ways, trilinear mipmaps, `anisotropy` samples along a pixel's long side at a grazing angle. */
export function tiling<T extends Texture>(t: T, anisotropy: number): T {
  t.wrapS = t.wrapT = RepeatWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = anisotropy;
  return t;
}
