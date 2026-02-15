import { defineConfig, mergeConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { sharedTestConfig } from '../../vitest.shared.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default mergeConfig(
  { test: sharedTestConfig },
  defineConfig({
    plugins: [react()],
    define: {
      __APP_TIER__: JSON.stringify(process.env.APP_TIER || 'lite'),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src/client'),
      },
    },
    test: {
      name: 'unit',
      root: __dirname,
      include: ['__tests__/**/*.unit.test.{ts,tsx}'],
      setupFiles: ['__tests__/setup.ts'],
      environment: 'jsdom',
    },
  }),
);
