import { fileURLToPath } from "url";
import { configDefaults, defineConfig } from "vitest/config";

// Lets a test import a route handler, which (like the rest of the app)
// refers to its own modules as "@/lib/…".
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // *.integration.test.ts need a real PostgREST (Docker): they run with
    // `npm run test:rest` (vitest.integration.config.ts), not here.
    exclude: [...configDefaults.exclude, "**/*.integration.test.ts"],
  },
});
