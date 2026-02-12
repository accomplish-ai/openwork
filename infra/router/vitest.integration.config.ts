import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

// Auxiliary worker approach fails with vitest-pool-workers (service registration issue).
// Use workers array in miniflare instead, with the compiled app worker bundle.
export default defineWorkersConfig({
  test: {
    include: ["tests/integration/**/*.integration.test.ts"],
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          kvNamespaces: ["ROUTING_CONFIG"],
          workers: [
            {
              name: "app-lite",
              modules: true,
              scriptPath: "./tests/fixtures/app-worker.mjs",
              compatibilityDate: "2024-12-01",
              r2Buckets: ["ASSETS"],
              bindings: { TIER: "lite", VERSION: "0.1.0-1", R2_PREFIX: "builds/v0.1.0-1-lite/" },
            },
            {
              name: "app-enterprise",
              modules: true,
              scriptPath: "./tests/fixtures/app-worker.mjs",
              compatibilityDate: "2024-12-01",
              r2Buckets: ["ASSETS"],
              bindings: { TIER: "enterprise", VERSION: "0.1.0-1", R2_PREFIX: "builds/v0.1.0-1-enterprise/" },
            },
            {
              name: "app-lite-v2",
              modules: true,
              scriptPath: "./tests/fixtures/app-worker.mjs",
              compatibilityDate: "2024-12-01",
              r2Buckets: ["ASSETS"],
              bindings: { TIER: "lite", VERSION: "0.2.0-5", R2_PREFIX: "builds/v0.2.0-5-lite/" },
            },
          ],
          serviceBindings: {
            APP_V0_1_0_1_LITE: "app-lite",
            APP_V0_1_0_1_ENTERPRISE: "app-enterprise",
            APP_V0_2_0_5_LITE: "app-lite-v2",
            APP_LITE: "app-lite",
            APP_ENTERPRISE: "app-enterprise",
          },
        },
      },
    },
  },
});
