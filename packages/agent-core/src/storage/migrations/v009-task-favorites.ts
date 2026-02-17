import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration: Migration = {
  version: 9,
  up: (db: Database) => {
    db.exec(
      `ALTER TABLE tasks ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0`
    );
    db.exec(
      `CREATE INDEX idx_tasks_is_favorite ON tasks(is_favorite)`
    );
  },
};
