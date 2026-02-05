// apps/desktop/src/main/store/migrations/v007-scheduled-tasks.ts

import type { Database } from 'better-sqlite3';
import type { Migration } from './index';

export const migration: Migration = {
  version: 7,
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE scheduled_tasks (
        id TEXT PRIMARY KEY,
        prompt TEXT NOT NULL,
        schedule_type TEXT NOT NULL CHECK (schedule_type IN ('one-time', 'recurring')),
        scheduled_at TEXT,
        cron_expression TEXT,
        timezone TEXT NOT NULL,
        next_run_at TEXT,
        last_run_at TEXT,
        last_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (
          (schedule_type = 'one-time' AND scheduled_at IS NOT NULL) OR
          (schedule_type = 'recurring' AND cron_expression IS NOT NULL)
        )
      )
    `);

    // Index for scheduler to quickly find due schedules
    db.exec(`
      CREATE INDEX idx_scheduled_next_run
      ON scheduled_tasks(next_run_at)
      WHERE status = 'active' AND enabled = 1
    `);

    // Index for listing by status
    db.exec(`CREATE INDEX idx_scheduled_status ON scheduled_tasks(status)`);
  },
};
