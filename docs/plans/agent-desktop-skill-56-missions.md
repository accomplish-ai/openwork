# Agent Desktop Skill Sprint Tracker (Compressed to 34 Missions)

| ID | Mission | Status | Notes | Evidence |
| --- | --- | --- | --- | --- |
| M01 | Define feature brief (problem, users, success metrics). | DONE | Migrated from prior tracker. | `docs/plans/big-feature-brief.md` |
| M02 | Map impacted modules/interfaces and finalize acceptance criteria/non-goals. | DONE | Merged old M02+M03. | `docs/plans/big-feature-impacted-modules.md`, `docs/plans/big-feature-acceptance.md` |
| M03 | Define telemetry/KPI events and rollout/kill-switch strategy. | DONE | Merged old M04+M05. | `docs/plans/big-feature-telemetry.md`, `docs/plans/big-feature-rollout.md` |
| M04 | Write technical design with dependency graph and risks. | DONE | Migrated from old M06. | `docs/plans/big-feature-technical-design.md` |
| M05 | Gate 1: Confirm docs consistency and implementation readiness. | DONE | Migrated from old M07. | `docs/plans/big-feature-consistency-review.md` |
| M06 | Add feature flag/config plumbing and shared contracts/types. | DONE | Merged old M08+M09. | `apps/desktop/src/main/ipc/handlers.ts`, `apps/desktop/src/preload/index.ts`, `apps/desktop/src/renderer/lib/accomplish.ts`, `apps/desktop/src/renderer/components/layout/SettingsDialog.tsx` |
| M07 | Create domain/state model and data-access abstraction skeleton. | DONE | Merged old M10+M11. | `apps/desktop/src/main/desktop-control/domain.ts`, `apps/desktop/src/main/desktop-control/state.ts`, `apps/desktop/src/main/desktop-control/data-access.ts` |
| M08 | Create service/orchestration skeleton and error taxonomy. | DONE | Merged old M12+M13. | `apps/desktop/src/main/desktop-control/service.ts` |
| M09 | Gate 2: Run lint/type/build checks. | DONE | Migrated from old M14 gate. | prior run evidence |
| M10 | Implement create/read/query paths. | DONE | Merged old M15+M16. | prior run evidence |
| M11 | Implement update and close/delete/revert paths. | DONE | Completed with explicit live-screen update/close/delete flows and rollback behavior. | `apps/desktop/src/main/desktop-control/service.ts`, `apps/desktop/__tests__/unit/main/desktop-control/service.unit.test.ts`, `docs/automation/56-hour-big-feature-plan.md` |
| M12 | Add input validation/sanitization and retry/idempotency. | DONE | Added service-level input guards, transient retry handling, and idempotent close/delete semantics. | `apps/desktop/src/main/desktop-control/service.ts`, `apps/desktop/__tests__/unit/main/desktop-control/service.unit.test.ts`, `docs/automation/56-hour-big-feature-plan.md` |
| M13 | Gate 3: Add and pass focused core-logic tests. | DONE | Old M21. | `apps/desktop/__tests__/unit/main/desktop-control/service.unit.test.ts`, `pnpm --dir apps/desktop test:unit -- __tests__/unit/main/desktop-control/service.unit.test.ts`, `pnpm --dir apps/desktop lint`, `pnpm --dir apps/desktop typecheck`, `pnpm --dir apps/desktop build` |
| M14 | Implement primary UI shell and loading/empty/error states. | DONE | Merged old M22+M23. | `apps/desktop/src/renderer/components/desktop-control/DesktopControlShell.tsx`, `apps/desktop/src/renderer/components/desktop-control/DesktopControlShell.test.tsx`, `pnpm --dir apps/desktop test:unit -- src/renderer/components/desktop-control/DesktopControlShell.test.tsx` |
| M15 | Wire UI to service with real data flow and async/optimistic handling. | DONE | Merged old M24+M25. | `apps/desktop/src/renderer/components/desktop-control/useDesktopControlStatus.ts`, `apps/desktop/src/renderer/components/desktop-control/useDesktopControlStatus.test.tsx`, `pnpm --dir apps/desktop test:unit -- src/renderer/components/desktop-control/useDesktopControlStatus.test.tsx` |
| M16 | Add accessibility, keyboard support, and user-facing defaults/settings. | DONE | Merged old M26+M27. | `apps/desktop/src/renderer/components/desktop-control/useDesktopControlPreferences.ts`, `apps/desktop/src/renderer/components/desktop-control/useDesktopControlPreferences.test.tsx`, `pnpm --dir apps/desktop test:unit -- src/renderer/components/desktop-control/useDesktopControlPreferences.test.tsx` |
| M17 | Gate 4: Manual UX pass and acceptance criteria verification. | TODO | Old M28. | Requires interactive macOS desktop session to run manual desktop-control UX checklist in the app; automated gate checks verified via `pnpm --dir apps/desktop lint`, `pnpm --dir apps/desktop typecheck`, `pnpm --dir apps/desktop build`. |
| M18 | Implement secondary workflows and power-user/bulk/shortcut actions. | TODO | Merged old M29+M30. |  |
| M19 | Add undo/recovery and status/feedback messaging. | TODO | Merged old M31+M32. |  |
| M20 | Add caching/persistence strategy and migration path. | TODO | Merged old M33+M34. |  |
| M21 | Gate 5: Cross-path manual smoke validation. | TODO | Old M35. |  |
| M22 | Add auth/permission checks and audit/trace logging. | TODO | Merged old M36+M37. |  |
| M23 | Add throttling/rate-limits and privacy/data-retention safeguards. | TODO | Merged old M38+M39. |  |
| M24 | Add crash/exception boundaries, recovery, and observability docs. | TODO | Merged old M40+M41. |  |
| M25 | Gate 6: Reliability/security checklist pass. | TODO | Old M42. |  |
| M26 | Expand unit tests and integration tests for happy path. | TODO | Merged old M43+M44. |  |
| M27 | Add regression coverage and stabilize flaky/non-deterministic flows. | TODO | Merged old M45+M48. |  |
| M28 | Run profiling, apply performance fixes, and verify memory/resource lifecycle. | TODO | Merged old M46+M47. |  |
| M29 | Gate 7: Run full local CI-equivalent checks. | TODO | Old M49. |  |
| M30 | Write user docs/release notes and support/operations runbook. | TODO | Merged old M50+M51. |  |
| M31 | Prepare staged rollout controls/thresholds and run limited beta feedback. | TODO | Merged old M52+M53. |  |
| M32 | Fix beta findings and validate launch checklist/rollback path. | TODO | Merged old M54+M55. |  |
| M33 | Gate 8: Final readiness report and handoff summary. | TODO | Old M56. |  |
| M34 | Post-launch 24h monitoring review and prioritized follow-up backlog. | TODO | New consolidation closeout mission. |  |
