import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Playwright owns the e2e/ specs; keep Vitest from ever picking them up.
    exclude: ['node_modules/**', 'dist/**', '.next/**', 'e2e/**'],
  },
});
