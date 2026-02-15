import { defineConfig, mergeConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { sharedTestConfig } from '../../vitest.shared.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default mergeConfig(
  { test: sharedTestConfig },
  defineConfig({
    resolve: {
      alias: {
        '@main': path.resolve(__dirname, 'src/main'),
      },
    },
    test: {
      name: 'integration',
      root: __dirname,
      include: ['__tests__/**/*.integration.test.{ts,tsx}'],
      setupFiles: ['__tests__/setup.ts'],
      environment: 'node',
      testTimeout: 10000,
      hookTimeout: 15000,
      server: {
        deps: {
          inline: ['@accomplish_ai/agent-core'],
        },
      },
    },
  }),
);
