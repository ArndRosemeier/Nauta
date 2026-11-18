/**
 * Counts what the page asks of the GPU, for `npm run shot:probe` (probe.mjs), injected before the page runs: every
 * pipeline built (how long until ready) and every queue submit (its passes, draws, dispatches and the pipelines first
 * used in it), with the moment the GPU finished it. `window.__gpuProbe` holds them; times are ms from the page's start.
 */
(() => {
  if (!('gpu' in navigator)) return;
  const probe = window.__gpuProbe = { pipelines: [], submits: [] };
  const fresh = () => ({ passes: 0, draws: 0, dispatches: 0, newPipelines: 0, labels: new Set() });
  let open = fresh();
  const used = new WeakSet();
  const wrap = (proto, name, around) => { const real = proto[name]; proto[name] = function (...args) { return around.call(this, real, args); }; };
  for (const name of ['createRenderPipeline', 'createComputePipeline', 'createRenderPipelineAsync', 'createComputePipelineAsync']) {
    wrap(GPUDevice.prototype, name, function (real, args) {
      const at = performance.now(), made = real.apply(this, args);
      const note = () => probe.pipelines.push({ label: args[0]?.label ?? '', at, ms: performance.now() - at });
      if (made instanceof Promise) made.then(note); else note();
      return made;
    });
  }
  for (const name of ['beginRenderPass', 'beginComputePass']) wrap(GPUCommandEncoder.prototype, name, function (real, args) { open.passes++; return real.apply(this, args); });
  const setPipeline = function (real, args) {
    if (!used.has(args[0])) { used.add(args[0]); open.newPipelines++; if (args[0].label) open.labels.add(args[0].label); }
    return real.apply(this, args);
  };
  wrap(GPURenderPassEncoder.prototype, 'setPipeline', setPipeline);
  wrap(GPUComputePassEncoder.prototype, 'setPipeline', setPipeline);
  for (const name of ['draw', 'drawIndexed', 'drawIndirect', 'drawIndexedIndirect']) wrap(GPURenderPassEncoder.prototype, name, function (real, args) { open.draws++; return real.apply(this, args); });
  for (const name of ['dispatchWorkgroups', 'dispatchWorkgroupsIndirect']) wrap(GPUComputePassEncoder.prototype, name, function (real, args) { open.dispatches++; return real.apply(this, args); });
  wrap(GPUQueue.prototype, 'submit', function (real, args) {
    const s = { ...open, labels: [...open.labels].join(', '), at: performance.now(), done: null };
    open = fresh();
    probe.submits.push(s);
    const sent = real.apply(this, args);
    this.onSubmittedWorkDone().then(() => { s.done = performance.now(); });
    return sent;
  });
})();
