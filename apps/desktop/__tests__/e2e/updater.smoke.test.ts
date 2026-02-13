import { test, expect } from '@playwright/test';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http';
import { createHash } from 'crypto';
import { launchElectron, forceCloseApp } from './helpers';

// Dummy ZIP content — just needs to be a valid file with known sha512
const DUMMY_ZIP = Buffer.from('PK\x05\x06' + '\x00'.repeat(18)); // minimal ZIP end-of-central-directory
const DUMMY_SHA512 = createHash('sha512').update(DUMMY_ZIP).digest('base64');
const DUMMY_SIZE = DUMMY_ZIP.length;

const UPDATE_VERSION = '99.0.0';

function createUpdateServer(): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (!req.url) throw new Error('Missing request URL');
      const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;

      if (pathname.endsWith('.yml')) {
        const manifest = [
          `version: ${UPDATE_VERSION}`,
          'files:',
          `  - url: update.zip`,
          `    sha512: ${DUMMY_SHA512}`,
          `    size: ${DUMMY_SIZE}`,
          `path: update.zip`,
          `sha512: ${DUMMY_SHA512}`,
          `releaseDate: '${new Date().toISOString()}'`,
        ].join('\n');
        res.writeHead(200, { 'Content-Type': 'text/yaml' });
        res.end(manifest);
        return;
      }

      if (pathname.endsWith('.zip')) {
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(DUMMY_SIZE),
        });
        res.end(DUMMY_ZIP);
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        throw new Error('Unexpected server address');
      }
      resolve({ server, port: addr.port });
    });
  });
}

let updateServer: Server;
let serverPort: number;

test.beforeAll(async () => {
  const { server, port } = await createUpdateServer();
  updateServer = server;
  serverPort = port;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => updateServer.close(() => resolve()));
});

test.describe('updater smoke tests', () => {
  test.setTimeout(60_000);

  test('auto-check detects newer version on startup', async () => {
    const app = await launchElectron({
      ACCOMPLISH_UPDATER_URL: `http://127.0.0.1:${serverPort}`,
      __UPDATER_AUTO_ACCEPT__: 'true',
    });

    try {
      // The auto-check fires after a 5s delay in index.ts.
      // Verify the updater detects the newer version.
      // Note: download requires APPIMAGE on Linux, so we only assert detection.
      await expect.poll(
        () => app.evaluate(() => process.env.__UPDATER_AVAILABLE__),
        { timeout: 30_000, intervals: [500] },
      ).toBeTruthy();
    } finally {
      await forceCloseApp(app);
    }
  });

  test('Check for Updates menu item detects newer version', async () => {
    const app = await launchElectron({
      ACCOMPLISH_UPDATER_URL: `http://127.0.0.1:${serverPort}`,
      __UPDATER_AUTO_ACCEPT__: 'true',
    });

    try {
      // Wait for app to fully initialize
      await new Promise((r) => setTimeout(r, 3000));

      // Click "Check for Updates..." via the application menu
      await app.evaluate(async ({ Menu }) => {
        const menu = Menu.getApplicationMenu();
        if (!menu) throw new Error('No application menu found');

        let updateItem: Electron.MenuItem | undefined;
        for (const topItem of menu.items) {
          if (topItem.submenu) {
            for (const item of topItem.submenu.items) {
              if (item.label === 'Check for Updates...') {
                updateItem = item;
                break;
              }
            }
          }
          if (updateItem) break;
        }

        if (!updateItem) throw new Error('"Check for Updates..." menu item not found');
        updateItem.click();
      });

      // Verify update detected
      await expect.poll(
        () => app.evaluate(() => process.env.__UPDATER_AVAILABLE__),
        { timeout: 30_000, intervals: [500] },
      ).toBeTruthy();
    } finally {
      await forceCloseApp(app);
    }
  });

  test('no update shown when server returns current version', async () => {
    // Create a server that returns the app's own version (no update available)
    const noUpdateServer = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (!req.url) { res.writeHead(400); res.end(); return; }
      const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;

      if (pathname.endsWith('.yml')) {
        // Return a manifest with the CURRENT version (0.3.8 or whatever the app reports)
        const manifest = [
          'version: 0.0.1',
          'files:',
          '  - url: update.zip',
          `    sha512: ${DUMMY_SHA512}`,
          `    size: ${DUMMY_SIZE}`,
          'path: update.zip',
          `sha512: ${DUMMY_SHA512}`,
          `releaseDate: '${new Date().toISOString()}'`,
        ].join('\n');
        res.writeHead(200, { 'Content-Type': 'text/yaml' });
        res.end(manifest);
        return;
      }
      res.writeHead(404);
      res.end('Not found');
    });

    const noUpdatePort = await new Promise<number>((resolve) => {
      noUpdateServer.listen(0, '127.0.0.1', () => {
        const addr = noUpdateServer.address();
        if (!addr || typeof addr === 'string') throw new Error('Unexpected address');
        resolve(addr.port);
      });
    });

    const app = await launchElectron({
      ACCOMPLISH_UPDATER_URL: `http://127.0.0.1:${noUpdatePort}`,
      __UPDATER_AUTO_ACCEPT__: 'true',
    });

    try {
      // Wait long enough for auto-check to fire (5s delay + check time)
      await new Promise((r) => setTimeout(r, 12_000));
      const available = await app.evaluate(() => process.env.__UPDATER_AVAILABLE__);
      expect(available).toBeFalsy();
    } finally {
      await forceCloseApp(app);
      await new Promise<void>((resolve) => noUpdateServer.close(() => resolve()));
    }
  });

  test('updater handles unreachable server gracefully', async () => {
    // Point at a port with no server — connection refused
    const app = await launchElectron({
      ACCOMPLISH_UPDATER_URL: 'http://127.0.0.1:1',
      __UPDATER_AUTO_ACCEPT__: 'true',
    });

    try {
      // Wait for auto-check to fire and fail
      await new Promise((r) => setTimeout(r, 12_000));
      // App should still be running — no crash
      const version = await app.evaluate(({ app }) => app.getVersion());
      expect(version).toBeTruthy();
      // No update should be detected
      const available = await app.evaluate(() => process.env.__UPDATER_AVAILABLE__);
      expect(available).toBeFalsy();
    } finally {
      await forceCloseApp(app);
    }
  });
});
