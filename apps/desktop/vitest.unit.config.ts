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
      name: 'unit',
      root: __dirname,
      include: ['__tests__/**/*.unit.test.{ts,tsx}'],
      setupFiles: ['__tests__/setup.ts'],
      environment: 'node',
    },
  }),
);
