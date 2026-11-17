/** The one renderer, scene and camera, and the Stage everything enters the scene through (docs/SHADERS.md). */
import { PerspectiveCamera, Scene, type WebGPURenderer } from 'three/webgpu';
import { Stage, createRenderer } from '@futuremagic/stage';
import { allKinds } from './materials';

/** The captain's eye above the water for now, metres (a brig's quarterdeck; the ship comes with N2). */
export const EYE_HEIGHT = 4.5;
/** The view's vertical angle, degrees. */
const FOV = 60;

export interface View {
  readonly renderer: WebGPURenderer;
  readonly backend: 'webgpu' | 'webgl2';
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly stage: Stage;
  /** The view's vertical angle over its height in pixels: what a drag of one pixel turns the look by. */
  radPerPixel(): number;
}

export async function createView(canvas: HTMLCanvasElement, forceWebGL: boolean): Promise<View> {
  // WebGPU where the browser has it. WebGL 2 stays as a fallback until the sea needs GPU compute (plan N1).
  const { renderer, backend } = await createRenderer(canvas, { backends: 'webgpu-or-webgl2', forceWebGL, depth: 'reversed', tone: 'agx' });
  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.2, 120000);
  camera.position.set(0, EYE_HEIGHT, 0);
  camera.rotation.order = 'YXZ';
  const stage = new Stage(renderer, scene, camera, { kinds: allKinds });
  const fit = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  fit();
  new ResizeObserver(fit).observe(canvas);
  return { renderer, backend, scene, camera, stage, radPerPixel: () => (FOV * Math.PI) / 180 / Math.max(1, canvas.clientHeight) };
}
