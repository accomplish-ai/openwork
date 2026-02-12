import { describe, it, expect } from "vitest";
import { createMockEnv, createMockExecutionContext } from "./setup";

import worker from "../index";

function makeRequest(path: string): Request {
  return new Request(`https://admin.example.com${path}`);
}

describe("GET /api/config _meta", () => {
  const ctx = createMockExecutionContext();

  it("includes _meta with accountId, kvNamespaceId, githubRepo", async () => {
    const env = createMockEnv();
    (env as Record<string, unknown>).CLOUDFLARE_ACCOUNT_ID = "abc123";
    (env as Record<string, unknown>).KV_NAMESPACE_ID = "kv456";

    const res = await worker.fetch(makeRequest("/api/config"), env, ctx);
    expect(res.status).toBe(200);

    const body = await res.json() as { _meta: { accountId: string; kvNamespaceId: string; githubRepo: string } };
    expect(body._meta).toEqual({
      accountId: "abc123",
      kvNamespaceId: "kv456",
      githubRepo: "test-org/test-repo",
    });
  });

  it("returns null for missing optional env vars", async () => {
    const env = createMockEnv();

    const res = await worker.fetch(makeRequest("/api/config"), env, ctx);
    const body = await res.json() as { _meta: { accountId: unknown; kvNamespaceId: unknown } };
    expect(body._meta.accountId).toBeNull();
    expect(body._meta.kvNamespaceId).toBeNull();
  });
});
