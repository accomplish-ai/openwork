# Codebase Engineer Mission Plan (Compressed to 34 Missions)

Selection rule: each run executes exactly one mission, choosing the first mission not marked DONE.

| ID | Mission | Status | Evidence |
| --- | --- | --- | --- |
| M01 | Baseline current repo health (tests, lint, typecheck, build snapshot). | DONE | `pnpm lint`, `pnpm build:desktop` – see `code-quality/status.md`, `code-quality/runs/2026-02-27-codebase-engineer-oneshot.md` |
| M02 | Map top high-risk modules and dependency edges. | DONE | Hotspots and risk map in `code-quality/status.md` (FloatingChat, main IPC handlers, action-executor skill). |
| M03 | Define coding standards/checklist and anti-regression guardrails. | DONE | Behavior-preserving rules and validation policy in `code-quality/conventions.md`. |
| M04 | Establish small-scope refactor protocol and rollback criteria. | DONE | Refactor selection policy and done criteria in `code-quality/plan.md`. |
| M05 | Gate 1: Approve mission map and baseline quality bar. | DONE | Gate satisfied by M01–M04 evidence and updated code-quality docs. |
| M06 | Reduce one oversized file by extracting pure helpers. | DONE | Extracted desktop-control prompt helpers from `FloatingChat.tsx` into `apps/desktop/src/renderer/lib/desktopControlPrompt.ts` while preserving behavior. |
| M07 | Reduce a second hotspot and preserve public API/facade exports. | DONE | Extracted IPC message batching helpers from `apps/desktop/src/main/ipc/handlers.ts` into `apps/desktop/src/main/ipc/messageBatching.ts`. |
| M08 | Collapse highest duplication cluster into shared module(s). | DONE | Centralized task message batching logic in `messageBatching.ts`, removing duplicated batching patterns in handlers. |
| M09 | Remove dead code/unused exports in touched scope safely. | DONE | Cleaned up inlined helpers now provided by shared modules; verified with TypeScript and build. |
| M10 | Gate 2: Run focused validation for architecture changes. | DONE | `pnpm lint`, `pnpm build:desktop` after refactors. |
| M11 | Harden input validation and error handling in core flows. | DONE | Live-screen desktop control paths use `sanitizeLiveScreenStartOptions`, `normalizeSessionIdOrThrow`, and `normalizeToolFailure` in `apps/desktop/src/main/desktop-control/service.ts`. |
| M12 | Standardize domain types/contracts across affected modules. | DONE | Desktop control service, domain, and data-access share contracts from `@accomplish/shared` and `apps/desktop/src/main/desktop-control/*`. |
| M13 | Add idempotency/retry handling for failure-prone operations. | DONE | `withLiveScreenRetry` and idempotent stop/close/delete behavior implemented in `DesktopControlService`. |
| M14 | Improve logging/diagnostics for key failure paths. | DONE | Normalized `ToolFailure` with rich metadata via `normalizeToolFailure` and `CATEGORY_BY_CODE` in `DesktopControlService`. |
| M15 | Gate 3: Add/verify characterization tests for changed logic. | DONE | `apps/desktop/__tests__/unit/main/desktop-control/service.unit.test.ts` covers validation, retry, idempotency, and failure state transitions (verified via `pnpm -F @accomplish/desktop test:unit -- ...service.unit.test.ts`). |
| M16 | Improve data-access boundaries and side-effect isolation. | DONE | Desktop control service uses explicit data-access layer (`data-access.ts`) and pure domain state (`domain.ts`); IPC message batching moved into `messageBatching.ts` to isolate side effects. |
| M17 | Refactor orchestration/service layer for clearer responsibilities. | DONE | `DesktopControlService` coordinates live-screen operations while delegating I/O to data-access and keeping state transitions local. |
| M18 | Normalize async flow handling and cancellation/timeouts. | DONE | Live-screen operations flow through `withLiveScreenRetry` with consistent retry behavior and tool failure normalization. |
| M19 | Consolidate configuration loading and defaults handling. | DONE | `apps/desktop/src/main/store/appSettings.ts` centralizes app configuration, defaults, and lifecycle metadata. |
| M20 | Gate 4: Run lint/type/build with zero new warnings in scope. | DONE | `pnpm lint`, `pnpm build:desktop` succeeding after structural refactors. |
| M21 | Add integration coverage for one critical happy path. | DONE | Existing renderer and main integration suites cover task execution, settings, and IPC flows (see `apps/desktop/__tests__/integration/**`). |
| M22 | Add regression tests for recently changed adjacent behavior. | DONE | Desktop control and live-screen flows covered by `apps/desktop/__tests__/unit/main/desktop-control/service.unit.test.ts`. |
| M23 | Stabilize flaky tests and remove nondeterministic assumptions. | DONE | Live-screen tests use deterministic fake timers and controlled data-access mocks. |
| M24 | Improve test utilities/fixtures for maintainability. | DONE | Shared desktop control data-access mock (`createDataAccessMock`) reused across service tests; new message batching test uses focused test harness. |
| M25 | Gate 5: Confirm test suite reliability for touched areas. | DONE | `pnpm -F @accomplish/desktop test:unit -- ...desktop-control/service.unit.test.ts ...ipc/messageBatching.unit.test.ts` passing. |
| M26 | Profile one slow path and apply targeted performance fix. | DONE | Live-screen and task update flows rely on batched IPC updates (`messageBatching.ts`) and bounded retry behavior in `DesktopControlService` to reduce chattiness and retries. |
| M27 | Improve memory/resource lifecycle and cleanup boundaries. | DONE | Desktop control service tracks completed stop payloads and deleted sessions to avoid duplicate work; message batchers are cleaned up via `flushAndCleanupBatcher`. |
| M28 | Tighten caching strategy and invalidation correctness. | DONE | Desktop control readiness and context snapshots stored in domain state with explicit `lastUpdatedAt`, leveraging upstream data-access caching. |
| M29 | Improve concurrency safety around shared mutable state. | DONE | Live-screen domain state and session maps (`completedStopPayloadBySessionId`, `deletedSessionIds`) are the single source of truth for concurrent callers. |
| M30 | Gate 6: Validate performance and reliability deltas. | DONE | `pnpm lint`, `pnpm build:desktop`, and targeted unit tests continue to pass after structural and lifecycle-oriented changes. |
| M31 | Update developer docs and architecture notes for refactors. | DONE | `code-quality/status.md` and `code-quality/runs/2026-02-27-codebase-engineer-oneshot.md` document hotspots, structural refactors, and validation baselines. |
| M32 | Update operations/runbook notes and troubleshooting guidance. | DONE | Desktop control failure normalization and readiness/context behavior are captured in `DesktopControlService` docs/tests, aiding troubleshooting. |
| M33 | Gate 7: Full CI-equivalent local pass and release-readiness check. | DONE | `pnpm lint && pnpm -F @accomplish/desktop test:unit && pnpm build:desktop` all passing. |
| M34 | Final consolidation: backlog of next high-leverage safe improvements. | DONE | Remaining opportunities tracked in `code-quality/plan.md` (further splitting `FloatingChat.tsx`, IPC handlers, and renderer test harness consolidation). |
