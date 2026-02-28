# Autonomy Policy

Purpose: define what the agent may do alone and when it must stop.

## Allowed Without User Presence

- Read files in the repo and nearby docs.
- Edit files needed for one queued task.
- Run local validation commands.
- Ask another coding agent for implementation help using a bounded prompt.
- Update task status and write a run report.

## Must Stop And Report

- Login, 2FA, CAPTCHA, billing, or consent prompts.
- Ambiguous destructive actions.
- Tasks that require touching unrelated files outside the declared scope.
- Validation failures with no clear local fix in the same run.
- Desktop-control send verification failure.
- Target thread, app, or repository mismatch.

## Guardrails

- One task per run.
- One repository per run.
- Keep the original task goal anchored in every outbound AI message.
- Require explicit validation evidence before marking a task `done`.
- Never claim a chat message was sent unless it was visibly verified.
- Never promote a task from `blocked` to `done` in the same run without fresh validation.

## Recommended Task Flags

- `canRunUnattended = true` only for bounded tasks with exact paths and validation.
- `requiresDesktopControl = true` only when shell or file edits are insufficient.
- `allowCommit = true` only for tasks with reviewable changes and clean validation.
- `allowPush = true` only when the user explicitly wants unattended push behavior.
