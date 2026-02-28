Task:
Complete exactly one task from `/Users/hareli/Projects/openwork/ops/agent-manager/queue.json`.

Context:
- Repository: `/Users/hareli/Projects/openwork`
- Task source of truth: `/Users/hareli/Projects/openwork/ops/agent-manager/queue.json`
- Select the first task where `status = "todo"` and `canRunUnattended = true`.
- If no such task exists, do not edit code; report that no unattended-safe task is available.

Constraints:
- Complete exactly one task per run.
- Do not revert unrelated local changes.
- Keep edits scoped to the selected task's `repoPaths`.
- Prefer local code and shell execution over desktop UI control.
- Use desktop control only if `requiresDesktopControl = true`.
- Stop immediately on auth prompts, permission blockers, irreversible actions, or failed send verification.
- Do not commit or push unless the task explicitly allows it.

Definition of done:
- The selected task is moved to one of: `done`, `blocked`, or `review`.
- Required validation for the task is executed and summarized.
- A run report is produced using `/Users/hareli/Projects/openwork/ops/agent-manager/run-report-template.md`.

Output format:
Outcome:
Changes made:
Validation run:
Open issues:
Next options:

Validation:
- Run the task's listed validation commands when changes are made.
- If a command fails, report the first actionable error and whether the task should be `blocked` or `review`.
