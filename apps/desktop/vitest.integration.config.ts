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
    name: 'integration',
    globals: true,
    root: __dirname,
    include: ['__tests__/**/*.integration.test.{ts,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-electron/**',
      '**/release/**',
      '__tests__/integration/main/taskHistory.integration.test.ts',
      '__tests__/integration/renderer/taskStore.integration.test.ts',
      '__tests__/integration/main/store/freshInstallCleanup.integration.test.ts',
      '__tests__/integration/main/desktop-control.preflight.integration.test.ts',
      '__tests__/integration/renderer/**/*.integration.test.tsx',
      '__tests__/integration/main/appSettings.integration.test.ts',
      '__tests__/integration/main/secureStorage.integration.test.ts',
      '__tests__/integration/main/opencode/config-generator.integration.test.ts',
    ],
    setupFiles: ['__tests__/setup.ts'],
    environment: 'node',
    environmentMatchGlobs: [
      ['__tests__/**/*.renderer.*.test.{ts,tsx}', 'jsdom'],
      ['__tests__/**/*.renderer.*.unit.test.{ts,tsx}', 'jsdom'],
      ['__tests__/**/*.renderer.*.integration.test.{ts,tsx}', 'jsdom'],
      ['__tests__/**/renderer/**/*.test.{ts,tsx}', 'jsdom'],
    ],
    // Integration tests may need longer timeouts
    testTimeout: 10000,
    hookTimeout: 15000,
  },
});
