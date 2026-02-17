import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration: Migration = {
  version: 9,
  up: (db: Database) => {
    db.exec(
      `ALTER TABLE tasks ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0`
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_tasks_is_favorite ON tasks(is_favorite) WHERE is_favorite = 1`
    );
  },
  down: (db: Database) => {
    db.exec(`DROP INDEX IF EXISTS idx_tasks_is_favorite`);
    db.exec(`ALTER TABLE tasks DROP COLUMN is_favorite`);
  },
};
