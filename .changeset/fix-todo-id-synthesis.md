---
"@accomplish_ai/agent-core": patch
---

fix(agent-core): synthesize missing todo IDs in todowrite handler

Synthesize `todo_id` from array index when OpenCode's `todowrite` tool omits the `id` field, preventing SQLite NOT NULL constraint violations.
