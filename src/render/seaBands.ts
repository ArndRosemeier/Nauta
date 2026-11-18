// @ts-nocheck -- three's TSL typings infer vector widths poorly for compute shaders; checked by rendering it (npm run shot).
/**
 * The fine sea on the GPU (plan N1.2): each frame, compute passes turn the fine waves' spectrum (seaFine.ts) into
 * waves, one square band of the sea at a time (Tessendorf's FFT ocean in cascades), and leave for the sea's
 * material two textures per band:
 *
 *  - `shape` (for the vertex stage): how far the water there moves sideways (x, z) and up, in m;
 *  - `slope` (for the fragment stage): the surface's slope along x and z, how much the water bunches (the waves'
 *    sideways shift's divergence: below 0 it crowds together, near −1 it folds), and the foam that lingers where it
 *    folded (0..1, fading over a few seconds).
 *
 * The slope has mipmaps, so a pixel too coarse for a band's waves reads them filtered, not as noise; the vertex stage
 * fades a band's shape out where the grid is too coarse for its waves.
 *
 * Each line of a band is one workgroup, its butterflies in workgroup memory (Stockham's radix-2 FFT): the first pass
 * builds the spectrum of the moment for every row and transforms it, then a pass per band transforms its columns and
 * writes its textures. Four transforms ride in each: the sideways shift (x + i·z), the height with the shift's
 * cross term, the slopes (x + i·z), and the shift's stretch along x and z, packed two to a vec4 as complex numbers
 * whose real and imaginary parts are each a real field. Every pipeline is compiled in the warm-up (`warmUp`).
 */
import { HalfFloatType, LinearFilter, RGBAFormat, StorageTexture, Vector4, type ComputeNode, type WebGPURenderer } from 'three/webgpu';
import {
  Fn, Loop, cos, float, instancedArray, texture, localId, max, pow, saturate, sin, smoothstep, sqrt, log, textureStore, uint, uniform,
  uniformArray, uvec2, vec2, vec4, workgroupArray, workgroupBarrier, workgroupId,
} from 'three/tsl';
import {
  BAND_NOISE_STRIDE, BAND_WAVE_STRIDE, FINE_CHOP, FINE_FADE_IN, FINE_LAYERS, FINE_REPEAT, MOST_BANDS, bandLayout, bandTables, fineFrameFor, type BandLayout, type FineFrame,
} from './seaFine';
import { FOAM_DEPTH_NONE } from './seaFoam';
import { tiling } from './tiling';

/** The least value a power or a wavenumber is taken from (keeps 0 and its logarithm out of the sums). */
const TINY = 1e-12;
/** How long foam lingers where a band folded, s (it falls to a third in this time). */
const FOLD_LINGER = 4;
/** A band's lingering foam turns fully white this many of its deviations past where it forms. */
const FOLD_RAMP = 1;
/** Samples a band's textures take along a pixel's long side at a grazing angle. */
const BAND_ANISOTROPY = 8;

/** What the passes read each frame, shared by every band set. */
export const BAND_INPUTS = {
  /** The fine waves' clock, s, wrapped every FINE_REPEAT. */
  time: uniform(0),
  /** Per layer: f²·level, wind direction x, z, ln k of its longest wave (seaFine.ts `FineLayer`). */
  layers: uniformArray(Array.from({ length: FINE_LAYERS }, () => new Vector4()), 'vec4'),
  /** How much lingering foam is left after this frame (e^(−dt / FOLD_LINGER)). */
  linger: uniform(1),
  /** How many deviations below its mean a band's bunching must lie to fold white (seaFoam.ts `foamDepth`). */
  depth: uniform(FOAM_DEPTH_NONE),
  /** Per band: the deviation of its bunching (FINE_CHOP · √slope); the rest unused. */
  bands: uniformArray(Array.from({ length: MOST_BANDS }, () => new Vector4()), 'vec4'),
};

/**
 * A band's texture: rgba16float, tiling. The slope is mipmapped (each frame, a small render pass per level), so a
 * pixel reads it filtered; the shape is read by vertices only where the grid holds its waves, so it needs none.
 */
function bandTexture(n: number, name: string, mipmapped: boolean): StorageTexture {
  const t = tiling(new StorageTexture(n, n), BAND_ANISOTROPY);
  t.name = name;
  t.type = HalfFloatType;
  t.format = RGBAFormat;
  if (!mipmapped) { t.generateMipmaps = false; t.minFilter = LinearFilter; }
  return t;
}

/** (a + ib)·(wr + i·wi) for both complex numbers packed in a vec4 (x + iy, z + iw). */
const cmul = (v, wr, wi) => vec4(v.x.mul(wr).sub(v.y.mul(wi)), v.x.mul(wi).add(v.y.mul(wr)), v.z.mul(wr).sub(v.w.mul(wi)), v.z.mul(wi).add(v.w.mul(wr)));

/**
 * The butterflies of one line of `n` values (two vec4s each, in `p` and `q`, workgroup memory), `half` = n / 2 threads,
 * thread `j`: the inverse transform, natural order in and out (Stockham's autosort).
 */
function transformLine(p, q, j, n: number) {
  const half = uint(n / 2);
  Loop({ start: uint(0), end: uint(Math.log2(n)), type: 'uint', condition: '<' }, ({ i: s }) => {
    const ns = uint(1).shiftLeft(s), k = j.mod(ns);
    const a = p.element(j).toVar(), b = p.element(j.add(half)).toVar(), c = q.element(j).toVar(), d = q.element(j.add(half)).toVar();
    workgroupBarrier();
    const angle = float(Math.PI).mul(float(k)).div(float(ns)), wr = cos(angle), wi = sin(angle);
    const bw = cmul(b, wr, wi), dw = cmul(d, wr, wi);
    const o = j.sub(k).mul(uint(2)).add(k);
    p.element(o).assign(a.add(bw)); p.element(o.add(ns)).assign(a.sub(bw));
    q.element(o).assign(c.add(dw)); q.element(o.add(ns)).assign(c.sub(dw));
    workgroupBarrier();
  });
}

/** The bands of one size: buffers, textures and the passes. */
export class BandSet {
  /** Each band's textures, coarsest first (`maxBands` of them; a layout with fewer leaves the rest still). */
  readonly shapes: StorageTexture[] = [];
  readonly slopes: StorageTexture[] = [];
  /** The passes: the rows of every band, then each band's columns. */
  readonly passes: ComputeNode[];
  private readonly waves;
  private readonly base;
  private readonly noise;
  private layout: BandLayout | null = null;

  /** `texels` a side (a power of two, at most 512), room for `maxBands` bands. */
  constructor(readonly texels: number, readonly maxBands: number) {
    const n = texels, half = n / 2, per = n * n, all = maxBands * per, N = uint(n), PER = uint(per), HALF = uint(half);
    this.waves = instancedArray(new Float32Array(all * BAND_WAVE_STRIDE), 'vec4');
    this.base = instancedArray(new Float32Array(all), 'float');
    this.noise = instancedArray(new Float32Array(all * BAND_NOISE_STRIDE), 'vec2');
    const fieldsP = instancedArray(all, 'vec4'), fieldsQ = instancedArray(all, 'vec4'), foam = instancedArray(all, 'float');
    for (let b = 0; b < maxBands; b++) {
      this.shapes.push(bandTexture(n, `sea band ${b} shape`, false));
      this.slopes.push(bandTexture(n, `sea band ${b} slope`, true));
    }
    const I = BAND_INPUTS, waves = this.waves.toReadOnly(), base = this.base.toReadOnly(), noise = this.noise.toReadOnly();

    // --- Rows: the spectrum of this moment at each texel of a row, then the row's transform.
    const rows = Fn(() => {
      const p = workgroupArray('vec4', n), q = workgroupArray('vec4', n);
      const line = workgroupId.x, j = localId.x, band = line.div(N), y = line.mod(N);
      for (const e of [j, j.add(HALF)]) {
        const x = e, i = band.mul(PER).add(y.mul(N)).add(x);
        const mirror = band.mul(PER).add(N.sub(y).mod(N).mul(N)).add(N.sub(x).mod(N));
        const w = waves.element(i), kx = w.x, kz = w.y, k = max(sqrt(kx.mul(kx).add(kz.mul(kz))), TINY), lnk = log(k);
        // The spectrum's energy toward +k and toward −k, every layer weighted (in energy, so a fade never swells).
        const toward = float(0).toVar(), away = float(0).toVar();
        for (let l = 0; l < FINE_LAYERS; l++) {
          const L = I.layers.element(l), along = kx.mul(L.y).add(kz.mul(L.z)).div(k);
          const lit = L.x.mul(smoothstep(L.w, L.w.add(FINE_FADE_IN), lnk));
          // spectrum.ts `spread`: cos^(2s)(θ/2) = ((1 + cos θ) / 2)^s.
          toward.addAssign(lit.mul(pow(max(along.add(1).div(2), TINY), w.w)));
          away.addAssign(lit.mul(pow(max(float(1).sub(along).div(2), TINY), w.w)));
        }
        const b0 = base.element(i), xi = noise.element(i), xm = noise.element(mirror);
        const ap = sqrt(toward).mul(b0), am = sqrt(away).mul(b0);
        // h = ξ(k)·A(k)·e^{iωt} + conj(ξ(−k))·A(−k)·e^{−iωt}.
        const phase = w.z.mul(I.time), c = cos(phase), s = sin(phase);
        const h0r = xi.x.mul(ap), h0i = xi.y.mul(ap), hmr = xm.x.mul(am), hmi = xm.y.mul(am).negate();
        const hr = h0r.mul(c).sub(h0i.mul(s)).add(hmr.mul(c).add(hmi.mul(s)));
        const hi = h0r.mul(s).add(h0i.mul(c)).add(hmi.mul(c).sub(hmr.mul(s)));
        // The four packed fields: shift (x + iz) = h·(−kz + i·kx)·λ/k; height + i·(shift's xz) = h·(1 − i·λ·kx·kz/k);
        // slope (x + iz) = h·(−kz + i·kx); stretch xx + i·zz = −h·λ·(kx² + i·kz²)/k.
        const lk = float(FINE_CHOP).div(k);
        const h2 = vec4(hr, hi, hr, hi);
        p.element(e).assign(vec4(
          cmul(h2, kz.negate().mul(lk), kx.mul(lk)).xy,
          cmul(h2, float(1), kx.mul(kz).mul(lk).negate()).zw,
        ));
        q.element(e).assign(vec4(
          cmul(h2, kz.negate(), kx).xy,
          cmul(h2, kx.mul(kx).mul(lk).negate(), kz.mul(kz).mul(lk).negate()).zw,
        ));
      }
      workgroupBarrier();
      transformLine(p, q, j, n);
      for (const e of [j, j.add(HALF)]) {
        const i = band.mul(PER).add(y.mul(N)).add(e);
        fieldsP.element(i).assign(p.element(e));
        fieldsQ.element(i).assign(q.element(e));
      }
    })().compute(all / 2, [half]);

    // --- Columns, a pass per band (a stage may write only four storage textures): each column's transform, then
    // the band's textures and its lingering foam.
    const columns = Array.from({ length: maxBands }, (_, b) => Fn(() => {
      const p = workgroupArray('vec4', n), q = workgroupArray('vec4', n);
      const x = workgroupId.x, j = localId.x, band = uint(b);
      for (const e of [j, j.add(HALF)]) {
        const i = band.mul(PER).add(e.mul(N)).add(x);
        p.element(e).assign(fieldsP.element(i));
        q.element(e).assign(fieldsQ.element(i));
      }
      workgroupBarrier();
      transformLine(p, q, j, n);
      for (const e of [j, j.add(HALF)]) {
        const i = band.mul(PER).add(e.mul(N)).add(x), P = p.element(e), Q = q.element(e);
        const bunch = Q.z.add(Q.w), deviation = max(I.bands.element(b).x, TINY);
        const folding = saturate(bunch.negate().sub(deviation.mul(I.depth)).div(deviation.mul(FOLD_RAMP)));
        const left = max(foam.element(i).mul(I.linger), folding);
        foam.element(i).assign(left);
        const at = uvec2(x, e);
        textureStore(this.shapes[b], at, vec4(P.x, P.z, P.y, P.w));
        textureStore(this.slopes[b], at, vec4(Q.x, Q.y, bunch, left));
      }
    })().compute(per / 2, [half]));
    this.passes = [rows, ...columns];
  }

  /** Lays out the bands as `layout` says (its fixed tables, its noise from `seed`): done when the quality level changes. */
  use(layout: BandLayout, seed: number): void {
    if (layout === this.layout) return;
    if (layout.texels !== this.texels || layout.bands.length > this.maxBands) throw new Error(`a band set of ${this.texels}² for ${this.maxBands} bands cannot hold ${layout.bands.length} of ${layout.texels}²`);
    const t = bandTables(layout, seed), per = this.texels * this.texels;
    for (const [node, data, stride] of [[this.waves, t.waves, BAND_WAVE_STRIDE], [this.base, t.base, 1], [this.noise, t.noise, BAND_NOISE_STRIDE]] as const) {
      const array = node.value.array as Float32Array;
      array.fill(0);
      array.set(data);
      node.value.needsUpdate = true;
      if (data.length > this.maxBands * per * stride) throw new Error('band tables larger than the set');
    }
    this.layout = layout;
  }

  /** Compiles the passes (in the warm-up, behind the loading screen). */
  async warmUp(renderer: WebGPURenderer): Promise<void> {
    await renderer.compileComputeAsync(this.passes);
  }

  /** Runs the passes for this frame: the rows, and the columns of the bands the layout has. */
  run(renderer: WebGPURenderer): void {
    renderer.compute(this.passes.slice(0, 1 + (this.layout?.bands.length ?? this.maxBands)));
  }
}

/**
 * Writes the moment's fine sea (`frame`, seaFine.ts) into the passes' inputs: `t` the sea's clock, `dt` the frame's
 * step (s), `depth` how deep the bunching must go to fold white (seaFoam.ts `foamDepth`).
 */
export function setBandInputs(frame: FineFrame, t: number, dt: number, depth: number): void {
  const I = BAND_INPUTS, layers = I.layers.array as Vector4[], bands = I.bands.array as Vector4[];
  I.depth.value = depth;
  I.time.value = t % FINE_REPEAT;
  I.linger.value = Math.exp(-dt / FOLD_LINGER);
  frame.layers.forEach((slot, l) => {
    const L = slot.layer;
    if (L) layers[l]!.set(slot.weight * slot.weight * L.level, L.dirX, L.dirZ, L.top);
    else layers[l]!.set(0, 1, 0, 0);
  });
  frame.slope.forEach((s, b) => { if (bands[b]) bands[b]!.x = FINE_CHOP * Math.sqrt(s); });
}

/** What a quality level asks of the fine sea (src/app/quality.ts `fineSeaBands`, `fineSeaSize`). */
export interface FineChoice {
  readonly bands: number;
  readonly texels: number;
}

/**
 * The fine sea: a band set for every size the quality levels ask for (built and compiled together in the warm-up,
 * so a change of level compiles nothing), the one drawn now, and the texture nodes the sea's material reads, which
 * follow the set drawn.
 */
export class FineSea {
  /** The most bands any level asks for: the material reads this many. */
  readonly maxBands: number;
  /** The layout drawn now, and its moment's fine waves. */
  layout!: BandLayout;
  frame!: FineFrame;
  private readonly sets = new Map<number, BandSet>();
  private readonly layouts = new Map<string, BandLayout>();
  private current!: BandSet;
  /** Every texture node the material made, with which band's texture it reads. */
  private readonly nodes: { node: { value: StorageTexture }; band: number; shape: boolean }[] = [];

  /** `choices`: every level's ask, the first drawn at the start; `seed`: the sea's, for the bands' noise. */
  constructor(choices: readonly FineChoice[], private readonly seed: number) {
    this.maxBands = Math.max(...choices.map((c) => c.bands));
    if (this.maxBands > MOST_BANDS) throw new Error(`the fine sea has room for ${MOST_BANDS} bands`);
    for (const c of choices) if (!this.sets.has(c.texels)) this.sets.set(c.texels, new BandSet(c.texels, this.maxBands));
    this.select(choices[0]!);
  }

  /** Draws the fine sea as `choice` asks (a quality level's knobs): new tables, the same pipelines. */
  select(choice: FineChoice): void {
    const key = `${choice.bands}x${choice.texels}`;
    let layout = this.layouts.get(key);
    if (!layout) { layout = bandLayout(choice.bands, choice.texels); this.layouts.set(key, layout); }
    const set = this.sets.get(choice.texels);
    if (!set) throw new Error(`no band set of ${choice.texels}² (it was not among the choices)`);
    set.use(layout, this.seed);
    this.layout = layout;
    this.frame = fineFrameFor(layout);
    this.current = set;
    for (const n of this.nodes) n.node.value = (n.shape ? set.shapes : set.slopes)[n.band]!;
  }

  /** Band `band`'s shape (shift x, height, shift z) at `uv` (the vertex stage's: no mipmaps). */
  shape(band: number, uv) {
    return this.track(texture(this.current.shapes[band]!, uv).level(0), band, true);
  }

  /** Band `band`'s slope x, z, bunching and lingering foam at `uv` (the fragment stage's, filtered by the pixel). */
  slope(band: number, uv) {
    return this.track(texture(this.current.slopes[band]!, uv), band, false);
  }

  private track(node, band: number, shape: boolean) {
    this.nodes.push({ node, band, shape });
    return node;
  }

  /** Compiles every set's passes and runs each once (behind the loading screen). */
  async warmUp(renderer: WebGPURenderer): Promise<void> {
    for (const set of this.sets.values()) await set.warmUp(renderer);
  }

  /** Runs the passes of the set drawn, for this frame (before the frame is drawn). */
  run(renderer: WebGPURenderer): void {
    this.current.run(renderer);
  }
}
