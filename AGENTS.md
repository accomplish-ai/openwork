# Agent Runtime Spec (Low-Token)

Purpose: keep agent behavior consistent for computer/system tasks without adding large instructions to every turn.

## Load Rule

- Keep this file short.
- Load `/Users/hareli/Projects/openwork/docs/agent-computer-mastery-spec.md` only when a task involves:
- macOS/system navigation
- finding files/apps/settings/logs on the computer
- Codex, Cursor, or ChatGPT Atlas workflows
- cross-agent handoff or message formatting
- For Codex UI execution tasks, prioritize section `12` (Codex Desktop Operation Playbook) and section `5`.
- For Codex UI tasks, enforce section `12.9` (self-UI filtering) and section `12.10` (conversation continuity).
- For Codex chat-send tasks, enforce section `12.13` (thread send-and-verify protocol).
- For Codex typing/conversation tasks, enforce section `12.16` (compose-and-talk protocol).
- For iterative Codex bug-chat tasks, enforce section `12.14` (multi-turn bug-resolution loop).
- For autonomous AI-chat tasks (agent writes its own outbound prompts or runs unattended), enforce section `12.15` (autonomous outbound messaging and unattended-mode guardrails).
- For commit/push tasks, enforce section `12.11` (commit/push anti-stall guardrail).
- For commit/push tasks, enforce section `12.12` (click precision and transition speed).
- For unknown app/system behavior, load section `4.3` first.

## Context Budget Rule

- Read only the relevant section(s) of the mastery spec.
- Do not paste the whole spec into replies.
- Return concise summaries and file references unless user asks for full detail.

## Operating Contract

- For prompts you send to another agent, use `Universal Prompt Contract`.
- For responses you return to the user, use `Agent Reply Contract`.
- For unknown app/system tasks, use `Unknown App Discovery Playbook`.
