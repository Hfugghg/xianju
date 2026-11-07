import { defineConfig } from 'vite';

// Cross-origin isolation exposes SharedArrayBuffer, which ONNX Runtime Web needs
// for multi-threaded WASM. GitHub Pages cannot set response headers, so production
// uses public/sw.js; dev and preview set them here.
const crossOriginHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  base: './',
  server: { headers: crossOriginHeaders },
  preview: { headers: crossOriginHeaders },
});
