import type { E2EConfig } from "e2e";
import { web } from "@e2e-dev/web";

export default {
  tests: "test/e2e/**/*.e2e.ts",
  targets: [{ engine: web(), app: { url: "http://127.0.0.1:5173" } }],
  workers: 1,
  retries: 0,
  timeout: 120_000,
  assertionTimeout: 30_000,
  trace: "retain-on-failure",
  video: "retain-on-failure",
} satisfies E2EConfig;
