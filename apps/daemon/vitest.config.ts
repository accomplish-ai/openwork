import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@accomplish_ai/agent-core': path.resolve(__dirname, '../../packages/agent-core/src'),
      '@accomplish_ai/agent-core/*': path.resolve(__dirname, '../../packages/agent-core/src/*'),
    },
  },
  test: {
    globals: true,
    root: __dirname,
    include: ['__tests__/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
    testTimeout: 5000,
    hookTimeout: 10000,
  },
});
