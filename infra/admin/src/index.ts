import { getDashboardHtml } from './dashboard';

interface Env {
  ROUTING_CONFIG: KVNamespace;
  DOWNLOADS_BUCKET: R2Bucket;
  GITHUB_TOKEN: string;
  GITHUB_REPO: string;
  AUDIT_WEBHOOK_SECRET: string;
  SLACK_WEBHOOK_URL?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  KV_NAMESPACE_ID?: string;
}

type AuditAction =
  | 'config_updated'
  | 'deploy_triggered'
  | 'release_completed'
  | 'desktop_release_triggered'
  | 'override_added'
  | 'override_removed';

interface AuditEntry {
  id: string;
  timestamp: string;
  action: AuditAction;
  details: Record<string, unknown>;
  source: 'dashboard' | 'ci';
  user?: string;
}

interface RoutingConfig {
  default: string;
  previousDefault?: string;
  overrides?: Array<{ desktopRange: string; webBuildId: string }>;
  activeVersions: string[];
}

const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};

function buildCsp(nonce: string): string {
  return `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data:; connect-src 'self'; font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; object-src 'none'; base-uri 'self'; form-action 'self'`;
}

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.byteLength !== bufB.byteLength) return false;
  return crypto.subtle.timingSafeEqual(bufA, bufB);
}

function checkOrigin(request: Request): Response | null {
  if (request.method === 'GET') return null;
  const origin = request.headers.get('origin');
  if (!origin) return jsonResponse({ error: 'forbidden', message: 'Missing origin header' }, 403);
  const url = new URL(request.url);
  if (origin !== url.origin)
    return jsonResponse({ error: 'forbidden', message: 'Origin mismatch' }, 403);
  return null;
}

function jsonResponse(body: unknown, status: number): Response {
  const headers = new Headers({
    'content-type': 'application/json',
    ...SECURITY_HEADERS,
  });
  return new Response(JSON.stringify(body), { status, headers });
}

function htmlResponse(body: string, nonce: string): Response {
  const headers = new Headers({
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': buildCsp(nonce),
    ...SECURITY_HEADERS,
  });
  return new Response(body, { status: 200, headers });
}

async function parseJsonBody(request: Request): Promise<{ data: unknown } | Response> {
  try {
    return { data: await request.json() };
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }
}

const BUILD_ID_PATTERN = /^\d+\.\d+\.\d+-\d+$/;

interface WebsiteDownload {
  platform: string;
  arch: string;
  url: string;
}

interface WebsiteVersionResult {
  version: string;
  downloads: WebsiteDownload[];
}

let websiteVersionCache: { data: WebsiteVersionResult; expiry: number } | null = null;
let websiteErrorCache: { expiry: number } | null = null;
const WEBSITE_CACHE_TTL_MS = 5 * 60 * 1000;
const WEBSITE_ERROR_CACHE_TTL_MS = 30 * 1000;

async function handleWebsiteVersion(): Promise<Response> {
  if (websiteVersionCache && Date.now() < websiteVersionCache.expiry) {
    return jsonResponse(websiteVersionCache.data, 200);
  }

  if (websiteErrorCache && Date.now() < websiteErrorCache.expiry) {
    return jsonResponse({ error: 'fetch_failed', cached: true }, 502);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  let res: Response;
  try {
    res = await fetch('https://accomplish.ai/', { signal: controller.signal });
  } catch {
    websiteErrorCache = { expiry: Date.now() + WEBSITE_ERROR_CACHE_TTL_MS };
    return jsonResponse({ error: 'fetch_failed', message: 'Network error or timeout' }, 502);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    websiteErrorCache = { expiry: Date.now() + WEBSITE_ERROR_CACHE_TTL_MS };
    return jsonResponse({ error: 'fetch_failed', status: res.status }, 502);
  }

  const html = await res.text();
  const downloadPattern =
    /https:\/\/downloads\.accomplish\.ai\/downloads\/(\d+\.\d+\.\d+)\/(macos|windows)\/([^\s"'<]+)/g;
  const downloads: WebsiteDownload[] = [];
  let version = '';
  let match: RegExpExecArray | null;

  const seen = new Set<string>();
  while ((match = downloadPattern.exec(html)) !== null) {
    if (!version) version = match[1];
    if (match[1] !== version) continue;
    const dir = match[2];
    const filename = match[3];
    const platform = dir === 'macos' ? 'macOS' : 'Windows';
    const arch = dir === 'macos' && filename.includes('arm64') ? 'ARM64' : 'x64';
    const key = platform + '-' + arch;
    if (seen.has(key)) continue;
    seen.add(key);
    downloads.push({ platform, arch, url: match[0] });
  }

  if (!version) {
    return jsonResponse({ error: 'version_not_found' }, 404);
  }

  const result: WebsiteVersionResult = { version, downloads };
  websiteVersionCache = { data: result, expiry: Date.now() + WEBSITE_CACHE_TTL_MS };

  return jsonResponse(result, 200);
}

const WORKFLOW_POLL_DELAY_MS = 2000;

function validateConfig(data: unknown): data is RoutingConfig {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  if (typeof obj.default !== 'string') return false;
  if (!Array.isArray(obj.activeVersions)) return false;
  for (const v of obj.activeVersions) {
    if (typeof v !== 'string' || !BUILD_ID_PATTERN.test(v)) return false;
  }
  if (obj.default !== '' && !BUILD_ID_PATTERN.test(obj.default)) return false;
  if (obj.previousDefault !== undefined) {
    if (typeof obj.previousDefault !== 'string' || !BUILD_ID_PATTERN.test(obj.previousDefault))
      return false;
  }
  if (obj.overrides !== undefined) {
    if (!Array.isArray(obj.overrides)) return false;
    for (const o of obj.overrides) {
      if (!o || typeof o !== 'object') return false;
      if (typeof o.desktopRange !== 'string' || !o.desktopRange.trim()) return false;
      if (typeof o.webBuildId !== 'string' || !BUILD_ID_PATTERN.test(o.webBuildId)) return false;
    }
  }
  return true;
}

interface AuditMetadata {
  id: string;
  kvKey: string;
  timestamp: string;
  action: AuditAction;
  source: 'dashboard' | 'ci';
  user?: string;
}

async function writeAuditEntry(
  env: Env,
  action: AuditAction,
  details: Record<string, unknown>,
  source: 'dashboard' | 'ci',
  user?: string,
): Promise<AuditEntry> {
  const now = Date.now();
  const timestamp = new Date(now).toISOString();
  const entry: AuditEntry = {
    id: crypto.randomUUID(),
    timestamp,
    action,
    details,
    source,
    ...(user && { user }),
  };
  const sortKey = String(9999999999999 - now).padStart(13, '0');
  const kvKey = `audit:${sortKey}:${entry.id}`;
  const metadata: AuditMetadata = {
    id: entry.id,
    kvKey,
    timestamp,
    action,
    source,
    ...(user && { user }),
  };
  await env.ROUTING_CONFIG.put(kvKey, JSON.stringify(entry), { metadata });
  return entry;
}

async function handleHealth(env: Env): Promise<Response> {
  try {
    await env.ROUTING_CONFIG.get('config');
    return jsonResponse({ status: 'ok', timestamp: Date.now() }, 200);
  } catch {
    return jsonResponse({ status: 'degraded', timestamp: Date.now() }, 503);
  }
}

function buildMeta(env: Env) {
  return {
    accountId: env.CLOUDFLARE_ACCOUNT_ID ?? null,
    kvNamespaceId: env.KV_NAMESPACE_ID ?? null,
    githubRepo: env.GITHUB_REPO,
  };
}

function sendSlackNotification(env: Env, ctx: ExecutionContext, message: string): void {
  if (!env.SLACK_WEBHOOK_URL) return;
  const url = env.SLACK_WEBHOOK_URL;
  ctx.waitUntil(
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
    }).catch((err) => console.error('Slack notification failed:', err)),
  );
}

async function handleGetConfig(env: Env): Promise<Response> {
  const data = await env.ROUTING_CONFIG.get<RoutingConfig>('config', { type: 'json' });
  const config = data ?? { default: '', overrides: [], activeVersions: [] };
  return jsonResponse({ ...config, _meta: buildMeta(env) }, 200);
}

async function handlePutConfig(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const parsed = await parseJsonBody(request);
  if (parsed instanceof Response) return parsed;
  const body = parsed.data;

  if (!validateConfig(body)) {
    return jsonResponse({ error: 'invalid_config' }, 400);
  }

  const previous = await env.ROUTING_CONFIG.get<RoutingConfig>('config', { type: 'json' });

  const defaultChanged = previous && previous.default !== body.default && previous.default !== '';
  const resolvedPreviousDefault = defaultChanged ? previous.default : body.previousDefault;
  const config: RoutingConfig = {
    default: body.default,
    ...(resolvedPreviousDefault ? { previousDefault: resolvedPreviousDefault } : {}),
    overrides: body.overrides ?? [],
    activeVersions: body.activeVersions,
  };

  await env.ROUTING_CONFIG.put('config', JSON.stringify(config));
  const user = request.headers.get('Cf-Access-Authenticated-User-Email') || undefined;
  await writeAuditEntry(
    env,
    'config_updated',
    { before: previous, after: config },
    'dashboard',
    user,
  );
  sendSlackNotification(
    env,
    ctx,
    `Config updated: default → ${config.default}${user ? ` by ${user}` : ''}`,
  );
  return jsonResponse(config, 200);
}

async function findLatestWorkflowRun(env: Env, workflowFile: string): Promise<string | null> {
  await new Promise((resolve) => setTimeout(resolve, WORKFLOW_POLL_DELAY_MS));
  try {
    const res = await fetch(
      `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${workflowFile}/runs?per_page=1`,
      {
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+v3+json',
          'User-Agent': 'accomplish-admin',
        },
      },
    );
    if (res.ok) {
      const runs = (await res.json()) as { workflow_runs?: Array<{ html_url: string }> };
      return runs.workflow_runs?.[0]?.html_url ?? null;
    }
  } catch {
    // Non-critical — dispatch already succeeded
  }
  return null;
}

async function handleDeploy(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const parsed = await parseJsonBody(request);
  if (parsed instanceof Response) return parsed;
  const body = parsed.data;

  if (
    !body ||
    typeof body !== 'object' ||
    typeof (body as Record<string, unknown>).setAsDefault !== 'boolean'
  ) {
    return jsonResponse(
      { error: 'invalid_body', message: 'Expected { setAsDefault: boolean }' },
      400,
    );
  }

  const { setAsDefault } = body as { setAsDefault: boolean };

  const response = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/release-web.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+v3+json',
        'User-Agent': 'accomplish-admin',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: { set_as_default: String(setAsDefault) },
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    console.error('GitHub API error:', response.status, text);
    return jsonResponse(
      { error: 'github_api_error', status: response.status, message: 'Failed to trigger deploy' },
      502,
    );
  }

  const runUrl = await findLatestWorkflowRun(env, 'release-web.yml');

  const user = request.headers.get('Cf-Access-Authenticated-User-Email') || undefined;
  await writeAuditEntry(env, 'deploy_triggered', { setAsDefault, runUrl }, 'dashboard', user);
  sendSlackNotification(
    env,
    ctx,
    `Deploy triggered${setAsDefault ? ' (set as default)' : ''}${user ? ` by ${user}` : ''}`,
  );

  return jsonResponse({ dispatched: true, setAsDefault, runUrl }, 202);
}

async function handleGetDeployStatus(env: Env, runId: string): Promise<Response> {
  if (!/^\d+$/.test(runId)) {
    return jsonResponse({ error: 'invalid_run_id' }, 400);
  }
  const response = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/actions/runs/${runId}`,
    {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+v3+json',
        'User-Agent': 'accomplish-admin',
      },
    },
  );
  if (!response.ok) {
    return jsonResponse({ error: 'github_api_error', status: response.status }, 502);
  }
  const run = (await response.json()) as {
    status: string;
    conclusion: string | null;
    html_url: string;
  };
  return jsonResponse(
    { status: run.status, conclusion: run.conclusion, htmlUrl: run.html_url },
    200,
  );
}

async function handleGetManifest(env: Env, buildId: string): Promise<Response> {
  if (!BUILD_ID_PATTERN.test(buildId)) {
    return jsonResponse({ error: 'invalid_build_id' }, 400);
  }
  const data = await env.ROUTING_CONFIG.get(`manifest:${buildId}`, { type: 'json' });
  if (!data) {
    return jsonResponse({ error: 'not_found' }, 404);
  }
  return jsonResponse(data, 200);
}

async function handleGetAudit(env: Env, url: URL): Promise<Response> {
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 1),
    200,
  );
  const cursor = url.searchParams.get('cursor') ?? undefined;

  const listed = await env.ROUTING_CONFIG.list({ prefix: 'audit:', limit, cursor });
  const entries: AuditMetadata[] = [];
  for (const key of listed.keys) {
    const meta = key.metadata as AuditMetadata | undefined;
    if (meta) {
      entries.push(meta);
    } else {
      const value = await env.ROUTING_CONFIG.get<AuditEntry>(key.name, { type: 'json' });
      if (value) {
        entries.push({
          id: value.id ?? key.name,
          kvKey: key.name,
          action: value.action,
          source: value.source,
          user: value.user,
          timestamp: value.timestamp,
        });
      }
    }
  }

  const result: { entries: AuditMetadata[]; cursor?: string } = { entries };
  if (!listed.list_complete) {
    result.cursor = listed.cursor;
  }
  return jsonResponse(result, 200);
}

async function handleGetAuditDetail(env: Env, key: string): Promise<Response> {
  if (!key.startsWith('audit:')) {
    return jsonResponse({ error: 'invalid_key' }, 400);
  }
  const value = await env.ROUTING_CONFIG.get<AuditEntry>(key, { type: 'json' });
  if (!value) {
    return jsonResponse({ error: 'not_found' }, 404);
  }
  return jsonResponse(value, 200);
}

async function handlePostAudit(request: Request, env: Env): Promise<Response> {
  const secret = request.headers.get('x-audit-secret');
  if (!secret || !timingSafeEqual(secret, env.AUDIT_WEBHOOK_SECRET)) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  const parsed = await parseJsonBody(request);
  if (parsed instanceof Response) return parsed;
  const body = parsed.data;

  if (!body || typeof body !== 'object') {
    return jsonResponse({ error: 'invalid_body' }, 400);
  }
  const obj = body as Record<string, unknown>;

  const validActions: AuditAction[] = [
    'config_updated',
    'deploy_triggered',
    'release_completed',
    'desktop_release_triggered',
    'override_added',
    'override_removed',
  ];
  if (typeof obj.action !== 'string' || !validActions.includes(obj.action as AuditAction)) {
    return jsonResponse({ error: 'invalid_action' }, 400);
  }

  if (!obj.details || typeof obj.details !== 'object') {
    return jsonResponse({ error: 'invalid_details' }, 400);
  }

  const entry = await writeAuditEntry(
    env,
    obj.action as AuditAction,
    obj.details as Record<string, unknown>,
    'ci',
  );

  return jsonResponse(entry, 201);
}

function parseElectronUpdaterYaml(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const files: Array<Record<string, unknown>> = [];
  let currentFile: Record<string, unknown> | null = null;

  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (!line || line.startsWith('#')) continue;

    if (line === 'files:') {
      continue;
    }

    // Array item start
    if (line.startsWith('  - ')) {
      if (currentFile) files.push(currentFile);
      currentFile = {};
      const kv = line.slice(4);
      const idx = kv.indexOf(':');
      if (idx !== -1) {
        const key = kv.slice(0, idx).trim();
        const val = kv.slice(idx + 1).trim();
        currentFile[key] = val === '' ? val : isNaN(Number(val)) ? val : Number(val);
      }
      continue;
    }

    // Array item continuation
    if (line.startsWith('    ') && currentFile) {
      const kv = line.trim();
      const idx = kv.indexOf(':');
      if (idx !== -1) {
        const key = kv.slice(0, idx).trim();
        const val = kv.slice(idx + 1).trim();
        currentFile[key] = val === '' ? val : isNaN(Number(val)) ? val : Number(val);
      }
      continue;
    }

    // Close any open file entry when we hit a top-level key
    if (currentFile) {
      files.push(currentFile);
      currentFile = null;
    }

    // Top-level key: value
    const idx = line.indexOf(':');
    if (idx !== -1) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      if (val.startsWith("'") && val.endsWith("'")) {
        result[key] = val.slice(1, -1);
      } else {
        result[key] = val === '' ? val : isNaN(Number(val)) ? val : Number(val);
      }
    }
  }

  if (currentFile) files.push(currentFile);
  if (files.length) result.files = files;

  return result;
}

async function handleDesktopWorkflows(env: Env): Promise<Response> {
  const response = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/release.yml/runs?per_page=20`,
    {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+v3+json',
        'User-Agent': 'accomplish-admin',
      },
    },
  );

  if (!response.ok) {
    return jsonResponse({ error: 'github_api_error', status: response.status }, 502);
  }

  const data = (await response.json()) as {
    workflow_runs: Array<{
      id: number;
      status: string;
      conclusion: string | null;
      html_url: string;
      created_at: string;
      updated_at: string;
      actor: { login: string } | null;
      run_started_at: string;
    }>;
  };

  const runs = (data.workflow_runs || []).map((r) => ({
    id: r.id,
    status: r.status,
    conclusion: r.conclusion,
    html_url: r.html_url,
    created_at: r.created_at,
    updated_at: r.updated_at,
    actor: r.actor?.login ?? 'unknown',
    run_started_at: r.run_started_at,
  }));

  return jsonResponse(runs, 200);
}

async function handleDesktopVersions(env: Env): Promise<Response> {
  let cursor: string | undefined;
  const allObjects: R2Object[] = [];
  do {
    const listed = await env.DOWNLOADS_BUCKET.list({ prefix: 'downloads/', cursor });
    allObjects.push(...listed.objects);
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  const versions: Record<string, Array<{ name: string; size: number }>> = {};

  for (const obj of allObjects) {
    // Key format: downloads/{version}/macos/{filename}
    const parts = obj.key.split('/');
    if (parts.length < 3) continue;
    const version = parts[1];
    if (!versions[version]) versions[version] = [];
    const name = parts.slice(2).join('/');
    versions[version].push({ name, size: obj.size });
  }

  const result = Object.entries(versions)
    .map(([version, files]) => ({ version, files }))
    .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));

  return jsonResponse(result, 200);
}

async function handleDesktopManifests(env: Env): Promise<Response> {
  const [liteObj, enterpriseObj] = await Promise.all([
    env.DOWNLOADS_BUCKET.get('latest-mac.yml'),
    env.DOWNLOADS_BUCKET.get('latest-mac-enterprise.yml'),
  ]);

  const lite = liteObj ? parseElectronUpdaterYaml(await liteObj.text()) : null;
  const enterprise = enterpriseObj ? parseElectronUpdaterYaml(await enterpriseObj.text()) : null;

  return jsonResponse({ lite, enterprise }, 200);
}

async function handleDesktopRelease(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const parsed = await parseJsonBody(request);
  if (parsed instanceof Response) return parsed;
  const body = parsed.data;

  if (
    !body ||
    typeof body !== 'object' ||
    typeof (body as Record<string, unknown>).updateLatestMac !== 'boolean' ||
    typeof (body as Record<string, unknown>).updateLatestWin !== 'boolean'
  ) {
    return jsonResponse(
      {
        error: 'invalid_body',
        message: 'Expected { updateLatestMac: boolean, updateLatestWin: boolean }',
      },
      400,
    );
  }

  const { updateLatestMac, updateLatestWin } = body as {
    updateLatestMac: boolean;
    updateLatestWin: boolean;
  };

  const response = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/release.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+v3+json',
        'User-Agent': 'accomplish-admin',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          update_latest_mac: String(updateLatestMac),
          update_latest_win: String(updateLatestWin),
        },
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    console.error('GitHub API error:', response.status, text);
    return jsonResponse(
      {
        error: 'github_api_error',
        status: response.status,
        message: 'Failed to trigger desktop release',
      },
      502,
    );
  }

  const runUrl = await findLatestWorkflowRun(env, 'release.yml');

  const user = request.headers.get('Cf-Access-Authenticated-User-Email') || undefined;
  await writeAuditEntry(
    env,
    'desktop_release_triggered',
    { updateLatestMac, updateLatestWin, runUrl },
    'dashboard',
    user,
  );
  sendSlackNotification(
    env,
    ctx,
    `Desktop release triggered${updateLatestMac ? ' (update latest-mac)' : ''}${updateLatestWin ? ' (update latest-win)' : ''}${user ? ` by ${user}` : ''}`,
  );

  return jsonResponse({ dispatched: true, updateLatestMac, updateLatestWin, runUrl }, 202);
}

async function handleDesktopPackageVersion(env: Env): Promise<Response> {
  const response = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/contents/apps/desktop/package.json?ref=main`,
    {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+v3+json',
        'User-Agent': 'accomplish-admin',
      },
    },
  );

  if (!response.ok) {
    return jsonResponse({ error: 'github_api_error', status: response.status }, 502);
  }

  const data = (await response.json()) as { content: string };
  const decoded = atob(data.content.replace(/\n/g, ''));
  const pkg = JSON.parse(decoded) as { version: string };

  return jsonResponse({ version: pkg.version }, 200);
}

async function handleListBuilds(env: Env): Promise<Response> {
  const listed = await env.ROUTING_CONFIG.list({ prefix: 'manifest:' });
  const builds = listed.keys
    .map((key) => ({ buildId: key.name.replace('manifest:', '') }))
    .sort((a, b) => a.buildId.localeCompare(b.buildId));
  return jsonResponse(builds, 200);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url);
      const { pathname } = url;

      if (pathname === '/' && request.method === 'GET') {
        const nonce = crypto.randomUUID();
        return htmlResponse(getDashboardHtml(nonce), nonce);
      }

      if (pathname === '/health' && request.method === 'GET') {
        return await handleHealth(env);
      }

      if (pathname.startsWith('/api/')) {
        if (pathname === '/api/config' && request.method === 'GET') {
          return await handleGetConfig(env);
        }
        if (pathname === '/api/config' && request.method === 'PUT') {
          const originErr = checkOrigin(request);
          if (originErr) return originErr;
          return await handlePutConfig(request, env, ctx);
        }
        if (pathname === '/api/deploy' && request.method === 'POST') {
          const originErr = checkOrigin(request);
          if (originErr) return originErr;
          return await handleDeploy(request, env, ctx);
        }
        if (pathname === '/api/deploy/status' && request.method === 'GET') {
          const runId = url.searchParams.get('run_id');
          if (!runId) return jsonResponse({ error: 'missing_run_id' }, 400);
          return await handleGetDeployStatus(env, runId);
        }
        if (pathname === '/api/audit' && request.method === 'GET') {
          return await handleGetAudit(env, url);
        }
        if (pathname === '/api/audit' && request.method === 'POST') {
          return await handlePostAudit(request, env);
        }
        const auditDetailMatch = pathname.match(/^\/api\/audit\/(.+)$/);
        if (auditDetailMatch && request.method === 'GET') {
          return await handleGetAuditDetail(env, decodeURIComponent(auditDetailMatch[1]));
        }

        const buildsMatch = pathname.match(/^\/api\/builds\/([^/]+)\/manifest$/);
        if (buildsMatch && request.method === 'GET') {
          return await handleGetManifest(env, buildsMatch[1]);
        }
        if (pathname === '/api/builds' && request.method === 'GET') {
          return await handleListBuilds(env);
        }

        if (pathname === '/api/website-version' && request.method === 'GET') {
          return await handleWebsiteVersion();
        }

        if (pathname === '/api/desktop/workflows' && request.method === 'GET') {
          return await handleDesktopWorkflows(env);
        }
        if (pathname === '/api/desktop/versions' && request.method === 'GET') {
          return await handleDesktopVersions(env);
        }
        if (pathname === '/api/desktop/manifests' && request.method === 'GET') {
          return await handleDesktopManifests(env);
        }
        if (pathname === '/api/desktop/release' && request.method === 'POST') {
          const originErr = checkOrigin(request);
          if (originErr) return originErr;
          return await handleDesktopRelease(request, env, ctx);
        }
        if (pathname === '/api/desktop/package-version' && request.method === 'GET') {
          return await handleDesktopPackageVersion(env);
        }

        return jsonResponse({ error: 'not_found' }, 404);
      }

      return jsonResponse({ error: 'not_found' }, 404);
    } catch (err) {
      console.error('Unhandled error in admin worker:', err);
      return jsonResponse({ error: 'internal_server_error' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
