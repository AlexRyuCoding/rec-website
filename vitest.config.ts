import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

// Lets a test import a route handler, which (like the rest of the app)
// refers to its own modules as "@/lib/…".
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
