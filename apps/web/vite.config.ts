import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tier = process.env.APP_TIER || 'lite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/client'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  base: './',
  define: {
    __APP_TIER__: JSON.stringify(tier),
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
});
