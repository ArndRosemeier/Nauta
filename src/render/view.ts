/** The one renderer, scene and camera, and the Stage everything enters the scene through (docs/SHADERS.md). */
import { DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, Vector2, type WebGPURenderer } from 'three/webgpu';
import { Stage, createPost, createRenderer, type Post, type PostOptions } from '@futuremagic/stage';
import { allKinds, standInAttribute } from './materials';
import { shadowingSun } from './ship/shipView';
import { DEGREE } from '../sim/units';

/** The view's vertical angle, degrees. */
const FOV = 60;
/** The nearest and farthest the camera draws, metres: a rail under the hand, and the sky's dome. */
const NEAR = 0.2;
const FAR = 120000;
/** Samples a pixel of the scene drawn into the post chain's target: as many as the canvas's own multisampling. */
const MULTISAMPLES = 4;

export interface View {
  readonly renderer: WebGPURenderer;
  readonly backend: 'webgpu';
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly stage: Stage;
  /** The sun (or moon) and the hemisphere light (the ground's bounce): the sky's light rig sets both each frame. */
  readonly sun: DirectionalLight;
  readonly hemi: HemisphereLight;
  /** The view's vertical angle over its height in pixels: what a drag of one pixel turns the look by (magnified as the view is). */
  radPerPixel(): number;
  /** Magnifies the view `power` times (the spyglass, app/glass.ts; 1 the naked eye). */
  magnify(power: number): void;
  /** Draws `scale` of the device's pixels along each side (the quality level's `renderScale`, src/app/quality.ts). */
  setRenderScale(scale: number): void;
  /** The pixels drawn now, width × height. */
  drawnSize(): Vector2;
  /**
   * The post chain the scene is drawn through (`?smoke=half`: into a multisampled target whose depth the smoke reads),
   * or null: the scene drawn straight to the canvas.
   */
  readonly post: Post | null;
  /** Draws the frame; `between`: drawn into the post chain's target after the scene, before its tone curve (with a chain only). */
  draw(between?: () => void): void;
}

/** The camera stands at zero until the caller places it. */
/**
 * `shadows`: the sun casts shadows (a ship is drawn); `veil`: the scene is drawn through the post chain, into a target
 * multisampled as the canvas is, with no edge filter after, and `veil` laid over it before the tone curve (the smoke's
 * half-resolution trial, halfSmoke.ts). Both decided before the
 * warm-up: they are part of every shader's key.
 */
export async function createView(canvas: HTMLCanvasElement, shadows = false, veil?: PostOptions['veil']): Promise<View> {
  // WebGPU only: the fine sea is computed on the GPU (plan N1.2). A browser without it gets a plain page (main.ts).
  const { renderer } = await createRenderer(canvas, { backends: 'webgpu', depth: 'reversed', tone: 'agx' });
  const backend = 'webgpu' as const;
  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, NEAR, FAR);
  camera.rotation.order = 'YXZ';
  // Lights are fixed before the warm-up: their number and order are part of every lit shader's key.
  const sun = new DirectionalLight(), hemi = new HemisphereLight();
  scene.add(sun, sun.target, hemi);
  if (shadows) {
    renderer.shadowMap.enabled = true;
    shadowingSun(sun);
  }
  const chain = veil ? createPost(renderer, scene, camera, { samples: MULTISAMPLES, fxaa: false, veil }) : null;
  const stage = new Stage(renderer, scene, camera, {
    kinds: allKinds, attribute: standInAttribute, ...(chain ? { target: () => chain.target(), draw: () => chain.draw() } : {}),
  });
  if (shadows) stage.shadowCamera = sun.shadow.camera;
  const fit = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  fit();
  new ResizeObserver(fit).observe(canvas);
  // The device's pixels per CSS pixel as the Stage capped them: the render scale is a share of these.
  const devicePixels = renderer.getPixelRatio(), drawn = new Vector2();
  let power = 1;
  return {
    renderer, backend, scene, camera, stage, sun, hemi,
    radPerPixel: () => (FOV * DEGREE) / power / Math.max(1, canvas.clientHeight),
    magnify: (p) => {
      if (p === power) return;
      power = p;
      // The view's half angle's tangent shrinks by the power: what was a degree off the middle fills `power` degrees.
      camera.fov = (2 * Math.atan(Math.tan((FOV * DEGREE) / 2) / p)) / DEGREE;
      camera.updateProjectionMatrix();
    },
    setRenderScale: (scale) => renderer.setPixelRatio(devicePixels * scale),
    drawnSize: () => renderer.getDrawingBufferSize(drawn),
    post: chain,
    draw: (between) => (chain ? chain.draw(between ? { between } : undefined) : renderer.render(scene, camera)),
  };
}
