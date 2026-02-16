import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration: Migration = {
  version: 9,
  up: (db: Database) => {
    // Check if is_favorite column already exists
    const tableInfo = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
    const hasIsFavoriteColumn = tableInfo.some(column => column.name === 'is_favorite');
    
    if (!hasIsFavoriteColumn) {
      // Add is_favorite column to tasks table
      db.exec(`
        ALTER TABLE tasks ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0
      `);
    }

    // Check if index exists before creating it
    const indexInfo = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_tasks_is_favorite'").get();
    if (!indexInfo) {
      // Create index for faster favorite queries
      db.exec(`CREATE INDEX idx_tasks_is_favorite ON tasks(is_favorite, created_at DESC)`);
    }
  },
  down: (db: Database) => {
    // Remove the index
    db.exec(`DROP INDEX IF EXISTS idx_tasks_is_favorite`);
    
    // Remove the column (SQLite doesn't support DROP COLUMN, so we need to recreate the table)
    db.exec(`
      CREATE TABLE tasks_new (
        id TEXT PRIMARY KEY,
        prompt TEXT NOT NULL,
        summary TEXT,
        status TEXT NOT NULL,
        session_id TEXT,
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT
      )
    `);

    db.exec(`
      INSERT INTO tasks_new
      SELECT id, prompt, summary, status, session_id, created_at, started_at, completed_at
      FROM tasks
    `);

    db.exec(`DROP TABLE tasks`);
    db.exec(`ALTER TABLE tasks_new RENAME TO tasks`);
    db.exec(`CREATE INDEX idx_tasks_created_at ON tasks(created_at DESC)`);
  },
};
