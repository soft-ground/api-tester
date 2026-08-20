import { defineConfig } from 'vitest/config';

// Unit tests (fast, no database). Integration tests live under test/integration and are excluded
// here; run those with `npm run test:integration` (needs a DATABASE_URL to a throwaway test DB).
export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
    exclude: ['test/integration/**', 'node_modules/**'],
  },
});
