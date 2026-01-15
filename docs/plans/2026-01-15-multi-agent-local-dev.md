# Multi-Agent Local Development Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable multiple Claude Code agents to run the desktop app locally without resource conflicts.

**Architecture:** Use `AGENT_ID` environment variable to derive port offsets (base + (ID-1)*10) and directory suffixes. All changes are backward-compatible - default behavior is unchanged when AGENT_ID is not set.

**Tech Stack:** TypeScript, Electron, Vite, electron-store

---

## Task 1: Create Agent Config Utility Module

**Files:**
- Create: `apps/desktop/src/main/utils/agent-config.ts`
- Test: `apps/desktop/__tests__/unit/main/utils/agent-config.unit.test.ts`

**Step 1: Write the test file**

```typescript
// apps/desktop/__tests__/unit/main/utils/agent-config.unit.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('agent-config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getAgentId', () => {
    it('returns 1 when AGENT_ID is not set', async () => {
      delete process.env.AGENT_ID;
      const { getAgentId } = await import('@main/utils/agent-config');
      expect(getAgentId()).toBe(1);
    });

    it('returns parsed AGENT_ID when set', async () => {
      process.env.AGENT_ID = '3';
      const { getAgentId } = await import('@main/utils/agent-config');
      expect(getAgentId()).toBe(3);
    });

    it('returns 1 for invalid AGENT_ID', async () => {
      process.env.AGENT_ID = 'invalid';
      const { getAgentId } = await import('@main/utils/agent-config');
      expect(getAgentId()).toBe(1);
    });
  });

  describe('getPortOffset', () => {
    it('returns 0 for agent 1', async () => {
      delete process.env.AGENT_ID;
      const { getPortOffset } = await import('@main/utils/agent-config');
      expect(getPortOffset()).toBe(0);
    });

    it('returns 10 for agent 2', async () => {
      process.env.AGENT_ID = '2';
      const { getPortOffset } = await import('@main/utils/agent-config');
      expect(getPortOffset()).toBe(10);
    });

    it('returns 20 for agent 3', async () => {
      process.env.AGENT_ID = '3';
      const { getPortOffset } = await import('@main/utils/agent-config');
      expect(getPortOffset()).toBe(20);
    });
  });

  describe('getAgentSuffix', () => {
    it('returns empty string for agent 1', async () => {
      delete process.env.AGENT_ID;
      const { getAgentSuffix } = await import('@main/utils/agent-config');
      expect(getAgentSuffix()).toBe('');
    });

    it('returns -agent-2 for agent 2', async () => {
      process.env.AGENT_ID = '2';
      const { getAgentSuffix } = await import('@main/utils/agent-config');
      expect(getAgentSuffix()).toBe('-agent-2');
    });
  });

  describe('isMultiAgentMode', () => {
    it('returns false for agent 1', async () => {
      delete process.env.AGENT_ID;
      const { isMultiAgentMode } = await import('@main/utils/agent-config');
      expect(isMultiAgentMode()).toBe(false);
    });

    it('returns true for agent 2+', async () => {
      process.env.AGENT_ID = '2';
      const { isMultiAgentMode } = await import('@main/utils/agent-config');
      expect(isMultiAgentMode()).toBe(true);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd /Users/danielscharfstein/Documents/accomplish/github-repos/openwork.local-run-multiple-agents
pnpm -F @accomplish/desktop test:unit -- --run apps/desktop/__tests__/unit/main/utils/agent-config.unit.test.ts
```

Expected: FAIL - module not found

**Step 3: Create the implementation**

```typescript
// apps/desktop/src/main/utils/agent-config.ts
/**
 * Multi-agent configuration utilities
 *
 * AGENT_ID environment variable enables running multiple app instances locally.
 * Each agent gets isolated ports and storage directories.
 *
 * Port formula: base_port + (AGENT_ID - 1) * 10
 *   Agent 1: 5173, 9224, 9225, 9226 (default)
 *   Agent 2: 5183, 9234, 9235, 9236
 *   Agent 3: 5193, 9244, 9245, 9246
 */

function parseAgentId(): number {
  const envValue = process.env.AGENT_ID;
  if (!envValue) return 1;
  const parsed = parseInt(envValue, 10);
  return isNaN(parsed) || parsed < 1 ? 1 : parsed;
}

const agentId = parseAgentId();

/**
 * Get the current agent ID (1-based)
 */
export function getAgentId(): number {
  return agentId;
}

/**
 * Get the port offset for this agent
 * Formula: (agentId - 1) * 10
 */
export function getPortOffset(): number {
  return (agentId - 1) * 10;
}

/**
 * Get suffix for store names and directories
 * Returns empty string for agent 1 (backward compatible)
 */
export function getAgentSuffix(): string {
  return agentId > 1 ? `-agent-${agentId}` : '';
}

/**
 * Check if running in multi-agent mode (AGENT_ID > 1)
 */
export function isMultiAgentMode(): boolean {
  return agentId > 1;
}
```

**Step 4: Run tests to verify they pass**

```bash
cd /Users/danielscharfstein/Documents/accomplish/github-repos/openwork.local-run-multiple-agents
pnpm -F @accomplish/desktop test:unit -- --run apps/desktop/__tests__/unit/main/utils/agent-config.unit.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/src/main/utils/agent-config.ts apps/desktop/__tests__/unit/main/utils/agent-config.unit.test.ts
git commit -m "feat: add agent-config utility for multi-agent local dev"
```

---

## Task 2: Update Vite Config for Dynamic Port

**Files:**
- Modify: `apps/desktop/vite.config.ts`

**Step 1: Update vite.config.ts**

Add at the top of the file (after imports):

```typescript
// Multi-agent support: calculate port offset from AGENT_ID env var
const agentId = parseInt(process.env.AGENT_ID || '1', 10);
const portOffset = (agentId - 1) * 10;
```

Add `server` config inside `defineConfig`:

```typescript
export default defineConfig(() => ({
  server: {
    port: 5173 + portOffset,
  },
  plugins: [
    // ... existing plugins
```

**Step 2: Test manually**

```bash
# Terminal 1 - should use port 5173
cd /Users/danielscharfstein/Documents/accomplish/github-repos/openwork.local-run-multiple-agents
pnpm dev
# Look for "Local: http://localhost:5173"

# Terminal 2 - should use port 5183
AGENT_ID=2 pnpm dev
# Look for "Local: http://localhost:5183"
```

**Step 3: Commit**

```bash
git add apps/desktop/vite.config.ts
git commit -m "feat: vite dev server uses dynamic port based on AGENT_ID"
```

---

## Task 3: Update Electron Main Process for Conditional Single Instance Lock

**Files:**
- Modify: `apps/desktop/src/main/index.ts:123-128`

**Step 1: Add import and modify single instance logic**

Add import near the top of the file:

```typescript
import { isMultiAgentMode } from './utils/agent-config';
```

Replace lines 123-128 (the single instance lock section):

```typescript
// Single instance lock - skip in multi-agent mode to allow parallel instances
const gotTheLock = isMultiAgentMode() ? true : app.requestSingleInstanceLock();
```

**Step 2: Test manually**

```bash
# Terminal 1
pnpm dev

# Terminal 2 - without AGENT_ID, should focus Terminal 1's window
pnpm dev
# Expected: "Second instance attempted; quitting"

# Terminal 2 - with AGENT_ID=2, should open new window
AGENT_ID=2 pnpm dev
# Expected: New window opens
```

**Step 3: Commit**

```bash
git add apps/desktop/src/main/index.ts
git commit -m "feat: skip single-instance lock in multi-agent mode"
```

---

## Task 4: Update Permission API for Dynamic Port

**Files:**
- Modify: `apps/desktop/src/main/permission-api.ts:13`
- Update test: `apps/desktop/__tests__/integration/main/permission-api.integration.test.ts`

**Step 1: Update permission-api.ts**

Replace line 13:

```typescript
export const PERMISSION_API_PORT = 9226;
```

With:

```typescript
import { getPortOffset } from './utils/agent-config';

export const PERMISSION_API_PORT = 9226 + getPortOffset();
```

**Step 2: Update integration test**

In `apps/desktop/__tests__/integration/main/permission-api.integration.test.ts`, update test at line 85:

```typescript
describe('PERMISSION_API_PORT', () => {
  it('should be exported with correct base value for agent 1', () => {
    // Base port is 9226, offset depends on AGENT_ID env var
    expect(PERMISSION_API_PORT).toBeGreaterThanOrEqual(9226);
  });
});
```

**Step 3: Run integration tests**

```bash
cd /Users/danielscharfstein/Documents/accomplish/github-repos/openwork.local-run-multiple-agents
pnpm -F @accomplish/desktop test:integration -- --run apps/desktop/__tests__/integration/main/permission-api.integration.test.ts
```

Expected: PASS

**Step 4: Commit**

```bash
git add apps/desktop/src/main/permission-api.ts apps/desktop/__tests__/integration/main/permission-api.integration.test.ts
git commit -m "feat: permission API uses dynamic port based on AGENT_ID"
```

---

## Task 5: Update Electron Stores with Agent Suffix

**Files:**
- Modify: `apps/desktop/src/main/store/appSettings.ts:16`
- Modify: `apps/desktop/src/main/store/secureStorage.ts:21,36`
- Modify: `apps/desktop/src/main/store/taskHistory.ts:23`

**Step 5.1: Update appSettings.ts**

Add import at top:

```typescript
import { getAgentSuffix } from '../utils/agent-config';
```

Update line 16:

```typescript
const appSettingsStore = new Store<AppSettingsSchema>({
  name: `app-settings${getAgentSuffix()}`,
```

**Step 5.2: Update secureStorage.ts**

Add import at top:

```typescript
import { getAgentSuffix } from '../utils/agent-config';
```

Update line 21 (the getStoreName function):

```typescript
const getStoreName = () => {
  const suffix = getAgentSuffix();
  return app.isPackaged ? `secure-storage${suffix}` : `secure-storage-dev${suffix}`;
};
```

**Step 5.3: Update taskHistory.ts**

Add import at top:

```typescript
import { getAgentSuffix } from '../utils/agent-config';
```

Update line 23:

```typescript
const taskHistoryStore = new Store<TaskHistorySchema>({
  name: `task-history${getAgentSuffix()}`,
```

**Step 5.4: Run existing unit tests to ensure no regressions**

```bash
cd /Users/danielscharfstein/Documents/accomplish/github-repos/openwork.local-run-multiple-agents
pnpm -F @accomplish/desktop test:unit
```

Expected: All tests PASS

**Step 5.5: Commit**

```bash
git add apps/desktop/src/main/store/appSettings.ts apps/desktop/src/main/store/secureStorage.ts apps/desktop/src/main/store/taskHistory.ts
git commit -m "feat: electron stores use agent suffix for multi-agent isolation"
```

---

## Task 6: Update Dev Browser to Support Dynamic Ports

**Files:**
- Modify: `apps/desktop/skills/dev-browser/scripts/start-server.ts:33-35`

**Step 1: Update start-server.ts**

Replace lines 33-35:

```typescript
// Accomplish uses ports 9224/9225 to avoid conflicts with Claude Code's dev-browser (9222/9223)
const ACCOMPLISH_HTTP_PORT = 9224;
const ACCOMPLISH_CDP_PORT = 9225;
```

With:

```typescript
// Accomplish uses ports 9224/9225 to avoid conflicts with Claude Code's dev-browser (9222/9223)
// In multi-agent mode, read ports from environment variables
const ACCOMPLISH_HTTP_PORT = parseInt(process.env.DEV_BROWSER_PORT || '9224', 10);
const ACCOMPLISH_CDP_PORT = parseInt(process.env.DEV_BROWSER_CDP_PORT || '9225', 10);
```

**Step 2: Commit**

```bash
git add apps/desktop/skills/dev-browser/scripts/start-server.ts
git commit -m "feat: dev-browser reads ports from env vars for multi-agent support"
```

---

## Task 7: Update Task Manager to Pass Agent Ports to Dev Browser

**Files:**
- Modify: `apps/desktop/src/main/opencode/task-manager.ts:178-196`

**Step 1: Add import**

Add near other imports at top:

```typescript
import { getPortOffset, getAgentSuffix } from '../utils/agent-config';
```

**Step 2: Update ensureDevBrowserServer function**

In the `ensureDevBrowserServer` function (around line 178), update the spawn environment to include the port environment variables:

```typescript
  // Now start the server
  try {
    const skillsPath = getSkillsPath();
    const serverScript = path.join(skillsPath, 'dev-browser', 'server.sh');

    // Build environment with bundled Node.js in PATH
    const bundledPaths = getBundledNodePaths();
    const portOffset = getPortOffset();
    let spawnEnv: NodeJS.ProcessEnv = { ...process.env };
    if (bundledPaths) {
      const delimiter = process.platform === 'win32' ? ';' : ':';
      spawnEnv.PATH = `${bundledPaths.binDir}${delimiter}${process.env.PATH || ''}`;
      spawnEnv.NODE_BIN_PATH = bundledPaths.binDir;
    }
    // Pass agent-specific ports to dev-browser
    spawnEnv.DEV_BROWSER_PORT = String(9224 + portOffset);
    spawnEnv.DEV_BROWSER_CDP_PORT = String(9225 + portOffset);

    // Spawn server in background (detached, unref to not block)
    const child = spawn('bash', [serverScript], {
      detached: true,
      stdio: 'ignore',
      cwd: path.join(skillsPath, 'dev-browser'),
      env: spawnEnv,
    });
    child.unref();

    console.log(`[TaskManager] Dev-browser server spawn initiated (ports: ${9224 + portOffset}/${9225 + portOffset})`);
```

**Step 3: Commit**

```bash
git add apps/desktop/src/main/opencode/task-manager.ts
git commit -m "feat: task manager passes agent ports to dev-browser"
```

---

## Task 8: Update Config Generator with Dynamic Ports in System Prompt

**Files:**
- Modify: `apps/desktop/src/main/opencode/config-generator.ts:4,138-143`

**Step 1: Add import**

Add import near top:

```typescript
import { getPortOffset } from '../utils/agent-config';
```

**Step 2: Update system prompt template**

The system prompt template has hardcoded port 9224. We need to make it dynamic.

Find line 138-143 (the curl check in the system prompt):

```typescript
curl -s http://localhost:9224
```

Replace the entire `ACCOMPLISH_SYSTEM_PROMPT_TEMPLATE` with a function that generates it dynamically:

Add this function before the template string:

```typescript
function getDevBrowserPort(): number {
  return 9224 + getPortOffset();
}
```

Then in the template, replace all occurrences of `9224` with `\${getDevBrowserPort()}` - but since this is a template string that gets used as a prompt, we need to handle it differently.

Instead, update the `generateOpenCodeConfig` function to do the replacement:

In the `generateOpenCodeConfig` function (around line 359), update:

```typescript
  // Get skills directory path and inject into system prompt
  const skillsPath = getSkillsPath();
  const devBrowserPort = 9224 + getPortOffset();
  const systemPrompt = ACCOMPLISH_SYSTEM_PROMPT_TEMPLATE
    .replace(/\{\{SKILLS_PATH\}\}/g, skillsPath)
    .replace(/9224/g, String(devBrowserPort));
```

**Step 3: Commit**

```bash
git add apps/desktop/src/main/opencode/config-generator.ts
git commit -m "feat: config generator uses dynamic dev-browser port in system prompt"
```

---

## Task 9: Add Convenience NPM Scripts

**Files:**
- Modify: `apps/desktop/package.json`

**Step 1: Add scripts**

Add these scripts after the "dev:clean" script in package.json:

```json
    "dev:agent2": "AGENT_ID=2 pnpm dev",
    "dev:agent3": "AGENT_ID=3 pnpm dev",
```

**Step 2: Test the scripts**

```bash
# Terminal 1
cd /Users/danielscharfstein/Documents/accomplish/github-repos/openwork.local-run-multiple-agents
pnpm -F @accomplish/desktop dev

# Terminal 2
pnpm -F @accomplish/desktop dev:agent2

# Terminal 3
pnpm -F @accomplish/desktop dev:agent3
```

All three should run simultaneously without conflicts.

**Step 3: Commit**

```bash
git add apps/desktop/package.json
git commit -m "feat: add convenience scripts for multi-agent dev"
```

---

## Task 10: Update CLAUDE.md Documentation

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add multi-agent section**

Add this section after the "Common Commands" section:

```markdown
## Multi-Agent Local Development

Multiple Claude Code agents can run the app simultaneously using the `AGENT_ID` environment variable:

```bash
# Terminal 1 (Agent 1 - default ports)
pnpm dev

# Terminal 2 (Agent 2 - offset ports)
AGENT_ID=2 pnpm dev
# Or use the convenience script:
pnpm -F @accomplish/desktop dev:agent2

# Terminal 3 (Agent 3)
AGENT_ID=3 pnpm dev
```

### Port Allocation

| Resource | Agent 1 | Agent 2 | Agent 3 |
|----------|---------|---------|---------|
| Vite Dev Server | 5173 | 5183 | 5193 |
| Dev Browser HTTP | 9224 | 9234 | 9244 |
| Dev Browser CDP | 9225 | 9235 | 9245 |
| Permission API | 9226 | 9236 | 9246 |

Each agent also gets isolated electron-store files (settings, history, API keys) with `-agent-{ID}` suffix.
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add multi-agent local development section"
```

---

## Task 11: Final Integration Test

**Step 1: Clean test**

```bash
cd /Users/danielscharfstein/Documents/accomplish/github-repos/openwork.local-run-multiple-agents
pnpm clean
pnpm install
```

**Step 2: Run all tests**

```bash
pnpm -F @accomplish/desktop test
```

Expected: All tests PASS

**Step 3: Manual verification**

Open 3 terminals and run:

```bash
# Terminal 1
pnpm dev

# Terminal 2
AGENT_ID=2 pnpm dev

# Terminal 3
AGENT_ID=3 pnpm dev
```

Verify:
- All three app windows open
- Each uses different ports (check Vite output)
- Settings/history are isolated per agent
- Dev browser starts without port conflicts

**Step 4: Final commit with summary**

```bash
git add -A
git commit -m "feat: complete multi-agent local development support

Enable multiple Claude Code agents to run the desktop app locally without
resource conflicts. Each agent uses AGENT_ID env var for:
- Dynamic port allocation (base + (ID-1)*10)
- Isolated electron-store files
- Separate dev-browser instances
- Conditional single-instance lock

Usage: AGENT_ID=2 pnpm dev"
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Create agent-config utility module |
| 2 | Update Vite config for dynamic port |
| 3 | Skip single-instance lock in multi-agent mode |
| 4 | Dynamic permission API port |
| 5 | Electron stores with agent suffix |
| 6 | Dev browser reads ports from env |
| 7 | Task manager passes ports to dev-browser |
| 8 | Config generator uses dynamic ports |
| 9 | Add convenience npm scripts |
| 10 | Update CLAUDE.md documentation |
| 11 | Final integration test |
