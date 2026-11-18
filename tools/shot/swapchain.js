/**
 * A stand-in for the canvas's WebGPU swap chain, injected by browser.mjs before the page runs (unless SHOT_GPU is set).
 * Headless Chromium's software GPU (SwiftShader) computes and renders to textures but cannot present to a canvas: the
 * device is lost on the first frame ("A valid external Instance reference no longer exists"). So `getContext('webgpu')`
 * hands back a context whose current texture is a plain texture; `window.__presentWebGPU()` reads the last frame back and
 * paints it into the same canvas through its 2D context, for the screenshot. The page itself is not changed.
 */
(() => {
  if (!('gpu' in navigator)) return;
  const realGetContext = HTMLCanvasElement.prototype.getContext;
  let last = null;
  class StandInContext {
    constructor(canvas) { this.canvas = canvas; this.config = null; this.tex = null; }
    configure(config) { this.config = config; this.tex = null; }
    unconfigure() { this.config = null; this.tex = null; }
    getConfiguration() { return this.config; }
    getCurrentTexture() {
      const { canvas, config } = this, w = Math.max(1, canvas.width), h = Math.max(1, canvas.height);
      if (!this.tex || this.tex.width !== w || this.tex.height !== h) {
        this.tex?.destroy();
        this.tex = config.device.createTexture({
          size: [w, h], format: config.format,
          usage: (config.usage ?? GPUTextureUsage.RENDER_ATTACHMENT) | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING,
        });
      }
      last = this;
      return this.tex;
    }
  }
  HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
    if (kind !== 'webgpu') return realGetContext.call(this, kind, ...rest);
    this.__standIn ??= new StandInContext(this);
    return this.__standIn;
  };
  window.__presentWebGPU = async () => {
    if (!last?.tex) return false;
    const { tex, config, canvas } = last, device = config.device, w = tex.width, h = tex.height;
    const row = Math.ceil((w * 4) / 256) * 256;
    const buf = device.createBuffer({ size: row * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = device.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: row }, [w, h]);
    device.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const src = new Uint8Array(buf.getMappedRange()), img = new ImageData(w, h), bgra = config.format.startsWith('bgra');
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const s = y * row + x * 4, d = (y * w + x) * 4;
      img.data[d] = src[s + (bgra ? 2 : 0)]; img.data[d + 1] = src[s + 1]; img.data[d + 2] = src[s + (bgra ? 0 : 2)]; img.data[d + 3] = 255;
    }
    buf.unmap();
    realGetContext.call(canvas, '2d').putImageData(img, 0, 0);
    return true;
  };
})();
