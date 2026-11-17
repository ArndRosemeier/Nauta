/**
 * Every material the game draws with, as a closed list of kinds (docs/SHADERS.md): the Stage compiles each one
 * behind the loading screen, so nothing compiles while the game is drawn.
 */
import type { Material } from 'three/webgpu';
import { makeSkyNode } from '@futuremagic/sky/node';
import type { StageKind } from '@futuremagic/stage';

const kinds = new Map<string, StageKind>();

/** A kind: its name, the vertex attributes its meshes carry, and its one shared material (built on first use). */
export function defineKind(name: string, attributes: readonly string[], build: () => Material, shadow = { cast: true, receive: true }): StageKind {
  if (kinds.has(name)) throw new Error(`material kind "${name}" defined twice`);
  let made: Material | null = null;
  const kind: StageKind = { name, attributes, shadow, make: () => (made ??= Object.assign(build(), { name })) };
  kinds.set(name, kind);
  return kind;
}

/** Every kind defined, for the Stage's warm-up. */
export const allKinds = (): readonly StageKind[] => [...kinds.values()];

/** The sky dome (a unit box on the camera, drawn at the far plane). */
export const SKY = defineKind('sky', ['position', 'normal', 'uv'], () => makeSkyNode({ reversed: true }).material as Material, { cast: false, receive: false });
