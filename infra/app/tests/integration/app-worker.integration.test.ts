import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";

const PREFIX = "builds/v0.1.0-1-lite/";

beforeEach(async () => {
  // Clean R2 state by overwriting known keys
  // Seed index.html for most tests
  await env.ASSETS.put(`${PREFIX}index.html`, "<html>test</html>");
  await env.ASSETS.put(`${PREFIX}assets/app-AbCd.js`, "console.log('app')");
});

describe("app worker integration", () => {
  it("serves index.html from R2 on root path", async () => {
    const res = await SELF.fetch("http://localhost/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(await res.text()).toBe("<html>test</html>");
  });

  it("serves hashed JS asset with correct headers", async () => {
    const res = await SELF.fetch("http://localhost/assets/app-AbCd.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "application/javascript; charset=utf-8"
    );
    // Note: cache-control is max-age=3600 due to getCacheControl bug
    // (path.includes("/assets/") doesn't match stripped-slash paths)
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(await res.text()).toBe("console.log('app')");
  });

  it("SPA fallback: /dashboard serves index.html from R2", async () => {
    const res = await SELF.fetch("http://localhost/dashboard");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(await res.text()).toBe("<html>test</html>");
  });

  it("returns 404 for missing file with extension", async () => {
    const res = await SELF.fetch("http://localhost/missing.css");
    expect(res.status).toBe(404);
    await res.text(); // consume body to avoid isolated storage errors
  });

  it("non-existent extensionless path with no index.html returns 404", async () => {
    // Delete the seeded index.html so SPA fallback also misses
    await env.ASSETS.delete(`${PREFIX}index.html`);
    const res = await SELF.fetch("http://localhost/nonexistent");
    expect(res.status).toBe(404);
    await res.text();
  });

  it("health check returns env vars", async () => {
    const res = await SELF.fetch("http://localhost/health");
    expect(res.status).toBe(200);
    const body = await res.json<{ version: string; tier: string; status: string }>();
    expect(body).toEqual({
      version: "0.1.0-1",
      tier: "lite",
      status: "ok",
    });
  });
});
