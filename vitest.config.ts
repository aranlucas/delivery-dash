import { defineConfig } from "vitest/config";

// Unit tests use Node; keep the app's Cloudflare/Vite plugins out of this runner.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["test/**/*.test.ts"],
    // Live-worker scenarios use the opt-in Vitest integration configuration.
    exclude: ["test/integration/**"],
    environment: "node",
    isolate: true,
    sequence: { concurrent: false },
  },
});
