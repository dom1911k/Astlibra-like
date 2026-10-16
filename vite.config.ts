import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build --mode single` produces dist-single/index.html with every script, style and
// font inlined: a single file that plays by double-clicking it (no server, no install).
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build:
    mode === 'single'
      ? { target: 'es2022', outDir: 'dist-single', assetsInlineLimit: 100_000_000, sourcemap: false }
      : { target: 'es2022', outDir: 'dist', sourcemap: true },
  server: { port: 5173 },
  test: { include: ['tests/**/*.test.ts'] },
}) as any);
