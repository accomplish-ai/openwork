import { Hono } from 'hono';
import type { AppTier } from '../shared';

type Bindings = {
  ASSETS: Fetcher;
  TIER: AppTier;
  VERSION: string;
};

const app = new Hono<{ Bindings: Bindings }>();

const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};

const CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'" // TODO: Add specific Auth0 domain to connect-src when auth integration is finalized;

app.use('*', async (c, next) => {
  await next();
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    c.res.headers.set(key, value);
  }
});

function getCacheControl(pathname: string): string {
  if (pathname === '/' || pathname.endsWith('/index.html')) {
    return 'no-cache';
  }
  if (pathname.includes('/assets/')) {
    return 'public, max-age=31536000, immutable';
  }
  return 'public, max-age=3600';
}

function hasFileExtension(pathname: string): boolean {
  const lastSegment = pathname.split('/').pop()!;
  return lastSegment.includes('.');
}

app.get('/health', (c) => {
  return c.json({ version: c.env.VERSION, tier: c.env.TIER, status: 'ok' });
});

app.get('*', async (c) => {
  const url = new URL(c.req.url);
  const pathname = url.pathname;

  if (pathname.includes('..')) {
    return c.text('Bad Request', 400);
  }

  let response = await c.env.ASSETS.fetch(new Request(url.toString()));

  if (response.status === 404 && !hasFileExtension(pathname)) {
    const indexUrl = new URL('/', url.origin);
    response = await c.env.ASSETS.fetch(new Request(indexUrl.toString()));
    if (response.ok) {
      const headers = new Headers(response.headers);
      headers.set('cache-control', 'no-cache');
      headers.set('content-security-policy', CONTENT_SECURITY_POLICY);
      return new Response(response.body, { status: 200, headers });
    }
  }

  if (!response.ok) {
    return new Response(response.body, { status: response.status, headers: new Headers(response.headers) });
  }

  const headers = new Headers(response.headers);
  headers.set('cache-control', getCacheControl(pathname));

  const contentType = headers.get('content-type') ?? '';
  if (contentType.startsWith('text/html')) {
    headers.set('content-security-policy', CONTENT_SECURITY_POLICY);
  }

  return new Response(response.body, { status: response.status, headers });
});

export default app;
