/**
 * Every material the game draws with, as a closed list of kinds (docs/SHADERS.md): the Stage compiles each one
 * behind the loading screen, so nothing compiles while the game is drawn. The registry is @futuremagic/stage's
 * `Kinds`, the one MasterWorld uses too.
 */
import { MeshStandardNodeMaterial, type Material } from 'three/webgpu';
import { makeSkyNode } from '@futuremagic/sky/node';
import { Kinds, type Kind } from '@futuremagic/stage';

const kinds = new Kinds();
/** Neither casts nor receives the sun's shadow. */
const NO_SHADOW = { cast: false, receive: false };

/** A kind: its name, the vertex attributes its meshes carry, and its one shared material (built on first use). */
export const defineKind = kinds.define.bind(kinds);

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
