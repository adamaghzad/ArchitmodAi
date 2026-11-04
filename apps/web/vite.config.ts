import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The renderer and quality modes are lazy. Prebundle their dependencies so a
  // first visit cannot trigger Vite's dependency-discovery page reload mid-edit.
  optimizeDeps: {
    include: [
      'three',
      '@react-three/fiber',
      '@react-three/drei',
      '@react-three/postprocessing',
      'postprocessing',
      'three-gpu-pathtracer',
      'three/addons/postprocessing/Pass.js',
      'three/addons/loaders/HDRLoader.js',
      'three/examples/jsm/loaders/GLTFLoader.js',
      'three/addons/utils/BufferGeometryUtils.js',
      'three-mesh-bvh/src/workers/GenerateMeshBVHWorker.js',
    ],
  },
  server: {
    proxy: { '/api': process.env.ARCHAI_API_URL || 'http://127.0.0.1:8000' },
  },
  test: { include: ['src/**/*.test.ts'] },
});
