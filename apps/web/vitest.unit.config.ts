import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
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
    globals: true,
    root: __dirname,
    include: ['__tests__/**/*.unit.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    setupFiles: ['__tests__/setup.ts'],
    environment: 'jsdom',
    testTimeout: 5000,
    hookTimeout: 10000,
  },
});
