import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.js'],
  format: ['esm'],
  dts: false,
  clean: true,
  outDir: 'dist',
  target: 'node18',
  minify: false,
  sourcemap: true,
})
