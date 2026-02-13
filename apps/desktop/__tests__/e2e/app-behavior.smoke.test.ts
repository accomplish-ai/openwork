import { test, expect } from '@playwright/test';
import { launchElectron, forceCloseApp, getMainWindow } from './helpers';

test.describe('app behavior smoke tests', () => {
  test.setTimeout(60_000);

  test('fallback page loads when remote URL is unreachable', async () => {
    const app = await launchElectron({
      ACCOMPLISH_ROUTER_URL: 'https://unreachable.invalid.test',
    });

    try {
      const { window } = await getMainWindow(app);
      // Wait for did-fail-load to trigger fallback
      await window.waitForLoadState('domcontentloaded');
      // The fallback page is loaded via loadFile with query params
      await expect.poll(
        () => window.url(),
        { timeout: 30_000, intervals: [500] },
      ).toContain('fallback.html');
    } finally {
      await forceCloseApp(app);
    }
  });

  test('navigation to external URL is blocked and stays on allowed origin', async () => {
    const app = await launchElectron();

    try {
      const { window } = await getMainWindow(app);
      await window.waitForLoadState('networkidle');

      // Attempt navigation to an external URL via JavaScript
      await window.evaluate(() => {
        window.location.href = 'https://evil.example.com';
      });

      // Give the navigation guard time to intercept
      await new Promise((r) => setTimeout(r, 2000));

      // URL should not have changed to the external site
      const urlAfter = window.url();
      expect(urlAfter).not.toContain('evil.example.com');
    } finally {
      await forceCloseApp(app);
    }
  });
});
