import { test, expect } from '../fixtures';
import { HomePage } from '../pages';
import { captureForAI } from '../utils';

test.describe('Desktop Control Diagnostics + Recovery', () => {
  test('guide me live empty-state action opens the live viewer shell', async ({ window }) => {
    const homePage = new HomePage(window);

    await window.waitForLoadState('domcontentloaded');
    await homePage.guideMeLiveButton.click();

    await captureForAI(window, 'desktop-control', 'live-viewer-open', [
      'Live viewer panel is visible',
      'Guide me live action opened the desktop-control shell',
      'Hide control is available for the viewer',
    ]);

    await expect(window.getByText(/Live Guidance is active|Live screen preview/)).toBeVisible();
    await expect(window.getByRole('button', { name: 'Hide live viewer' })).toBeVisible();
  });

  test('quick actions can queue and clear screen capture mode', async ({ window }) => {
    const homePage = new HomePage(window);

    await window.waitForLoadState('domcontentloaded');
    await homePage.openQuickActions();
    await window.getByText('Add screen capture').click();

    await captureForAI(window, 'desktop-control', 'screen-capture-queued', [
      'Screen capture mode badge is visible',
      'Queued desktop-control state is clear to the user',
      'Queued state can be cleared before sending a message',
    ]);

    await expect(window.getByText('Next message will include screen capture mode')).toBeVisible();
    await window.getByRole('button', { name: 'Clear' }).click();
    await expect(window.getByText('Next message will include screen capture mode')).not.toBeVisible();
  });
});
