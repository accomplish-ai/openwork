# Bugs and Features

## Bugs

### BUG-001: Permission API server never closed on app quit [HIGH]
**File:** `apps/desktop/src/main/permission-api.ts:64-186`
**Description:** The HTTP server created in `startPermissionApiServer()` is returned but the caller in `handlers.ts:289` discards the return value. On app quit (`before-quit` event in `index.ts:192`), only `disposeTaskManager()` is called — the permission API server is never closed. This prevents clean shutdown (open handles keep the process alive longer than needed) and causes `EADDRINUSE` errors if the app restarts quickly.
**Fix:** Store the server reference and close it during `before-quit`.

### BUG-002: Duplicate IPC event listeners between Sidebar and Execution [MEDIUM]
**File:** `apps/desktop/src/renderer/components/layout/Sidebar.tsx:34` and `apps/desktop/src/renderer/pages/Execution.tsx:112`
**Description:** Both `Sidebar` and `Execution` components subscribe to `accomplish.onTaskUpdate()` and both call `addTaskUpdate(event)`. Since the Sidebar is always mounted while the Execution page is also mounted, every task update event triggers `addTaskUpdate` twice. For `complete`/`error` events this is idempotent (just extra re-renders), but it's wasteful and could cause subtle issues if message deduplication isn't perfect.
**Fix:** Remove the `onTaskUpdate` subscription from the Sidebar — Execution handles it when mounted, and the store's global listener already handles setup progress cleanup.

### BUG-003: Preload `startTask` parameter type mismatch [MEDIUM]
**File:** `apps/desktop/src/preload/index.ts:21`
**Description:** The preload declares `startTask(config: { description: string })` but the actual `TaskConfig` type uses `prompt`, not `description`. This type annotation is wrong and misleading. At runtime it works because JS doesn't enforce types, but it's confusing and any TypeScript tooling relying on the preload types would get the wrong API shape.
**Fix:** Change the type to match the actual `TaskConfig` interface.

### BUG-004: cancelTask sets ptyProcess to null before onExit fires [MEDIUM]
**File:** `apps/desktop/src/main/opencode/adapter.ts:242-248`
**Description:** `cancelTask()` calls `this.ptyProcess.kill()` then immediately sets `this.ptyProcess = null`. The PTY `onData` handler (line 183) could still fire between `kill()` and `null` assignment with buffered data. The `onExit` handler (line 198) will also fire later when the process actually exits, calling `handleProcessExit()` which sets `this.ptyProcess = null` again (harmless but redundant). The real issue is that `handleProcessExit` at line 633 nullifies `currentTaskId`, preventing `getSessionId()` from working for the completion callbacks.
**Fix:** Don't null `ptyProcess` in `cancelTask()` — let `handleProcessExit` handle cleanup consistently.

### BUG-005: Stream parser buffer truncation can corrupt JSON messages [LOW]
**File:** `apps/desktop/src/main/opencode/stream-parser.ts:25-29`
**Description:** When the buffer exceeds 10MB, the code keeps the last 5MB via `this.buffer.slice(-MAX_BUFFER_SIZE / 2)`. This can split a JSON message mid-line, causing the next `parseBuffer()` to attempt parsing a partial JSON object, which fails. The split message is permanently lost.
**Fix:** Instead of slicing at an arbitrary byte offset, find the last newline in the discard region and slice there to preserve message boundaries.

### BUG-006: `accomplish.ts` interface has stale method names [LOW]
**File:** `apps/desktop/src/renderer/lib/accomplish.ts:69-70`
**Description:** The `AccomplishAPI` interface declares `checkClaudeCli()` and `getClaudeVersion()`, but the preload exposes `checkOpenCodeCli` (via `opencode:check`) and `getOpenCodeVersion` (via `opencode:version`). These methods would fail at runtime if ever called through the typed interface.
**Fix:** Rename to `checkOpenCodeCli()` and `getOpenCodeVersion()` to match the preload.

### BUG-007: handleProcessExit clears currentTaskId prematurely [MEDIUM]
**File:** `apps/desktop/src/main/opencode/adapter.ts:633`
**Description:** `handleProcessExit()` sets `this.currentTaskId = null` after emitting `complete` or `error`. However, `TaskManager.getSessionId()` at `task-manager.ts:558` may be called by the `onComplete` callback in `handlers.ts:368` which calls `taskManager.getSessionId(taskId)`. By the time completion callbacks propagate, the adapter's `currentTaskId` is already null. This doesn't directly break `getSessionId()` since it's looked up by `taskId` in the `activeTasks` map, but it makes the adapter inconsistent during the critical completion phase.
**Fix:** Don't clear `currentTaskId` in `handleProcessExit` — let `dispose()` handle it.

### BUG-008: Sidebar `onTaskStatusChange` subscription inconsistency [LOW]
**File:** `apps/desktop/src/renderer/components/layout/Sidebar.tsx:30`
**Description:** Sidebar uses optional chaining `accomplish.onTaskStatusChange?.()` but the Execution page at line 150 also does the same. Both register listeners for the same event, both calling `updateTaskStatus`. This is the same class of duplicate listener issue as BUG-002.
**Fix:** Consolidate event handling — remove from Sidebar since Execution handles it.

### BUG-009: Execution page debounce timer not cleaned up on unmount [LOW]
**File:** `apps/desktop/src/renderer/pages/Execution.tsx:46-52`
**Description:** The `debounce` utility creates a `setTimeout` that is never cleared when the component unmounts. The `useMemo` wrapping it only prevents recreating the debounce function, but the pending timer inside persists past unmount, potentially calling `scrollIntoView` on an unmounted element.
**Fix:** Add cleanup in the useEffect that calls `scrollToBottom`, or convert to a ref-based approach with proper cleanup.
