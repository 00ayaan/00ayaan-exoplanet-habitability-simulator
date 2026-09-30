/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// base: './' keeps every asset path relative, so the same build works on
// GitHub Pages (served from /<repo>/) and inside a Capacitor native shell
// (served from the app bundle). Do not change to an absolute base.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: true,
  },
  test: {
    include: ['tests/**/*.test.ts', 'validation/**/*.test.ts'],
    environment: 'node',
  },
});
