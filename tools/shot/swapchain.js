/**
 * A stand-in for the canvas's WebGPU swap chain, injected by browser.mjs before the page runs (unless SHOT_GPU is set).
 * Headless Chromium's software GPU (SwiftShader) computes and renders to textures but cannot present to a canvas: the
 * device is lost on the first frame ("A valid external Instance reference no longer exists"). So `getContext('webgpu')`
 * hands back a context whose current texture is a plain texture; `window.__presentWebGPU()` reads the last frame back and
 * paints it into the same canvas through its 2D context, for the screenshot. The page itself is not changed.
 *
 * A real swap chain holds the page back while the GPU is behind; a plain texture does not, so the page would queue
 * frames far faster than the software GPU draws them (60 a second against one or two), and a picture taken later waits
 * for minutes of queued frames. So `requestAnimationFrame` here calls back only once the GPU has done the work sent so
 * far, as a swap chain would pace it.
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
  const realRequest = window.requestAnimationFrame.bind(window), realCancel = window.cancelAnimationFrame.bind(window);
  /** Callbacks asked for, by the id handed out: the browser's own id once the GPU has caught up, or null until then. */
  const asked = new Map();
  let nextId = 0;
  window.requestAnimationFrame = (callback) => {
    const id = ++nextId, device = last?.config?.device;
    asked.set(id, null);
    const ask = () => { if (asked.has(id)) asked.set(id, realRequest((t) => { asked.delete(id); callback(t); })); };
    if (device) device.queue.onSubmittedWorkDone().then(ask); else ask();
    return id;
  };
  window.cancelAnimationFrame = (id) => { const real = asked.get(id); if (real) realCancel(real); asked.delete(id); };
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
