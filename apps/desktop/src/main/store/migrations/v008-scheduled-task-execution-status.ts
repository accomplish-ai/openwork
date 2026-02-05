// apps/desktop/src/main/store/migrations/v008-scheduled-task-execution-status.ts

import type { Database } from 'better-sqlite3';
import type { Migration } from './index';

export const migration: Migration = {
  version: 8,
  up: (db: Database) => {
    // Track execution status separately from schedule lifecycle status.
    // This enables atomic "claim" + makes failures visible without logs.
    db.exec(`
      ALTER TABLE scheduled_tasks
      ADD COLUMN execution_status TEXT NOT NULL DEFAULT 'pending'
      CHECK (execution_status IN ('pending', 'running', 'completed', 'failed'))
    `);

    db.exec(`
      ALTER TABLE scheduled_tasks
      ADD COLUMN execution_error TEXT
    `);

    // Backfill execution_status from the last task if available (best-effort).
    // Maps task status to schedule execution status.
    db.exec(`
      UPDATE scheduled_tasks
      SET execution_status = COALESCE(
        (
          SELECT
            CASE
              WHEN tasks.status = 'completed' THEN 'completed'
              WHEN tasks.status = 'failed' THEN 'failed'
              WHEN tasks.status IN ('running', 'pending', 'queued', 'waiting_permission') THEN 'running'
              WHEN tasks.status IN ('cancelled', 'interrupted') THEN 'failed'
              ELSE 'pending'
            END
          FROM tasks
          WHERE tasks.id = scheduled_tasks.last_task_id
        ),
        execution_status
      )
      WHERE last_task_id IS NOT NULL
    `);

    db.exec(`CREATE INDEX IF NOT EXISTS idx_scheduled_execution_status ON scheduled_tasks(execution_status)`);
  },
};

