# Code Quality Plan

Last updated: 2026-02-25
Planning horizon: next 5 safe initiatives

## Selection Policy
- If any file >1200 LOC OR >=3 files >800 LOC: pick one oversized file and split by concern with facade re-exports.
- Otherwise pick highest-leverage safe refactor (duplication collapse, extraction, dead-code removal).
- Execute exactly one coherent initiative per run.

## Next Steps (ordered)
1. Split apps/desktop/src/renderer/components/FloatingChat.tsx into subcomponents + helpers; keep facade export and reduce below 800 LOC.
2. Split apps/desktop/src/main/ipc/handlers.ts by concern (api key, window mgmt, settings) with a stable facade.
3. Consolidate repeated renderer integration test harness setup into shared test utilities.
4. Extract shared API key validation helper used in handlers.ts and api-key-handlers.ts.
5. Assess apps/desktop/skills/action-executor/src/index.ts for modularization if it remains >800 LOC.

## Done Criteria Per Run
- One initiative completed safely.
- Validation passes including `pnpm run cq:check`.
- `status.md`, `plan.md`, and run log updated.
