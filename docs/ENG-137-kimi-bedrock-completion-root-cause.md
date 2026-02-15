# ENG-137 Root Cause Analysis: Kimi K2.5 (AWS Bedrock) Stops as "Conversational"

## Summary

Issue: tasks run with Kimi K2.5 on AWS Bedrock can stop with:

`No tools used and no complete_task called — treating as conversational response`

This causes the task to be marked as completed even when work is still pending.

Jira references:
- `ENG-137`: `[Bug] Kimi k2.5 always stops with "No tools used and no complete_task called" (AWS Bedrock)`
- `ENG-147`: `[Bug] task marked as completed without doing anything (AWS Bedrock Kimi K2.5)` (clone)

## Observed Behavior (From Runtime Trace)

Representative sequence:

1. Agent calls `start_task` successfully.
2. Todo list is created (`in_progress` + `pending` items).
3. Agent reaches `step_finish` with reason `stop` without `complete_task`.
4. System schedules continuation.
5. Continuation starts.
6. Agent emits plain text (no tool call, no `complete_task`) and stops.
7. Completion enforcer logs:
   - `No tools used and no complete_task called — treating as conversational response`
8. Task is finalized as success.

Result: structured task flow is abandoned mid-task and still reported as complete.

## Expected Behavior

If a task has already entered structured execution (`start_task`/todos/tool usage), then:

- A text-only continuation turn should **not** end the task as success.
- The run should continue, or fail as `blocked/error` after retry limits.
- `success` should only happen after a valid `complete_task(status="success")` path.

## Current Code Path

### 1) Conversational fallback in completion enforcer

File: `packages/agent-core/src/opencode/completion/completion-enforcer.ts`

Current behavior in `handleStepFinish()`:

- On `stop`/`end_turn`, if `complete_task` not called:
  - If `toolsWereUsed === false` in that turn:
    - return `complete` with debug message:
      `No tools used and no complete_task called — treating as conversational response`

This is valid for true chat-only requests, but unsafe for active automation tasks.

### 2) Per-turn tool usage is reset before continuation

File: `packages/agent-core/src/opencode/completion/completion-enforcer.ts`

In `handleProcessExit()`:

- Before continuation, `toolsWereUsed = false` is set.

So a single text-only continuation turn can trigger the conversational fallback even if prior turns used tools and created todos.

### 3) Adapter maps enforcer `complete` to task `success`

File: `packages/agent-core/src/opencode/adapter.ts`

- On `step_finish`, when enforcer action is `complete`, adapter emits:
  - `status: "success"`

This makes the conversational fallback indistinguishable from real completion.

### 4) Tests currently codify this fallback

File: `packages/agent-core/tests/unit/opencode/completion/completion-enforcer.test.ts`

- Test explicitly expects:
  - no tools + no `complete_task` => `complete`

This behavior is currently intentional per tests, but incorrect for structured-task continuations.

## Root Cause

The completion decision uses **turn-local** tool activity (`toolsWereUsed`) to determine whether to continue or finish, but ignores **task-level context** (existing todos, prior `start_task`, prior tool usage, pending structured execution).

In short:

- Continuation turn emits text only
- `toolsWereUsed` is false (reset)
- Fallback treats it as conversational
- Adapter converts that to `success`

This creates false-positive task completion.

## Why Kimi K2.5 (Bedrock) Exposes It More Often

Kimi appears more likely to produce a brief natural-language continuation turn ("Let me navigate...") before invoking a tool. With current logic, that one turn is enough to terminate execution as conversational-success.

This is a model-behavior sensitivity bug in orchestrator completion logic, not a provider-auth/config failure.

## Suggested Solution

## A) Add task-level execution state in completion logic

Track these booleans in `CompletionEnforcer`:

- `hasStructuredTask`: set true once `start_task` is observed or todos exist.
- `toolsUsedEver`: set true when any tool was used in any turn.

Keep `toolsUsedThisTurn` (current behavior) but do not use it alone for terminal decisions.

## B) Gate conversational fallback strictly

Only allow conversational fallback when **all** are true:

- no `complete_task` called,
- no structured-task signal (`hasStructuredTask` false),
- no todos,
- no prior tool usage (`toolsUsedEver` false),
- and no continuation already in progress.

If structured task is active, `stop` without `complete_task` should schedule continuation (or eventual blocked/error), not `complete`.

## C) Use incomplete todos as hard signal

If any todo is `pending` or `in_progress`, never finalize as conversational success.

## D) Final status semantics on retry exhaustion

If continuation retries are exhausted without `complete_task`, emit a non-success terminal state (`blocked` or `error`) with explicit reason (`missing_complete_task_after_retries`).

## E) Preserve completion correctness contract

`success` should require one of:

1. valid `complete_task(status="success")`, or
2. explicit non-structured conversational run that never entered tool/task flow.

Any structured run without completion tool should not report success.

## Implementation Outline

1. Update `CompletionEnforcer` state:
   - add task-level flags and setters
   - separate `markToolsUsedThisTurn()` from `markToolsUsedEver()`
2. Update adapter wiring (`OpenCodeAdapter`):
   - on `start_task` tool, mark structured task active in enforcer
   - on todo updates, mark structured task active
   - on tool calls, set both per-turn and ever-used flags
3. Update `handleStepFinish()` decision tree:
   - prioritize structured-task invariants and incomplete todos
   - remove unsafe direct `complete` path for active tasks
4. Update terminal emit logic:
   - distinguish real success vs guarded termination (`blocked/error`)
5. Add/adjust tests.

## Test Plan Changes

Add or update unit tests in:

- `packages/agent-core/tests/unit/opencode/completion/completion-enforcer.test.ts`
- `apps/desktop/__tests__/unit/main/opencode/adapter.unit.test.ts`

Critical cases:

1. Structured task + no tools this continuation turn + no `complete_task` => `pending`, not `complete`.
2. Incomplete todos + text-only stop => continuation, not success.
3. True conversational request (never used tools / never started structured task) => still completes without forced continuation.
4. Retry exhaustion without `complete_task` => non-success terminal status.
5. Existing success path with `complete_task(status="success")` remains unchanged.

## Risks and Mitigations

Risk: over-correcting may cause unnecessary continuation loops for real conversational prompts.

Mitigation:
- Keep conversational fallback for genuinely chat-only flows.
- Use structured-task/todo signals to scope stricter behavior only to automation runs.
- Add max retry guard with clear non-success termination.

## Rollout Recommendation

1. Land logic fix + tests in `agent-core`.
2. Validate with Bedrock Kimi K2.5 repro prompt from Jira.
3. Smoke-test with other providers (Anthropic/OpenAI/OpenRouter) to ensure no regression in conversational tasks.
4. Backport to current release branch if `0.3.9` is still active.

## Practical Acceptance Criteria

- Repro from `ENG-137` no longer ends with conversational-success while todos remain pending.
- Task ends only after `complete_task` or explicit blocked/error terminal path.
- Existing chat-only prompts still finish naturally without tool-enforcement noise.
