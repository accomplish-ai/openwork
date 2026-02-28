# Agent Manager Scaffold

Purpose: give the agent a bounded, low-risk way to manage project work without changing the current runtime path.

This scaffold does not enable unattended execution by itself. It adds the files and rules needed to run a safe manager loop:

1. pick one queued task
2. gather local context
3. execute through Codex or local tools
4. run validation
5. classify the result as `done`, `blocked`, or `needs_review`
6. write a run report
7. stop

## Files

- `ops/agent-manager/queue.json`: source of truth for tasks the manager may pick
- `ops/agent-manager/codex-execution-prompt.md`: outbound prompt template for implementation runs
- `ops/agent-manager/autonomy-policy.md`: stop rules and safety boundaries
- `ops/agent-manager/run-report-template.md`: result format for each autonomous run

## Operating Rules

- One task per run.
- Prefer local tools and repo edits over UI control.
- Use desktop control only when a task explicitly requires it.
- Do not touch tasks marked `blocked`, `review`, or `done`.
- Do not continue past auth, permission, billing, CAPTCHA, or destructive action prompts.
- Do not commit or push unless the task explicitly requests it.

## Suggested Loop

1. Open `ops/agent-manager/queue.json`.
2. Select the first task with `"status": "todo"` and `"canRunUnattended": true`.
3. Copy the task data into `ops/agent-manager/codex-execution-prompt.md`.
4. Execute the task.
5. Update the task status and append a report using `ops/agent-manager/run-report-template.md`.

## Health Gate

For desktop-control work, do not run until the machine baseline in `docs/plans/2026-02-19-desktop-control-healthy-machine-baseline.md` is satisfied.
