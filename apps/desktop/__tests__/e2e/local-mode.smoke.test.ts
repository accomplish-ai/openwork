import { test } from '@playwright/test';
import { type ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchElectron, startServeProcess, stopServeProcess, runE2ESuite } from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = path.resolve(__dirname, '../../../web/dist/client');
const PORT = 4173;

let serveProcess: ChildProcess;

test.beforeAll(async () => {
  serveProcess = await startServeProcess(WEB_DIST, PORT);
});

test.afterAll(async () => {
  if (serveProcess) await stopServeProcess(serveProcess);
});

test.describe('local mode', () => {
  test('Electron app loads web UI from local server with working bridge', async () => {
    const app = await launchElectron({
      ACCOMPLISH_ROUTER_URL: `http://localhost:${PORT}`,
    });
    await runE2ESuite(app, `http://localhost:${PORT}`);
  });
});
