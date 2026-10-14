import { defineConfig } from "vitest/config";

// Unit tests use Node; keep the app's Cloudflare/Vite plugins out of this runner.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // These live-worker scenarios keep their dedicated Node entry point.
    exclude: ["test/integration/**"],
    environment: "node",
    isolate: true,
    sequence: { concurrent: false },
  },
});
