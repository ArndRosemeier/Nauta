/**
 * Her fittings drawn as instances (plan N2.6, render/ship/furnishings.ts) with her own materials: the instances are
 * placed in her moving frame (`@futuremagic/instances` frames), and this matrix takes them from the world back into
 * her frame, so the materials see ship space as on her hull and decks (the light below deck, grain, wear) and the
 * draws' group, posed by her, takes them out to the world again. Written each frame by `Furnishings.update`.
 */
import { Matrix4, type NodeMaterial } from 'three/webgpu';
import { uniform } from 'three/tsl';
import { geometryInstancing } from '@futuremagic/instances/node';

/** From the world into her frame (the inverse of her pose). */
export const TO_SHIP = uniform(new Matrix4());

/** One of her materials made to draw instances in her frame. */
export function fitted<M extends NodeMaterial>(material: M): M {
  geometryInstancing(material, TO_SHIP);
  return material;
}
