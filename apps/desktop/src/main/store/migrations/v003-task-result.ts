// apps/desktop/src/main/store/migrations/v003-task-result.ts

import type { Database } from 'better-sqlite3';
import type { Migration } from './index';

/**
 * Migration v003: Add result column to tasks table
 *
 * This allows storing task results (including error codes) directly in the database
 * so they persist across app restarts and page reloads.
 */
export const migration: Migration = {
  version: 3,
  up(db: Database): void {
    db.exec(`ALTER TABLE tasks ADD COLUMN result TEXT`);
    console.log('[v003] Added result column to tasks table');
  },
  down(db: Database): void {
    // SQLite 3.35.0+ supports DROP COLUMN
    db.exec(`ALTER TABLE tasks DROP COLUMN result`);
    console.log('[v003] Removed result column from tasks table');
  },
};
