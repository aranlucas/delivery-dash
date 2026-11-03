import { defineConfig } from "vitest/config";

// Opt-in live-worker tests keep their real protocol assertions and socket cleanup.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["test/integration/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    maxWorkers: 1,
    sequence: { concurrent: false },
    // The optional Rush Hour check waits for the actual 180-second server deadline.
    testTimeout: 240_000,
  },
});
