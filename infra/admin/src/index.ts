import { getDashboardHtml } from "./dashboard";

interface Env {
  ROUTING_CONFIG: KVNamespace;
  ASSETS: R2Bucket;
  GITHUB_TOKEN: string;
  GITHUB_REPO: string;
  AUDIT_WEBHOOK_SECRET: string;
}

type AuditAction =
  | "config_updated"
  | "deploy_triggered"
  | "release_completed"
  | "override_added"
  | "override_removed";

interface AuditEntry {
  id: string;
  timestamp: string;
  action: AuditAction;
  details: Record<string, unknown>;
  source: "dashboard" | "ci";
  user?: string;
}

interface RoutingConfig {
  default: string;
  overrides?: Array<{ desktopRange: string; webBuildId: string }>;
  activeVersions: string[];
}

const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

const CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data:; connect-src 'self'; font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; object-src 'none'; base-uri 'self'; form-action 'self'";

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.byteLength !== bufB.byteLength) return false;
  return crypto.subtle.timingSafeEqual(bufA, bufB);
}

function checkOrigin(request: Request): Response | null {
  if (request.method === "GET") return null;
  const origin = request.headers.get("origin");
  if (!origin) return jsonResponse({ error: "forbidden", message: "Missing origin header" }, 403);
  const url = new URL(request.url);
  if (origin !== url.origin) return jsonResponse({ error: "forbidden", message: "Origin mismatch" }, 403);
  return null;
}

function jsonResponse(body: unknown, status: number): Response {
  const headers = new Headers({
    "content-type": "application/json",
    ...SECURITY_HEADERS,
  });
  return new Response(JSON.stringify(body), { status, headers });
}

function htmlResponse(body: string): Response {
  const headers = new Headers({
    "content-type": "text/html; charset=utf-8",
    "content-security-policy": CSP,
    ...SECURITY_HEADERS,
  });
  return new Response(body, { status: 200, headers });
}

async function parseJsonBody(request: Request): Promise<{ data: unknown } | Response> {
  try {
    return { data: await request.json() };
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }
}

const BUILD_ID_PATTERN = /^\d+\.\d+\.\d+-\d+$/;

function validateConfig(data: unknown): data is RoutingConfig {
  if (!data || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;
  if (typeof obj.default !== "string") return false;
  if (!Array.isArray(obj.activeVersions)) return false;
  for (const v of obj.activeVersions) {
    if (typeof v !== "string" || !BUILD_ID_PATTERN.test(v)) return false;
  }
  if (obj.default !== "" && !BUILD_ID_PATTERN.test(obj.default)) return false;
  if (obj.overrides !== undefined) {
    if (!Array.isArray(obj.overrides)) return false;
    for (const o of obj.overrides) {
      if (!o || typeof o !== "object") return false;
      if (typeof o.desktopRange !== "string" || !o.desktopRange.trim()) return false;
      if (typeof o.webBuildId !== "string" || !BUILD_ID_PATTERN.test(o.webBuildId)) return false;
    }
  }
  return true;
}

async function writeAuditEntry(
  env: Env,
  action: AuditAction,
  details: Record<string, unknown>,
  source: "dashboard" | "ci",
  user?: string,
): Promise<AuditEntry> {
  const timestamp = new Date().toISOString();
  const entry: AuditEntry = {
    id: crypto.randomUUID(),
    timestamp,
    action,
    details,
    source,
    ...(user && { user }),
  };
  const sortKey = String(9999999999999 - Date.now()).padStart(13, "0");
  await env.ROUTING_CONFIG.put(`audit:${sortKey}:${entry.id}`, JSON.stringify(entry));
  return entry;
}

async function handleGetConfig(env: Env): Promise<Response> {
  const data = await env.ROUTING_CONFIG.get<RoutingConfig>("config", { type: "json" });
  if (!data) {
    return jsonResponse({ default: "", overrides: [], activeVersions: [] }, 200);
  }
  return jsonResponse(data, 200);
}

async function handlePutConfig(request: Request, env: Env): Promise<Response> {
  const parsed = await parseJsonBody(request);
  if (parsed instanceof Response) return parsed;
  const body = parsed.data;

  if (!validateConfig(body)) {
    return jsonResponse({ error: "invalid_config" }, 400);
  }

  const previous = await env.ROUTING_CONFIG.get<RoutingConfig>("config", { type: "json" });

  const config: RoutingConfig = {
    default: body.default,
    overrides: body.overrides ?? [],
    activeVersions: body.activeVersions,
  };

  await env.ROUTING_CONFIG.put("config", JSON.stringify(config));
  const user = request.headers.get("Cf-Access-Authenticated-User-Email") || undefined;
  await writeAuditEntry(env, "config_updated", { before: previous, after: config }, "dashboard", user);
  return jsonResponse(config, 200);
}

async function handleDeploy(request: Request, env: Env): Promise<Response> {
  const parsed = await parseJsonBody(request);
  if (parsed instanceof Response) return parsed;
  const body = parsed.data;

  if (!body || typeof body !== "object" || typeof (body as Record<string, unknown>).setAsDefault !== "boolean") {
    return jsonResponse({ error: "invalid_body", message: "Expected { setAsDefault: boolean }" }, 400);
  }

  const { setAsDefault } = body as { setAsDefault: boolean };

  const response = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/release-web.yml/dispatches`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
        "Accept": "application/vnd.github+v3+json",
        "User-Agent": "accomplish-admin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: { set_as_default: String(setAsDefault) },
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    console.error("GitHub API error:", response.status, text);
    return jsonResponse({ error: "github_api_error", status: response.status, message: "Failed to trigger deploy" }, 502);
  }

  const user = request.headers.get("Cf-Access-Authenticated-User-Email") || undefined;
  await writeAuditEntry(env, "deploy_triggered", { setAsDefault }, "dashboard", user);

  return jsonResponse({ dispatched: true, setAsDefault }, 202);
}

async function handleGetManifest(env: Env, buildId: string): Promise<Response> {
  if (!BUILD_ID_PATTERN.test(buildId)) {
    return jsonResponse({ error: "invalid_build_id" }, 400);
  }
  const key = `builds/v${buildId}-lite/manifest.json`;
  const object = await env.ASSETS.get(key);
  if (!object) {
    return jsonResponse({ error: "not_found" }, 404);
  }
  const data = await object.json();
  return jsonResponse(data, 200);
}

async function handleGetAudit(env: Env, url: URL): Promise<Response> {
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1), 200);
  const cursor = url.searchParams.get("cursor") ?? undefined;

  const listed = await env.ROUTING_CONFIG.list({ prefix: "audit:", limit, cursor });
  const entries: AuditEntry[] = [];
  for (const key of listed.keys) {
    const value = await env.ROUTING_CONFIG.get<AuditEntry>(key.name, { type: "json" });
    if (value) entries.push(value);
  }

  entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const result: { entries: AuditEntry[]; cursor?: string } = { entries };
  if (!listed.list_complete) {
    result.cursor = listed.cursor;
  }
  return jsonResponse(result, 200);
}

async function handlePostAudit(request: Request, env: Env): Promise<Response> {
  const secret = request.headers.get("x-audit-secret");
  if (!secret || !timingSafeEqual(secret, env.AUDIT_WEBHOOK_SECRET)) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const parsed = await parseJsonBody(request);
  if (parsed instanceof Response) return parsed;
  const body = parsed.data;

  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "invalid_body" }, 400);
  }
  const obj = body as Record<string, unknown>;

  const validActions: AuditAction[] = ["config_updated", "deploy_triggered", "release_completed", "override_added", "override_removed"];
  if (typeof obj.action !== "string" || !validActions.includes(obj.action as AuditAction)) {
    return jsonResponse({ error: "invalid_action" }, 400);
  }

  if (!obj.details || typeof obj.details !== "object") {
    return jsonResponse({ error: "invalid_details" }, 400);
  }

  const entry = await writeAuditEntry(
    env,
    obj.action as AuditAction,
    obj.details as Record<string, unknown>,
    "ci",
  );

  return jsonResponse(entry, 201);
}

async function handleListBuilds(env: Env): Promise<Response> {
  const listed = await env.ASSETS.list({ prefix: "builds/v", delimiter: "/" });
  const buildIds = new Set<string>();
  for (const prefix of listed.delimitedPrefixes) {
    const match = prefix.match(/^builds\/v(.+)-(lite|enterprise)\/$/);
    if (match) {
      buildIds.add(match[1]);
    }
  }
  return jsonResponse([...buildIds].sort(), 200);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === "/" && request.method === "GET") {
      return htmlResponse(getDashboardHtml());
    }

    if (pathname.startsWith("/api/")) {
      if (pathname === "/api/config" && request.method === "GET") {
        return handleGetConfig(env);
      }
      if (pathname === "/api/config" && request.method === "PUT") {
        const originErr = checkOrigin(request);
        if (originErr) return originErr;
        return handlePutConfig(request, env);
      }
      if (pathname === "/api/deploy" && request.method === "POST") {
        const originErr = checkOrigin(request);
        if (originErr) return originErr;
        return handleDeploy(request, env);
      }
      if (pathname === "/api/audit" && request.method === "GET") {
        return handleGetAudit(env, url);
      }
      if (pathname === "/api/audit" && request.method === "POST") {
        return handlePostAudit(request, env);
      }

      const buildsMatch = pathname.match(/^\/api\/builds\/([^/]+)\/manifest$/);
      if (buildsMatch && request.method === "GET") {
        return handleGetManifest(env, buildsMatch[1]);
      }
      if (pathname === "/api/builds" && request.method === "GET") {
        return handleListBuilds(env);
      }

      return jsonResponse({ error: "not_found" }, 404);
    }

    return jsonResponse({ error: "not_found" }, 404);
  },
} satisfies ExportedHandler<Env>;
