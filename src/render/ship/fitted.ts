/**
 * Her fittings drawn as instances (plan N2.6, render/ship/furnishings.ts) with her own materials: the instances are
 * placed in her moving frame (`@futuremagic/instances` frames), and this matrix takes them from the world back into
 * her frame, so the materials see ship space as on her hull and decks (the light below deck, grain, wear) and the
 * draws' group, posed by her, takes them out to the world again. Written each frame by `Furnishings.update`, one matrix per ship.
 */
import { Matrix4, type NodeMaterial } from 'three/webgpu';
import { uniform } from 'three/tsl';
import { geometryInstancing } from '@futuremagic/instances/node';

/** No fittings' frame given: the world's own. */
const NONE = new Matrix4();

/**
 * From the world into the frame of the ship a fitting stands on (the inverse of her pose): each ship's fittings carry
 * their own (`userData.fromWorld`, furnishings.ts), so both ships' draw with the same shaders (plan N3.8).
 */
export const TO_SHIP = uniform(new Matrix4()).onObjectUpdate(({ object }) => (object?.userData.fromWorld as Matrix4 | undefined) ?? NONE);

/** One of her materials made to draw instances in her frame. */
export function fitted<M extends NodeMaterial>(material: M): M {
  geometryInstancing(material, TO_SHIP);
  return material;
}
