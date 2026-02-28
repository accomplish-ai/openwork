Task:
Complete exactly one unattended-safe task from `/Users/hareli/Projects/openwork/ops/agent-manager/queue.json`.

Context:
- Repository: `/Users/hareli/Projects/openwork`
- Task source of truth: `/Users/hareli/Projects/openwork/ops/agent-manager/queue.json`
- Policy: `/Users/hareli/Projects/openwork/ops/agent-manager/autonomy-policy.md`
- Prompt template: `/Users/hareli/Projects/openwork/ops/agent-manager/codex-execution-prompt.md`
- Run report template: `/Users/hareli/Projects/openwork/ops/agent-manager/run-report-template.md`

Constraints:
- Choose the first task where `status = "todo"` and `canRunUnattended = true`.
- Complete exactly one task per run.
- Do not continue if no unattended-safe task exists.
- Do not revert unrelated local changes.
- Prefer local tool execution over desktop UI control.
- Use desktop control only when the selected task explicitly requires it.
- Stop on any blocker listed in the autonomy policy.

Definition of done:
- One task is advanced to `done`, `blocked`, or `review`.
- Required validation is run and summarized.
- A run report is produced in the requested output format.

Output format:
Outcome:
Changes made:
Validation run:
Open issues:
Next options:

Validation:
- Execute the validation commands listed on the selected task.
- If no unattended-safe task exists, report that state without changing code.
