---
"@accomplish_ai/agent-core": minor
---

Add `needs_planning` classification to `start_task` tool. The agent still calls `start_task` for every message (preserving discipline), but now sets `needs_planning: false` for simple messages like greetings and knowledge questions. When false, the adapter skips plan card emission and todo creation, and the completion enforcer treats it as a conversational turn — no continuation prompts needed.
