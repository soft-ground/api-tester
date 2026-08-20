import { defineConfig } from 'vitest/config';

// Integration tests boot the Nest app against a real (test) Postgres, so they run sequentially with
// generous timeouts. Provide DATABASE_URL and apply migrations (`prisma migrate deploy`) beforehand.
export default defineConfig({
  test: {
    include: ['test/integration/**/*.spec.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
