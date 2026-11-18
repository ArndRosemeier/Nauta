// @ts-nocheck -- three's TSL typings infer vector widths poorly for shader math; checked by rendering it (npm run shot).
/**
 * Powder smoke at half resolution (`?smoke=half`, the design thread's fourth way, plan N5.5): the scene is drawn
 * through the post chain into a target multisampled as the canvas was (4x MSAA kept), so its depth can be read; one
 * small pass brings that depth down to half resolution (the nearest of each 2 × 2), the smoke alone is drawn into a
 * half-resolution target against it (smoke.ts `useSmokeDepth`: no depth buffer, the smoke thins where it meets the
 * scene), and the post chain's tone pass lays it over the scene (its `veil`), blending the four half-resolution texels
 * about each pixel by how near their depth is to the pixel's own, so along the hull and the rigging against the sky the
 * smoke behind her is not smeared over her edge, nor the smoke before her lost.
 *
 * Cost over the main-pass smoke: the scene's colour is a half-float target (4 samples, resolved) instead of the canvas's
 * 8 bits, the tone curve is a pass of its own over the frame, plus the depth halved and the smoke drawn at a quarter of
 * the pixels (the multisampled depth is stored either way: three keeps it unless a target says not to).
 *
 * A trial behind a switch, so its cost and look can be compared on the iPad with the smoke drawn in the main pass.
 */
import { Color, DepthTexture, FloatType, HalfFloatType, NodeMaterial, QuadMesh, RedFormat, RenderTarget, Scene, Vector2, type Camera, type Mesh, type Post, type WebGPURenderer } from 'three/webgpu';
import {
  Fn, abs, float, int, ivec2, max, min, oneMinus, perspectiveDepthToViewZ, screenCoordinate, texture, textureLoad, uniform,
  vec2, vec4,
} from 'three/tsl';

/**
 * The four half-resolution texels about a pixel weighed as bilinear filtering would (its own, its two neighbours toward
 * it, the one across: a quarter texel off its own's middle), and each divided by how far (as a share) its depth is off
 * this pixel's, plus this share: depths closer than about it count alike.
 */
const NEIGHBOUR = [9 / 16, 3 / 16, 3 / 16, 1 / 16] as const;
const ALIKE = 0.02;
/** The smoke's target is cleared to nothing: black, alpha 0. */
const CLEAR = { colour: 0x000000, alpha: 0 };

export class HalfSmoke {
  /** The smoke alone, drawn into the half-resolution target. */
  readonly scene = new Scene();
  /** The scene's depth brought down to half resolution (the nearest of each 2 × 2: depth is reversed, so the largest). */
  readonly depth = new RenderTarget(1, 1, { type: FloatType, format: RedFormat, depthBuffer: false });
  private readonly smoke = new RenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false });
  /** The post chain's scene depth (multisampled), set by readDepthOf. */
  private readonly full = texture(new DepthTexture(1, 1));
  private readonly fullLast = uniform(new Vector2(1, 1));
  private readonly halfLast = uniform(new Vector2(1, 1));
  private readonly near = uniform(1);
  private readonly far = uniform(1);
  private readonly down: QuadMesh;
  private post: Post | null = null;
  private readonly clearColour = new Color();

  constructor() {
    const read = (at) => textureLoad(this.full, ivec2(min(at, this.fullLast)), int(0)).x;
    const m = new NodeMaterial();
    m.name = 'smoke depth halved';
    m.fragmentNode = Fn(() => {
      const p = screenCoordinate.xy.floor().mul(2);
      const d = max(max(read(p), read(p.add(vec2(1, 0)))), max(read(p.add(vec2(0, 1))), read(p.add(vec2(1, 1)))));
      return vec4(d, 0, 0, 1);
    })();
    this.down = new QuadMesh(m);
  }

  /** The tone pass's veil (PostOptions.veil): the half-resolution smoke laid over the scene's colour. */
  over(colour) {
    // The tone pass draws with a camera of its own: the scene camera's near and far come as uniforms.
    const metresAway = (d) => perspectiveDepthToViewZ(d, this.near, this.far).negate();
    return Fn(() => {
      const p = screenCoordinate.xy.floor();
      const here = metresAway(textureLoad(this.full, ivec2(p), int(0)).x);
      // The four half-resolution texels around this pixel: its own and its neighbours toward it.
      const q = p.mul(1 / 2).floor(), toward = p.sub(q.mul(2)).mul(2).sub(1);
      const at = [q, q.add(vec2(toward.x, 0)), q.add(vec2(0, toward.y)), q.add(toward)].map((c) => max(min(c, this.halfLast), vec2(0)));
      const off = at.map((c) => abs(metresAway(textureLoad(this.depth.texture, ivec2(c)).x).sub(here)).div(here));
      // Blended as bilinear filtering would (this pixel lies a quarter texel from its own texel's middle), each texel
      // weighed down as its depth differs from this pixel's: smooth where the depth is alike, and along an edge the smoke
      // comes from the texels on this pixel's side of it.
      const w = off.map((o, k) => float(NEIGHBOUR[k]!).div(o.add(ALIKE)));
      const s = at.map((c, k) => textureLoad(this.smoke.texture, ivec2(c)).mul(w[k]!)).reduce((a, b) => a.add(b))
        .div(w.reduce((a, b) => a.add(b)));
      return vec4(colour.rgb.mul(oneMinus(s.a)).add(s.rgb), colour.a);
    })();
  }

  /** Joins the post chain (its scene target's depth is read): before anything is drawn, as its passes are built for that texture. */
  readDepthOf(post: Post): void {
    this.post = post;
    this.full.value = post.target().depthTexture;
  }

  /** In the post chain's `between`: the depth halved, then the smoke drawn into its half-resolution target. */
  between(renderer: WebGPURenderer, camera: Camera): void {
    const full = this.post!.target(), w = Math.max(1, Math.ceil(full.width / 2)), h = Math.max(1, Math.ceil(full.height / 2));
    if (this.depth.width !== w || this.depth.height !== h) { this.depth.setSize(w, h); this.smoke.setSize(w, h); }
    this.fullLast.value.set(full.width - 1, full.height - 1);
    this.halfLast.value.set(w - 1, h - 1);
    const lens = camera as Camera & { near: number; far: number };
    this.near.value = lens.near;
    this.far.value = lens.far;
    const prev = renderer.getRenderTarget(), alpha = renderer.getClearAlpha();
    renderer.getClearColor(this.clearColour);
    renderer.setRenderTarget(this.depth);
    this.down.render(renderer);
    renderer.setRenderTarget(this.smoke);
    renderer.setClearColor(CLEAR.colour, CLEAR.alpha); // the renderer clears as it draws (autoClear)
    renderer.render(this.scene, camera);
    renderer.setClearColor(this.clearColour, alpha);
    renderer.setRenderTarget(prev);
  }

  /** Behind the loading screen: the smoke's shader against its target, then one frame through it all (the small passes build there). */
  async warm(renderer: WebGPURenderer, camera: Camera, smoke: Mesh, draw: () => void): Promise<void> {
    this.scene.add(smoke);
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.smoke);
    const compiled = renderer.compileAsync(this.scene, camera);
    renderer.setRenderTarget(prev);
    await compiled;
    draw();
  }
}
