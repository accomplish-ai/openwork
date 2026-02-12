// app/src/index.ts
var CONTENT_TYPES = {
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
  ".webmanifest": "application/manifest+json"
};
function getExtension(path) {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? "" : path.substring(dot).toLowerCase();
}
function getContentType(path) {
  return CONTENT_TYPES[getExtension(path)] ?? "application/octet-stream";
}
function getCacheControl(path) {
  if (path.endsWith("/index.html") || path === "index.html") {
    return "no-cache";
  }
  if (path.includes("/assets/")) {
    return "public, max-age=31536000, immutable";
  }
  return "public, max-age=3600";
}
var SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()"
};
var CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'";
function secureResponse(body, init) {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(body, { ...init, headers });
}
function hasFileExtension(path) {
  const lastSegment = path.split("/").pop() ?? "";
  return lastSegment.includes(".");
}
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    if (pathname === "/health") {
      return secureResponse(JSON.stringify({ version: env.VERSION, tier: env.TIER, status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    const assetPath = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
    if (assetPath.includes("..")) {
      return secureResponse("Bad Request", { status: 400 });
    }
    const r2Key = env.R2_PREFIX + assetPath;
    try {
      let object = await env.ASSETS.get(r2Key);
      if (!object && !hasFileExtension(assetPath)) {
        const fallbackKey = env.R2_PREFIX + "index.html";
        object = await env.ASSETS.get(fallbackKey);
        if (object) {
          return secureResponse(object.body, {
            status: 200,
            headers: {
              "content-type": "text/html; charset=utf-8",
              "cache-control": "no-cache",
              "content-security-policy": CSP,
              ...object.etag ? { etag: object.etag } : {}
            }
          });
        }
      }
      if (!object) {
        return secureResponse("Not Found", { status: 404 });
      }
      const contentType = getContentType(assetPath);
      const isHtml = contentType.startsWith("text/html");
      return secureResponse(object.body, {
        status: 200,
        headers: {
          "content-type": contentType,
          "cache-control": getCacheControl(assetPath),
          ...isHtml ? { "content-security-policy": CSP } : {},
          ...object.etag ? { etag: object.etag } : {}
        }
      });
    } catch (err) {
      console.error("R2 asset fetch failed:", err);
      return secureResponse("Internal Server Error", { status: 500 });
    }
  }
};
export {
  CONTENT_TYPES,
  index_default as default,
  getCacheControl,
  getContentType,
  getExtension,
  hasFileExtension
};
