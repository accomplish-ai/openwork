# Multi-Agent Local Development Support

## Overview

Enable multiple Claude Code agents to run the Openwork desktop app locally without resource conflicts. Each agent uses a unique `AGENT_ID` environment variable to derive isolated ports and directories.

## Problem

When multiple agents run `pnpm dev` simultaneously, they race for:
- Vite dev server port (5173)
- Electron single-instance lock
- Dev browser ports (9224, 9225)
- Permission API port (9226)
- Browser profile directory (`.browser-data/`)
- Electron userData (settings, task history, API keys)

## Solution

Use `AGENT_ID` environment variable (1, 2, 3, ...) to calculate port offsets and directory suffixes.

### Port Allocation

Formula: `base_port + (AGENT_ID - 1) * 10`

| Resource | Agent 1 | Agent 2 | Agent 3 |
|----------|---------|---------|---------|
| Vite Dev Server | 5173 | 5183 | 5193 |
| Dev Browser HTTP | 9224 | 9234 | 9244 |
| Dev Browser CDP | 9225 | 9235 | 9245 |
| Permission API | 9226 | 9236 | 9246 |

### Directory Isolation

| Resource | Agent 1 | Agent 2+ |
|----------|---------|----------|
| Browser profile | `.browser-data/` | `.browser-data-agent-{ID}/` |
| Electron stores | `app-settings.json` | `app-settings-agent-{ID}.json` |
| userData | Default | Suffixed |

## Implementation

### 1. New Utility Module

**File:** `apps/desktop/src/main/utils/agent-config.ts`

```typescript
/**
 * Multi-agent configuration utilities
 * AGENT_ID env var enables running multiple app instances locally
 */

const agentId = parseInt(process.env.AGENT_ID || '1', 10);

export function getAgentId(): number {
  return agentId;
}

export function getPortOffset(): number {
  return (agentId - 1) * 10;
}

export function getAgentSuffix(): string {
  return agentId > 1 ? `-agent-${agentId}` : '';
}

export function isMultiAgentMode(): boolean {
  return agentId > 1;
}
```

### 2. Vite Config Changes

**File:** `apps/desktop/vite.config.ts`

```typescript
const agentId = parseInt(process.env.AGENT_ID || '1', 10);
const portOffset = (agentId - 1) * 10;

export default defineConfig(() => ({
  server: {
    port: 5173 + portOffset,
  },
  // ... rest unchanged
}));
```

### 3. Main Process Changes

**File:** `apps/desktop/src/main/index.ts`

```typescript
import { getAgentId } from './utils/agent-config';

// Skip single-instance lock in multi-agent mode
const agentId = getAgentId();
const gotTheLock = agentId === 1 ? app.requestSingleInstanceLock() : true;
```

### 4. Permission API Changes

**File:** `apps/desktop/src/main/permission-api.ts`

```typescript
import { getPortOffset } from './utils/agent-config';

export const PERMISSION_API_PORT = 9226 + getPortOffset();
```

### 5. Electron Store Changes

**Files:**
- `apps/desktop/src/main/store/appSettings.ts`
- `apps/desktop/src/main/store/secureStorage.ts`
- `apps/desktop/src/main/store/taskHistory.ts`

```typescript
import { getAgentSuffix } from '../utils/agent-config';

const store = new Store<Schema>({
  name: `app-settings${getAgentSuffix()}`,
  // ...
});
```

### 6. Dev Browser Port Configuration

**File:** `apps/desktop/src/main/opencode/config-generator.ts`

Update system prompt to use dynamic ports:
```typescript
import { getPortOffset } from '../utils/agent-config';

const devBrowserPort = 9224 + getPortOffset();
const devBrowserCdpPort = 9225 + getPortOffset();

// Update system prompt template with calculated ports
```

### 7. Dev Browser Server Startup

**File:** `apps/desktop/src/main/opencode/task-manager.ts` (or wherever dev-browser is started)

Pass ports via environment when spawning dev-browser:
```typescript
const env = {
  ...process.env,
  DEV_BROWSER_PORT: String(9224 + getPortOffset()),
  DEV_BROWSER_CDP_PORT: String(9225 + getPortOffset()),
};
```

### 8. NPM Script (Optional Convenience)

**File:** `apps/desktop/package.json`

```json
{
  "scripts": {
    "dev:agent2": "AGENT_ID=2 pnpm dev",
    "dev:agent3": "AGENT_ID=3 pnpm dev"
  }
}
```

## Usage

```bash
# Terminal 1 (Agent 1 - default)
pnpm dev

# Terminal 2 (Agent 2)
AGENT_ID=2 pnpm dev

# Terminal 3 (Agent 3)
AGENT_ID=3 pnpm dev
```

## Design Principles

1. **Zero impact when unused** - When `AGENT_ID` is not set or equals 1, behavior is identical to current implementation
2. **Environment-based configuration** - Standard pattern, works in CI/CD
3. **Centralized calculation** - Single utility module prevents drift
4. **Backwards compatible** - No breaking changes to existing workflows

## Files to Modify

| File | Change |
|------|--------|
| `src/main/utils/agent-config.ts` | NEW - utility module |
| `vite.config.ts` | Add port offset |
| `src/main/index.ts` | Conditional instance lock |
| `src/main/permission-api.ts` | Dynamic port |
| `src/main/store/appSettings.ts` | Store name suffix |
| `src/main/store/secureStorage.ts` | Store name suffix |
| `src/main/store/taskHistory.ts` | Store name suffix |
| `src/main/opencode/config-generator.ts` | Dynamic ports in prompt |
| `skills/dev-browser/src/index.ts` | Read ports from env |
| `package.json` | Optional convenience scripts |

## Testing

After implementation:
1. Run `pnpm dev` in terminal 1
2. Run `AGENT_ID=2 pnpm dev` in terminal 2
3. Verify both apps launch without port conflicts
4. Verify each app has isolated settings/history
5. Verify dev-browser instances don't interfere
