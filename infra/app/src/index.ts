interface Env {
  ASSETS: R2Bucket;
  TIER: string;
  VERSION: string;
  R2_PREFIX: string;
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

function getExtension(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? "" : path.substring(dot).toLowerCase();
}

function getContentType(path: string): string {
  return CONTENT_TYPES[getExtension(path)] ?? "application/octet-stream";
}

function getCacheControl(path: string): string {
  // index.html: always revalidate
  if (path.endsWith("/index.html") || path === "index.html") {
    return "no-cache";
  }
  // Hashed assets (Vite output: assets/index-AbCd1234.js)
  const ext = getExtension(path);
  if (path.includes("/assets/") && (ext === ".js" || ext === ".css")) {
    return "public, max-age=31536000, immutable";
  }
  // Everything else
  return "public, max-age=3600";
}

function hasFileExtension(path: string): boolean {
  const lastSegment = path.split("/").pop() ?? "";
  return lastSegment.includes(".");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Health check
    if (pathname === "/health") {
      return Response.json({
        version: env.VERSION,
        tier: env.TIER,
        status: "ok",
      });
    }

    // Resolve R2 key
    const assetPath = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
    if (assetPath.includes("..")) {
      return new Response("Bad Request", { status: 400 });
    }
    const r2Key = env.R2_PREFIX + assetPath;

    try {
      let object = await env.ASSETS.get(r2Key);

      // SPA fallback: if not found and no file extension, serve index.html
      if (!object && !hasFileExtension(assetPath)) {
        const fallbackKey = env.R2_PREFIX + "index.html";
        object = await env.ASSETS.get(fallbackKey);
        if (object) {
          return new Response(object.body, {
            status: 200,
            headers: {
              "content-type": "text/html; charset=utf-8",
              "cache-control": "no-cache",
              ...(object.etag ? { etag: object.etag } : {}),
            },
          });
        }
      }

      // 404 for missing files
      if (!object) {
        return new Response("Not Found", { status: 404 });
      }

      // Serve the asset
      return new Response(object.body, {
        status: 200,
        headers: {
          "content-type": getContentType(assetPath),
          "cache-control": getCacheControl(assetPath),
          ...(object.etag ? { etag: object.etag } : {}),
        },
      });
    } catch (err) {
      console.error("R2 asset fetch failed:", err);
      return new Response("Internal Server Error", { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
