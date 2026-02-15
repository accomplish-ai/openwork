import { describe, it, expect } from 'vitest';

/**
 * Tests for the navigation guard logic used in createWindow().
 * These test the URL validation patterns directly since the guards
 * are inline closures that can't be imported.
 */
describe('Navigation Guard Logic', () => {
  const ROUTER_URL = 'https://accomplish-router.accomplish.workers.dev';
  const allowedOrigin = new URL(ROUTER_URL).origin;

  function shouldBlockNavigation(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.origin !== allowedOrigin;
    } catch {
      return true;
    }
  }

  describe('will-navigate / will-redirect guard', () => {
    it('allows navigation to the router origin', () => {
      expect(
        shouldBlockNavigation('https://accomplish-router.accomplish.workers.dev/some/path'),
      ).toBe(false);
    });

    it('allows navigation with query params on the router origin', () => {
      expect(
        shouldBlockNavigation(
          'https://accomplish-router.accomplish.workers.dev?type=lite&build=0.3.8',
        ),
      ).toBe(false);
    });

    it('blocks navigation to external origins', () => {
      expect(shouldBlockNavigation('https://evil.com/phish')).toBe(true);
    });

    it('blocks navigation to different subdomains', () => {
      expect(shouldBlockNavigation('https://other.accomplish.workers.dev')).toBe(true);
    });

    it('blocks malformed URLs', () => {
      expect(shouldBlockNavigation('not-a-url')).toBe(true);
    });

    it('blocks empty strings', () => {
      expect(shouldBlockNavigation('')).toBe(true);
    });

    it('blocks javascript: URLs', () => {
      expect(shouldBlockNavigation('javascript:alert(1)')).toBe(true);
    });
  });

  describe('window open handler', () => {
    // Models the real setWindowOpenHandler logic from index.ts:
    // - data:/blob: URLs are denied without shell.openExternal
    // - http(s): URLs trigger shell.openExternal, then denied
    // - All other URLs are silently denied
    function classifyWindowOpen(url: string): 'deny-silent' | 'deny-after-external' {
      if (url.startsWith('data:') || url.startsWith('blob:')) return 'deny-silent';
      if (url.startsWith('https:') || url.startsWith('http:')) return 'deny-after-external';
      return 'deny-silent';
    }

    it('silently denies data: URLs (no shell.openExternal)', () => {
      expect(classifyWindowOpen('data:text/html,<script>alert(1)</script>')).toBe('deny-silent');
    });

    it('silently denies blob: URLs (no shell.openExternal)', () => {
      expect(classifyWindowOpen('blob:https://example.com/some-guid')).toBe('deny-silent');
    });

    it('opens https: URLs externally before denying', () => {
      expect(classifyWindowOpen('https://example.com')).toBe('deny-after-external');
    });

    it('opens http: URLs externally before denying', () => {
      expect(classifyWindowOpen('http://example.com')).toBe('deny-after-external');
    });

    it('silently denies unknown protocol URLs', () => {
      expect(classifyWindowOpen('ftp://example.com')).toBe('deny-silent');
    });
  });
});
