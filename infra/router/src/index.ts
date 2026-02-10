type Tier = "lite" | "enterprise";

interface Env {
  APP_LITE: Fetcher;
  APP_ENTERPRISE: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const params = {
      build: url.searchParams.get("build"),
      type: url.searchParams.get("type") as Tier | null,
      machineId: url.searchParams.get("machineId"),
      arch: url.searchParams.get("arch"),
      platform: url.searchParams.get("platform"),
      channel: url.searchParams.get("channel"),
    };

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

    // TODO: KV version resolution — look up latest stable version from KV
    // TODO: Cookie-based session pinning
    // TODO: Canary routing — hash machineId into 0-99 bucket
    // TODO: Build-version override routing
    // TODO: PR preview routing
    // TODO: Analytics Engine writeDataPoint
    // TODO: A/B experiment assignment

    // Tier resolution from type param
    const tier: Tier = params.type === "enterprise" ? "enterprise" : "lite";
    const worker = tier === "enterprise" ? env.APP_ENTERPRISE : env.APP_LITE;

    return worker.fetch(request);
  },
} satisfies ExportedHandler<Env>;
