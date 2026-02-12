import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockEnv, createMockExecutionContext } from "./setup";
import type { MockKVEntry } from "./setup";

import worker from "../index";

function makeRequest(path: string, method = "GET"): Request {
  return new Request(`https://admin.example.com${path}`, { method });
}

describe("global error handler", () => {
  let env: ReturnType<typeof createMockEnv>;
  const ctx = createMockExecutionContext();

  beforeEach(() => {
    vi.restoreAllMocks();
    env = createMockEnv();
  });

  it("returns 500 with generic error when handler throws", async () => {
    (env.ROUTING_CONFIG.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("KV exploded"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await worker.fetch(makeRequest("/api/config"), env, ctx);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "internal_server_error" });
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("does not leak stack traces in error response", async () => {
    (env.ROUTING_CONFIG.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("secret details"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await worker.fetch(makeRequest("/api/config"), env, ctx);
    const text = await res.text();

    expect(text).not.toContain("secret details");
    expect(text).not.toContain("stack");
  });

  it("includes security headers on error response", async () => {
    (env.ROUTING_CONFIG.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await worker.fetch(makeRequest("/api/config"), env, ctx);

    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });

  it("accepts ExecutionContext as third parameter", async () => {
    const res = await worker.fetch(makeRequest("/"), env, ctx);
    expect(res.status).toBe(200);
  });
});
