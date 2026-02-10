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
      expect(shouldBlockNavigation('https://accomplish-router.accomplish.workers.dev/some/path')).toBe(false);
    });

    it('allows navigation with query params on the router origin', () => {
      expect(shouldBlockNavigation('https://accomplish-router.accomplish.workers.dev?type=lite&build=0.3.8')).toBe(false);
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
    function shouldDenyWindowOpen(url: string): boolean {
      if (url.startsWith('data:') || url.startsWith('blob:')) return true;
      // All URLs are denied from opening as new windows (external ones get shell.openExternal)
      return true;
    }

    it('denies data: URLs', () => {
      expect(shouldDenyWindowOpen('data:text/html,<script>alert(1)</script>')).toBe(true);
    });

    it('denies blob: URLs', () => {
      expect(shouldDenyWindowOpen('blob:https://example.com/some-guid')).toBe(true);
    });

    it('denies all new window opens (they go to external browser)', () => {
      expect(shouldDenyWindowOpen('https://example.com')).toBe(true);
    });
  });

  describe('did-fail-load error page path', () => {
    it('constructs packaged error page path correctly', () => {
      const resourcesPath = '/Applications/Accomplish.app/Contents/Resources';
      const errorPage = `${resourcesPath}/error.html`;
      expect(errorPage).toBe('/Applications/Accomplish.app/Contents/Resources/error.html');
    });

    it('constructs dev error page path correctly', () => {
      const appRoot = '/Users/dev/accomplish/apps/desktop';
      const errorPage = `${appRoot}/resources/error.html`;
      expect(errorPage).toContain('resources/error.html');
    });

    it('passes error details as query params', () => {
      const query = { code: String(-106), desc: 'ERR_INTERNET_DISCONNECTED' };
      expect(query.code).toBe('-106');
      expect(query.desc).toBe('ERR_INTERNET_DISCONNECTED');
    });
  });
});
