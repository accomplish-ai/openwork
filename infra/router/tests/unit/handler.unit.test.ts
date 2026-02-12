import { describe, it, expect, vi } from "vitest";
import worker from "../../src/index";
import type { RoutingConfig } from "../../src/types";

function createEnv(overrides?: Record<string, unknown>) {
  return {
    ROUTING_CONFIG: { get: vi.fn() },
    KV_CONFIG_KEY: "config",
    APP_LITE: { fetch: vi.fn().mockResolvedValue(new Response("ok")) },
    APP_ENTERPRISE: { fetch: vi.fn().mockResolvedValue(new Response("ok")) },
    ...overrides,
  };
}

function createConfig(overrides?: Partial<RoutingConfig>): RoutingConfig {
  return {
    default: "0.1.0-27",
    activeVersions: ["0.1.0-27"],
    ...overrides,
  };
}

// ----- 2.1 Fallback Path (no KV config) -----

describe("handler — fallback path", () => {
  it("routes to APP_LITE when ROUTING_CONFIG is undefined", async () => {
    const env = createEnv({ ROUTING_CONFIG: undefined });
    const req = new Request("https://example.com/");
    const res = await worker.fetch(req, env as any);
    expect(env.APP_LITE.fetch).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it("routes to APP_LITE when KV returns null", async () => {
    const env = createEnv();
    env.ROUTING_CONFIG.get.mockResolvedValue(null);
    const req = new Request("https://example.com/");
    const res = await worker.fetch(req, env as any);
    expect(env.APP_LITE.fetch).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it("returns 503 when no KV and no fallback binding", async () => {
    const env = createEnv({ ROUTING_CONFIG: undefined, APP_LITE: undefined });
    const req = new Request("https://example.com/");
    const res = await worker.fetch(req, env as any);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "routing_config_unavailable" });
  });
});

// ----- 2.2 Happy Path Routing -----

describe("handler — happy path", () => {
  it("navigation sets cookie on response", async () => {
    const env = createEnv({
      APP_V0_1_0_27_LITE: { fetch: vi.fn().mockResolvedValue(new Response("ok")) },
    });
    (env.ROUTING_CONFIG.get as ReturnType<typeof vi.fn>).mockResolvedValue(createConfig());
    const req = new Request("https://example.com/");
    const res = await worker.fetch(req, env as any);
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("app-version=0.1.0-27:lite");
  });

  it("sub-resource with matching active cookie skips set-cookie", async () => {
    const env = createEnv({
      APP_V0_1_0_27_LITE: { fetch: vi.fn().mockResolvedValue(new Response("ok")) },
    });
    (env.ROUTING_CONFIG.get as ReturnType<typeof vi.fn>).mockResolvedValue(createConfig());
    const req = new Request("https://example.com/assets/app.js", {
      headers: { cookie: "app-version=0.1.0-27:lite" },
    });
    const res = await worker.fetch(req, env as any);
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("sub-resource with stale cookie sets new cookie", async () => {
    const env = createEnv({
      APP_V0_1_0_27_LITE: { fetch: vi.fn().mockResolvedValue(new Response("ok")) },
    });
    (env.ROUTING_CONFIG.get as ReturnType<typeof vi.fn>).mockResolvedValue(createConfig());
    const req = new Request("https://example.com/assets/app.js", {
      headers: { cookie: "app-version=0.0.1-1:lite" },
    });
    const res = await worker.fetch(req, env as any);
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("app-version=0.1.0-27:lite");
  });

  it("override routing uses override buildId", async () => {
    const config = createConfig({
      overrides: [{ desktopRange: ">=1.0.0", webBuildId: "0.2.0-5" }],
      activeVersions: ["0.1.0-27", "0.2.0-5"],
    });
    const env = createEnv({
      APP_V0_2_0_5_LITE: { fetch: vi.fn().mockResolvedValue(new Response("override")) },
    });
    (env.ROUTING_CONFIG.get as ReturnType<typeof vi.fn>).mockResolvedValue(config);
    const req = new Request("https://example.com/?build=1.0.0");
    const res = await worker.fetch(req, env as any);
    expect((env as any).APP_V0_2_0_5_LITE.fetch).toHaveBeenCalled();
    expect(res.headers.get("set-cookie")).toContain("app-version=0.2.0-5:lite");
  });

  it("pin param routes to pinned version", async () => {
    const config = createConfig({
      activeVersions: ["0.1.0-27", "0.2.0-42"],
    });
    const env = createEnv({
      APP_V0_2_0_42_LITE: { fetch: vi.fn().mockResolvedValue(new Response("pinned")) },
    });
    (env.ROUTING_CONFIG.get as ReturnType<typeof vi.fn>).mockResolvedValue(config);
    const req = new Request("https://example.com/?pin=0.2.0-42");
    const res = await worker.fetch(req, env as any);
    expect((env as any).APP_V0_2_0_42_LITE.fetch).toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("app-version=0.2.0-42:lite");
  });

  it("enterprise via type param routes to enterprise binding", async () => {
    const config = createConfig({
      overrides: [{ desktopRange: ">=1.0.0", webBuildId: "0.1.0-27" }],
    });
    const env = createEnv({
      APP_V0_1_0_27_ENTERPRISE: { fetch: vi.fn().mockResolvedValue(new Response("enterprise")) },
    });
    (env.ROUTING_CONFIG.get as ReturnType<typeof vi.fn>).mockResolvedValue(config);
    const req = new Request("https://example.com/?type=enterprise&build=1.0.0");
    const res = await worker.fetch(req, env as any);
    expect((env as any).APP_V0_1_0_27_ENTERPRISE.fetch).toHaveBeenCalled();
  });
});

// ----- 2.3 Error Paths -----

describe("handler — error paths", () => {
  it("returns 503 when no default version configured", async () => {
    const env = createEnv();
    (env.ROUTING_CONFIG.get as ReturnType<typeof vi.fn>).mockResolvedValue(
      createConfig({ default: "", activeVersions: [] }),
    );
    const req = new Request("https://example.com/");
    const res = await worker.fetch(req, env as any);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "no_default_version_configured" });
  });

  it("returns 502 when binding not found", async () => {
    const env = createEnv(); // No APP_V0_1_0_27_LITE binding
    (env.ROUTING_CONFIG.get as ReturnType<typeof vi.fn>).mockResolvedValue(createConfig());
    const req = new Request("https://example.com/");
    const res = await worker.fetch(req, env as any);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "version_not_available" });
  });
});
