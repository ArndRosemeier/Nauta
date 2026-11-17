import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages serves the game under /Nauta/ (set by .github/workflows/pages.yml); locally it is /.
  base: process.env.VITE_BASE ?? '/',
  // One three.js: the vendored packages must not bring a second copy (it would split TSL's state).
  resolve: { dedupe: ['three'] },
  server: { port: 5300, host: true, fs: { allow: ['.', 'vendor/assetgenerator/packages'] } },
  preview: { port: 5301 },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 2000,
    // three.js in a chunk of its own: it changes only on an upgrade, so the browser keeps it cached.
    rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'three', test: /[\\/]node_modules[\\/]three[\\/]/ }] } } },
  },
});
