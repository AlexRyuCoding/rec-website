import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

// The tests that need a real PostgREST and Postgres (Docker). Run through
// `npm run test:rest`, which starts both — never by `npm test`.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.integration.test.ts"],
    // One database for every case: one file at a time, and room for the
    // case that adds a thousand rows.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
