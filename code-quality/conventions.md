# Code Quality Conventions

This file defines the behavior-preserving refactor rules for automated runs.

## Primary Goal
Improve evolvability safely: reduce duplication/coupling and improve module boundaries without changing runtime behavior.

## Non-negotiables
- Behavior-preserving only.
- No API/request/response/status/stream/schema contract changes unless explicitly requested.
- Minimal, reversible diffs; avoid formatting-only churn.
- Do not edit generated files.
- Prefer extraction/strangler refactors over rewrites.

## Large-file default approach
1. Identify concerns in oversized file.
2. Extract pure helpers first.
3. Keep side effects at boundaries.
4. Keep original module as a facade via re-exports for compatibility.
5. Add/strengthen characterization tests where feasible.

## Validation minimum
- Run targeted tests/lint/typecheck for touched scope.
- Run `pnpm run cq:check` as the final gate.
- If uncertainty remains about behavior preservation, stop and avoid risky changes.

## Documentation rules
- Keep `/docs/00-index.md` accurate.
- Update docs touched by refactor scope.
- Move contradictory docs to `/docs/archive/` with a short reason note.

## Run-output rules
Each run must:
- Update `/code-quality/status.md`.
- Update `/code-quality/plan.md`.
- Append `/code-quality/runs/YYYY-MM-DD-NONCE.md`.
