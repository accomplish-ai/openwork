import { describe, it, expect } from "vitest";
import { createMockEnv, createMockExecutionContext } from "./setup";

import worker from "../index";

function makeRequest(path: string): Request {
  return new Request(`https://admin.example.com${path}`);
}

describe("GET /api/builds (multi-tier)", () => {
  const ctx = createMockExecutionContext();

  it("returns builds with tier info", async () => {
    const r2Objects = new Map<string, unknown>();
    r2Objects.set("builds/v0.1.0-1-lite/index.html", {});
    r2Objects.set("builds/v0.1.0-1-enterprise/index.html", {});
    r2Objects.set("builds/v0.2.0-2-lite/index.html", {});
    const env = createMockEnv({ r2Objects });

    const res = await worker.fetch(makeRequest("/api/builds"), env, ctx);
    expect(res.status).toBe(200);

    const body = await res.json() as Array<{ buildId: string; tiers: string[] }>;
    expect(body).toEqual([
      { buildId: "0.1.0-1", tiers: ["enterprise", "lite"] },
      { buildId: "0.2.0-2", tiers: ["lite"] },
    ]);
  });
});
