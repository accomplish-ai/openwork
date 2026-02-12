import { test, expect, type Page } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import { type ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  launchElectron,
  getMainWindow,
  startServeProcess,
  stopServeProcess,
  assertLoadedFrom,
  assertAppRendered,
  assertBridgeWorks,
  assertNoConsoleErrors,
  collectAllConsoleLogs,
  collectNetworkFailures,
  connectProviderViaUI,
  waitForTaskCompletion,
  getArtifactDir,
  setupMainProcessLogging,
  getElectronPaths,
  collectAppLogs,
  collectCrashDumps,
  forceCloseApp,
  PRODUCTION_ORIGIN,
  type ConsoleCollector,
  type ElectronPaths,
} from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = path.resolve(__dirname, '../../../web/dist/client');
const LOCAL_PORT = 4173;

const PROVIDERS = [
  { id: 'anthropic', envVar: 'ANTHROPIC_API_KEY', name: 'Anthropic' },
  { id: 'openai', envVar: 'OPEN_AI_API_KEY', name: 'OpenAI' },
  { id: 'google', envVar: 'GEMINI_API_KEY', name: 'Gemini' },
] as const;

export interface TaskTestContext {
  app: ElectronApplication;
  window: Page;
  consoleCollector: ConsoleCollector;
  networkFailures: string[];
  artifactDir: string;
  electronPaths: ElectronPaths;
  closeMainLog: () => void;
}

export async function setupApp(
  testName: string,
  env?: Record<string, string>,
): Promise<TaskTestContext> {
  const artifactDir = getArtifactDir(testName);
  const app = await launchElectron({
    ELECTRON_ENABLE_LOGGING: '1',
    ...env,
  });
  const closeMainLog = setupMainProcessLogging(app, path.join(artifactDir, 'main-process.log'));
  const electronPaths = await getElectronPaths(app);
  const { window } = await getMainWindow(app);
  const consoleCollector = collectAllConsoleLogs(window);
  const networkFailures = collectNetworkFailures(window);
  await window.waitForLoadState('networkidle');
  return { app, window, consoleCollector, networkFailures, artifactDir, electronPaths, closeMainLog };
}

export async function teardownApp(ctx: TaskTestContext) {
  ctx.closeMainLog();
  if (ctx.consoleCollector) {
    ctx.consoleCollector.flush(path.join(ctx.artifactDir, 'console.log'));
  }
  if (ctx.networkFailures?.length > 0) {
    fs.writeFileSync(path.join(ctx.artifactDir, 'network-failures.log'), ctx.networkFailures.join('\n'));
  }
  collectAppLogs(ctx.electronPaths, ctx.artifactDir);
  collectCrashDumps(ctx.electronPaths, ctx.artifactDir);
  await forceCloseApp(ctx.app);
}

export async function connectAndActivateProvider(window: Page, providerId: string, apiKey: string) {
  await window.getByTestId('sidebar-settings-button').click();
  await expect(window.getByTestId('settings-dialog')).toBeVisible({ timeout: 5_000 });
  await connectProviderViaUI(window, providerId, apiKey);
  await window.getByTestId('settings-done-button').click();
  await expect(window.getByTestId('settings-dialog')).not.toBeVisible({ timeout: 5_000 });
}

export async function runTaskTest(
  ctx: TaskTestContext,
  expectedOrigin: string,
  providerId: string,
  apiKey: string,
) {
  assertLoadedFrom(ctx.window, expectedOrigin);
  await assertAppRendered(ctx.window);
  await assertBridgeWorks(ctx.window);
  await connectAndActivateProvider(ctx.window, providerId, apiKey);

  await ctx.window.getByTestId('task-input-textarea').fill('Go to hackernews and click on the first article');
  await ctx.window.getByTestId('task-input-submit').click();

  const status = await waitForTaskCompletion(ctx.window, 300_000);
  expect(status, 'Task should complete successfully').toBe('completed');
  assertNoConsoleErrors(ctx.consoleCollector.errors);
}

// --- Local mode: Anthropic only ---

test.describe('task execution - local mode', () => {
  let serveProcess: ChildProcess;

  test.beforeAll(async () => {
    serveProcess = await startServeProcess(WEB_DIST, LOCAL_PORT);
  });

  test.afterAll(async () => {
    if (serveProcess) await stopServeProcess(serveProcess);
  });

  test('[local] Anthropic browser automation task completes', async () => {
    test.setTimeout(300_000);
    const apiKey = process.env.ANTHROPIC_API_KEY;
    test.skip(!apiKey, 'ANTHROPIC_API_KEY not set');

    const origin = `http://localhost:${LOCAL_PORT}`;
    const ctx = await setupApp('task-local-anthropic', { ACCOMPLISH_ROUTER_URL: origin });
    try {
      await runTaskTest(ctx, origin, 'anthropic', apiKey!);
    } finally {
      await teardownApp(ctx);
    }
  });
});

// --- Remote mode: one test per provider ---
// Each describe block gets its own worker, preventing process leaks
// from one test affecting the next (known Playwright+Electron issue).

const REMOTE_URL = process.env.E2E_REMOTE_URL || PRODUCTION_ORIGIN;
const remoteOrigin = new URL(REMOTE_URL).origin;

for (const provider of PROVIDERS) {
  test.describe(`task execution - remote ${provider.name}`, () => {
    test(`[remote] ${provider.name} browser automation task completes`, async () => {
      test.setTimeout(300_000);
      const apiKey = process.env[provider.envVar];
      test.skip(!apiKey, `${provider.envVar} not set`);

      const ctx = await setupApp(`task-remote-${provider.id}`, {
        ACCOMPLISH_ROUTER_URL: REMOTE_URL,
      });
      try {
        await runTaskTest(ctx, remoteOrigin, provider.id, apiKey!);
      } finally {
        await teardownApp(ctx);
      }
    });
  });
}
