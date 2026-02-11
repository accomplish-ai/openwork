import type { Env, RoutingConfig } from "./types";

type Tier = "lite" | "enterprise";

interface Route {
  buildId: string;
  tier: Tier;
  source: string;
}

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

function resolveTier(tierParam: string | null, cookieTier: Tier | undefined): Tier {
  if (tierParam === "enterprise") return "enterprise";
  return cookieTier ?? "lite";
}

export function isNavigation(request: Request, url: URL): boolean {
  if (url.searchParams.has('build') || url.searchParams.has('type') || url.searchParams.has('pin')) return true;
  if (url.pathname === '/') return true;
  if (!url.pathname.includes('.') && request.headers.get('accept')?.includes('text/html')) return true;
  return false;
}

function errorResponse(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function resolveRoute(
  config: RoutingConfig,
  url: URL,
  cookie: { buildId: string; tier: Tier } | null,
  navigation: boolean,
): Route | null {
  if (!navigation && cookie && config.activeVersions.includes(cookie.buildId)) {
    return { buildId: cookie.buildId, tier: cookie.tier, source: "cookie" };
  }

  const buildParam = url.searchParams.get("build");
  const tierParam = url.searchParams.get("type");

  const pinParam = url.searchParams.get("pin");
  if (pinParam) {
    if (BUILD_ID_PATTERN.test(pinParam) && config.activeVersions.includes(pinParam)) {
      return { buildId: pinParam, tier: resolveTier(tierParam, cookie?.tier), source: "pin" };
    }
    return null;
  }

  const validBuildParam = buildParam && /^\d+\.\d+\.\d+$/.test(buildParam)
    ? buildParam : null;

  const overrideBuild = resolveOverride(config, validBuildParam);
  let buildId: string;
  let source: string;

  if (overrideBuild && BUILD_ID_PATTERN.test(overrideBuild)) {
    buildId = overrideBuild;
    source = "override";
  } else if (config.default && BUILD_ID_PATTERN.test(config.default)) {
    buildId = config.default;
    source = "default";
  } else {
    return null;
  }

  return { buildId, tier: resolveTier(tierParam, cookie?.tier), source };
}

function logRequest(request: Request, url: URL, route: Route, navigation: boolean): void {
  console.log(
    JSON.stringify({
      url: url.pathname,
      method: request.method,
      build: url.searchParams.get("build"),
      type: url.searchParams.get("type"),
      machineId: url.searchParams.get("machineId"),
      userAgent: request.headers.get("user-agent"),
      country: (request as RequestInit & { cf?: { country?: string; colo?: string } }).cf?.country,
      colo: (request as RequestInit & { cf?: { country?: string; colo?: string } }).cf?.colo,
      routeSource: route.source,
      buildId: route.buildId,
      tier: route.tier,
      binding: bindingName(route.buildId, route.tier),
      navigation,
      ts: new Date().toISOString(),
    }),
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cookie = parseCookie(request);
    const navigation = isNavigation(request, url);

    const config = env.ROUTING_CONFIG
      ? await env.ROUTING_CONFIG.get<RoutingConfig>(env.KV_CONFIG_KEY || "config", { type: "json", cacheTtl: 60 })
      : null;

    if (!config) {
      const tier = resolveTier(url.searchParams.get("type"), cookie?.tier);
      const fallbackWorker = (env as Record<string, Fetcher | undefined>)[`APP_${tier.toUpperCase()}`];
      if (fallbackWorker) {
        console.log(JSON.stringify({ routeSource: "fallback", tier, navigation, ts: new Date().toISOString() }));
        return fallbackWorker.fetch(request);
      }
      return errorResponse("routing_config_unavailable", 503);
    }

    const route = resolveRoute(config, url, cookie, navigation);
    if (!route) return errorResponse("no_default_version_configured", 503);

    const worker = (env as Record<string, Fetcher | undefined>)[bindingName(route.buildId, route.tier)];
    logRequest(request, url, route, navigation);

    if (!worker) return errorResponse("version_not_available", 502);

    const response = await worker.fetch(request);

    const needsCookie = navigation
      || !cookie
      || cookie.buildId !== route.buildId
      || cookie.tier !== route.tier;

    if (needsCookie) {
      const newResponse = new Response(response.body, response);
      newResponse.headers.append("set-cookie", setCookieHeader(route.buildId, route.tier));
      return newResponse;
    }

    return response;
  },
} satisfies ExportedHandler<Env>;
