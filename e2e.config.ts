import type { E2EConfig } from "e2e";
import { web } from "@e2e-dev/web";

export default {
  tests: "test/e2e/**/*.e2e.ts",
  targets: [
    {
      engine: web({ viewport: { width: 1024, height: 640 } }),
      app: { url: "http://127.0.0.1:5173" },
    },
  ],
  workers: 1,
  retries: 0,
  timeout: 240_000,
  actionTimeout: 60_000,
  assertionTimeout: 30_000,
  trace: "retain-on-failure",
  // Traces and failure screenshots retain evidence without continuous GPU readback.
  video: "off",
} satisfies E2EConfig;
