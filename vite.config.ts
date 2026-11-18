import { defineConfig } from 'vite';
import { versionPlugin } from './tools/version/version';

/** Vite's own limit for inlining a file into the bundle, bytes. */
const INLINE_BYTES = 4096;

export default defineConfig({
  // GitHub Pages serves the game under /Nauta/ (set by .github/workflows/pages.yml); locally it is /.
  base: process.env.VITE_BASE ?? '/',
  // The version and the what's-new history, worked out from git at build time (tools/version/version.ts).
  plugins: [versionPlugin()],
  // One three.js: the vendored packages must not bring a second copy (it would split TSL's state).
  resolve: { dedupe: ['three'] },
  server: { port: 5300, host: true, fs: { allow: ['.', 'vendor/assetgenerator/packages'] } },
  preview: { port: 5301 },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 2000,
    // The title's stills (src/title/still-*.jpg) go inside the style sheet, so they show at the page's first paint;
    // other files are inlined under 4 KB, as by default.
    assetsInlineLimit: (file, content) => (/[\\/]title[\\/]still-[a-z]+\.jpg$/.test(file) ? true : content.length < INLINE_BYTES),
    // three.js in a chunk of its own: it changes only on an upgrade, so the browser keeps it cached.
    rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'three', test: /[\\/]node_modules[\\/]three[\\/]/ }] } } },
  },
});
