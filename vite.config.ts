import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { version } from './package.json';

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  clearScreen: false,
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    reporters: 'default',
  },
});
