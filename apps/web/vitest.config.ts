import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  // Property tests (fast-check) run hundreds of cases; under a parallel run they exceed the 5 s default.
  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'], testTimeout: 60_000 },
});
