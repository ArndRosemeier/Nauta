/**
 * Every material the game draws with, as a closed list of kinds (docs/SHADERS.md): the Stage compiles each one
 * behind the loading screen, so nothing compiles while the game is drawn. The registry is @futuremagic/stage's
 * `Kinds`, the one MasterWorld uses too.
 */
import { Float32BufferAttribute, MeshStandardNodeMaterial, type BufferGeometry, type Material } from 'three/webgpu';
import { makeSkyNode } from '@futuremagic/sky/node';
import { Kinds, type Kind } from '@futuremagic/stage';
import { SEA_TILE_ATTRIBUTE, SEA_TILE_STRIDE, makeDeepMaterial, makeSeaMaterial } from './seaMaterial';
import { SOLID_ATTRIBUTES, SOLID_STRIDES } from './ship/solid';
import { ROPE_ATTRIBUTES, ROPE_STRIDES } from './ship/rope';
import { DROP_ATTRIBUTE, DROP_STRIDE, FLING_ATTRIBUTE, makeSprayMaterial } from './spray';
import { BALL_FROM, BALL_TO, BIT_ATTRIBUTE, BIT_FLING, BIT_LOOK, BIT_STRIDE, makeBallMaterial, makeGunfireMaterial } from './gunfire';
import { PUFF_ATTRIBUTE, PUFF_LOOK, PUFF_STRIDE, PUFF_THROW, makeSmokeMaterial } from './smoke';
import { SAIL_ATTRIBUTES, SAIL_STRIDES } from './ship/sailGrid';
import { makeSailMaterial } from './ship/sailMaterial';
import { makeCopperMaterial, makeGlowMaterial, makeIronMaterial, makeRopeMaterial, makeWoodMaterial } from './ship/shipMaterials';
import { fitted } from './ship/fitted';

/** Vertices of the Stage's stand-in mesh (one triangle). */
const STAND_IN_VERTICES = 3;

const kinds = new Kinds();
/** Neither casts nor receives the sun's shadow. */
const NO_SHADOW = { cast: false, receive: false };

/** A kind: its name, the vertex attributes its meshes carry, and its one shared material (built on first use). */
export const defineKind = kinds.define.bind(kinds);

/** Numbers per vertex of the game's own attributes. */
const STRIDES: Readonly<Record<string, number>> = {
  [SEA_TILE_ATTRIBUTE]: SEA_TILE_STRIDE, [DROP_ATTRIBUTE]: DROP_STRIDE, [FLING_ATTRIBUTE]: DROP_STRIDE,
  [BIT_ATTRIBUTE]: BIT_STRIDE, [BIT_FLING]: BIT_STRIDE, [BIT_LOOK]: BIT_STRIDE, [BALL_FROM]: BIT_STRIDE, [BALL_TO]: BIT_STRIDE,
  [PUFF_ATTRIBUTE]: PUFF_STRIDE, [PUFF_THROW]: PUFF_STRIDE, [PUFF_LOOK]: PUFF_STRIDE, ...SOLID_STRIDES, ...ROPE_STRIDES, ...SAIL_STRIDES,
};

/** Sets an attribute of the game's own kinds on the Stage's stand-in of 3 vertices (StageOptions.attribute). */
export function standInAttribute(g: BufferGeometry, name: string): boolean {
  const stride = STRIDES[name];
  if (!stride) return false;
  g.setAttribute(name, new Float32BufferAttribute(new Float32Array(STAND_IN_VERTICES * stride), stride));
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
/** Spray thrown from her bow (spray.ts): quads facing the eye, flown in the vertex stage; drawn as one instanced mesh, which the warm-up builds too (main.ts). */
export const SPRAY = defineKind('spray', ['position', DROP_ATTRIBUTE, FLING_ATTRIBUTE], makeSprayMaterial, NO_SHADOW);
/** Gunfire (gunfire.ts, N5.4a): the flash, first puff and splinters, quads flown in the vertex stage, one instanced mesh the warm-up builds too (main.ts). */
export const GUNFIRE = defineKind('gunfire', ['position', BIT_ATTRIBUTE, BIT_FLING, BIT_LOOK], makeGunfireMaterial, NO_SHADOW);
/** Shot in flight (gunfire.ts): a streak per ball, one instanced mesh. */
export const SHOT_IN_FLIGHT = defineKind('shot in flight', ['position', BALL_FROM, BALL_TO], makeBallMaterial, NO_SHADOW);
/** Powder smoke (smoke.ts, N5.5): big puffs poured from the ports, drifting with the wind, one instanced mesh the warm-up builds too (main.ts). */
export const SMOKE = defineKind('smoke', ['position', PUFF_ATTRIBUTE, PUFF_THROW, PUFF_LOOK], makeSmokeMaterial, NO_SHADOW);
/** The deep around an eye under water (seaView.ts): a sphere about the eye in the murk's colour. */
export const DEEP = defineKind('deep water', ['position', 'normal', 'uv'], makeDeepMaterial, NO_SHADOW);

/** Casts the sun's shadow and receives it. */
const SHADOWED = { cast: true, receive: true };
/** Receives the sun's shadow only (it lies where nothing it would shade is seen). */
const RECEIVES = { cast: false, receive: true };
/** The ship's timber, bare and painted: all of it one mesh, one draw (render/ship/shipMaterials.ts). */
export const SHIP_WOOD = defineKind('ship wood', SOLID_ATTRIBUTES, () => makeWoodMaterial(), SHADOWED);
/** Her iron: guns, hoops, chain plates, bolts, the lantern's tin. */
export const SHIP_IRON = defineKind('ship iron', SOLID_ATTRIBUTES, () => makeIronMaterial(), SHADOWED);
/** The copper sheathing below her waterline. */
export const SHIP_COPPER = defineKind('ship copper', SOLID_ATTRIBUTES, () => makeCopperMaterial(), RECEIVES);
/** The lantern's horn and candle, lit from within. */
export const SHIP_GLOW = defineKind('ship glow', SOLID_ATTRIBUTES, makeGlowMaterial, NO_SHADOW);
/** Her timber, iron and copper as a crossfade between levels of detail draws them: dithered by each mesh's share (shipView.ts). */
export const SHIP_WOOD_FADING = defineKind('ship wood fading', SOLID_ATTRIBUTES, () => makeWoodMaterial(true), SHADOWED);
export const SHIP_IRON_FADING = defineKind('ship iron fading', SOLID_ATTRIBUTES, () => makeIronMaterial(true), SHADOWED);
export const SHIP_COPPER_FADING = defineKind('ship copper fading', SOLID_ATTRIBUTES, () => makeCopperMaterial(true), RECEIVES);
/** Rope, standing and running: widened to a pixel far off and faded, laid in strands up close. */
export const SHIP_ROPE = defineKind('ship rope', ROPE_ATTRIBUTES, makeRopeMaterial, SHADOWED);
/** Her fittings' timber, iron and lights, drawn as instances in her moving frame (render/ship/furnishings.ts, plan N2.6). */
export const FITTED_WOOD = defineKind('fitted wood', SOLID_ATTRIBUTES, () => fitted(makeWoodMaterial()), SHADOWED);
export const FITTED_IRON = defineKind('fitted iron', SOLID_ATTRIBUTES, () => fitted(makeIronMaterial()), SHADOWED);
export const FITTED_GLOW = defineKind('fitted glow', SOLID_ATTRIBUTES, () => fitted(makeGlowMaterial()), NO_SHADOW);
/**
 * Her sails and flags (plan N3.10): grids shaped on the GPU from each sail's numbers (sailMaterial.ts), canvas and
 * bunting with the light through them; all in one draw. The far ship's crossfade draws them dithered.
 */
export const SHIP_SAILS = defineKind('ship sails', SAIL_ATTRIBUTES, () => makeSailMaterial(), SHADOWED);
export const SHIP_SAILS_FADING = defineKind('ship sails fading', SAIL_ATTRIBUTES, () => makeSailMaterial(true), SHADOWED);
