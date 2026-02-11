import { test } from '@playwright/test';
import { launchElectron, runE2ESuite, PRODUCTION_ORIGIN } from './helpers';

test.describe('remote mode', () => {
  test('Electron app loads web UI from production with working bridge', async () => {
    const app = await launchElectron();
    await runE2ESuite(app, PRODUCTION_ORIGIN);
  });
});
