---
'@accomplish_ai/agent-core': patch
---

fix(agent-core): prevent infinite completion loop on incomplete todos

Add circuit breaker (max 3 todo-based downgrades before accepting success),
transparent feedback via getIncompleteTodosPrompt, and reduce default
maxContinuationAttempts from 50/20 to 10.
