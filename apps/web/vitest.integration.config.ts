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
      name: 'integration',
      root: __dirname,
      include: ['__tests__/**/*.integration.test.{ts,tsx}'],
      setupFiles: ['__tests__/setup.ts'],
      environment: 'jsdom',
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
