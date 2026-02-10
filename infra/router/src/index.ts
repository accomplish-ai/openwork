interface Env {
  APP_LITE: Fetcher;
  APP_ENTERPRISE: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Extract query params used by future routing logic
    const params = {
      build: url.searchParams.get("build"),
      type: url.searchParams.get("type"),
      machineId: url.searchParams.get("machineId"),
      arch: url.searchParams.get("arch"),
      platform: url.searchParams.get("platform"),
      channel: url.searchParams.get("channel"),
    };

    // Structured request log
    console.log(
      JSON.stringify({
        url: url.pathname,
        method: request.method,
        ...params,
        userAgent: request.headers.get("user-agent"),
        country: (request as RequestInit & { cf?: { country?: string; colo?: string } }).cf?.country,
        colo: (request as RequestInit & { cf?: { country?: string; colo?: string } }).cf?.colo,
        ts: new Date().toISOString(),
      }),
    );

    // Phase 1: hardcoded forward to lite app
    // TODO: KV version resolution — look up latest stable version from KV
    //   const version = await env.VERSIONS_KV.get(`${tier}:stable`)
    //
    // TODO: Cookie-based session pinning
    //   const pinned = parseCookie(request.headers.get("cookie"), "app-version")
    //   if (pinned) route to that version's worker
    //
    // TODO: Canary routing — hash machineId into 0-99 bucket
    //   const bucket = hashToPercent(params.machineId)
    //   if (bucket < canaryPercent) route to canary version
    //
    // TODO: Build-version override routing
    //   if (params.build) route to specific build worker/R2 prefix
    //
    // TODO: PR preview routing
    //   if (url.hostname matches pr-{number}.accomplish.ai) route to preview
    //
    // TODO: Tier resolution from type param
    //   const tier = params.type === "enterprise" ? env.APP_ENTERPRISE : env.APP_LITE
    //
    // TODO: Analytics Engine writeDataPoint
    //   env.ANALYTICS.writeDataPoint({ blobs: [url.pathname], doubles: [bucket] })
    //
    // TODO: A/B experiment assignment
    //   assign experiment variant, set cookie, log to analytics

    return env.APP_LITE.fetch(request);
  },
} satisfies ExportedHandler<Env>;
