import { bindings, defineConfig, exports } from "cf/config";

export default defineConfig({
  worker: {
    name: "delivery-dash",
    exports: { RaceRoom: exports.durableObject({ storage: "sqlite" }) },
    compatibilityDate: "2026-07-31",
    entrypoint: "./src/worker/index.ts",
    observability: {
      enabled: true,
    },
    assets: {
      notFoundHandling: "single-page-application",
    },
    env: {
      RACE_ROOM: bindings.durableObject({
        worker: "delivery-dash",
        exportName: "RaceRoom",
      }),
    },
  },
});
