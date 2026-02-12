import { describe, it, expect, vi, beforeEach } from "vitest";
import worker, {
  getExtension,
  getContentType,
  getCacheControl,
  hasFileExtension,
} from "../../src/index";

function createMockR2Object(
  body: string,
  options?: { etag?: string }
): R2ObjectBody {
  const encoder = new TextEncoder();
  const arrayBuffer = encoder.encode(body).buffer;
  return {
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(body));
        controller.close();
      },
    }),
    bodyUsed: false,
    arrayBuffer: async () => arrayBuffer,
    text: async () => body,
    json: async () => JSON.parse(body),
    blob: async () => new Blob([body]),
    etag: options?.etag ?? "",
    httpEtag: options?.etag ? `"${options.etag}"` : "",
    key: "",
    version: "",
    size: body.length,
    uploaded: new Date(),
    httpMetadata: {},
    customMetadata: {},
    checksums: { toJSON: () => ({}) } as R2Checksums,
    storageClass: "Standard" as const,
    writeHttpMetadata: () => {},
    range: undefined as unknown as R2Range,
    clone: () =>
      createMockR2Object(body, options) as unknown as R2ObjectBody,
  } as unknown as R2ObjectBody;
}

function createEnv(overrides?: Partial<Record<string, unknown>>) {
  return {
    ASSETS: { get: vi.fn() },
    TIER: "lite",
    VERSION: "0.1.0-1",
    R2_PREFIX: "builds/v0.1.0-1-lite/",
    ...overrides,
  };
}

async function callWorker(
  path: string,
  env?: ReturnType<typeof createEnv>
): Promise<Response> {
  const request = new Request(`http://localhost${path}`);
  return worker.fetch(request, (env ?? createEnv()) as any);
}

// ─── Pure Functions ──────────────────────────────────────────────

describe("getExtension", () => {
  it('returns ".html" for "index.html"', () => {
    expect(getExtension("index.html")).toBe(".html");
  });

  it('returns ".css" for uppercase "assets/style.CSS"', () => {
    expect(getExtension("assets/style.CSS")).toBe(".css");
  });

  it('returns "" for "no-extension"', () => {
    expect(getExtension("no-extension")).toBe("");
  });

  it('returns "" for empty string', () => {
    expect(getExtension("")).toBe("");
  });

  it('returns ".gz" for "file.tar.gz"', () => {
    expect(getExtension("file.tar.gz")).toBe(".gz");
  });

  it('returns ".hidden" for ".hidden"', () => {
    expect(getExtension(".hidden")).toBe(".hidden");
  });
});

describe("getContentType", () => {
  it('returns text/html for "index.html"', () => {
    expect(getContentType("index.html")).toBe("text/html; charset=utf-8");
  });

  it('returns application/javascript for "script.js"', () => {
    expect(getContentType("script.js")).toBe(
      "application/javascript; charset=utf-8"
    );
  });

  it('returns image/png for "image.png"', () => {
    expect(getContentType("image.png")).toBe("image/png");
  });

  it('returns font/woff2 for "font.woff2"', () => {
    expect(getContentType("font.woff2")).toBe("font/woff2");
  });

  it('returns application/octet-stream for "unknown.xyz"', () => {
    expect(getContentType("unknown.xyz")).toBe("application/octet-stream");
  });
});

describe("getCacheControl", () => {
  it('returns no-cache for "index.html"', () => {
    expect(getCacheControl("index.html")).toBe("no-cache");
  });

  it('returns no-cache for "builds/v1/index.html"', () => {
    expect(getCacheControl("builds/v1/index.html")).toBe("no-cache");
  });

  it("returns 1hr cache for assets path without leading slash", () => {
    expect(getCacheControl("assets/index-Ab12.js")).toBe(
      "public, max-age=3600"
    );
  });

  it('returns 1hr cache for "favicon.ico"', () => {
    expect(getCacheControl("favicon.ico")).toBe("public, max-age=3600");
  });
});

describe("hasFileExtension", () => {
  it('returns true for "file.js"', () => {
    expect(hasFileExtension("file.js")).toBe(true);
  });

  it('returns false for "path/to/route"', () => {
    expect(hasFileExtension("path/to/route")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(hasFileExtension("")).toBe(false);
  });

  it('returns true for "path/.hidden"', () => {
    expect(hasFileExtension("path/.hidden")).toBe(true);
  });
});

// ─── Fetch Handler ───────────────────────────────────────────────

describe("fetch handler", () => {
  let env: ReturnType<typeof createEnv>;

  beforeEach(() => {
    env = createEnv();
  });

  describe("GET /health", () => {
    it("returns 200 with JSON body containing version, tier, status", async () => {
      const res = await callWorker("/health", env);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");
      const body = await res.json();
      expect(body).toEqual({
        version: "0.1.0-1",
        tier: "lite",
        status: "ok",
      });
    });

    it("reflects custom VERSION and TIER env vars", async () => {
      const customEnv = createEnv({ VERSION: "2.0.0-99", TIER: "enterprise" });
      const res = await callWorker("/health", customEnv);
      const body = await res.json();
      expect(body.version).toBe("2.0.0-99");
      expect(body.tier).toBe("enterprise");
    });
  });

  describe("R2 asset serving", () => {
    it("serves JS asset with correct content-type and cache-control", async () => {
      (env.ASSETS.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        createMockR2Object("console.log('hi')")
      );
      const res = await callWorker("/assets/index-Ab12.js", env);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe(
        "application/javascript; charset=utf-8"
      );
      expect(res.headers.get("cache-control")).toBe(
        "public, max-age=3600"
      );
      expect(await res.text()).toBe("console.log('hi')");
    });

    it("GET / serves index.html from R2", async () => {
      (env.ASSETS.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        createMockR2Object("<html></html>")
      );
      const res = await callWorker("/", env);
      expect(res.status).toBe(200);
      expect(env.ASSETS.get).toHaveBeenCalledWith(
        "builds/v0.1.0-1-lite/index.html"
      );
      expect(await res.text()).toBe("<html></html>");
    });

    it("includes etag header when R2 object has etag, omits when absent", async () => {
      (env.ASSETS.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        createMockR2Object("body", { etag: "abc123" })
      );
      const withEtag = await callWorker("/file.js", env);
      expect(withEtag.headers.get("etag")).toBe("abc123");

      const env2 = createEnv();
      (env2.ASSETS.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        createMockR2Object("body")
      );
      const withoutEtag = await callWorker("/file.js", env2);
      expect(withoutEtag.headers.get("etag")).toBeNull();
    });
  });

  describe("SPA fallback", () => {
    it("serves index.html for extensionless paths not in R2", async () => {
      (env.ASSETS.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(createMockR2Object("<html>spa</html>"));
      const res = await callWorker("/dashboard", env);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe(
        "text/html; charset=utf-8"
      );
      expect(res.headers.get("cache-control")).toBe("no-cache");
      expect(await res.text()).toBe("<html>spa</html>");
    });

    it("propagates etag from fallback index.html", async () => {
      (env.ASSETS.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(
          createMockR2Object("<html></html>", { etag: "spa-etag" })
        );
      const res = await callWorker("/settings", env);
      expect(res.headers.get("etag")).toBe("spa-etag");
    });

    it("returns 404 when index.html is also missing", async () => {
      (env.ASSETS.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      const res = await callWorker("/dashboard", env);
      expect(res.status).toBe(404);
    });
  });

  describe("path traversal", () => {
    it("returns 404 for /../../etc/passwd (URL normalizes .. away)", async () => {
      (env.ASSETS.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
      const res = await callWorker("/../../etc/passwd", env);
      expect(res.status).toBe(404);
    });

    it("returns 404 for /assets/../secret (URL normalizes .. away)", async () => {
      (env.ASSETS.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
      const res = await callWorker("/assets/../secret", env);
      expect(res.status).toBe(404);
    });

    it("returns 404 for percent-encoded traversal (URL normalizes .. away)", async () => {
      (env.ASSETS.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
      const res = await callWorker("/%2e%2e/etc/passwd", env);
      expect(res.status).toBe(404);
    });

    it("allows valid paths without ..", async () => {
      (env.ASSETS.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        createMockR2Object("ok")
      );
      const res = await callWorker("/valid/path.js", env);
      expect(res.status).toBe(200);
    });
  });

  describe("404 handling", () => {
    it("returns 404 for missing file with extension", async () => {
      (env.ASSETS.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        null
      );
      const res = await callWorker("/missing.js", env);
      expect(res.status).toBe(404);
      expect(await res.text()).toBe("Not Found");
    });
  });

  describe("R2 errors", () => {
    it("returns 500 when R2.get() throws", async () => {
      (env.ASSETS.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("R2 failure")
      );
      const res = await callWorker("/file.js", env);
      expect(res.status).toBe(500);
      expect(await res.text()).toBe("Internal Server Error");
    });
  });
});
