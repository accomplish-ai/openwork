---
"@accomplish_ai/agent-core": patch
---

feat(agent-core): handle context window overflow with silent recovery (ENG-150)

When a running task exceeds the LLM's context window limit, the adapter now intercepts the
ContextOverflow error from the log watcher instead of surfacing it to the user. It compacts the
conversation history into a summary using Haiku, builds a continuation prompt with the summary
prepended, and retries the task in a fresh CLI session. If recovery fails (compaction unavailable,
API error, or second overflow), the original error is surfaced normally. Only one retry attempt
is made per task to prevent infinite loops.
