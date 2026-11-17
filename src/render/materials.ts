/**
 * Every material the game draws with, as a closed list of kinds (docs/SHADERS.md): the Stage compiles each one
 * behind the loading screen, so nothing compiles while the game is drawn. The registry is @futuremagic/stage's
 * `Kinds`, the one MasterWorld uses too.
 */
import { Float32BufferAttribute, MeshStandardNodeMaterial, type BufferGeometry, type Material } from 'three/webgpu';
import { makeSkyNode } from '@futuremagic/sky/node';
import { Kinds, type Kind } from '@futuremagic/stage';
import { SEA_TILE_ATTRIBUTE, SEA_TILE_STRIDE, makeSeaMaterial } from './seaMaterial';

/** Vertices of the Stage's stand-in mesh (one triangle). */
const STAND_IN_VERTICES = 3;

const kinds = new Kinds();
/** Neither casts nor receives the sun's shadow. */
const NO_SHADOW = { cast: false, receive: false };

/** A kind: its name, the vertex attributes its meshes carry, and its one shared material (built on first use). */
export const defineKind = kinds.define.bind(kinds);

/** Sets an attribute of the game's own kinds on the Stage's stand-in of 3 vertices (StageOptions.attribute). */
export function standInAttribute(g: BufferGeometry, name: string): boolean {
  if (name !== SEA_TILE_ATTRIBUTE) return false;
  g.setAttribute(name, new Float32BufferAttribute(new Float32Array(STAND_IN_VERTICES * SEA_TILE_STRIDE), SEA_TILE_STRIDE));
  return true;
}

/** Every kind defined, for the Stage's warm-up. */
export const allKinds = (): readonly Kind[] => kinds.all();

/** The sky dome (a unit box on the camera, drawn at the far plane). */
export const SKY = defineKind('sky', ['position', 'normal', 'uv'], () => makeSkyNode({ reversed: true }).material as Material, NO_SHADOW);

/** How rough the test bodies are (matte, like painted wood and canvas). */
const TEST_ROUGHNESS = 0.85;
/**
 * The light rig's test bodies (`?rig`): plain matte surfaces whose albedo is their vertex colour, so the light on
 * a known albedo can be judged through the day (render/testBodies.ts).
 */
export const TEST_BODY = defineKind('test body', ['position', 'normal', 'color'], () => new MeshStandardNodeMaterial({ vertexColors: true, roughness: TEST_ROUGHNESS, metalness: 0 }), NO_SHADOW);
/**
 * The sea's surface: tiles of one grid around the eye, displaced by the simulated waves (seaView.ts). Its meshes are
 * drawn many at once, which three builds another shader for, so the warm-up builds the sea's own mesh too (main.ts).
 */
export const SEA = defineKind('sea', ['position', SEA_TILE_ATTRIBUTE], makeSeaMaterial, NO_SHADOW);
