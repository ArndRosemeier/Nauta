/**
 * Every material the game draws with, as a closed list of kinds (docs/SHADERS.md): the Stage compiles each one
 * behind the loading screen, so nothing compiles while the game is drawn.
 */
import { Float32BufferAttribute, type BufferGeometry, type Material } from 'three/webgpu';
import { makeSkyNode } from '@futuremagic/sky/node';
import type { StageKind } from '@futuremagic/stage';
import { SEA_TILE_ATTRIBUTE, SEA_TILE_STRIDE, makeSeaMaterial } from './seaMaterial';

/** Vertices of the Stage's stand-in mesh (one triangle). */
const STAND_IN_VERTICES = 3;

const kinds = new Map<string, StageKind>();

/** A kind: its name, the vertex attributes its meshes carry, and its one shared material (built on first use). */
export function defineKind(name: string, attributes: readonly string[], build: () => Material, shadow = { cast: true, receive: true }): StageKind {
  if (kinds.has(name)) throw new Error(`material kind "${name}" defined twice`);
  let made: Material | null = null;
  const kind: StageKind = { name, attributes, shadow, make: () => (made ??= Object.assign(build(), { name })) };
  kinds.set(name, kind);
  return kind;
}

/** Sets an attribute of the game's own kinds on the Stage's stand-in of 3 vertices (StageOptions.attribute). */
export function standInAttribute(g: BufferGeometry, name: string): boolean {
  if (name !== SEA_TILE_ATTRIBUTE) return false;
  g.setAttribute(name, new Float32BufferAttribute(new Float32Array(STAND_IN_VERTICES * SEA_TILE_STRIDE), SEA_TILE_STRIDE));
  return true;
}

/** Every kind defined, for the Stage's warm-up. */
export const allKinds = (): readonly StageKind[] => [...kinds.values()];

/** The sky dome (a unit box on the camera, drawn at the far plane). */
export const SKY = defineKind('sky', ['position', 'normal', 'uv'], () => makeSkyNode({ reversed: true }).material as Material, { cast: false, receive: false });
/**
 * The sea's surface: tiles of one grid around the eye, displaced by the simulated waves (seaView.ts). Its meshes are
 * drawn many at once, which three builds another shader for, so the warm-up builds the sea's own mesh too (main.ts).
 */
export const SEA = defineKind('sea', ['position', SEA_TILE_ATTRIBUTE], makeSeaMaterial, { cast: false, receive: false });
