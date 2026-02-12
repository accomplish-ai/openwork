import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    include: ["tests/integration/**/*.integration.test.ts"],
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          bindings: { TIER: "lite", VERSION: "0.1.0-1", R2_PREFIX: "builds/v0.1.0-1-lite/" },
          r2Buckets: ["ASSETS"],
        },
      },
    },
  },
});
