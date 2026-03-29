import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  outDir: '../dist/bitbucket',
  clean: true,
  // Bundle all dependencies into a single file
  noExternal: [/.*/],
});
