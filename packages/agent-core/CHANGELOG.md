# @accomplish_ai/agent-core

## 0.4.0

### Minor Changes

- f954f59: Add `needs_planning` classification to `start_task` tool. The agent still calls `start_task` for every message (preserving discipline), but now sets `needs_planning: false` for simple messages like greetings and knowledge questions. When false, the adapter skips plan card emission and todo creation, and the completion enforcer treats it as a conversational turn — no continuation prompts needed.

### Patch Changes

- 68094c9: refactor(agent-core): remove stale duplicate files from opencode/ directory

  Deleted 6 dead files left behind after the encapsulation refactor: opencode/task-manager.ts,
  opencode/adapter.ts, opencode/stream-parser.ts, opencode/log-watcher.ts, opencode/index.ts
  (barrel), and internal/classes/CompletionEnforcer.ts. The canonical implementations live in
  internal/classes/ and are used via the factory pattern. Re-pointed test imports to the active
  internal/classes/ sources. No behavior changes; public API unchanged.

- 0c555bf: fix(agent-core): serialize non-string error values in TaskResult to prevent downstream TypeError

  The stream parser casts JSON.parse output to OpenCodeMessage without runtime validation. When the
  OpenCode CLI emits an error message with a non-string error field (e.g. an object like
  `{name: "APIError", data: {...}}`), the raw object was passed through to TaskResult.error which is
  typed as `string | undefined`. Downstream consumers calling `.toLowerCase()` on this value would
  crash with `TypeError: errorName.toLowerCase is not a function`.

  Added defensive coercion in the adapter's error handling path: string values pass through unchanged,
  non-string values are serialized via JSON.stringify to preserve error details.

## 0.3.3

### Patch Changes

- 934b96a: fix(agent-core): prevent infinite completion loop on incomplete todos

  Integrate incomplete-todos feedback into getPartialContinuationPrompt so the
  agent knows exactly which items are unresolved and to call todowrite. Reduce
  default maxContinuationAttempts from 50 to 10 as a safety net. Add
  continuationPrompt to debug logging for observability.

## 0.3.2

### Patch Changes

- 3ae6718: feat(dev-browser-mcp): improve browser interaction reliability with coordinate fallbacks

  - Add canvas app detection (Google Docs, Figma, etc.) with automatic coordinate-based interactions
  - Add coordinate fallback for click, type, and hover when DOM interactions fail
  - Add ARIA tree pruning to remove useless wrapper nodes and reduce snapshot noise
  - Add configurable bounding box annotations in snapshot output (includeBoundingBoxes option)
  - Fix Playwright silently hijacking downloads by resetting Browser.setDownloadBehavior
  - Fix 0x0 viewport detection with window.innerWidth/innerHeight fallback
  - Set default 1280x720 viewport for new pages

## 0.3.1

### Patch Changes

- 7ab95c7: Auto-detect MCP entry point by checking if source files exist on disk instead of relying on ACCOMPLISH_BUNDLED_MCP env var

## 0.3.0

### Minor Changes

- ed82a03: Add `BrowserConfig` option to config-generator with three modes: `builtin` (default, existing behavior), `remote` (connect to any CDP endpoint), and `none` (disable browser tools). Extract connection logic from dev-browser-mcp into a dedicated module with switchable strategies.

## 0.2.2

### Patch Changes

- 0287432: Include server.cjs launcher files in published npm package by adding `mcp-tools/*/*.cjs` to the files field

## 0.2.1

### Patch Changes

- 32795a5: Clean up public API surface and improve encapsulation

  - Replace wildcard barrel exports with explicit named exports
  - Internalize message batching and proxy lifecycle into TaskManager
  - Remove raw database repository functions from public API (use createStorage factory)
  - Move better-sqlite3 and node-pty to optional peer dependencies
  - Add StorageAPI and SkillsManagerAPI JSDoc documentation
  - Fix SpeechServiceOptions.storage type from unknown to SecureStorageAPI
  - Remove dead code (unused interfaces, empty functions)
  - Add README.md and npm metadata (homepage, bugs, keywords)
  - Remove raw TypeScript source and build configs from published files

## 0.2.0

### Minor Changes

- 4405211: Enable npm publishing for @accomplish_ai/agent-core package

  - Package now published to npm as @accomplish_ai/agent-core
  - Added changesets for version management
  - Added automated release workflows
