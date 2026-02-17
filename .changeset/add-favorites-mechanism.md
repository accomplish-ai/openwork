---
"@accomplish_ai/agent-core": minor
---

feat(agent-core): add favorites mechanism for completed tasks

- Add `toggleTaskFavorite()` and `getFavoriteTasks()` to StorageAPI
- Add v009 migration adding `is_favorite` column with index to tasks table
- Preserve favorite flag during `saveTask` INSERT OR REPLACE operations
- Protect favorited tasks from history pruning
- Transaction-safe toggle with atomic read-update pattern
