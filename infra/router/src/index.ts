import type { Env, RoutingConfig } from "./types";

type Tier = "lite" | "enterprise";

const BUILD_ID_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+-[0-9]+$/;
const COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function slugifyBinding(buildId: string): string {
  return buildId.replace(/[.\-]/g, "_");
}

function bindingName(buildId: string, tier: Tier): string {
  return `APP_V${slugifyBinding(buildId)}_${tier.toUpperCase()}`;
}

function parseCookie(request: Request): { buildId: string; tier: Tier } | null {
  const header = request.headers.get("cookie");
  if (!header) return null;

  const match = header.match(/(?:^|;\s*)app-version=([^;]+)/);
  if (!match) return null;

  const value = match[1];
  const lastColon = value.lastIndexOf(":");
  if (lastColon === -1) return null;

  const buildId = value.slice(0, lastColon);
  const tier = value.slice(lastColon + 1);
  if (tier !== "lite" && tier !== "enterprise") return null;
  if (!BUILD_ID_PATTERN.test(buildId)) return null;

  return { buildId, tier };
}

function setCookieHeader(buildId: string, tier: Tier): string {
  return `app-version=${buildId}:${tier}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

/**
 * Simple semver satisfies check for ranges like ">=1.0.0 <1.1.0".
 * Supports individual constraints: >=, >, <=, <, = (or bare version).
 */
function semverSatisfies(version: string, range: string): boolean {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return false;

  const constraints = range.trim().split(/\s+/);
  for (const constraint of constraints) {
    const opMatch = constraint.match(/^(>=|<=|>|<|=)?(\d+\.\d+\.\d+)$/);
    if (!opMatch) return false;

    const op = opMatch[1] || "=";
    const target = opMatch[2].split(".").map(Number);
    const cmp = compareSemver(parts, target);

    const valid =
      (op === ">=" && cmp >= 0) ||
      (op === "<=" && cmp <= 0) ||
      (op === ">" && cmp > 0) ||
      (op === "<" && cmp < 0) ||
      (op === "=" && cmp === 0);

    if (!valid) return false;
  }
  return true;
}

function compareSemver(a: number[], b: number[]): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function resolveOverride(
  config: RoutingConfig,
  desktopVersion: string | null,
): string | null {
  if (!desktopVersion || !config.overrides) return null;
  for (const override of config.overrides) {
    if (semverSatisfies(desktopVersion, override.desktopRange)) {
      return override.webBuildId;
    }
  }
  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const buildParam = url.searchParams.get("build");
    const tierParam = url.searchParams.get("type");

    const tier: Tier = tierParam === "enterprise" ? "enterprise" : "lite";

    const config = env.ROUTING_CONFIG
      ? await env.ROUTING_CONFIG.get<RoutingConfig>(env.KV_CONFIG_KEY || "config", { type: "json", cacheTtl: 60 })
      : null;

    if (!config) {
      const fallbackBinding = `APP_${tier.toUpperCase()}`;
      const fallbackWorker = (env as Record<string, Fetcher | undefined>)[fallbackBinding];
      if (fallbackWorker) {
        console.log(JSON.stringify({ routeSource: "fallback", tier, ts: new Date().toISOString() }));
        return fallbackWorker.fetch(request);
      }
      console.log(JSON.stringify({ error: "config_missing", ts: new Date().toISOString() }));
      return new Response(JSON.stringify({ error: "routing_config_unavailable" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    }

    const cookie = parseCookie(request);
    const validBuildParam = buildParam && /^\d+\.\d+\.\d+$/.test(buildParam) ? buildParam : null;
    let buildId: string;
    let routeSource: string;

    if (cookie && config.activeVersions.includes(cookie.buildId)) {
      buildId = cookie.buildId;
      routeSource = "cookie";
    } else {
      const overrideBuild = resolveOverride(config, validBuildParam);
      if (overrideBuild && BUILD_ID_PATTERN.test(overrideBuild)) {
        buildId = overrideBuild;
        routeSource = "override";
      } else if (config.default && BUILD_ID_PATTERN.test(config.default)) {
        buildId = config.default;
        routeSource = "default";
      } else {
        return new Response(JSON.stringify({ error: "no_default_version_configured" }), {
          status: 503,
          headers: { "content-type": "application/json" },
        });
      }
    }

    const binding = bindingName(buildId, tier);
    const worker = (env as Record<string, Fetcher | undefined>)[binding];

    console.log(
      JSON.stringify({
        url: url.pathname,
        method: request.method,
        build: buildParam,
        type: tierParam,
        machineId: url.searchParams.get("machineId"),
        userAgent: request.headers.get("user-agent"),
        country: (request as RequestInit & { cf?: { country?: string; colo?: string } }).cf?.country,
        colo: (request as RequestInit & { cf?: { country?: string; colo?: string } }).cf?.colo,
        routeSource,
        buildId,
        tier,
        binding,
        ts: new Date().toISOString(),
      }),
    );

    if (!worker) {
      return new Response(
        JSON.stringify({ error: "version_not_available" }),
        { status: 502, headers: { "content-type": "application/json" } },
      );
    }

    const response = await worker.fetch(request);

    const needsCookie =
      !cookie || cookie.buildId !== buildId || cookie.tier !== tier;

    if (needsCookie) {
      const newResponse = new Response(response.body, response);
      newResponse.headers.append("set-cookie", setCookieHeader(buildId, tier));
      return newResponse;
    }

    return response;
  },
} satisfies ExportedHandler<Env>;
