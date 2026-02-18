import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration: Migration = {
  version: 10,
  up: (db: Database) => {
    // Add is_favorite column to tasks table, default to 0 (false)
    try {
      db.prepare('ALTER TABLE tasks ADD COLUMN is_favorite INTEGER DEFAULT 0').run();
    } catch (error: unknown) {
      // Use 'unknown' instead of 'any' to satisfy @typescript-eslint/no-explicit-any
      if (error instanceof Error && !error.message.includes('duplicate column name')) {
        throw error;
      }
    }
  },
  down: (db: Database) => {
    try {
      db.prepare('ALTER TABLE tasks DROP COLUMN is_favorite').run();
    } catch {
      // Empty catch block requires a comment to satisfy 'no-empty' rule
      // SQLite versions prior to 3.35.0 do not support DROP COLUMN
    }
  },
};
