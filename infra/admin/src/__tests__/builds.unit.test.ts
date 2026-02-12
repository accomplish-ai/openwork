import { describe, it, expect } from "vitest";
import { createMockEnv, createMockExecutionContext, type MockKVEntry } from "./setup";

import worker from "../index";

function makeRequest(path: string): Request {
  return new Request(`https://admin.example.com${path}`);
}

describe("GET /api/builds (KV manifests)", () => {
  const ctx = createMockExecutionContext();

  it("returns builds from KV manifest keys", async () => {
    const kvStore = new Map<string, MockKVEntry>();
    kvStore.set("manifest:0.1.0-1", { value: JSON.stringify({ buildId: "0.1.0-1" }) });
    kvStore.set("manifest:0.2.0-2", { value: JSON.stringify({ buildId: "0.2.0-2" }) });
    const env = createMockEnv({ kvStore });

    const res = await worker.fetch(makeRequest("/api/builds"), env, ctx);
    expect(res.status).toBe(200);

    const body = await res.json() as Array<{ buildId: string }>;
    expect(body).toEqual([
      { buildId: "0.1.0-1" },
      { buildId: "0.2.0-2" },
    ]);
  });
});
