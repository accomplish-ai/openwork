import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vite plugin: compile theme-core.ts → public/theme-init.js as an IIFE.
 * Runs at the start of every build (dev + production) so the early-boot script
 * is always in sync with the TypeScript source.
 */
function buildThemeInit(): import('vite').Plugin {
  return {
    name: 'build-theme-init',
    async buildStart() {
      await esbuild.build({
        stdin: {
          contents: `import { initEarlyTheme } from './src/client/lib/theme-core.ts'; initEarlyTheme();`,
          resolveDir: __dirname,
          loader: 'ts',
        },
        bundle: true,
        format: 'iife',
        outfile: path.resolve(__dirname, 'public/theme-init.js'),
        platform: 'browser',
        minify: false,
      });
    },
  };
}

export default defineConfig({
  plugins: [buildThemeInit(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/client'),
      '@accomplish_ai/agent-core/common': path.resolve(
        __dirname,
        '../../packages/agent-core/src/common',
      ),
      '@accomplish_ai/agent-core': path.resolve(__dirname, '../../packages/agent-core/src'),
      '@locales': path.resolve(__dirname, 'locales'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  base: './',
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
});
