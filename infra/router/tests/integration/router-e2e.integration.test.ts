import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF } from "cloudflare:test";
import type { RoutingConfig } from "../../src/types";

// Use /health endpoint on auxiliary workers to get 200 responses and verify routing
// (R2 buckets are empty so asset paths return 404, but /health always returns { version, tier, status })

beforeEach(async () => {
  // Clear KV between tests to ensure isolation
  await env.ROUTING_CONFIG.delete("config");
});

function seedKV(config: RoutingConfig) {
  return env.ROUTING_CONFIG.put("config", JSON.stringify(config));
}

describe("router integration — end-to-end", () => {
  it("full flow: KV config → resolve → service binding → response + set-cookie", async () => {
    await seedKV({ default: "0.1.0-1", activeVersions: ["0.1.0-1"] });

    const res = await SELF.fetch("http://localhost/health");

    expect(res.status).toBe(200);
    const body = await res.json<{ version: string; tier: string; status: string }>();
    expect(body).toEqual({ version: "0.1.0-1", tier: "lite", status: "ok" });
    expect(res.headers.get("set-cookie")).toContain("app-version=0.1.0-1:lite");
  });

  it("enterprise tier: ?type=enterprise dispatches to enterprise binding", async () => {
    await seedKV({ default: "0.1.0-1", activeVersions: ["0.1.0-1"] });

    const res = await SELF.fetch("http://localhost/health?type=enterprise");

    expect(res.status).toBe(200);
    const body = await res.json<{ version: string; tier: string; status: string }>();
    expect(body).toEqual({ version: "0.1.0-1", tier: "enterprise", status: "ok" });
    expect(res.headers.get("set-cookie")).toContain("app-version=0.1.0-1:enterprise");
  });

  it("override routing: ?build=1.0.0 dispatches to override binding", async () => {
    await seedKV({
      default: "0.1.0-1",
      overrides: [{ desktopRange: ">=1.0.0", webBuildId: "0.2.0-5" }],
      activeVersions: ["0.1.0-1", "0.2.0-5"],
    });

    const res = await SELF.fetch("http://localhost/health?build=1.0.0");

    expect(res.status).toBe(200);
    const body = await res.json<{ version: string; tier: string; status: string }>();
    expect(body).toEqual({ version: "0.2.0-5", tier: "lite", status: "ok" });
    expect(res.headers.get("set-cookie")).toContain("app-version=0.2.0-5:lite");
  });

  it("empty config: returns 503 no_default_version_configured", async () => {
    await seedKV({ default: "", activeVersions: [] });

    const res = await SELF.fetch("http://localhost/");

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "no_default_version_configured" });
  });

  it("KV unavailable: fallback to APP_LITE binding", async () => {
    // Don't seed KV — get() returns null → fallback path
    const res = await SELF.fetch("http://localhost/health");

    expect(res.status).toBe(200);
    const body = await res.json<{ version: string; tier: string; status: string }>();
    expect(body).toEqual({ version: "0.1.0-1", tier: "lite", status: "ok" });
    // Fallback path does NOT set cookies
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("cookie fast path: sub-resource with valid cookie skips set-cookie", async () => {
    await seedKV({ default: "0.1.0-1", activeVersions: ["0.1.0-1"] });

    const res = await SELF.fetch("http://localhost/assets/app.js", {
      headers: { cookie: "app-version=0.1.0-1:lite" },
    });

    // App worker returns 404 (empty R2), but routing worked via cookie fast path
    expect(res.status).toBe(404);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});
