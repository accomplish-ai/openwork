# Daemon Architecture

## Overview

The Accomplish app is split into two processes:

1. **Daemon** — An always-on background process that handles task execution, storage, and API management
2. **UI** — The Electron app that provides the user interface and dispatches work to the daemon

This separation enables:
- **Headless task execution** when the UI is closed
- **Scheduled tasks** via system services (launchd on macOS, Windows Task Scheduler)
- **Multiple clients** — the UI, CLI tools, or other integrations can all talk to the same daemon
- **Resilience** — the daemon persists across UI restarts

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    RENDERER PROCESS                      │
│  React + Zustand + Tailwind                             │
│  (unchanged — same preload API)                         │
├─────────────────────────┬───────────────────────────────┤
│                 PRELOAD (CJS)                            │
│          ipcRenderer.invoke / .on / .send               │
├─────────────────────────┼───────────────────────────────┤
│              ELECTRON MAIN PROCESS (thin)               │
│                         │                                │
│  ┌──────────────────────┴──────────────────────────┐    │
│  │ Daemon Bridge (bridge.ts)                        │    │
│  │  - registerDaemonBridgeHandlers()               │    │
│  │    ipcMain.handle() → DaemonClient.rpc()        │    │
│  │  - bridgeDaemonEventsToRenderer()               │    │
│  │    daemon events → sender.send()                │    │
│  └──────────────────────┬──────────────────────────┘    │
│                         │                                │
│  ┌──────────────────────┴──────────────────────────┐    │
│  │ DaemonManager (lifecycle.ts)                     │    │
│  │  - Spawns daemon if not running                 │    │
│  │  - Health monitoring (ping)                     │    │
│  │  - Auto-restart on crash                        │    │
│  │  - launchd install/uninstall                    │    │
│  └──────────────────────┬──────────────────────────┘    │
│                         │ Unix domain socket             │
├─────────────────────────┼───────────────────────────────┤
│                         │                                │
│  ┌──────────────────────▼──────────────────────────┐    │
│  │            DAEMON PROCESS (always-on)            │    │
│  │                                                  │    │
│  │  ┌────────────┐  ┌───────────┐  ┌────────────┐  │    │
│  │  │  Storage   │  │   Task    │  │  HTTP APIs  │  │    │
│  │  │ (SQLite +  │  │  Manager  │  │ (thought    │  │    │
│  │  │  Secure)   │  │ (agent-   │  │  stream,    │  │    │
│  │  │            │  │  core)    │  │  permission)│  │    │
│  │  └────────────┘  └─────┬─────┘  └────────────┘  │    │
│  │                        │                         │    │
│  │               ┌────────▼────────┐                │    │
│  │               │ OpenCode CLI    │                │    │
│  │               │ (node-pty)      │                │    │
│  │               └─────────────────┘                │    │
│  │                                                  │    │
│  │  Skills │ Providers │ Connectors │ Logging       │    │
│  └──────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

## File Structure

```
src/daemon/
├── protocol.ts      # JSON-RPC 2.0 message types, method names, event names
├── transport.ts     # ndjson-over-Unix-socket transport (server + client)
├── server.ts        # DaemonServer: RPC handler registry + event broadcasting
├── client.ts        # DaemonClient: typed high-level client for UI
├── lifecycle.ts     # DaemonManager: spawn, health check, restart, launchd
├── bridge.ts        # Electron IPC ↔ Daemon bridge (zero renderer changes)
├── index.ts         # Daemon process entry point (standalone)
└── exports.ts       # Public API barrel export
```

## Communication Protocol

### Transport
- **macOS/Linux**: Unix domain socket at `~/Library/Application Support/Accomplish/daemon.sock`
- **Windows**: Named pipe at `\\.\pipe\accomplish-daemon`
- **Wire format**: Newline-delimited JSON (ndjson) — each message is one JSON line

### Message Format (JSON-RPC 2.0)

**Request** (UI → Daemon):
```json
{"jsonrpc": "2.0", "id": 1, "method": "task.start", "params": {"prompt": "Fix the bug"}}
```

**Response** (Daemon → UI):
```json
{"jsonrpc": "2.0", "id": 1, "result": {"id": "task_123", "status": "running"}}
```

**Push Notification** (Daemon → UI, no `id`):
```json
{"jsonrpc": "2.0", "method": "event.task.updateBatch", "params": {"taskId": "task_123", "messages": [...]}}
```

### Method Categories

| Category | Methods |
|----------|---------|
| Lifecycle | `ping`, `shutdown`, `status.get` |
| Tasks | `task.start`, `task.cancel`, `task.interrupt`, `task.get`, `task.list`, `task.delete` |
| Sessions | `session.resume` |
| Permissions | `permission.respond` |
| Settings | `settings.*` — theme, debug mode, API keys |
| Models | `model.get`, `model.set`, `models.fetch` |
| Providers | `providerSettings.*`, `ollama.*`, `azureFoundry.*`, `litellm.*`, `lmstudio.*`, `bedrock.*` |
| Skills | `skills.list`, `skills.add`, `skills.update`, `skills.delete`, `skills.toggle` |
| Connectors | `connectors.list`, `connectors.add`, `connectors.update`, `connectors.delete` |

### Push Events (Daemon → UI)

| Event | Electron IPC Channel | Purpose |
|-------|---------------------|---------|
| `event.task.update` | `task:update` | Task completion/error |
| `event.task.updateBatch` | `task:update:batch` | Batched message updates |
| `event.task.progress` | `task:progress` | Setup stage updates |
| `event.task.statusChange` | `task:status-change` | Status transitions |
| `event.task.summary` | `task:summary` | AI-generated summary |
| `event.permission.request` | `permission:request` | File/question prompts |
| `event.todo.update` | `todo:update` | Todo list updates |
| `event.debug.log` | `debug:log` | Debug logs |
| `event.auth.error` | `auth:error` | Auth failures |
| `event.settings.themeChanged` | `settings:theme-changed` | Theme updates |

## Migration Strategy

The architecture is designed for **zero changes to the renderer/preload layer**:

1. **Phase 1 (Current)**: The daemon bridge (`bridge.ts`) registers the exact same `ipcMain.handle()` channels that currently exist, but delegates to `DaemonClient` instead of calling agent-core directly
2. **Phase 2**: The Electron main process becomes thin — only window management, native theme, and protocol handlers remain
3. **Phase 3**: Alternative clients (CLI, scheduled tasks) can connect directly to the daemon socket

### How to Enable the Daemon

In the Electron main process (`src/main/index.ts`), replace direct handler registration with the daemon bridge:

```typescript
// Before (direct):
import { registerIPCHandlers } from './ipc/handlers';
registerIPCHandlers();

// After (daemon bridge):
import { DaemonManager } from '../daemon/lifecycle';
import { registerDaemonBridgeHandlers, bridgeDaemonEventsToRenderer } from '../daemon/bridge';

const daemonManager = new DaemonManager({
  daemonScript: path.join(__dirname, '../daemon/index.js'),
  nodePath: getNodePath(), // bundled Node.js
});

const client = await daemonManager.ensureRunning();
registerDaemonBridgeHandlers(() => client);
bridgeDaemonEventsToRenderer(client, () => mainWindow);
```

### `getNodePath()`

The `nodePath` option passed to `DaemonManager` must point to a Node.js binary that can execute the daemon script outside of Electron. This matters because Electron's own binary is not a general-purpose Node runtime.

| Context | Path |
|---------|------|
| Development | `process.execPath` (the locally-installed Node) |
| Production (macOS) | `Contents/Resources/app.asar.unpacked/node_modules/.package/node` (bundled by `download-nodejs.cjs`) |
| Production (Windows) | `resources\app.asar.unpacked\node_modules\.package\node.exe` |
| Production (Linux) | `resources/app.asar.unpacked/node_modules/.package/node` |

You can override this at runtime by passing a custom path:

```typescript
const daemonManager = new DaemonManager({
  daemonScript: path.join(__dirname, '../daemon/index.js'),
  nodePath: process.env.ACCOMPLISH_NODE_PATH ?? getNodePath(),
});
```

## Running the Daemon Standalone

```bash
# Development
node dist-electron/daemon/index.js

# With custom data directory
ACCOMPLISH_DATA_DIR=~/my-data node dist-electron/daemon/index.js
```

### `ACCOMPLISH_DATA_DIR`

The daemon stores all persistent state inside a single data directory. The default location is platform-specific:

| Platform | Default Path |
|----------|-------------|
| macOS | `~/Library/Application Support/Accomplish` |
| Windows | `%APPDATA%\Accomplish` |
| Linux | `~/.local/share/Accomplish` |

**What's stored there:**

| File / Directory | Purpose |
|------------------|---------|
| `accomplish.db` | SQLite database (tasks, sessions, settings) |
| `daemon.sock` | Unix domain socket (runtime only, not persisted) |
| `daemon.pid` | PID file for single-instance enforcement |
| `daemon.log` | Daemon stdout/stderr log |

Set the `ACCOMPLISH_DATA_DIR` environment variable to override the default:

```bash
export ACCOMPLISH_DATA_DIR="$HOME/.accomplish"
node dist-electron/daemon/index.js
```

Both the daemon (`index.ts → getDataDir()`) and the Electron main process (`protocol.ts → getAppDataDir()`) respect this variable, ensuring the socket path, PID file, and database all point to the same directory.

## macOS Always-On (LaunchAgent)

```typescript
import { DaemonManager } from '../daemon/lifecycle';

// Install — daemon starts at login
DaemonManager.installLaunchAgent({
  nodePath: '/path/to/node',
  daemonScript: '/path/to/daemon/index.js',
  appVersion: '0.3.8',
});

// Manage
// launchctl load ~/Library/LaunchAgents/ai.accomplish.daemon.plist
// launchctl unload ~/Library/LaunchAgents/ai.accomplish.daemon.plist

// Uninstall
DaemonManager.uninstallLaunchAgent();
```

## Security

- Unix socket has `0600` permissions (owner-only read/write)
- PID file prevents duplicate daemon instances
- Daemon validates all incoming requests via the same validation schemas used by the current IPC handlers
- No network ports exposed — communication is local-only via Unix socket / named pipe
