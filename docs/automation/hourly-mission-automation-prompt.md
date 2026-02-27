Task:
Complete exactly one mission from `/Users/hareli/Projects/openwork/docs/automation/56-hour-big-feature-plan.md` during this run.

Context:
- Repository: `/Users/hareli/Projects/openwork`
- Mission source of truth: `/Users/hareli/Projects/openwork/docs/automation/56-hour-big-feature-plan.md`
- Choose the first mission marked `[ ]`.
- If all missions are `[x]`, do not change code; output completion status only.

Constraints:
- Complete exactly one mission per run.
- Do not skip quality gates (`M07`, `M14`, `M21`, `M28`, `M35`, `M42`, `M49`, `M56`).
- Keep edits minimal and scoped to the selected mission.
- Do not revert unrelated local changes.
- If mission is blocked, mark it `[b]`, log blocker, and complete one unblock mission in the same run.
- Keep all status updates and run logs in the mission file.

Definition of done:
- Exactly one mission is advanced to a completed state in the tracker.
- A run log entry is appended in the `Hourly Run Log` section.
- Relevant validation is run:
  - Regular mission: targeted validation for changed area.
  - Gate mission: run `pnpm lint && pnpm typecheck && pnpm build`.

Output format:
Outcome:
Changes made:
Validation run:
Open issues:
Next options:

Validation:
- Execute required commands and report pass/fail with short output summary.
- If command fails, include the first actionable error and proposed fix path.
