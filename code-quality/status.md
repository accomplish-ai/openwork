# Code Quality Status

Last updated: 2026-02-25
Owner: automated refactor agent

## Current State
- Baseline inventory captured and refreshed after first refactor run.
- Screen-capture MCP server split into focused modules; entrypoint remains stable.
- Validation: `pnpm -C apps/desktop typecheck` ok; `pnpm run cq:check` missing script.

## Pre-flight Inventory (2026-02-25)
### Top 15 Largest Source Files (non-generated)
1. apps/desktop/__tests__/unit/main/ipc/handlers.unit.test.ts (1905) - large IPC behavior matrix for main handlers.
2. apps/desktop/src/renderer/components/FloatingChat.tsx (1633) - dense UI state machine + messaging logic.
3. apps/desktop/__tests__/integration/renderer/pages/Execution.integration.test.tsx (1354) - end-to-end renderer flow coverage.
4. apps/desktop/src/main/ipc/handlers.ts (1332) - main IPC routing + side-effectful handlers.
5. apps/desktop/__tests__/integration/renderer/components/TaskLauncher.integration.test.tsx (1083) - heavy integration coverage for task launcher.
6. apps/desktop/__tests__/unit/main/opencode/adapter.unit.test.ts (1010) - adapter behavior and edge cases.
7. apps/desktop/__tests__/integration/renderer/components/SettingsDialog.integration.test.tsx (988) - settings integration tests with extensive setup.
8. apps/desktop/src/renderer/pages/Execution.tsx (966) - large page composition + state handling.
9. apps/desktop/src/renderer/components/layout/SettingsDialog.tsx (962) - complex layout + configuration UI.
10. apps/desktop/skills/action-executor/src/index.ts (945) - skill entrypoint with orchestration logic.
11. apps/desktop/src/main/opencode/task-manager.ts (885) - task orchestration + process handling.
12. apps/desktop/__tests__/integration/renderer/taskStore.integration.test.ts (846) - store integration coverage.
13. apps/desktop/__tests__/integration/renderer/components/TaskHistory.integration.test.tsx (791) - history panel behavior suite.
14. apps/desktop/__tests__/main/ipc/handlers-utils.unit.test.ts (784) - shared IPC utility coverage.
15. apps/desktop/__tests__/unit/main/opencode/task-manager.unit.test.ts (765) - task-manager unit tests.

### Duplication Hotspots (top 5)
1. apps/desktop/src/renderer/components/ui/*.tsx (card/avatar/etc): repeated forwardRef + cn className wrappers.
2. apps/desktop/__tests__/integration/renderer/*: repeated renderer harness setup across Sidebar/TaskInputBar/TaskLauncher/SettingsDialog/taskStore.
3. apps/desktop/__tests__/integration/main/utils/bundled-node.integration.test.ts and apps/desktop/__tests__/integration/main/opencode/cli-path.integration.test.ts: repeated CLI path validation blocks.
4. apps/desktop/src/main/ipc/handlers.ts and apps/desktop/src/main/ipc/api-key-handlers.ts: repeated API key validation request/response handling patterns.
5. apps/desktop/__tests__/integration/renderer/components/* + pages/*: repeated snapshot/fixture assertions in TaskHistory/Execution/Home/Sidebar/TaskLauncher suites.

### Risk Map (selected refactor: screen-capture skill entrypoint)
- Side effects: spawns helper process, schedules background sampling timer, reads/writes temp files.
- External I/O: osascript calls, screencapture, sips, filesystem reads/writes, JSON over stdin/stdout.
- State: background snapshot cache, helper pending request map, in-memory selection ranking.
- Concurrency: parallel window capture promises, interval refresh, helper process lifecycle events.
- Invariants/contracts: MCP tool names and response shapes, error code formatting, capture limits + retry semantics.

## Active Hotspots
- apps/desktop/src/renderer/components/FloatingChat.tsx (UI + state machine)
- apps/desktop/src/main/ipc/handlers.ts (central IPC routing)
- apps/desktop/skills/action-executor/src/index.ts (skill orchestration)

## Risks / Constraints
- Preserve behavior exactly.
- Keep public contracts/import paths stable.
- Prefer facade re-exports when splitting files.

## Validation Baseline
- `pnpm -C apps/desktop typecheck`: pass (2026-02-25)
- `pnpm run cq:check`: missing script in root package.json (2026-02-25)
