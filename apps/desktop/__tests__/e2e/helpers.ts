import { _electron as electron, expect, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { type ChildProcess, spawn } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, '../..');

export const PRODUCTION_ORIGIN = 'https://accomplish-router.accomplish.workers.dev';

const KNOWN_NOISE_PATTERNS = [
  /Failed to load resource.*favicon/i,
  /Electron Security Warning/i,
  /Blocked aria-hidden on an element/i,
];

export async function launchElectron(env: Record<string, string> = {}) {
  const args = [path.join(DESKTOP_ROOT, 'dist-electron/main/index.js')];
  if (process.env.CI) {
    args.push('--no-sandbox');
  }
  return electron.launch({
    args,
    env: {
      HOME: process.env.HOME,
      PATH: process.env.PATH,
      DISPLAY: process.env.DISPLAY,
      XAUTHORITY: process.env.XAUTHORITY,
      TMPDIR: process.env.TMPDIR,
      CLEAN_START: '1',
      ACCOMPLISH_USER_DATA_NAME: 'Accomplish-E2E-Test',
      ...env,
    },
  });
}

export async function getMainWindow(app: Awaited<ReturnType<typeof electron.launch>>) {
  let window = await app.firstWindow();

  if (window.url().startsWith('devtools://')) {
    window = await app.waitForEvent('window');
  }

  await window.waitForLoadState('domcontentloaded');
  return { window };
}

export function assertNoConsoleErrors(errors: string[]) {
  const real = errors.filter((e) => !KNOWN_NOISE_PATTERNS.some((p) => p.test(e)));
  expect(real, `Unexpected console errors:\n${real.join('\n')}`).toHaveLength(0);
}

export function assertLoadedFrom(window: Page, expectedOrigin: string) {
  const url = window.url();
  expect(url.startsWith(expectedOrigin), `Expected URL to start with ${expectedOrigin}, got ${url}`).toBe(true);
}

export async function assertAppRendered(window: Page) {
  const sidebar = window.getByTestId('sidebar-settings-button');
  await expect(sidebar, 'React app did not render — sidebar not found').toBeVisible({ timeout: 10_000 });
}

export async function assertBridgeWorks(window: Page) {
  const hasBridge = await window.evaluate(() => 'accomplish' in window);
  expect(hasBridge, 'Preload bridge not injected into renderer').toBe(true);

  const version = await window.evaluate(() => (window as any).accomplish.getVersion());
  expect(version, 'Bridge getVersion() returned falsy').toBeTruthy();
  expect(typeof version, 'Bridge getVersion() did not return a string').toBe('string');

  const platform = await window.evaluate(() => (window as any).accomplish.getPlatform());
  expect(platform, `Unexpected platform: ${platform}`).toMatch(/^(darwin|win32|linux)$/);
}

export async function assertSettingsDialogOpens(window: Page) {
  const settingsButton = window.getByTestId('sidebar-settings-button');
  await settingsButton.click();

  const settingsDialog = window.getByTestId('settings-dialog');
  await expect(settingsDialog, 'Settings dialog did not open').toBeVisible({ timeout: 5_000 });
}

export async function runE2ESuite(app: Awaited<ReturnType<typeof electron.launch>>, expectedOrigin: string) {
  try {
    const { window } = await getMainWindow(app);
    const console = collectAllConsoleLogs(window);
    await window.waitForLoadState('networkidle');

    assertLoadedFrom(window, expectedOrigin);
    await assertAppRendered(window);
    await assertBridgeWorks(window);
    await assertSettingsDialogOpens(window);

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
      await connectProviderViaUI(window, 'anthropic', anthropicKey);
      await window.getByTestId('settings-done-button').click();
      await expect(window.getByTestId('settings-dialog')).not.toBeVisible({ timeout: 5_000 });
    }

    assertNoConsoleErrors(console.errors);
  } finally {
    await forceCloseApp(app);
  }
}

const SERVE_STARTUP_TIMEOUT_MS = 10_000;

export async function startServeProcess(distPath: string, port: number): Promise<ChildProcess> {
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  const serveBin = require.resolve('serve/build/main.js');

  const proc = spawn(process.execPath, [serveBin, distPath, '-l', String(port), '--no-clipboard', '--single'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  proc.stderr?.resume();

  await new Promise<void>((resolve, reject) => {
    const fail = (err: Error) => {
      clearTimeout(timer);
      proc.kill();
      reject(err);
    };
    const timer = setTimeout(() => fail(new Error(`serve did not start within ${SERVE_STARTUP_TIMEOUT_MS}ms`)), SERVE_STARTUP_TIMEOUT_MS);
    proc.stdout?.on('data', (data: Buffer) => {
      if (data.toString().includes('Accepting connections')) {
        clearTimeout(timer);
        resolve();
      }
    });
    proc.on('error', (err) => fail(err));
    proc.on('close', (code) => fail(new Error(`serve exited with code ${code}`)));
  });

  return proc;
}

const PROVIDER_ENV_MAP: { id: string; envVar: string }[] = [
  { id: 'anthropic', envVar: 'ANTHROPIC_API_KEY' },
  { id: 'openai', envVar: 'OPEN_AI_API_KEY' },
  { id: 'google', envVar: 'GEMINI_API_KEY' },
];

export async function connectProviderViaUI(window: Page, providerId: string, apiKey: string) {
  const card = window.getByTestId(`provider-card-${providerId}`);
  await card.click();
  const input = window.getByTestId('api-key-input');
  await input.fill(apiKey);
  const connect = window.getByTestId('connect-button');
  await connect.click();
  await expect(window.getByTestId(`provider-connected-badge-${providerId}`)).toBeVisible({ timeout: 10_000 });
}

export async function connectAllProviders(window: Page) {
  for (const { id, envVar } of PROVIDER_ENV_MAP) {
    const key = process.env[envVar];
    if (key) {
      await connectProviderViaUI(window, id, key);
    }
  }
}

export async function stopServeProcess(proc: ChildProcess): Promise<void> {
  proc.kill('SIGTERM');
  const timeout = setTimeout(() => proc.kill('SIGKILL'), 5_000);
  await new Promise<void>((resolve) => proc.on('close', resolve));
  clearTimeout(timeout);
}

export async function waitForTaskCompletion(window: Page, timeout: number): Promise<string> {
  const badge = window.getByTestId('execution-status-badge');
  await expect(badge).toContainText(/Completed|Failed/, { timeout });
  const text = await badge.textContent();
  return text?.includes('Completed') ? 'completed' : 'failed';
}

export function getArtifactDir(testName: string): string {
  const dir = path.join(DESKTOP_ROOT, 'test-artifacts', testName.replace(/\s+/g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function setupMainProcessLogging(
  app: Awaited<ReturnType<typeof electron.launch>>,
  logPath: string,
): () => void {
  const stream = fs.createWriteStream(logPath, { flags: 'a' });
  const proc = app.process();
  proc?.stdout?.on('data', (data: Buffer) => stream.write(`[stdout] ${data.toString()}`));
  proc?.stderr?.on('data', (data: Buffer) => stream.write(`[stderr] ${data.toString()}`));
  return () => stream.end();
}

export interface ConsoleCollector {
  errors: string[];
  all: string[];
  flush(logPath: string): void;
}

export function collectAllConsoleLogs(window: Page): ConsoleCollector {
  const errors: string[] = [];
  const all: string[] = [];
  window.on('console', (msg) => {
    const line = `[${new Date().toISOString()}][${msg.type()}] ${msg.text()}`;
    all.push(line);
    if (msg.type() === 'error') errors.push(msg.text());
  });
  window.on('pageerror', (error) => {
    const line = `[${new Date().toISOString()}][pageerror] ${error.message}`;
    all.push(line);
    errors.push(error.message);
  });
  return {
    errors,
    all,
    flush(logPath: string) {
      if (all.length > 0) {
        fs.mkdirSync(path.dirname(logPath), { recursive: true });
        fs.writeFileSync(logPath, all.join('\n'));
      }
    },
  };
}

export function collectNetworkFailures(window: Page): string[] {
  const failures: string[] = [];
  window.on('requestfailed', (req) => {
    failures.push(`[${new Date().toISOString()}] FAIL ${req.failure()?.errorText} ${req.method()} ${req.url()}`);
  });
  window.on('response', (res) => {
    if (res.status() >= 400) {
      failures.push(`[${new Date().toISOString()}] HTTP ${res.status()} ${res.request().method()} ${res.url()}`);
    }
  });
  return failures;
}

function copyDirContents(sourceDir: string, destDir: string): void {
  if (!fs.existsSync(sourceDir)) return;
  const files = fs.readdirSync(sourceDir);
  if (files.length === 0) return;
  fs.mkdirSync(destDir, { recursive: true });
  for (const file of files) {
    fs.copyFileSync(path.join(sourceDir, file), path.join(destDir, file));
  }
}

export interface ElectronPaths {
  userData: string;
  crashDumps: string;
}

export async function getElectronPaths(
  app: Awaited<ReturnType<typeof electron.launch>>,
): Promise<ElectronPaths> {
  const [userData, crashDumps] = await Promise.all([
    app.evaluate(async ({ app }) => app.getPath('userData')),
    app.evaluate(async ({ app }) => app.getPath('crashDumps')),
  ]);
  return { userData, crashDumps };
}

export function collectAppLogs(paths: ElectronPaths, destDir: string): void {
  copyDirContents(path.join(paths.userData, 'logs'), path.join(destDir, 'app-logs'));
}

export function collectCrashDumps(paths: ElectronPaths, destDir: string): void {
  copyDirContents(paths.crashDumps, path.join(destDir, 'crash-dumps'));
}

export async function forceCloseApp(
  app: Awaited<ReturnType<typeof electron.launch>>,
): Promise<void> {
  const proc = app.process();
  if (!proc) return;

  // Ask Electron to exit cleanly
  try {
    await Promise.race([
      app.evaluate(({ app }) => { app.exit(0); }),
      new Promise((r) => setTimeout(r, 3_000)),
    ]);
  } catch { /* may fail if process is already dead */ }

  // Force-kill the process group and the process itself
  const pid = proc.pid;
  if (pid && !proc.killed && proc.exitCode === null) {
    try { process.kill(-pid, 'SIGKILL'); } catch {}
    try { process.kill(pid, 'SIGKILL'); } catch {}
  }

  // Clear Playwright's internal gracefullyCloseSet. On Linux, the child
  // process 'close' event never fires after SIGKILL (Playwright's readline
  // interfaces keep pipes open), so the gracefullyClose handler is never
  // deregistered. During worker teardown, gracefullyCloseAll() calls
  // app.close() which hangs indefinitely. Clearing the set prevents this.
  try {
    const _require = createRequire(import.meta.url);
    const playwrightTestPath = _require.resolve('@playwright/test');
    const innerRequire = createRequire(playwrightTestPath);
    const pwCorePath = innerRequire.resolve('playwright-core');
    const processLauncherPath = path.resolve(
      path.dirname(pwCorePath),
      'lib/server/utils/processLauncher.js',
    );
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { gracefullyCloseSet } = innerRequire(processLauncherPath);
    gracefullyCloseSet.clear();
  } catch { /* best effort — if this fails, teardown just takes longer */ }
}
