/**
 * What the GPU offers, asked through WebGPU and WebGL 2 directly, and a small compute workload run and timed
 * (plan N0.5). The probe page runs alone, never beside the game, so its raw pipelines are outside the game's
 * material kinds and warm-up (docs/SHADERS.md): their compile time is one of the things measured.
 */
import { DataUtils } from 'three';
import { formatBytes, formatMs, medianOf, yesNo, type Row, type Section } from './report';
import { probeWaves, waveHeight } from './waves';

/** What a GPU probe found: its sections for the full report and its lines for the summary at the top. */
export interface Findings {
  readonly sections: Section[];
  readonly summary: Row[];
}

// ---- The little of WebGPU's API the probe uses (the project carries no WebGPU typings). ----
type Obj = object;
interface GpuLimits { readonly [name: string]: number }
interface GpuAdapter {
  readonly features: ReadonlySet<string>;
  readonly limits: GpuLimits;
  readonly info?: { vendor: string; architecture: string; device: string; description: string };
  readonly isFallbackAdapter?: boolean;
  requestDevice(): Promise<GpuDevice>;
}
interface GpuBuffer { getMappedRange(): ArrayBuffer; mapAsync(mode: number): Promise<void>; unmap(): void; destroy(): void }
interface GpuTexture { createView(): Obj; destroy(): void }
interface GpuPipeline { getBindGroupLayout(i: number): Obj }
interface GpuPass { setPipeline(p: GpuPipeline): void; setBindGroup(i: number, g: Obj): void; dispatchWorkgroups(x: number, y?: number): void; end(): void }
interface GpuEncoder {
  beginComputePass(): GpuPass;
  copyTextureToBuffer(src: { texture: GpuTexture }, dst: { buffer: GpuBuffer; bytesPerRow: number }, size: number[]): void;
  finish(): Obj;
}
interface GpuDevice {
  readonly limits: GpuLimits;
  readonly queue: { submit(c: Obj[]): void; writeBuffer(b: GpuBuffer, o: number, d: ArrayBufferView): void; onSubmittedWorkDone(): Promise<void> };
  readonly lost: Promise<{ message: string }>;
  createShaderModule(d: { code: string }): Obj;
  createComputePipelineAsync(d: { layout: 'auto'; compute: { module: Obj; entryPoint: string } }): Promise<GpuPipeline>;
  createBuffer(d: { size: number; usage: number }): GpuBuffer;
  createTexture(d: { size: number[]; format: string; usage: number }): GpuTexture;
  createBindGroup(d: { layout: Obj; entries: { binding: number; resource: Obj }[] }): Obj;
  createCommandEncoder(): GpuEncoder;
  pushErrorScope(filter: 'validation'): void;
  popErrorScope(): Promise<{ message: string } | null>;
  addEventListener(type: 'uncapturederror', f: (e: { error: { message: string } }) => void): void;
  destroy(): void;
}
interface Gpu {
  requestAdapter(o?: { powerPreference: 'high-performance' }): Promise<GpuAdapter | null>;
  getPreferredCanvasFormat(): string;
  readonly wgslLanguageFeatures?: ReadonlySet<string>;
}
/** The usage flags, read from the browser's own constants. */
const BUFFER = (globalThis as unknown as { GPUBufferUsage?: Record<'STORAGE' | 'UNIFORM' | 'COPY_DST' | 'COPY_SRC' | 'MAP_READ', number> }).GPUBufferUsage;
const TEXTURE = (globalThis as unknown as { GPUTextureUsage?: Record<'STORAGE_BINDING' | 'COPY_SRC' | 'TEXTURE_BINDING', number> }).GPUTextureUsage;
const MAP_READ = (globalThis as unknown as { GPUMapMode?: { READ: number } }).GPUMapMode?.READ ?? 1;

// ---- The workload. ----
/** Waves summed per texel: about what a fine sea's spectrum band holds. */
const WAVE_COUNT = 16;
/** Grid spacing of the wave texture, metres. */
const SPACING = 0.5;
/** The grid sizes the wave pass is timed at, texels a side. */
const WAVE_SIZES = [256, 512];
/** Workgroup edge of the 2D wave pass (8 × 8 = 64 invocations). */
const WG_2D = 8;
/** Workgroup size of the 1D butterfly pass. */
const WG_1D = 64;
/** Side of the butterfly field: one FFT of 256² has log2(256) passes per axis. */
const FFT_SIDE = 256;
const FFT_PASSES = 16;
/** Bytes in one complex value (two f32). */
const COMPLEX_BYTES = 8;
/** Dispatches per timed submit, so the submit's own cost spreads thin. */
const REPEATS = 20;
/** FFT-shaped chains per timed submit. */
const CHAINS = 8;
/** Timed rounds; the median is reported. */
const ROUNDS = 5;
/** Bytes per texel of rgba16float, and the row alignment a texture copy needs. */
const RGBA16F_BYTES = 8;
const ROW_ALIGN = 256;
/** The time the checked frame is computed at, seconds. */
const CHECK_TIME = 3.7;
/** Texels of the first row whose heights are compared with the CPU. */
const CHECK_TEXELS = [0, 37, 129, 255];
/** How far the GPU's height may differ from the CPU's, metres: half floats hold about three digits. */
const CHECK_TOLERANCE = 0.02;
/** Bytes of one vec4 uniform. */
const VEC4_BYTES = 16;
/** Formats tried as storage textures (written by compute), the ones a sea or its foam could use. */
const STORAGE_FORMATS = ['rgba16float', 'rgba32float', 'r32float', 'rg32float', 'rgba8unorm', 'bgra8unorm'];
/** Edge of the tiny texture each format is tried with. */
const TRY_SIZE = 4;
/** Limits worth a line in the summary. */
const KEY_LIMITS = ['maxTextureDimension2D', 'maxComputeInvocationsPerWorkgroup', 'maxComputeWorkgroupStorageSize', 'maxStorageBufferBindingSize', 'maxStorageTexturesPerShaderStage'];

const WAVES_WGSL = `
struct Wave { dir: vec2f, k: f32, amp: f32, phase: f32, speed: f32, pad0: f32, pad1: f32 }
@group(0) @binding(0) var<storage, read> waves: array<Wave>;
@group(0) @binding(1) var<uniform> u: vec4f; // x: time s, y: spacing m
@group(0) @binding(2) var out: texture_storage_2d<rgba16float, write>;
@compute @workgroup_size(${WG_2D}, ${WG_2D})
fn main(@builtin(global_invocation_id) id: vec3u) {
  let size = textureDimensions(out);
  if (id.x >= size.x || id.y >= size.y) { return; }
  let p = vec2f(id.xy) * u.y;
  var h = 0.0; var sx = 0.0; var sz = 0.0;
  for (var i = 0u; i < arrayLength(&waves); i++) {
    let w = waves[i];
    let a = w.k * dot(w.dir, p) + w.phase + w.speed * u.x;
    h += w.amp * sin(a);
    let c = w.amp * w.k * cos(a);
    sx += c * w.dir.x; sz += c * w.dir.y;
  }
  textureStore(out, id.xy, vec4f(h, sx, sz, 1.0));
}`;

const BUTTERFLY_WGSL = `
@group(0) @binding(0) var<storage, read> src: array<vec2f>;
@group(0) @binding(1) var<storage, read_write> dst: array<vec2f>;
@group(0) @binding(2) var<uniform> stage: vec4u; // x: the partner's distance
@compute @workgroup_size(${WG_1D})
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= arrayLength(&dst)) { return; }
  let a = src[i];
  let b = src[i ^ stage.x];
  let ang = -6.2831853 * f32(i & (stage.x - 1u)) / f32(2u * stage.x);
  let t = vec2f(cos(ang), sin(ang));
  dst[i] = a + vec2f(b.x * t.x - b.y * t.y, b.x * t.y + b.y * t.x);
}`;

const READ_WRITE_WGSL = `
@group(0) @binding(0) var tex: texture_storage_2d<r32float, read_write>;
@compute @workgroup_size(1)
fn main() { textureStore(tex, vec2u(0u), textureLoad(tex, vec2u(0u)) + vec4f(1.0)); }`;

/** Wall time of `work` (encoded by the caller) until the GPU has finished it, ms. */
async function timed(device: GpuDevice, encode: (enc: GpuEncoder) => void): Promise<number> {
  const enc = device.createCommandEncoder();
  encode(enc);
  const t0 = performance.now();
  device.queue.submit([enc.finish()]);
  await device.queue.onSubmittedWorkDone();
  return performance.now() - t0;
}

/** The median of ROUNDS timed runs, each divided by `per`, after one untimed run that wakes the GPU up. */
async function medianTime(device: GpuDevice, per: number, encode: (enc: GpuEncoder) => void): Promise<number> {
  await timed(device, encode);
  const times: number[] = [];
  for (let r = 0; r < ROUNDS; r++) times.push((await timed(device, encode)) / per);
  return medianOf(times);
}

/** A compute pipeline and the time its compile took, ms. */
async function pipeline(device: GpuDevice, code: string): Promise<{ pipe: GpuPipeline; ms: number }> {
  const t0 = performance.now();
  const pipe = await device.createComputePipelineAsync({ layout: 'auto', compute: { module: device.createShaderModule({ code }), entryPoint: 'main' } });
  return { pipe, ms: performance.now() - t0 };
}

function uniform(device: GpuDevice, data: Float32Array | Uint32Array): GpuBuffer {
  const b = device.createBuffer({ size: VEC4_BYTES, usage: BUFFER!.UNIFORM | BUFFER!.COPY_DST });
  device.queue.writeBuffer(b, 0, data);
  return b;
}

/** The wave pass: compile, check one row against the CPU, time it at each size. */
async function wavePass(device: GpuDevice, rows: Row[], summary: Row[]): Promise<void> {
  const { pipe, ms } = await pipeline(device, WAVES_WGSL);
  rows.push(['wave pass compile', formatMs(ms)]);
  const table = probeWaves(WAVE_COUNT);
  const waves = device.createBuffer({ size: table.byteLength, usage: BUFFER!.STORAGE | BUFFER!.COPY_DST });
  device.queue.writeBuffer(waves, 0, table);
  const u = uniform(device, new Float32Array([CHECK_TIME, SPACING, 0, 0]));
  const timesBySize: string[] = [];
  for (const size of WAVE_SIZES) {
    const tex = device.createTexture({ size: [size, size], format: 'rgba16float', usage: TEXTURE!.STORAGE_BINDING | TEXTURE!.COPY_SRC });
    const group = device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: waves } }, { binding: 1, resource: { buffer: u } }, { binding: 2, resource: tex.createView() }] });
    const groups = Math.ceil(size / WG_2D);
    const dispatch = (pass: GpuPass) => { pass.setPipeline(pipe); pass.setBindGroup(0, group); pass.dispatchWorkgroups(groups, groups); };
    if (size === WAVE_SIZES[0]) rows.push(['wave pass result', await checkRow(device, tex, size, dispatch, table)]);
    const t = await medianTime(device, REPEATS, (enc) => { const pass = enc.beginComputePass(); for (let i = 0; i < REPEATS; i++) dispatch(pass); pass.end(); });
    rows.push([`wave pass ${size}² × ${WAVE_COUNT} waves`, `${formatMs(t)} per dispatch`]);
    timesBySize.push(`${size}²: ${formatMs(t)}`);
    tex.destroy();
  }
  summary.push(['compute: waves', `${timesBySize.join(', ')} (${WAVE_COUNT} waves a texel)`]);
}

/** Runs the wave pass once and compares a few texels of its first row with the CPU's sum: `ok` or what differs. */
async function checkRow(device: GpuDevice, tex: GpuTexture, size: number, dispatch: (p: GpuPass) => void, table: Float32Array): Promise<string> {
  const bytesPerRow = Math.ceil((size * RGBA16F_BYTES) / ROW_ALIGN) * ROW_ALIGN;
  const read = device.createBuffer({ size: bytesPerRow, usage: BUFFER!.COPY_DST | BUFFER!.MAP_READ });
  const enc = device.createCommandEncoder();
  const pass = enc.beginComputePass(); dispatch(pass); pass.end();
  enc.copyTextureToBuffer({ texture: tex }, { buffer: read, bytesPerRow }, [size, 1]);
  device.queue.submit([enc.finish()]);
  await read.mapAsync(MAP_READ);
  const halves = new Uint16Array(read.getMappedRange().slice(0));
  read.unmap(); read.destroy();
  const channels = RGBA16F_BYTES / Uint16Array.BYTES_PER_ELEMENT;
  const off = CHECK_TEXELS.map((x) => {
    const gpu = DataUtils.fromHalfFloat(halves[x * channels]), cpu = waveHeight(table, x * SPACING, 0, CHECK_TIME);
    return { x, gpu, cpu, bad: !(Math.abs(gpu - cpu) <= CHECK_TOLERANCE) };
  }).filter((c) => c.bad);
  return off.length ? `WRONG at ${off.map((c) => `x=${c.x}: ${c.gpu.toFixed(2)} not ${c.cpu.toFixed(2)}`).join('; ')}` : `ok (matches the CPU at ${CHECK_TEXELS.length} texels)`;
}

/** The FFT-shaped chain: FFT_PASSES butterfly passes in a row over a FFT_SIDE² complex field, each its own pass. */
async function butterflyChain(device: GpuDevice, rows: Row[], summary: Row[]): Promise<void> {
  const { pipe, ms } = await pipeline(device, BUTTERFLY_WGSL);
  rows.push(['butterfly compile', formatMs(ms)]);
  const count = FFT_SIDE * FFT_SIDE, bytes = count * COMPLEX_BYTES;
  const field = [0, 1].map(() => device.createBuffer({ size: bytes, usage: BUFFER!.STORAGE }));
  const groups = Array.from({ length: FFT_PASSES }, (_, p) => {
    const u = uniform(device, new Uint32Array([1 << p, 0, 0, 0]));
    return device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: field[p % 2] } }, { binding: 1, resource: { buffer: field[1 - (p % 2)] } }, { binding: 2, resource: { buffer: u } }] });
  });
  const t = await medianTime(device, CHAINS, (enc) => {
    for (let c = 0; c < CHAINS; c++) for (const g of groups) {
      const pass = enc.beginComputePass(); pass.setPipeline(pipe); pass.setBindGroup(0, g); pass.dispatchWorkgroups(count / WG_1D); pass.end();
    }
  });
  rows.push([`${FFT_PASSES} passes over ${FFT_SIDE}² complex`, `${formatMs(t)} (the shape of one ${FFT_SIDE}² FFT)`]);
  summary.push(['compute: one FFT-shaped chain', `${formatMs(t)} (${FFT_PASSES} passes, ${FFT_SIDE}²)`]);
  field.forEach((b) => b.destroy());
}

/** Which formats can be storage textures, and whether one can be read and written in the same pass. */
async function storageTextures(device: GpuDevice, rows: Row[], summary: Row[]): Promise<void> {
  const ok: string[] = [];
  for (const format of STORAGE_FORMATS) {
    device.pushErrorScope('validation');
    const tex = device.createTexture({ size: [TRY_SIZE, TRY_SIZE], format, usage: TEXTURE!.STORAGE_BINDING });
    const err = await device.popErrorScope();
    tex.destroy();
    rows.push([`storage texture ${format}`, err ? `no (${err.message.split('\n')[0]})` : 'yes']);
    if (!err) ok.push(format);
  }
  const rw = await pipeline(device, READ_WRITE_WGSL).then(() => true, () => false);
  rows.push(['read_write r32float', yesNo(rw)]);
  summary.push(['storage textures', `${ok.join(', ') || 'none'}; read_write r32float: ${yesNo(rw)}`]);
}

/** Everything WebGPU tells and does here. */
export async function probeWebGPU(): Promise<Findings> {
  const gpu = (navigator as unknown as { gpu?: Gpu }).gpu;
  const rows: Row[] = [], summary: Row[] = [];
  const sections: Section[] = [{ title: 'WebGPU', rows }];
  if (!gpu || !BUFFER || !TEXTURE) {
    rows.push(['available', 'no (navigator.gpu is missing)']);
    summary.push(['WebGPU', 'NO']);
    return { sections, summary };
  }
  const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' }).catch(() => null);
  if (!adapter) {
    rows.push(['available', 'no (no adapter)']);
    summary.push(['WebGPU', 'NO (navigator.gpu is there, but no adapter)']);
    return { sections, summary };
  }
  const info = adapter.info;
  const name = info ? [info.vendor, info.architecture, info.device, info.description].filter(Boolean).join(' / ') : '';
  rows.push(['available', 'yes'], ['adapter', name || 'not told'], ['fallback (software) adapter', yesNo(!!adapter.isFallbackAdapter)],
    ['canvas format', gpu.getPreferredCanvasFormat()], ['WGSL language features', [...(gpu.wgslLanguageFeatures ?? [])].sort().join(', ') || 'none told']);
  const features = [...adapter.features].sort();
  rows.push(['features', features.join(', ') || 'none']);
  const has = (f: string) => adapter.features.has(f);
  summary.push(['WebGPU', `yes (${name || 'adapter not named'})`],
    ['float32 filtering (WebGPU)', yesNo(has('float32-filterable'))],
    ['shader-f16 / timestamp-query / subgroups', [has('shader-f16'), has('timestamp-query'), has('subgroups')].map(yesNo).join(' / ')]);

  const limitNames: string[] = [];
  for (const k in adapter.limits) if (typeof adapter.limits[k] === 'number') limitNames.push(k);
  const limitRows: Row[] = limitNames.sort().map((k) => [k, k.endsWith('Size') && adapter.limits[k] >= ROW_ALIGN ? `${adapter.limits[k]} (${formatBytes(adapter.limits[k])})` : String(adapter.limits[k])]);
  sections.push({ title: 'WebGPU adapter limits', rows: limitRows });
  summary.push(['key limits', KEY_LIMITS.map((k) => `${k} ${adapter.limits[k] ?? '?'}`).join(', ')]);

  const device = await adapter.requestDevice();
  const errors: string[] = [];
  device.addEventListener('uncapturederror', (e) => errors.push(e.error.message));
  let lost = '';
  void device.lost.then((l) => { lost = l.message; });
  const compute: Row[] = [];
  sections.push({ title: 'WebGPU compute', rows: compute });
  for (const step of [wavePass, butterflyChain, storageTextures]) {
    try { await step(device, compute, summary); } catch (err) { compute.push([`${step.name} failed`, err instanceof Error ? err.message : String(err)]); }
  }
  if (errors.length) compute.push(['GPU errors', errors.join(' | ')]);
  if (lost) compute.push(['device lost', lost]);
  device.destroy();
  return { sections, summary };
}

// ---- WebGL 2 ----
/** WebGL 2 extensions that matter for a sea and its fallback, said in the summary. */
const KEY_EXTENSIONS = ['EXT_color_buffer_float', 'OES_texture_float_linear', 'EXT_color_buffer_half_float', 'EXT_disjoint_timer_query_webgl2', 'KHR_parallel_shader_compile'];

/** Everything WebGL 2 tells. */
export function probeWebGL2(): Findings {
  const rows: Row[] = [], summary: Row[] = [];
  const sections: Section[] = [{ title: 'WebGL 2', rows }];
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) {
    rows.push(['available', 'no']);
    summary.push(['WebGL 2', 'NO']);
    return { sections, summary };
  }
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const p = (name: string, value: number) => rows.push([name, String(gl.getParameter(value))]);
  rows.push(['available', 'yes']);
  p('VERSION', gl.VERSION); p('SHADING_LANGUAGE_VERSION', gl.SHADING_LANGUAGE_VERSION);
  if (debug) { p('UNMASKED_VENDOR', debug.UNMASKED_VENDOR_WEBGL); p('UNMASKED_RENDERER', debug.UNMASKED_RENDERER_WEBGL); }
  p('MAX_TEXTURE_SIZE', gl.MAX_TEXTURE_SIZE); p('MAX_3D_TEXTURE_SIZE', gl.MAX_3D_TEXTURE_SIZE); p('MAX_ARRAY_TEXTURE_LAYERS', gl.MAX_ARRAY_TEXTURE_LAYERS);
  p('MAX_SAMPLES', gl.MAX_SAMPLES); p('MAX_DRAW_BUFFERS', gl.MAX_DRAW_BUFFERS); p('MAX_TEXTURE_IMAGE_UNITS', gl.MAX_TEXTURE_IMAGE_UNITS);
  p('MAX_VERTEX_TEXTURE_IMAGE_UNITS', gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS); p('MAX_UNIFORM_BLOCK_SIZE', gl.MAX_UNIFORM_BLOCK_SIZE);
  const ext = (gl.getSupportedExtensions() ?? []).sort();
  rows.push(['extensions', ext.join(', ')]);
  const renderer = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
  summary.push(['WebGL 2', `yes (${renderer}), max texture ${gl.getParameter(gl.MAX_TEXTURE_SIZE)}`],
    ['float textures (WebGL 2)', KEY_EXTENSIONS.map((e) => `${e} ${yesNo(ext.includes(e))}`).join(', ')]);
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return { sections, summary };
}
