import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron';
import path from 'path';
import pkg from './package.json';

const tier = process.env.APP_TIER || 'lite';
if (tier !== 'lite' && tier !== 'enterprise') {
  throw new Error(`Invalid APP_TIER: "${tier}". Must be "lite" or "enterprise".`);
}

export default defineConfig(() => ({
  plugins: [
    electron([
      {
        entry: 'src/main/index.ts',
        onstart({ startup }) {
          startup();
        },
        vite: {
          define: {
            __APP_TIER__: JSON.stringify(tier),
            __APP_VERSION__: JSON.stringify(pkg.version),
          },
          resolve: {
            alias: {
              '@main': path.resolve(__dirname, 'src/main'),
            },
          },
          build: {
            outDir: 'dist-electron/main',
            rollupOptions: {
              external: ['electron', 'electron-store', 'keytar', 'node-pty', 'better-sqlite3'],
            },
          },
        },
      },
      {
        entry: 'src/preload/index.ts',
        onstart({ reload }) {
          reload();
        },
        vite: {
          define: {
            'process.env.npm_package_version': JSON.stringify(pkg.version),
          },
          build: {
            outDir: 'dist-electron/preload',
            lib: {
              formats: ['cjs'],
              fileName: (format, entryName) =>
                format === 'cjs' ? `${entryName}.cjs` : `${entryName}.mjs`,
            },
            rollupOptions: {
              external: ['electron'],
              output: {
                inlineDynamicImports: true,
              },
            },
          },
        },
      },
    ]),
  ],
}));
