import { defineConfig } from "vitest/config";

// Unit tests use Node; keep the app's Cloudflare/Vite plugins out of this runner.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    isolate: true,
    sequence: { concurrent: false },
  },
});
