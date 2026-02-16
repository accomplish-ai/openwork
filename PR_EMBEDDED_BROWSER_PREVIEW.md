# PR: Embedded Live Browser Preview in Execution Chat

## Issue
- Related: `#191` / `#414`
- Goal: show a live browser stream inside chat while browser automation is running, without forcing users to switch to a separate browser window.

## What Changed

### Main Process
- Added CDP screencast service:
  - `apps/desktop/src/main/services/browserPreview.ts`
  - Connects to the dev-browser CDP endpoint.
  - Attaches to the active page target (`taskId-pageName`).
  - Starts `Page.startScreencast` with:
    - `format: jpeg`
    - `quality: 50`
    - `everyNthFrame: 3` (roughly ~10 FPS target)
  - Emits IPC events:
    - `browser:frame`
    - `browser:navigate`
    - `browser:status`

- Added IPC handlers:
  - `browser-preview:start`
  - `browser-preview:stop`
  - File: `apps/desktop/src/main/ipc/handlers.ts`

- Added cleanup on task lifecycle and app shutdown:
  - Stop stream on task complete/error/cancel/delete/history-clear.
  - Stop all streams on `before-quit`.
  - Files:
    - `apps/desktop/src/main/ipc/task-callbacks.ts`
    - `apps/desktop/src/main/ipc/handlers.ts`
    - `apps/desktop/src/main/index.ts`

### Preload / Renderer API
- Exposed preview commands/events to renderer:
  - `startBrowserPreview(taskId, pageName?)`
  - `stopBrowserPreview(taskId)`
  - `onBrowserFrame`
  - `onBrowserNavigate`
  - `onBrowserStatus`
- File: `apps/desktop/src/preload/index.ts`

- Added renderer typings:
  - File: `apps/desktop/src/renderer/lib/accomplish.ts`

### Execution UI
- Added inline browser preview component:
  - `apps/desktop/src/renderer/components/execution/BrowserPreview.tsx`
  - Shows URL/status header + live frame image.
  - Supports collapse/expand.
  - Supports pop-out via external browser open.

- Integrated preview in execution page:
  - Auto-detects browser MCP tools (including MCP-prefixed names).
  - Resolves `page_name` from tool input (default `main`).
  - Starts stream when task is running and preview is expanded.
  - Stops stream when collapsed, task stops, or page unmounts.
  - File: `apps/desktop/src/renderer/pages/Execution.tsx`

## Validation Run
- `pnpm --filter @accomplish/desktop typecheck` ✅
- `pnpm --filter @accomplish_ai/agent-core typecheck` ✅
- `pnpm --filter @accomplish/desktop test:unit` ✅

## Notes
- Existing unit tests pass. Some existing tests print warnings to stderr from mocked log watcher paths; they are non-failing and pre-existing.
- This implementation streams directly from CDP in the Electron main process and relays via IPC to renderer.
