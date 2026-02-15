---
"@accomplish_ai/agent-core": patch
---

Emit complete_task summary as a final assistant message in the UI. When the agent calls complete_task with a summary, the adapter now emits a synthetic text message so users see the task result displayed as the last chat bubble.
