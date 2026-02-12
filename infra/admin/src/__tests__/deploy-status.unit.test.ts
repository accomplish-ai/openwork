import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockEnv, createMockExecutionContext } from "./setup";

import worker from "../index";

function makeRequest(path: string): Request {
  return new Request(`https://admin.example.com${path}`);
}

describe("GET /api/deploy/status", () => {
  const ctx = createMockExecutionContext();
  let env: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    vi.restoreAllMocks();
    env = createMockEnv();
  });

  it("returns run status from GitHub API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        status: "completed",
        conclusion: "success",
        html_url: "https://github.com/test/repo/actions/runs/12345",
      }), { status: 200 }),
    ));

    const res = await worker.fetch(makeRequest("/api/deploy/status?run_id=12345"), env, ctx);
    expect(res.status).toBe(200);

    const body = await res.json() as { status: string; conclusion: string; htmlUrl: string };
    expect(body.status).toBe("completed");
    expect(body.conclusion).toBe("success");
  });

  it("returns 400 for missing run_id", async () => {
    const res = await worker.fetch(makeRequest("/api/deploy/status"), env, ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid run_id", async () => {
    const res = await worker.fetch(makeRequest("/api/deploy/status?run_id=abc"), env, ctx);
    expect(res.status).toBe(400);
  });
});
