# App Init Manager & Build-time Validation Design

## Problem

Frequent failures in:
1. MCP servers - can't find Node at runtime
2. Browser automation - Chrome not detected

Issues surface late (during task execution) with unclear errors.

## Solution

1. **AppInitManager** - centralized init orchestrator with health checks
2. **Status bar UI** - persistent indicator with verbose errors
3. **Build-time CI validation** - catch packaging issues before release
4. **Require system Chrome** - remove Playwright fallback, simplify

## Decisions

| Decision | Choice |
|----------|--------|
| Chrome requirement | System Chrome only, no Playwright fallback |
| Setup timing | Background on launch (non-blocking) |
| Error display | Status bar at bottom |
| Build validation | Full spawn check with clean PATH |
| CI environment | Strip PATH to simulate no-Node machine |

---

## 1. AppInitManager Architecture

**Location:** `apps/desktop/src/main/services/app-init-manager.ts`

Single orchestrator for all app initialization:

```
AppInitManager
├── InitPhase: Sequential startup
│   ├── Database (migrations, connection)
│   ├── Keychain (keytar init)
│   ├── BundledNode (path validation)
│   ├── MCPServers (file existence, spawn test)
│   └── ChromeDetection (find executable)
│
├── HealthRegistry: Runtime status tracking
│   ├── status: 'healthy' | 'degraded' | 'failed'
│   ├── lastCheck: timestamp
│   ├── error: { code, message, guidance, debugInfo }
│   └── retryCount: number
│
└── Events
    ├── 'init:phase-complete' → progress updates
    ├── 'health:changed' → status bar updates
    └── 'health:check-complete' → detailed results
```

### Error Structure

Used everywhere - verbose by default:

```typescript
interface InitError {
  code: string;                    // e.g., 'CHROME_NOT_FOUND', 'NODE_SPAWN_FAILED'
  component: string;               // e.g., 'chrome', 'bundled-node', 'mcp:dev-browser'
  message: string;                 // Human-readable summary
  guidance: string;                // How to fix it
  debugInfo: {
    platform: string;              // 'darwin-arm64', 'win32-x64'
    expectedPath: string;          // Where we looked
    actualPath: string | null;     // What we found (if anything)
    env: Record<string, string>;   // Relevant env vars (PATH, NODE_BIN_PATH)
    stderr: string;                // Captured error output
    exitCode: number | null;       // Process exit code if applicable
  };
}
```

---

## 2. Runtime Health Checks

### Non-blocking Flow

```
App Launch
    │
    ├──▶ Window loads immediately (UI usable)
    │
    └──▶ AppInitManager.runChecks() [background]
              │
              ├── Emits 'health:changed' as each check completes
              │
              └── Status bar updates reactively
```

### Check Execution

| Check | What | Timeout |
|-------|------|---------|
| BundledNode | `node --version` with bundled binary | 5s |
| MCPServers | Spawn each, verify alive after 2s | 10s |
| Chrome | Find executable, verify launchable | 5s |

### Auto-retry Behavior

- On app window focus → re-run failed checks only
- Max 3 auto-retries per session
- Manual "Retry" always available

### Error Examples

**Chrome not found:**
```typescript
{
  code: 'CHROME_NOT_FOUND',
  component: 'chrome',
  message: 'Chrome browser not found',
  guidance: 'Install Google Chrome from https://google.com/chrome and restart the app',
  debugInfo: {
    platform: 'darwin-arm64',
    searchedPaths: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium'
    ],
    foundPath: null,
    env: { PATH: '/usr/bin:/bin' }
  }
}
```

**MCP spawn failed:**
```typescript
{
  code: 'MCP_SPAWN_FAILED',
  component: 'mcp:dev-browser-mcp',
  message: 'Failed to start dev-browser-mcp server',
  guidance: 'Bundled Node.js may be corrupted. Try reinstalling the app.',
  debugInfo: {
    platform: 'win32-x64',
    command: 'node.exe',
    args: ['C:\\Users\\...\\skills\\dev-browser-mcp\\dist\\index.mjs'],
    expectedNodePath: 'C:\\Users\\...\\resources\\nodejs\\x64\\node.exe',
    nodeExists: true,
    nodeVersion: null,
    env: {
      PATH: 'C:\\Users\\...\\resources\\nodejs\\x64;C:\\Windows\\System32',
      NODE_BIN_PATH: 'C:\\Users\\...\\resources\\nodejs\\x64'
    },
    stderr: 'Error: Cannot find module \'@anthropic/sdk\'',
    exitCode: 1
  }
}
```

---

## 3. Status Bar UI

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  [Main App Content]                                             │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  ● 2 issues                                        Checking MCP │
│  ▲ status indicator                    progress label (temp) ──▶│
└─────────────────────────────────────────────────────────────────┘
```

### States

| State | Left side | Right side |
|-------|-----------|------------|
| Checking | ○ Checking... (gray) | `Validating bundled Node...` → `Checking MCP...` → `Detecting Chrome...` |
| All OK | ● Ready (green) | *(disappears)* |
| Issues | ● 2 issues (amber/red) | *(disappears)* |

Progress label disappears when setup completes.

### Issue Details Panel

Click "● 2 issues" to expand:

```
┌─────────────────────────────────────────────────┐
│ System Health                           [Retry] │
├─────────────────────────────────────────────────┤
│ ✓ Bundled Node.js                               │
│ ✓ MCP: file-permission                          │
│ ✗ MCP: dev-browser-mcp                          │
│   └─ Failed to start server                     │
│      Bundled Node.js may be corrupted.          │
│      Try reinstalling the app.                  │
│      [Show Details]                             │
│ ✗ Chrome                                        │
│   └─ Chrome browser not found                   │
│      Install from https://google.com/chrome     │
│      [Show Details]                             │
└─────────────────────────────────────────────────┘
```

"Show Details" expands to verbose debugInfo with "Copy to Clipboard" button.

---

## 4. Build-time CI Validation

### Workflow Structure

```yaml
jobs:
  build-mac:
    runs-on: macos-latest
    # existing build

  build-windows:
    runs-on: windows-latest
    # existing build

  validate-mac:
    needs: build-mac
    runs-on: macos-latest
    steps:
      - uses: actions/download-artifact@v4
      - run: ./scripts/validate-package.sh

  validate-windows:
    needs: build-windows
    runs-on: windows-latest
    steps:
      - uses: actions/download-artifact@v4
      - run: ./scripts/validate-package.ps1
```

### macOS Validation Script

`scripts/validate-package.sh`:

```bash
#!/bin/bash
set -e

APP_PATH="$1"

# Strip system Node - simulate user machine without Node
export PATH="/usr/bin:/bin:/usr/sbin:/sbin"

# Locate bundled Node
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  NODE_DIR="$APP_PATH/Contents/Resources/nodejs/arm64/bin"
else
  NODE_DIR="$APP_PATH/Contents/Resources/nodejs/x64/bin"
fi
SKILLS_DIR="$APP_PATH/Contents/Resources/app/skills"

# Check 1: Bundled Node exists
echo "=== Check: Bundled Node exists ==="
if [ ! -f "$NODE_DIR/node" ]; then
  echo "ERROR: Bundled Node not found"
  echo "  Expected: $NODE_DIR/node"
  echo "  Platform: $(uname -s)-$ARCH"
  echo "  Contents of nodejs dir:"
  ls -la "$APP_PATH/Contents/Resources/nodejs/" || echo "  (dir not found)"
  exit 1
fi
echo "OK: Found $NODE_DIR/node"

# Check 2: Bundled Node runs
echo "=== Check: Bundled Node runs ==="
export PATH="$NODE_DIR:$PATH"
NODE_VERSION=$("$NODE_DIR/node" --version 2>&1) || {
  echo "ERROR: Bundled Node failed to run"
  echo "  Path: $NODE_DIR/node"
  echo "  Exit code: $?"
  echo "  Output: $NODE_VERSION"
  exit 1
}
echo "OK: Node $NODE_VERSION"

# Check 3: Node path structure correct
echo "=== Check: Node path structure ==="
for BINARY in "$NODE_DIR/node" "$NODE_DIR/npm" "$NODE_DIR/npx"; do
  if [ ! -f "$BINARY" ]; then
    echo "ERROR: Expected binary missing"
    echo "  Expected: $BINARY"
    echo "  Contents of $NODE_DIR:"
    ls -la "$NODE_DIR"
    exit 1
  fi
done
echo "OK: All expected binaries present"

# Check 4: MCP servers can spawn
echo "=== Check: MCP servers spawn ==="
for MCP_DIR in "$SKILLS_DIR"/*/; do
  MCP_NAME=$(basename "$MCP_DIR")
  MCP_ENTRY="$MCP_DIR/dist/index.mjs"

  if [ ! -f "$MCP_ENTRY" ]; then
    echo "ERROR: MCP entry point missing"
    echo "  MCP: $MCP_NAME"
    echo "  Expected: $MCP_ENTRY"
    echo "  Contents of $MCP_DIR:"
    ls -la "$MCP_DIR" || echo "  (dir not found)"
    exit 1
  fi

  echo "Spawning $MCP_NAME..."
  "$NODE_DIR/node" "$MCP_ENTRY" &
  PID=$!
  sleep 2

  if ! kill -0 $PID 2>/dev/null; then
    wait $PID
    EXIT_CODE=$?
    echo "ERROR: MCP crashed on startup"
    echo "  MCP: $MCP_NAME"
    echo "  Entry: $MCP_ENTRY"
    echo "  Exit code: $EXIT_CODE"
    echo "  Node path: $NODE_DIR/node"
    echo "  PATH: $PATH"
    exit 1
  fi

  kill $PID 2>/dev/null || true
  echo "OK: $MCP_NAME"
done

echo ""
echo "=== All validations passed ==="
```

### Windows Validation Script

`scripts/validate-package.ps1`:

```powershell
param([string]$AppPath)

$ErrorActionPreference = "Stop"

# Strip system Node
$env:PATH = "C:\Windows\System32;C:\Windows"

$NodeDir = "$AppPath\resources\nodejs\x64"
$SkillsDir = "$AppPath\resources\app\skills"

# Check 1: Bundled Node exists
Write-Host "=== Check: Bundled Node exists ==="
if (-not (Test-Path "$NodeDir\node.exe")) {
    Write-Host "ERROR: Bundled Node not found"
    Write-Host "  Expected: $NodeDir\node.exe"
    Write-Host "  Platform: win32-x64"
    Write-Host "  Contents of nodejs dir:"
    Get-ChildItem "$AppPath\resources\nodejs" -EA SilentlyContinue
    exit 1
}
Write-Host "OK: Found $NodeDir\node.exe"

# Check 2: Bundled Node runs
Write-Host "=== Check: Bundled Node runs ==="
$env:PATH = "$NodeDir;$env:PATH"
try {
    $NodeVersion = & "$NodeDir\node.exe" --version 2>&1
    Write-Host "OK: Node $NodeVersion"
} catch {
    Write-Host "ERROR: Bundled Node failed to run"
    Write-Host "  Path: $NodeDir\node.exe"
    Write-Host "  Error: $_"
    exit 1
}

# Check 3: Node path structure correct
Write-Host "=== Check: Node path structure ==="
foreach ($bin in @("node.exe", "npm.cmd", "npx.cmd")) {
    if (-not (Test-Path "$NodeDir\$bin")) {
        Write-Host "ERROR: Expected binary missing: $bin"
        Write-Host "  Contents of $NodeDir:"
        Get-ChildItem $NodeDir
        exit 1
    }
}
Write-Host "OK: All expected binaries present"

# Check 4: MCP servers can spawn
Write-Host "=== Check: MCP servers spawn ==="
Get-ChildItem $SkillsDir -Directory | ForEach-Object {
    $McpName = $_.Name
    $McpEntry = "$($_.FullName)\dist\index.mjs"

    if (-not (Test-Path $McpEntry)) {
        Write-Host "ERROR: MCP entry point missing"
        Write-Host "  MCP: $McpName"
        Write-Host "  Expected: $McpEntry"
        Get-ChildItem $_.FullName -EA SilentlyContinue
        exit 1
    }

    Write-Host "Spawning $McpName..."
    $process = Start-Process -FilePath "$NodeDir\node.exe" -ArgumentList $McpEntry -PassThru -NoNewWindow
    Start-Sleep -Seconds 2

    if ($process.HasExited) {
        Write-Host "ERROR: MCP crashed on startup"
        Write-Host "  MCP: $McpName"
        Write-Host "  Entry: $McpEntry"
        Write-Host "  Exit code: $($process.ExitCode)"
        Write-Host "  Node path: $NodeDir\node.exe"
        Write-Host "  PATH: $env:PATH"
        exit 1
    }

    Stop-Process -Id $process.Id -Force -EA SilentlyContinue
    Write-Host "OK: $McpName"
}

Write-Host ""
Write-Host "=== All validations passed ==="
```

---

## 5. Node Path Injection Tests

### Single Source of Truth

All Node path logic through `bundled-node.ts`:

```typescript
export function getBundledNodePaths(): BundledNodePaths | null
export function getNodePath(): string
export function getNpmPath(): string
export function getNpxPath(): string
export function buildNodeEnv(baseEnv?: NodeJS.ProcessEnv): NodeJS.ProcessEnv
```

### Injection Points (must all use bundled-node.ts)

- `opencode/adapter.ts` - spawns OpenCode CLI
- `opencode/config-generator.ts` - generates MCP server configs
- `mcp/spawner.ts` - spawns MCP servers directly

### Unit Tests

```typescript
describe('bundled-node paths', () => {
  it('returns correct structure for darwin-arm64', () => {
    const paths = getBundledNodePaths('darwin', 'arm64', '/fake/resources');
    expect(paths).toEqual({
      binDir: '/fake/resources/nodejs/arm64/bin',
      node: '/fake/resources/nodejs/arm64/bin/node',
      npm: '/fake/resources/nodejs/arm64/bin/npm',
      npx: '/fake/resources/nodejs/arm64/bin/npx',
    });
  });

  it('returns correct structure for win32-x64', () => {
    const paths = getBundledNodePaths('win32', 'x64', '/fake/resources');
    expect(paths).toEqual({
      binDir: '/fake/resources/nodejs/x64',
      node: '/fake/resources/nodejs/x64/node.exe',
      npm: '/fake/resources/nodejs/x64/npm.cmd',
      npx: '/fake/resources/nodejs/x64/npx.cmd',
    });
  });

  it('prepends bundled bin dir to PATH', () => {
    const env = buildNodeEnv({ PATH: '/usr/bin' }, '/fake/nodejs/arm64/bin');
    expect(env.PATH).toBe('/fake/nodejs/arm64/bin:/usr/bin');
  });

  it('uses correct delimiter on Windows', () => {
    const env = buildNodeEnv({ PATH: 'C:\\Windows' }, 'C:\\nodejs\\x64', 'win32');
    expect(env.PATH).toBe('C:\\nodejs\\x64;C:\\Windows');
  });
});
```

---

## 6. Chrome Detection

### Remove Playwright Fallback

In `packages/browser-manager/src/launcher.ts`:

```typescript
export async function launchBrowser(): Promise<BrowserContext> {
  const detection = await detectChrome();

  if (!detection.found) {
    throw new ChromeNotFoundError(detection.error);
  }

  return await chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    executablePath: detection.path,
  });
}
```

### Chrome Detection Utility

`apps/desktop/src/main/utils/chrome-detector.ts`:

```typescript
export async function detectChrome(): Promise<ChromeDetectionResult> {
  const searchPaths = getChromePaths(process.platform);

  for (const chromePath of searchPaths) {
    if (await fileExists(chromePath)) {
      try {
        await execFile(chromePath, ['--version'], { timeout: 5000 });
        return { found: true, path: chromePath, error: null };
      } catch (e) {
        // Found but can't execute - continue searching
      }
    }
  }

  return {
    found: false,
    path: null,
    error: {
      code: 'CHROME_NOT_FOUND',
      component: 'chrome',
      message: 'Chrome browser not found',
      guidance: 'Install Google Chrome from https://google.com/chrome and restart the app.',
      debugInfo: {
        platform: `${process.platform}-${process.arch}`,
        searchedPaths: searchPaths,
        foundPath: null,
        env: { PATH: process.env.PATH || '' },
        stderr: '',
        exitCode: null,
      },
    },
  };
}

function getChromePaths(platform: string): string[] {
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
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
      ];
    default:
      return [];
  }
}
```

---

## Summary

| Layer | What | Validates |
|-------|------|-----------|
| **Build-time CI** | `validate-package.sh/.ps1` | Bundled Node exists, runs, MCP servers spawn, path structure correct |
| **Unit tests** | `bundled-node.test.ts`, `chrome-detector.test.ts` | Path logic, detection logic, error formatting |
| **Runtime: AppInitManager** | Background checks on launch | Node, MCPs, Chrome all functional |
| **Runtime: Status bar** | UI feedback | User sees issues + guidance + debug info |
| **Runtime: Auto-retry** | On window focus | Re-check failed components |

**Error visibility everywhere:**
- CI: Verbose console output with paths, exit codes, directory listings
- Runtime: Structured `InitError` with `debugInfo`
- UI: Human guidance + expandable technical details + copy to clipboard
