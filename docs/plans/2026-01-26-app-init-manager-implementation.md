# AppInitManager Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a centralized AppInitManager service that orchestrates all app initialization, provides runtime health checks with status bar UI, and enables build-time CI validation.

**Architecture:** Non-blocking background health checks on app launch. Status bar shows progress during checks, then persistent status indicator. Errors include verbose debug info with user guidance. Build scripts validate packaged binaries in clean-PATH environment.

**Tech Stack:** TypeScript, Electron IPC, Zustand, React, Vitest, GitHub Actions

---

## Task 1: InitError Type and Constants

**Files:**
- Create: `apps/desktop/src/main/services/app-init/types.ts`
- Create: `apps/desktop/packages/shared/src/types/init.ts`

**Step 1: Create shared types**

Create `packages/shared/src/types/init.ts`:

```typescript
/**
 * Structured error for initialization failures.
 * Verbose by default - captures full context for debugging.
 */
export interface InitError {
  code: string;
  component: string;
  message: string;
  guidance: string;
  debugInfo: {
    platform: string;
    expectedPath?: string;
    actualPath?: string | null;
    searchedPaths?: string[];
    env?: Record<string, string>;
    stderr?: string;
    exitCode?: number | null;
    nodeVersion?: string | null;
  };
}

export type HealthStatus = 'pending' | 'checking' | 'healthy' | 'degraded' | 'failed';

export interface ComponentHealth {
  name: string;
  displayName: string;
  status: HealthStatus;
  lastCheck: number | null;
  error: InitError | null;
  retryCount: number;
}

export interface SystemHealth {
  overall: HealthStatus;
  components: ComponentHealth[];
  lastFullCheck: number | null;
  isChecking: boolean;
  checkingComponent: string | null;
}

export const HEALTH_COMPONENTS = [
  'bundled-node',
  'mcp:file-permission',
  'mcp:ask-user-question',
  'mcp:dev-browser-mcp',
  'mcp:complete-task',
  'chrome',
] as const;

export type HealthComponent = typeof HEALTH_COMPONENTS[number];
```

**Step 2: Export from shared package**

Edit `packages/shared/src/types/index.ts` - add export:

```typescript
export * from './init';
```

**Step 3: Verify types compile**

Run: `pnpm -F @accomplish/shared build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add packages/shared/src/types/init.ts packages/shared/src/types/index.ts
git commit -m "feat(shared): add InitError and SystemHealth types"
```

---

## Task 2: Chrome Detector Utility

**Files:**
- Create: `apps/desktop/src/main/utils/chrome-detector.ts`
- Create: `apps/desktop/__tests__/unit/main/utils/chrome-detector.unit.test.ts`

**Step 1: Write failing test**

Create `apps/desktop/__tests__/unit/main/utils/chrome-detector.unit.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  access: vi.fn(),
}));

// Mock child_process
vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

describe('ChromeDetector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getChromePaths', () => {
    it('returns correct paths for darwin', async () => {
      const { getChromePaths } = await import('@main/utils/chrome-detector');
      const paths = getChromePaths('darwin');

      expect(paths).toContain('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
      expect(paths.length).toBeGreaterThan(0);
    });

    it('returns correct paths for win32', async () => {
      const { getChromePaths } = await import('@main/utils/chrome-detector');
      const paths = getChromePaths('win32');

      expect(paths.some(p => p.includes('Program Files'))).toBe(true);
      expect(paths.some(p => p.includes('chrome.exe'))).toBe(true);
    });

    it('returns correct paths for linux', async () => {
      const { getChromePaths } = await import('@main/utils/chrome-detector');
      const paths = getChromePaths('linux');

      expect(paths).toContain('/usr/bin/google-chrome');
    });
  });

  describe('detectChrome', () => {
    it('returns found=true when Chrome exists and is executable', async () => {
      const fs = await import('fs/promises');
      const cp = await import('child_process');

      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      vi.mocked(cp.execFile).mockImplementation((_cmd, _args, _opts, callback) => {
        if (callback) callback(null, 'Google Chrome 120.0.0', '');
        return {} as any;
      });

      vi.resetModules();
      const { detectChrome } = await import('@main/utils/chrome-detector');
      const result = await detectChrome();

      expect(result.found).toBe(true);
      expect(result.path).toBeTruthy();
      expect(result.error).toBeNull();
    });

    it('returns verbose error when Chrome not found', async () => {
      const fs = await import('fs/promises');

      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      vi.resetModules();
      const { detectChrome } = await import('@main/utils/chrome-detector');
      const result = await detectChrome();

      expect(result.found).toBe(false);
      expect(result.error).not.toBeNull();
      expect(result.error?.code).toBe('CHROME_NOT_FOUND');
      expect(result.error?.debugInfo.searchedPaths).toBeDefined();
      expect(result.error?.debugInfo.searchedPaths!.length).toBeGreaterThan(0);
      expect(result.error?.guidance).toContain('google.com/chrome');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @accomplish/desktop test:unit -- chrome-detector`
Expected: FAIL - module not found

**Step 3: Write implementation**

Create `apps/desktop/src/main/utils/chrome-detector.ts`:

```typescript
import fs from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { InitError } from '@accomplish/shared';

const execFileAsync = promisify(execFile);

export interface ChromeDetectionResult {
  found: boolean;
  path: string | null;
  version: string | null;
  error: InitError | null;
}

export function getChromePaths(platform: string): string[] {
  switch (platform) {
    case 'darwin':
      return [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        `${process.env.HOME}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
      ];
    case 'win32':
      return [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
      ];
    case 'linux':
      return [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/snap/bin/chromium',
      ];
    default:
      return [];
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function getChromeVersion(chromePath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(chromePath, ['--version'], { timeout: 5000 });
    return stdout.trim();
  } catch {
    return null;
  }
}

export async function detectChrome(): Promise<ChromeDetectionResult> {
  const searchPaths = getChromePaths(process.platform);

  for (const chromePath of searchPaths) {
    if (await fileExists(chromePath)) {
      const version = await getChromeVersion(chromePath);
      if (version) {
        return { found: true, path: chromePath, version, error: null };
      }
      // File exists but couldn't get version - try next
    }
  }

  return {
    found: false,
    path: null,
    version: null,
    error: {
      code: 'CHROME_NOT_FOUND',
      component: 'chrome',
      message: 'Chrome browser not found',
      guidance: 'Install Google Chrome from https://google.com/chrome and restart the app.',
      debugInfo: {
        platform: `${process.platform}-${process.arch}`,
        searchedPaths: searchPaths,
        actualPath: null,
        env: { PATH: process.env.PATH || '' },
      },
    },
  };
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm -F @accomplish/desktop test:unit -- chrome-detector`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/src/main/utils/chrome-detector.ts apps/desktop/__tests__/unit/main/utils/chrome-detector.unit.test.ts
git commit -m "feat(desktop): add Chrome detection utility with verbose errors"
```

---

## Task 3: Extend bundled-node.ts with buildNodeEnv

**Files:**
- Modify: `apps/desktop/src/main/utils/bundled-node.ts`
- Modify: `apps/desktop/__tests__/integration/main/utils/bundled-node.integration.test.ts`

**Step 1: Write failing test**

Add to `apps/desktop/__tests__/integration/main/utils/bundled-node.integration.test.ts`:

```typescript
describe('buildNodeEnv()', () => {
  it('prepends bundled bin dir to PATH on unix', async () => {
    mockApp.isPackaged = true;
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    const resourcesPath = '/fake/resources';
    (process as any).resourcesPath = resourcesPath;

    vi.resetModules();
    const module = await import('@main/utils/bundled-node');

    const env = module.buildNodeEnv({ PATH: '/usr/bin:/bin' });

    expect(env.PATH).toMatch(/^\/fake\/resources\/nodejs\/[^:]+\/bin:/);
    expect(env.PATH).toContain('/usr/bin:/bin');
  });

  it('uses semicolon delimiter on Windows', async () => {
    mockApp.isPackaged = true;
    Object.defineProperty(process, 'platform', { value: 'win32' });
    Object.defineProperty(process, 'arch', { value: 'x64' });
    const resourcesPath = 'C:\\fake\\resources';
    (process as any).resourcesPath = resourcesPath;

    vi.resetModules();
    const module = await import('@main/utils/bundled-node');

    const env = module.buildNodeEnv({ PATH: 'C:\\Windows\\System32' });

    expect(env.PATH).toContain(';');
    expect(env.PATH).not.toContain(':C:'); // No unix-style colons before drive letters
  });

  it('sets NODE_BIN_PATH env var', async () => {
    mockApp.isPackaged = true;
    const resourcesPath = '/fake/resources';
    (process as any).resourcesPath = resourcesPath;

    vi.resetModules();
    const module = await import('@main/utils/bundled-node');

    const env = module.buildNodeEnv({});

    expect(env.NODE_BIN_PATH).toBeDefined();
    expect(env.NODE_BIN_PATH).toContain('nodejs');
  });

  it('returns unmodified env in development mode', async () => {
    mockApp.isPackaged = false;

    vi.resetModules();
    const module = await import('@main/utils/bundled-node');

    const env = module.buildNodeEnv({ PATH: '/usr/bin', CUSTOM: 'value' });

    expect(env.PATH).toBe('/usr/bin');
    expect(env.CUSTOM).toBe('value');
    expect(env.NODE_BIN_PATH).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @accomplish/desktop test -- bundled-node.integration`
Expected: FAIL - buildNodeEnv is not a function

**Step 3: Add buildNodeEnv to bundled-node.ts**

Add to `apps/desktop/src/main/utils/bundled-node.ts`:

```typescript
/**
 * Build environment variables with bundled Node.js in PATH.
 *
 * This ensures spawned processes (MCP servers, CLI tools) find the
 * bundled Node.js instead of relying on system Node.js.
 *
 * @param baseEnv - Base environment to extend (defaults to process.env)
 * @returns Environment with bundled Node in PATH and NODE_BIN_PATH set
 */
export function buildNodeEnv(baseEnv: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const bundled = getBundledNodePaths();

  if (!bundled) {
    // Development mode - return env unchanged
    return { ...baseEnv };
  }

  const delimiter = process.platform === 'win32' ? ';' : ':';
  const currentPath = baseEnv.PATH || process.env.PATH || '';

  return {
    ...baseEnv,
    PATH: `${bundled.binDir}${delimiter}${currentPath}`,
    NODE_BIN_PATH: bundled.binDir,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm -F @accomplish/desktop test -- bundled-node.integration`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/src/main/utils/bundled-node.ts apps/desktop/__tests__/integration/main/utils/bundled-node.integration.test.ts
git commit -m "feat(desktop): add buildNodeEnv for consistent PATH injection"
```

---

## Task 4: Node Health Checker

**Files:**
- Create: `apps/desktop/src/main/services/app-init/checkers/node-checker.ts`
- Create: `apps/desktop/__tests__/unit/main/services/app-init/node-checker.unit.test.ts`

**Step 1: Write failing test**

Create `apps/desktop/__tests__/unit/main/services/app-init/node-checker.unit.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('@main/utils/bundled-node', () => ({
  getBundledNodePaths: vi.fn(),
  buildNodeEnv: vi.fn(),
}));

describe('NodeChecker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkBundledNode', () => {
    it('returns healthy when bundled node runs successfully', async () => {
      const bundledNode = await import('@main/utils/bundled-node');
      const cp = await import('child_process');

      vi.mocked(bundledNode.getBundledNodePaths).mockReturnValue({
        nodePath: '/fake/node',
        npmPath: '/fake/npm',
        npxPath: '/fake/npx',
        binDir: '/fake/bin',
        nodeDir: '/fake',
      });

      vi.mocked(cp.execFile).mockImplementation((_cmd, _args, _opts, callback) => {
        if (callback) callback(null, 'v20.18.1\n', '');
        return {} as any;
      });

      vi.resetModules();
      const { checkBundledNode } = await import('@main/services/app-init/checkers/node-checker');
      const result = await checkBundledNode();

      expect(result.status).toBe('healthy');
      expect(result.error).toBeNull();
    });

    it('returns failed with verbose error when node not found', async () => {
      const bundledNode = await import('@main/utils/bundled-node');

      vi.mocked(bundledNode.getBundledNodePaths).mockReturnValue(null);

      vi.resetModules();
      const { checkBundledNode } = await import('@main/services/app-init/checkers/node-checker');
      const result = await checkBundledNode();

      expect(result.status).toBe('failed');
      expect(result.error).not.toBeNull();
      expect(result.error?.code).toBe('BUNDLED_NODE_NOT_FOUND');
      expect(result.error?.debugInfo.platform).toBeDefined();
    });

    it('returns failed with stderr when node crashes', async () => {
      const bundledNode = await import('@main/utils/bundled-node');
      const cp = await import('child_process');

      vi.mocked(bundledNode.getBundledNodePaths).mockReturnValue({
        nodePath: '/fake/node',
        npmPath: '/fake/npm',
        npxPath: '/fake/npx',
        binDir: '/fake/bin',
        nodeDir: '/fake',
      });

      const error = new Error('spawn failed') as Error & { code: number };
      error.code = 127;
      vi.mocked(cp.execFile).mockImplementation((_cmd, _args, _opts, callback) => {
        if (callback) callback(error, '', 'node: not found');
        return {} as any;
      });

      vi.resetModules();
      const { checkBundledNode } = await import('@main/services/app-init/checkers/node-checker');
      const result = await checkBundledNode();

      expect(result.status).toBe('failed');
      expect(result.error?.code).toBe('BUNDLED_NODE_FAILED');
      expect(result.error?.debugInfo.stderr).toContain('not found');
      expect(result.error?.debugInfo.exitCode).toBe(127);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @accomplish/desktop test:unit -- node-checker`
Expected: FAIL - module not found

**Step 3: Create directory and implement**

```bash
mkdir -p apps/desktop/src/main/services/app-init/checkers
```

Create `apps/desktop/src/main/services/app-init/checkers/node-checker.ts`:

```typescript
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import type { ComponentHealth, InitError } from '@accomplish/shared';
import { getBundledNodePaths } from '../../../utils/bundled-node';

const execFileAsync = promisify(execFile);

export interface NodeCheckResult {
  status: 'healthy' | 'failed';
  version: string | null;
  error: InitError | null;
}

export async function checkBundledNode(): Promise<NodeCheckResult> {
  const paths = getBundledNodePaths();

  // In development, always healthy (using system node)
  if (!paths) {
    return { status: 'healthy', version: process.version, error: null };
  }

  // Check if node binary exists
  if (!fs.existsSync(paths.nodePath)) {
    return {
      status: 'failed',
      version: null,
      error: {
        code: 'BUNDLED_NODE_NOT_FOUND',
        component: 'bundled-node',
        message: 'Bundled Node.js binary not found',
        guidance: 'The app installation may be corrupted. Try reinstalling the app.',
        debugInfo: {
          platform: `${process.platform}-${process.arch}`,
          expectedPath: paths.nodePath,
          actualPath: null,
          env: { resourcesPath: process.resourcesPath },
        },
      },
    };
  }

  // Try to run node --version
  try {
    const { stdout } = await execFileAsync(paths.nodePath, ['--version'], {
      timeout: 5000,
    });
    const version = stdout.trim();
    return { status: 'healthy', version, error: null };
  } catch (err) {
    const error = err as Error & { code?: number; stderr?: string };
    return {
      status: 'failed',
      version: null,
      error: {
        code: 'BUNDLED_NODE_FAILED',
        component: 'bundled-node',
        message: 'Bundled Node.js failed to run',
        guidance: 'The bundled Node.js binary may be corrupted. Try reinstalling the app.',
        debugInfo: {
          platform: `${process.platform}-${process.arch}`,
          expectedPath: paths.nodePath,
          actualPath: paths.nodePath,
          stderr: error.stderr || error.message,
          exitCode: typeof error.code === 'number' ? error.code : null,
          env: {
            resourcesPath: process.resourcesPath,
            PATH: process.env.PATH || '',
          },
        },
      },
    };
  }
}

export function toComponentHealth(result: NodeCheckResult): ComponentHealth {
  return {
    name: 'bundled-node',
    displayName: 'Bundled Node.js',
    status: result.status,
    lastCheck: Date.now(),
    error: result.error,
    retryCount: 0,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm -F @accomplish/desktop test:unit -- node-checker`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/src/main/services/app-init/checkers/node-checker.ts apps/desktop/__tests__/unit/main/services/app-init/node-checker.unit.test.ts
git commit -m "feat(desktop): add Node.js health checker with verbose errors"
```

---

## Task 5: MCP Health Checker

**Files:**
- Create: `apps/desktop/src/main/services/app-init/checkers/mcp-checker.ts`
- Create: `apps/desktop/__tests__/unit/main/services/app-init/mcp-checker.unit.test.ts`

**Step 1: Write failing test**

Create `apps/desktop/__tests__/unit/main/services/app-init/mcp-checker.unit.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('@main/utils/bundled-node', () => ({
  getNodePath: vi.fn(),
  buildNodeEnv: vi.fn(),
}));

describe('MCPChecker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkMCPServer', () => {
    it('returns healthy when MCP server starts and stays alive', async () => {
      const fs = await import('fs');
      const cp = await import('child_process');
      const bundledNode = await import('@main/utils/bundled-node');

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(bundledNode.getNodePath).mockReturnValue('/fake/node');
      vi.mocked(bundledNode.buildNodeEnv).mockReturnValue({ PATH: '/fake/bin' });

      const mockProcess = {
        pid: 1234,
        kill: vi.fn(),
        on: vi.fn(),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
      };
      vi.mocked(cp.spawn).mockReturnValue(mockProcess as any);

      vi.resetModules();
      const { checkMCPServer } = await import('@main/services/app-init/checkers/mcp-checker');

      // Start check
      const resultPromise = checkMCPServer('dev-browser-mcp', '/fake/skills/dev-browser-mcp/dist/index.mjs');

      // Simulate process staying alive for 2 seconds
      await new Promise(r => setTimeout(r, 100));

      // Get result
      const result = await resultPromise;

      expect(result.status).toBe('healthy');
      expect(mockProcess.kill).toHaveBeenCalled();
    });

    it('returns failed when MCP entry point missing', async () => {
      const fs = await import('fs');

      vi.mocked(fs.existsSync).mockReturnValue(false);

      vi.resetModules();
      const { checkMCPServer } = await import('@main/services/app-init/checkers/mcp-checker');
      const result = await checkMCPServer('dev-browser-mcp', '/fake/missing.mjs');

      expect(result.status).toBe('failed');
      expect(result.error?.code).toBe('MCP_ENTRY_NOT_FOUND');
      expect(result.error?.debugInfo.expectedPath).toBe('/fake/missing.mjs');
    });

    it('returns failed with stderr when MCP crashes on startup', async () => {
      const fs = await import('fs');
      const cp = await import('child_process');
      const bundledNode = await import('@main/utils/bundled-node');

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(bundledNode.getNodePath).mockReturnValue('/fake/node');
      vi.mocked(bundledNode.buildNodeEnv).mockReturnValue({ PATH: '/fake/bin' });

      let exitCallback: (code: number) => void;
      let stderrCallback: (data: Buffer) => void;

      const mockProcess = {
        pid: 1234,
        kill: vi.fn(),
        on: vi.fn((event: string, cb: any) => {
          if (event === 'exit') exitCallback = cb;
        }),
        stdout: { on: vi.fn() },
        stderr: {
          on: vi.fn((event: string, cb: any) => {
            if (event === 'data') stderrCallback = cb;
          }),
        },
      };
      vi.mocked(cp.spawn).mockReturnValue(mockProcess as any);

      vi.resetModules();
      const { checkMCPServer } = await import('@main/services/app-init/checkers/mcp-checker');

      const resultPromise = checkMCPServer('dev-browser-mcp', '/fake/index.mjs');

      // Simulate crash
      await new Promise(r => setTimeout(r, 50));
      stderrCallback!(Buffer.from('Error: Cannot find module'));
      exitCallback!(1);

      const result = await resultPromise;

      expect(result.status).toBe('failed');
      expect(result.error?.code).toBe('MCP_SPAWN_FAILED');
      expect(result.error?.debugInfo.stderr).toContain('Cannot find module');
      expect(result.error?.debugInfo.exitCode).toBe(1);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @accomplish/desktop test:unit -- mcp-checker`
Expected: FAIL - module not found

**Step 3: Implement MCP checker**

Create `apps/desktop/src/main/services/app-init/checkers/mcp-checker.ts`:

```typescript
import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import type { ComponentHealth, InitError } from '@accomplish/shared';
import { getNodePath, buildNodeEnv } from '../../../utils/bundled-node';

export interface MCPCheckResult {
  status: 'healthy' | 'failed';
  error: InitError | null;
}

const MCP_STARTUP_TIMEOUT = 2000; // 2 seconds to verify server starts

export async function checkMCPServer(
  mcpName: string,
  entryPath: string
): Promise<MCPCheckResult> {
  // Check entry point exists
  if (!fs.existsSync(entryPath)) {
    return {
      status: 'failed',
      error: {
        code: 'MCP_ENTRY_NOT_FOUND',
        component: `mcp:${mcpName}`,
        message: `MCP server entry point not found: ${mcpName}`,
        guidance: 'The app installation may be incomplete. Try reinstalling the app.',
        debugInfo: {
          platform: `${process.platform}-${process.arch}`,
          expectedPath: entryPath,
          actualPath: null,
        },
      },
    };
  }

  const nodePath = getNodePath();
  const env = buildNodeEnv(process.env);

  return new Promise((resolve) => {
    let stderr = '';
    let resolved = false;
    let proc: ChildProcess | null = null;

    const cleanup = () => {
      if (proc && !proc.killed) {
        try {
          proc.kill('SIGTERM');
        } catch {
          // Ignore kill errors
        }
      }
    };

    const fail = (exitCode: number | null) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve({
        status: 'failed',
        error: {
          code: 'MCP_SPAWN_FAILED',
          component: `mcp:${mcpName}`,
          message: `Failed to start MCP server: ${mcpName}`,
          guidance: 'Bundled Node.js may be corrupted or missing dependencies. Try reinstalling the app.',
          debugInfo: {
            platform: `${process.platform}-${process.arch}`,
            expectedPath: entryPath,
            actualPath: nodePath,
            stderr: stderr.slice(0, 1000), // Limit stderr length
            exitCode,
            env: {
              PATH: env.PATH || '',
              NODE_BIN_PATH: env.NODE_BIN_PATH || '',
            },
          },
        },
      });
    };

    try {
      proc = spawn(nodePath, [entryPath], {
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('error', (err) => {
        stderr += err.message;
        fail(null);
      });

      proc.on('exit', (code) => {
        fail(code);
      });

      // If still running after timeout, consider it healthy
      setTimeout(() => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve({ status: 'healthy', error: null });
      }, MCP_STARTUP_TIMEOUT);
    } catch (err) {
      stderr += (err as Error).message;
      fail(null);
    }
  });
}

export function toComponentHealth(
  mcpName: string,
  displayName: string,
  result: MCPCheckResult
): ComponentHealth {
  return {
    name: `mcp:${mcpName}`,
    displayName,
    status: result.status,
    lastCheck: Date.now(),
    error: result.error,
    retryCount: 0,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm -F @accomplish/desktop test:unit -- mcp-checker`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/src/main/services/app-init/checkers/mcp-checker.ts apps/desktop/__tests__/unit/main/services/app-init/mcp-checker.unit.test.ts
git commit -m "feat(desktop): add MCP server health checker with verbose errors"
```

---

## Task 6: Chrome Health Checker Integration

**Files:**
- Create: `apps/desktop/src/main/services/app-init/checkers/chrome-checker.ts`

**Step 1: Create chrome checker wrapper**

Create `apps/desktop/src/main/services/app-init/checkers/chrome-checker.ts`:

```typescript
import type { ComponentHealth } from '@accomplish/shared';
import { detectChrome, type ChromeDetectionResult } from '../../../utils/chrome-detector';

export { detectChrome, type ChromeDetectionResult };

export function toComponentHealth(result: ChromeDetectionResult): ComponentHealth {
  return {
    name: 'chrome',
    displayName: 'Google Chrome',
    status: result.found ? 'healthy' : 'failed',
    lastCheck: Date.now(),
    error: result.error,
    retryCount: 0,
  };
}
```

**Step 2: Create index for checkers**

Create `apps/desktop/src/main/services/app-init/checkers/index.ts`:

```typescript
export * from './node-checker';
export * from './mcp-checker';
export * from './chrome-checker';
```

**Step 3: Verify compilation**

Run: `pnpm -F @accomplish/desktop build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add apps/desktop/src/main/services/app-init/checkers/chrome-checker.ts apps/desktop/src/main/services/app-init/checkers/index.ts
git commit -m "feat(desktop): add Chrome health checker wrapper and export checkers"
```

---

## Task 7: AppInitManager Service

**Files:**
- Create: `apps/desktop/src/main/services/app-init/app-init-manager.ts`
- Create: `apps/desktop/src/main/services/app-init/index.ts`

**Step 1: Create AppInitManager**

Create `apps/desktop/src/main/services/app-init/app-init-manager.ts`:

```typescript
import { EventEmitter } from 'events';
import { app, BrowserWindow } from 'electron';
import path from 'path';
import type { SystemHealth, ComponentHealth, HealthStatus } from '@accomplish/shared';
import {
  checkBundledNode,
  toComponentHealth as nodeToHealth,
} from './checkers/node-checker';
import {
  checkMCPServer,
  toComponentHealth as mcpToHealth,
} from './checkers/mcp-checker';
import {
  detectChrome,
  toComponentHealth as chromeToHealth,
} from './checkers/chrome-checker';

const MCP_SERVERS = [
  { name: 'file-permission', displayName: 'File Permission MCP' },
  { name: 'ask-user-question', displayName: 'Ask User Question MCP' },
  { name: 'dev-browser-mcp', displayName: 'Browser Automation MCP' },
  { name: 'complete-task', displayName: 'Complete Task MCP' },
];

const MAX_AUTO_RETRIES = 3;

export class AppInitManager extends EventEmitter {
  private health: SystemHealth;
  private autoRetryCount = 0;
  private focusListener: (() => void) | null = null;

  constructor() {
    super();
    this.health = {
      overall: 'pending',
      components: [],
      lastFullCheck: null,
      isChecking: false,
      checkingComponent: null,
    };
  }

  getHealth(): SystemHealth {
    return { ...this.health };
  }

  private getSkillsDir(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'app', 'skills');
    }
    // Development: skills are in apps/desktop/skills
    return path.join(app.getAppPath(), 'skills');
  }

  private getMCPEntryPath(mcpName: string): string {
    return path.join(this.getSkillsDir(), mcpName, 'dist', 'index.mjs');
  }

  private updateComponent(component: ComponentHealth): void {
    const index = this.health.components.findIndex(c => c.name === component.name);
    if (index >= 0) {
      this.health.components[index] = component;
    } else {
      this.health.components.push(component);
    }
    this.recalculateOverall();
    this.emit('health:changed', this.getHealth());
  }

  private recalculateOverall(): void {
    const statuses = this.health.components.map(c => c.status);

    if (statuses.some(s => s === 'failed')) {
      this.health.overall = 'failed';
    } else if (statuses.some(s => s === 'degraded')) {
      this.health.overall = 'degraded';
    } else if (statuses.some(s => s === 'checking' || s === 'pending')) {
      this.health.overall = 'checking';
    } else {
      this.health.overall = 'healthy';
    }
  }

  async runChecks(): Promise<SystemHealth> {
    if (this.health.isChecking) {
      return this.getHealth();
    }

    this.health.isChecking = true;
    this.health.components = [];
    this.emit('health:check-started');

    try {
      // Check bundled Node
      this.health.checkingComponent = 'Validating bundled Node...';
      this.emit('health:progress', this.health.checkingComponent);
      const nodeResult = await checkBundledNode();
      this.updateComponent(nodeToHealth(nodeResult));

      // Only check MCPs if Node is healthy
      if (nodeResult.status === 'healthy') {
        for (const mcp of MCP_SERVERS) {
          this.health.checkingComponent = `Checking ${mcp.displayName}...`;
          this.emit('health:progress', this.health.checkingComponent);

          const entryPath = this.getMCPEntryPath(mcp.name);
          const mcpResult = await checkMCPServer(mcp.name, entryPath);
          this.updateComponent(mcpToHealth(mcp.name, mcp.displayName, mcpResult));
        }
      } else {
        // Mark all MCPs as failed if Node fails
        for (const mcp of MCP_SERVERS) {
          this.updateComponent({
            name: `mcp:${mcp.name}`,
            displayName: mcp.displayName,
            status: 'failed',
            lastCheck: Date.now(),
            error: {
              code: 'MCP_BLOCKED_BY_NODE',
              component: `mcp:${mcp.name}`,
              message: 'Cannot check MCP - bundled Node.js is not working',
              guidance: 'Fix the bundled Node.js issue first.',
              debugInfo: { platform: `${process.platform}-${process.arch}` },
            },
            retryCount: 0,
          });
        }
      }

      // Check Chrome
      this.health.checkingComponent = 'Detecting Chrome...';
      this.emit('health:progress', this.health.checkingComponent);
      const chromeResult = await detectChrome();
      this.updateComponent(chromeToHealth(chromeResult));

    } finally {
      this.health.isChecking = false;
      this.health.checkingComponent = null;
      this.health.lastFullCheck = Date.now();
      this.emit('health:check-complete', this.getHealth());
    }

    return this.getHealth();
  }

  async retryFailed(): Promise<SystemHealth> {
    const failedComponents = this.health.components.filter(c => c.status === 'failed');

    if (failedComponents.length === 0) {
      return this.getHealth();
    }

    this.health.isChecking = true;
    this.emit('health:check-started');

    try {
      for (const component of failedComponents) {
        component.retryCount++;

        if (component.name === 'bundled-node') {
          this.health.checkingComponent = 'Retrying bundled Node...';
          this.emit('health:progress', this.health.checkingComponent);
          const result = await checkBundledNode();
          this.updateComponent({ ...nodeToHealth(result), retryCount: component.retryCount });
        } else if (component.name === 'chrome') {
          this.health.checkingComponent = 'Retrying Chrome detection...';
          this.emit('health:progress', this.health.checkingComponent);
          const result = await detectChrome();
          this.updateComponent({ ...chromeToHealth(result), retryCount: component.retryCount });
        } else if (component.name.startsWith('mcp:')) {
          const mcpName = component.name.replace('mcp:', '');
          this.health.checkingComponent = `Retrying ${component.displayName}...`;
          this.emit('health:progress', this.health.checkingComponent);
          const entryPath = this.getMCPEntryPath(mcpName);
          const result = await checkMCPServer(mcpName, entryPath);
          this.updateComponent({ ...mcpToHealth(mcpName, component.displayName, result), retryCount: component.retryCount });
        }
      }
    } finally {
      this.health.isChecking = false;
      this.health.checkingComponent = null;
      this.emit('health:check-complete', this.getHealth());
    }

    return this.getHealth();
  }

  setupAutoRetryOnFocus(window: BrowserWindow): void {
    if (this.focusListener) return;

    this.focusListener = () => {
      const hasFailures = this.health.components.some(c => c.status === 'failed');
      if (hasFailures && this.autoRetryCount < MAX_AUTO_RETRIES && !this.health.isChecking) {
        this.autoRetryCount++;
        console.log(`[AppInitManager] Auto-retry on focus (attempt ${this.autoRetryCount}/${MAX_AUTO_RETRIES})`);
        this.retryFailed();
      }
    };

    window.on('focus', this.focusListener);
  }

  dispose(): void {
    if (this.focusListener) {
      this.focusListener = null;
    }
    this.removeAllListeners();
  }
}

// Singleton instance
let instance: AppInitManager | null = null;

export function getAppInitManager(): AppInitManager {
  if (!instance) {
    instance = new AppInitManager();
  }
  return instance;
}

export function disposeAppInitManager(): void {
  if (instance) {
    instance.dispose();
    instance = null;
  }
}
```

**Step 2: Create index export**

Create `apps/desktop/src/main/services/app-init/index.ts`:

```typescript
export { AppInitManager, getAppInitManager, disposeAppInitManager } from './app-init-manager';
export * from './checkers';
```

**Step 3: Verify compilation**

Run: `pnpm -F @accomplish/desktop build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add apps/desktop/src/main/services/app-init/app-init-manager.ts apps/desktop/src/main/services/app-init/index.ts
git commit -m "feat(desktop): add AppInitManager service with health checks"
```

---

## Task 8: IPC Handlers for Health Status

**Files:**
- Modify: `apps/desktop/src/main/ipc/handlers.ts`
- Modify: `apps/desktop/src/preload/index.ts`

**Step 1: Add IPC handlers**

Add to `apps/desktop/src/main/ipc/handlers.ts` in the `registerIPCHandlers` function:

```typescript
import { getAppInitManager } from '../services/app-init';

// Inside registerIPCHandlers():

// System health
ipcMain.handle('system:health', async () => {
  const manager = getAppInitManager();
  return manager.getHealth();
});

ipcMain.handle('system:health-retry', async () => {
  const manager = getAppInitManager();
  return manager.retryFailed();
});
```

**Step 2: Add preload API**

Add to `apps/desktop/src/preload/index.ts` in the `accomplishAPI` object:

```typescript
// System health
getSystemHealth: (): Promise<unknown> =>
  ipcRenderer.invoke('system:health'),
retrySystemHealth: (): Promise<unknown> =>
  ipcRenderer.invoke('system:health-retry'),

// Health status events
onHealthChanged: (callback: (health: unknown) => void) => {
  const listener = (_: unknown, health: unknown) => callback(health);
  ipcRenderer.on('system:health-changed', listener);
  return () => ipcRenderer.removeListener('system:health-changed', listener);
},
onHealthProgress: (callback: (message: string) => void) => {
  const listener = (_: unknown, message: string) => callback(message);
  ipcRenderer.on('system:health-progress', listener);
  return () => ipcRenderer.removeListener('system:health-progress', listener);
},
```

**Step 3: Forward events from AppInitManager**

Add to `apps/desktop/src/main/ipc/handlers.ts`:

```typescript
// At end of registerIPCHandlers, after window is available:
// Setup health event forwarding
const initManager = getAppInitManager();

initManager.on('health:changed', (health) => {
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) {
      win.webContents.send('system:health-changed', health);
    }
  });
});

initManager.on('health:progress', (message) => {
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) {
      win.webContents.send('system:health-progress', message);
    }
  });
});
```

**Step 4: Verify compilation**

Run: `pnpm -F @accomplish/desktop build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add apps/desktop/src/main/ipc/handlers.ts apps/desktop/src/preload/index.ts
git commit -m "feat(desktop): add IPC handlers for system health"
```

---

## Task 9: Health Store (Zustand)

**Files:**
- Create: `apps/desktop/src/renderer/stores/healthStore.ts`

**Step 1: Create health store**

Create `apps/desktop/src/renderer/stores/healthStore.ts`:

```typescript
import { create } from 'zustand';
import type { SystemHealth, ComponentHealth } from '@accomplish/shared';
import { getAccomplish } from '../lib/accomplish';

interface HealthState {
  health: SystemHealth | null;
  progressMessage: string | null;
  isExpanded: boolean;

  // Actions
  loadHealth: () => Promise<void>;
  retry: () => Promise<void>;
  setExpanded: (expanded: boolean) => void;
  setProgressMessage: (message: string | null) => void;
  updateHealth: (health: SystemHealth) => void;
}

export const useHealthStore = create<HealthState>((set, get) => ({
  health: null,
  progressMessage: null,
  isExpanded: false,

  loadHealth: async () => {
    const accomplish = getAccomplish();
    const health = await accomplish.getSystemHealth() as SystemHealth;
    set({ health });
  },

  retry: async () => {
    const accomplish = getAccomplish();
    const health = await accomplish.retrySystemHealth() as SystemHealth;
    set({ health });
  },

  setExpanded: (expanded: boolean) => {
    set({ isExpanded: expanded });
  },

  setProgressMessage: (message: string | null) => {
    set({ progressMessage: message });
  },

  updateHealth: (health: SystemHealth) => {
    set({ health, progressMessage: health.checkingComponent });
  },
}));

// Setup event listeners (call once at app startup)
export function setupHealthListeners(): void {
  const accomplish = getAccomplish();

  accomplish.onHealthChanged?.((health: unknown) => {
    useHealthStore.getState().updateHealth(health as SystemHealth);
  });

  accomplish.onHealthProgress?.((message: string) => {
    useHealthStore.getState().setProgressMessage(message);
  });
}
```

**Step 2: Verify compilation**

Run: `pnpm -F @accomplish/desktop build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add apps/desktop/src/renderer/stores/healthStore.ts
git commit -m "feat(desktop): add Zustand store for system health"
```

---

## Task 10: Status Bar Component

**Files:**
- Create: `apps/desktop/src/renderer/components/StatusBar.tsx`
- Create: `apps/desktop/src/renderer/components/StatusBar.css`

**Step 1: Create StatusBar component**

Create `apps/desktop/src/renderer/components/StatusBar.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useHealthStore, setupHealthListeners } from '../stores/healthStore';
import type { ComponentHealth } from '@accomplish/shared';
import './StatusBar.css';

function StatusIndicator({ status }: { status: string }) {
  const color = {
    healthy: 'var(--color-success)',
    degraded: 'var(--color-warning)',
    failed: 'var(--color-error)',
    checking: 'var(--color-muted)',
    pending: 'var(--color-muted)',
  }[status] || 'var(--color-muted)';

  return <span className="status-dot" style={{ backgroundColor: color }} />;
}

function ComponentItem({ component }: { component: ComponentHealth }) {
  const [showDetails, setShowDetails] = useState(false);
  const icon = component.status === 'healthy' ? '✓' : '✗';

  return (
    <div className="component-item">
      <div className="component-header" onClick={() => component.error && setShowDetails(!showDetails)}>
        <span className={`component-icon ${component.status}`}>{icon}</span>
        <span className="component-name">{component.displayName}</span>
      </div>

      {component.error && (
        <div className="component-error">
          <div className="error-message">{component.error.message}</div>
          <div className="error-guidance">{component.error.guidance}</div>

          {showDetails && (
            <div className="error-details">
              <div className="details-header">Debug Info</div>
              <pre className="details-content">
                {JSON.stringify(component.error.debugInfo, null, 2)}
              </pre>
              <button
                className="copy-button"
                onClick={() => navigator.clipboard.writeText(JSON.stringify(component.error, null, 2))}
              >
                Copy to Clipboard
              </button>
            </div>
          )}

          {!showDetails && component.error && (
            <button className="show-details-button" onClick={() => setShowDetails(true)}>
              Show Details
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function StatusBar() {
  const { health, progressMessage, isExpanded, setExpanded, loadHealth, retry } = useHealthStore();

  useEffect(() => {
    setupHealthListeners();
    loadHealth();
  }, []);

  if (!health) {
    return null;
  }

  const failedCount = health.components.filter(c => c.status === 'failed').length;
  const isChecking = health.isChecking;

  const statusText = isChecking
    ? 'Checking...'
    : failedCount > 0
    ? `${failedCount} issue${failedCount > 1 ? 's' : ''}`
    : 'Ready';

  return (
    <div className="status-bar">
      <div className="status-bar-content">
        <button
          className="status-indicator-button"
          onClick={() => setExpanded(!isExpanded)}
          disabled={isChecking}
        >
          <StatusIndicator status={health.overall} />
          <span className="status-text">{statusText}</span>
        </button>

        {progressMessage && (
          <span className="progress-message">{progressMessage}</span>
        )}
      </div>

      {isExpanded && (
        <div className="status-panel">
          <div className="panel-header">
            <span>System Health</span>
            <button
              className="retry-button"
              onClick={() => retry()}
              disabled={isChecking}
            >
              Retry
            </button>
          </div>
          <div className="panel-content">
            {health.components.map(component => (
              <ComponentItem key={component.name} component={component} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Create CSS**

Create `apps/desktop/src/renderer/components/StatusBar.css`:

```css
.status-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--color-bg-secondary);
  border-top: 1px solid var(--color-border);
  z-index: 100;
}

.status-bar-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 12px;
  height: 28px;
}

.status-indicator-button {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 4px;
  color: var(--color-text);
  font-size: 12px;
}

.status-indicator-button:hover {
  background: var(--color-bg-hover);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-text {
  font-size: 12px;
}

.progress-message {
  font-size: 11px;
  color: var(--color-text-muted);
}

.status-panel {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  max-height: 400px;
  overflow-y: auto;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-bottom: none;
  border-radius: 8px 8px 0 0;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
  font-weight: 500;
}

.retry-button {
  padding: 4px 12px;
  border-radius: 4px;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  cursor: pointer;
  font-size: 12px;
}

.retry-button:hover {
  background: var(--color-bg-hover);
}

.panel-content {
  padding: 8px 16px;
}

.component-item {
  padding: 8px 0;
  border-bottom: 1px solid var(--color-border);
}

.component-item:last-child {
  border-bottom: none;
}

.component-header {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.component-icon {
  font-size: 14px;
}

.component-icon.healthy {
  color: var(--color-success);
}

.component-icon.failed {
  color: var(--color-error);
}

.component-name {
  font-size: 13px;
}

.component-error {
  margin-top: 8px;
  margin-left: 22px;
  font-size: 12px;
}

.error-message {
  color: var(--color-error);
  margin-bottom: 4px;
}

.error-guidance {
  color: var(--color-text-muted);
  margin-bottom: 8px;
}

.show-details-button {
  padding: 2px 8px;
  font-size: 11px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: none;
  cursor: pointer;
  color: var(--color-text-muted);
}

.error-details {
  margin-top: 8px;
  background: var(--color-bg);
  border-radius: 4px;
  padding: 8px;
}

.details-header {
  font-size: 11px;
  font-weight: 500;
  margin-bottom: 4px;
  color: var(--color-text-muted);
}

.details-content {
  font-size: 10px;
  overflow-x: auto;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.copy-button {
  margin-top: 8px;
  padding: 4px 8px;
  font-size: 11px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: none;
  cursor: pointer;
}
```

**Step 3: Verify compilation**

Run: `pnpm -F @accomplish/desktop build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add apps/desktop/src/renderer/components/StatusBar.tsx apps/desktop/src/renderer/components/StatusBar.css
git commit -m "feat(desktop): add StatusBar component for system health"
```

---

## Task 11: Integrate StatusBar into App

**Files:**
- Modify: `apps/desktop/src/renderer/App.tsx`
- Modify: `apps/desktop/src/main/index.ts`

**Step 1: Add StatusBar to App.tsx**

Add import and component to `apps/desktop/src/renderer/App.tsx`:

```tsx
import { StatusBar } from './components/StatusBar';

// Add at end of App component, before closing fragment:
<StatusBar />
```

**Step 2: Initialize health checks in main process**

Add to `apps/desktop/src/main/index.ts` after `createWindow()`:

```typescript
import { getAppInitManager, disposeAppInitManager } from './services/app-init';

// After createWindow() in app.whenReady():
const initManager = getAppInitManager();
initManager.runChecks(); // Non-blocking background check
if (mainWindow) {
  initManager.setupAutoRetryOnFocus(mainWindow);
}

// In app.on('before-quit'):
disposeAppInitManager();
```

**Step 3: Test manually**

Run: `pnpm dev`
Expected: App launches, status bar visible at bottom, shows health check progress then status

**Step 4: Commit**

```bash
git add apps/desktop/src/renderer/App.tsx apps/desktop/src/main/index.ts
git commit -m "feat(desktop): integrate StatusBar and health checks into app"
```

---

## Task 12: Build-time Validation Scripts

**Files:**
- Create: `apps/desktop/scripts/validate-package.sh`
- Create: `apps/desktop/scripts/validate-package.ps1`

**Step 1: Create macOS/Linux script**

Create `apps/desktop/scripts/validate-package.sh`:

```bash
#!/bin/bash
set -e

APP_PATH="$1"

if [ -z "$APP_PATH" ]; then
  echo "Usage: $0 <path-to-app>"
  echo "  macOS: $0 /path/to/Openwork.app"
  echo "  Linux: $0 /path/to/openwork-linux-unpacked"
  exit 1
fi

echo "=== Package Validation ==="
echo "App path: $APP_PATH"
echo "Platform: $(uname -s)"
echo "Architecture: $(uname -m)"
echo ""

# Strip system Node from PATH to simulate clean environment
export PATH="/usr/bin:/bin:/usr/sbin:/sbin"
echo "Stripped PATH to: $PATH"
echo ""

# Determine paths based on platform
if [ "$(uname -s)" = "Darwin" ]; then
  RESOURCES_DIR="$APP_PATH/Contents/Resources"
else
  RESOURCES_DIR="$APP_PATH/resources"
fi

ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  NODE_ARCH="arm64"
else
  NODE_ARCH="x64"
fi

NODE_DIR="$RESOURCES_DIR/nodejs/$NODE_ARCH"
NODE_BIN="$NODE_DIR/bin/node"
SKILLS_DIR="$RESOURCES_DIR/app/skills"

# === Check 1: Bundled Node exists ===
echo "=== Check 1: Bundled Node exists ==="
if [ ! -f "$NODE_BIN" ]; then
  echo "ERROR: Bundled Node not found"
  echo "  Expected: $NODE_BIN"
  echo "  Platform: $(uname -s)-$ARCH"
  echo "  Contents of nodejs dir:"
  ls -la "$RESOURCES_DIR/nodejs/" 2>/dev/null || echo "  (nodejs dir not found)"
  exit 1
fi
echo "OK: Found $NODE_BIN"
echo ""

# === Check 2: Bundled Node runs ===
echo "=== Check 2: Bundled Node runs ==="
export PATH="$NODE_DIR/bin:$PATH"
NODE_VERSION=$("$NODE_BIN" --version 2>&1) || {
  echo "ERROR: Bundled Node failed to run"
  echo "  Path: $NODE_BIN"
  echo "  Exit code: $?"
  echo "  Output: $NODE_VERSION"
  exit 1
}
echo "OK: Node $NODE_VERSION"
echo ""

# === Check 3: Node path structure correct ===
echo "=== Check 3: Node path structure correct ==="
for BINARY in "$NODE_DIR/bin/node" "$NODE_DIR/bin/npm" "$NODE_DIR/bin/npx"; do
  if [ ! -f "$BINARY" ]; then
    echo "ERROR: Expected binary missing"
    echo "  Expected: $BINARY"
    echo "  Contents of bin dir:"
    ls -la "$NODE_DIR/bin/" 2>/dev/null || echo "  (bin dir not found)"
    exit 1
  fi
done
echo "OK: All expected binaries present (node, npm, npx)"
echo ""

# === Check 4: MCP servers can spawn ===
echo "=== Check 4: MCP servers spawn ==="
if [ ! -d "$SKILLS_DIR" ]; then
  echo "ERROR: Skills directory not found"
  echo "  Expected: $SKILLS_DIR"
  exit 1
fi

for MCP_DIR in "$SKILLS_DIR"/*/; do
  MCP_NAME=$(basename "$MCP_DIR")
  MCP_ENTRY="$MCP_DIR/dist/index.mjs"

  if [ ! -f "$MCP_ENTRY" ]; then
    echo "ERROR: MCP entry point missing"
    echo "  MCP: $MCP_NAME"
    echo "  Expected: $MCP_ENTRY"
    echo "  Contents of $MCP_DIR:"
    ls -la "$MCP_DIR" 2>/dev/null || echo "  (dir not found)"
    exit 1
  fi

  echo "Spawning $MCP_NAME..."
  "$NODE_BIN" "$MCP_ENTRY" &
  PID=$!
  sleep 2

  if ! kill -0 $PID 2>/dev/null; then
    wait $PID 2>/dev/null
    EXIT_CODE=$?
    echo "ERROR: MCP crashed on startup"
    echo "  MCP: $MCP_NAME"
    echo "  Entry: $MCP_ENTRY"
    echo "  Exit code: $EXIT_CODE"
    echo "  Node path: $NODE_BIN"
    echo "  PATH: $PATH"
    exit 1
  fi

  kill $PID 2>/dev/null || true
  wait $PID 2>/dev/null || true
  echo "OK: $MCP_NAME started successfully"
done

echo ""
echo "=== All validations passed ==="
```

**Step 2: Create Windows script**

Create `apps/desktop/scripts/validate-package.ps1`:

```powershell
param(
    [Parameter(Mandatory=$true)]
    [string]$AppPath
)

$ErrorActionPreference = "Stop"

Write-Host "=== Package Validation ===" -ForegroundColor Cyan
Write-Host "App path: $AppPath"
Write-Host "Platform: Windows"
Write-Host "Architecture: x64"
Write-Host ""

# Strip system Node from PATH to simulate clean environment
$env:PATH = "C:\Windows\System32;C:\Windows"
Write-Host "Stripped PATH to: $env:PATH"
Write-Host ""

$ResourcesDir = "$AppPath\resources"
$NodeDir = "$ResourcesDir\nodejs\x64"
$NodeBin = "$NodeDir\node.exe"
$SkillsDir = "$ResourcesDir\app\skills"

# === Check 1: Bundled Node exists ===
Write-Host "=== Check 1: Bundled Node exists ===" -ForegroundColor Yellow
if (-not (Test-Path $NodeBin)) {
    Write-Host "ERROR: Bundled Node not found" -ForegroundColor Red
    Write-Host "  Expected: $NodeBin"
    Write-Host "  Platform: win32-x64"
    Write-Host "  Contents of nodejs dir:"
    Get-ChildItem "$ResourcesDir\nodejs" -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "    $_" }
    exit 1
}
Write-Host "OK: Found $NodeBin" -ForegroundColor Green
Write-Host ""

# === Check 2: Bundled Node runs ===
Write-Host "=== Check 2: Bundled Node runs ===" -ForegroundColor Yellow
$env:PATH = "$NodeDir;$env:PATH"
try {
    $NodeVersion = & $NodeBin --version 2>&1
    Write-Host "OK: Node $NodeVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Bundled Node failed to run" -ForegroundColor Red
    Write-Host "  Path: $NodeBin"
    Write-Host "  Error: $_"
    exit 1
}
Write-Host ""

# === Check 3: Node path structure correct ===
Write-Host "=== Check 3: Node path structure correct ===" -ForegroundColor Yellow
foreach ($bin in @("node.exe", "npm.cmd", "npx.cmd")) {
    $binPath = "$NodeDir\$bin"
    if (-not (Test-Path $binPath)) {
        Write-Host "ERROR: Expected binary missing: $bin" -ForegroundColor Red
        Write-Host "  Expected: $binPath"
        Write-Host "  Contents of node dir:"
        Get-ChildItem $NodeDir -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "    $_" }
        exit 1
    }
}
Write-Host "OK: All expected binaries present (node.exe, npm.cmd, npx.cmd)" -ForegroundColor Green
Write-Host ""

# === Check 4: MCP servers can spawn ===
Write-Host "=== Check 4: MCP servers spawn ===" -ForegroundColor Yellow
if (-not (Test-Path $SkillsDir)) {
    Write-Host "ERROR: Skills directory not found" -ForegroundColor Red
    Write-Host "  Expected: $SkillsDir"
    exit 1
}

Get-ChildItem $SkillsDir -Directory | ForEach-Object {
    $McpName = $_.Name
    $McpEntry = "$($_.FullName)\dist\index.mjs"

    if (-not (Test-Path $McpEntry)) {
        Write-Host "ERROR: MCP entry point missing" -ForegroundColor Red
        Write-Host "  MCP: $McpName"
        Write-Host "  Expected: $McpEntry"
        Write-Host "  Contents of MCP dir:"
        Get-ChildItem $_.FullName -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "    $_" }
        exit 1
    }

    Write-Host "Spawning $McpName..."
    $process = Start-Process -FilePath $NodeBin -ArgumentList $McpEntry -PassThru -NoNewWindow -RedirectStandardError "NUL"
    Start-Sleep -Seconds 2

    if ($process.HasExited) {
        Write-Host "ERROR: MCP crashed on startup" -ForegroundColor Red
        Write-Host "  MCP: $McpName"
        Write-Host "  Entry: $McpEntry"
        Write-Host "  Exit code: $($process.ExitCode)"
        Write-Host "  Node path: $NodeBin"
        Write-Host "  PATH: $env:PATH"
        exit 1
    }

    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    Write-Host "OK: $McpName started successfully" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== All validations passed ===" -ForegroundColor Green
```

**Step 3: Make scripts executable**

Run: `chmod +x apps/desktop/scripts/validate-package.sh`

**Step 4: Commit**

```bash
git add apps/desktop/scripts/validate-package.sh apps/desktop/scripts/validate-package.ps1
git commit -m "feat(desktop): add build-time package validation scripts"
```

---

## Task 13: GitHub Actions Workflow for Validation

**Files:**
- Modify: `.github/workflows/build.yml` (or create new workflow)

**Step 1: Add validation jobs**

Add to existing build workflow or create `.github/workflows/validate-package.yml`:

```yaml
name: Validate Package

on:
  workflow_run:
    workflows: ["Build"]
    types:
      - completed

jobs:
  validate-mac:
    runs-on: macos-latest
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    steps:
      - uses: actions/checkout@v4

      - name: Download macOS artifact
        uses: actions/download-artifact@v4
        with:
          name: mac-build
          path: ./build
          run-id: ${{ github.event.workflow_run.id }}
          github-token: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract and validate
        run: |
          # Find and extract the app
          APP_PATH=$(find ./build -name "*.app" -type d | head -1)
          if [ -z "$APP_PATH" ]; then
            echo "No .app found, looking for DMG..."
            DMG_PATH=$(find ./build -name "*.dmg" | head -1)
            hdiutil attach "$DMG_PATH" -mountpoint /tmp/app-mount
            APP_PATH=$(find /tmp/app-mount -name "*.app" -type d | head -1)
          fi

          echo "Validating: $APP_PATH"
          chmod +x ./apps/desktop/scripts/validate-package.sh
          ./apps/desktop/scripts/validate-package.sh "$APP_PATH"

  validate-windows:
    runs-on: windows-latest
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    steps:
      - uses: actions/checkout@v4

      - name: Download Windows artifact
        uses: actions/download-artifact@v4
        with:
          name: windows-build
          path: ./build
          run-id: ${{ github.event.workflow_run.id }}
          github-token: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract and validate
        shell: powershell
        run: |
          # Find unpacked directory or extract installer
          $unpackedDir = Get-ChildItem -Path ./build -Filter "*-unpacked" -Directory | Select-Object -First 1

          if ($unpackedDir) {
            $AppPath = $unpackedDir.FullName
          } else {
            # Extract NSIS installer
            $installer = Get-ChildItem -Path ./build -Filter "*.exe" | Select-Object -First 1
            7z x $installer.FullName -o"./extracted" -y
            $AppPath = "./extracted"
          }

          Write-Host "Validating: $AppPath"
          ./apps/desktop/scripts/validate-package.ps1 -AppPath $AppPath
```

**Step 2: Commit**

```bash
git add .github/workflows/validate-package.yml
git commit -m "ci: add package validation workflow for macOS and Windows"
```

---

## Task 14: Remove Playwright Fallback from Browser Manager

**Files:**
- Modify: `packages/browser-manager/src/launcher.ts`

**Step 1: Update launcher to require Chrome**

Modify `packages/browser-manager/src/launcher.ts` to remove Playwright fallback:

```typescript
import { chromium, type BrowserContext } from 'playwright';
import type { BrowserMode } from './types.js';
import { ensureProfileDir } from './profile.js';

export interface LaunchOptions {
  headless: boolean;
  onProgress?: (message: string) => void;
}

export interface LaunchResult {
  context: BrowserContext;
  wsEndpoint: string;
  usedSystemChrome: boolean;
}

export interface Launcher {
  name: BrowserMode;
  canUse(): Promise<boolean>;
  launch(httpPort: number, cdpPort: number, options: LaunchOptions): Promise<LaunchResult>;
}

/**
 * Chrome not found error with verbose debugging info
 */
export class ChromeNotFoundError extends Error {
  constructor(public readonly searchedPaths: string[]) {
    super(
      `Chrome browser not found. Searched paths:\n${searchedPaths.map(p => `  - ${p}`).join('\n')}\n\n` +
      `Please install Google Chrome from https://google.com/chrome and restart the app.`
    );
    this.name = 'ChromeNotFoundError';
  }
}

/**
 * Launch mode - launches a new browser instance
 * Requires system Chrome - no Playwright Chromium fallback
 */
export class LaunchModeLauncher implements Launcher {
  readonly name: BrowserMode = 'launch';

  async canUse(): Promise<boolean> {
    return true; // Can always try to launch
  }

  async launch(httpPort: number, cdpPort: number, options: LaunchOptions): Promise<LaunchResult> {
    options.onProgress?.('Launching Chrome...');
    const profileDir = ensureProfileDir('chrome');

    let context: BrowserContext;
    try {
      context = await chromium.launchPersistentContext(profileDir, {
        headless: options.headless,
        channel: 'chrome',
        ignoreDefaultArgs: ['--enable-automation'],
        args: [
          `--remote-debugging-port=${cdpPort}`,
          '--disable-blink-features=AutomationControlled',
        ],
      });
    } catch (err) {
      const error = err as Error;
      // Chrome not found - provide helpful error
      if (error.message.includes('chrome') || error.message.includes('executable')) {
        const searchedPaths = getChromePaths();
        throw new ChromeNotFoundError(searchedPaths);
      }
      throw err;
    }

    options.onProgress?.('Chrome launched');

    // Get CDP WebSocket endpoint (with retry for browser startup)
    let wsEndpoint: string | undefined;
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const cdpResponse = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
        const cdpInfo = (await cdpResponse.json()) as { webSocketDebuggerUrl: string };
        wsEndpoint = cdpInfo.webSocketDebuggerUrl;
        break;
      } catch {
        if (attempt === 9) {
          throw new Error(`CDP endpoint not ready after 10 attempts on port ${cdpPort}`);
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return {
      context,
      wsEndpoint: wsEndpoint!,
      usedSystemChrome: true,
    };
  }
}

function getChromePaths(): string[] {
  const platform = process.platform;
  switch (platform) {
    case 'darwin':
      return [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
      ];
    case 'win32':
      return [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      ];
    case 'linux':
      return [
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
      ];
    default:
      return [];
  }
}
```

**Step 2: Remove installer.ts if no longer needed**

If `installer.ts` only handled Playwright Chromium installation, it can be removed or deprecated.

**Step 3: Verify build**

Run: `pnpm -F @accomplish/browser-manager build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add packages/browser-manager/src/launcher.ts
git commit -m "feat(browser-manager): require system Chrome, remove Playwright fallback"
```

---

## Task 15: Final Integration Test

**Step 1: Build entire project**

Run: `pnpm build`
Expected: All packages build successfully

**Step 2: Run unit tests**

Run: `pnpm test`
Expected: All tests pass

**Step 3: Manual test in dev mode**

Run: `pnpm dev`
Expected:
- App launches
- Status bar appears at bottom
- Health checks run (progress visible)
- Status shows "Ready" or issues with guidance
- Clicking status expands panel with details

**Step 4: Test package validation locally**

```bash
# Build the app
pnpm -F @accomplish/desktop build:mac

# Find the built app
APP_PATH=$(find apps/desktop/dist -name "*.app" -type d | head -1)

# Run validation
./apps/desktop/scripts/validate-package.sh "$APP_PATH"
```

Expected: All validations pass

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat(desktop): complete AppInitManager implementation

- Centralized health checks for Node, MCPs, Chrome
- Non-blocking background checks on app launch
- Status bar UI with verbose error details
- Auto-retry on window focus
- Build-time validation scripts for CI
- Removed Playwright Chromium fallback (Chrome required)"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | InitError types | `packages/shared/src/types/init.ts` |
| 2 | Chrome detector | `apps/desktop/src/main/utils/chrome-detector.ts` |
| 3 | buildNodeEnv | `apps/desktop/src/main/utils/bundled-node.ts` |
| 4 | Node checker | `apps/desktop/src/main/services/app-init/checkers/node-checker.ts` |
| 5 | MCP checker | `apps/desktop/src/main/services/app-init/checkers/mcp-checker.ts` |
| 6 | Chrome checker | `apps/desktop/src/main/services/app-init/checkers/chrome-checker.ts` |
| 7 | AppInitManager | `apps/desktop/src/main/services/app-init/app-init-manager.ts` |
| 8 | IPC handlers | `apps/desktop/src/main/ipc/handlers.ts`, `preload/index.ts` |
| 9 | Health store | `apps/desktop/src/renderer/stores/healthStore.ts` |
| 10 | StatusBar UI | `apps/desktop/src/renderer/components/StatusBar.tsx` |
| 11 | App integration | `App.tsx`, `main/index.ts` |
| 12 | Validation scripts | `scripts/validate-package.sh`, `.ps1` |
| 13 | CI workflow | `.github/workflows/validate-package.yml` |
| 14 | Remove Playwright | `packages/browser-manager/src/launcher.ts` |
| 15 | Integration test | Manual verification |
