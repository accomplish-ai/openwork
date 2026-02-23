import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@main', replacement: path.resolve(__dirname, 'src/main') },
      { find: '@renderer', replacement: path.resolve(__dirname, 'src/renderer') },
      { find: '@shared', replacement: path.resolve(__dirname, '../../packages/shared/src') },
      { find: '@', replacement: path.resolve(__dirname, 'src/renderer') },
    ],
  },
  test: {
    name: 'unit',
    globals: true,
    root: __dirname,
    include: ['__tests__/**/*.unit.test.{ts,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-electron/**',
      '**/release/**',
      '__tests__/unit/main/ipc/handlers.unit.test.ts',
    ],
    setupFiles: ['__tests__/setup.ts'],
    environment: 'node',
    environmentMatchGlobs: [
      ['__tests__/**/*.renderer.*.test.{ts,tsx}', 'jsdom'],
      ['__tests__/**/*.renderer.*.unit.test.{ts,tsx}', 'jsdom'],
      ['__tests__/**/*.renderer.*.integration.test.{ts,tsx}', 'jsdom'],
      ['__tests__/**/renderer/**/*.test.{ts,tsx}', 'jsdom'],
    ],
    testTimeout: 5000,
    hookTimeout: 10000,
  },
});
