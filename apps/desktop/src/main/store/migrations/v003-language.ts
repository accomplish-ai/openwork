// apps/desktop/src/main/store/migrations/v003-language.ts

import type { Database } from 'better-sqlite3';
import type { Migration } from './index';

export const migration: Migration = {
  version: 3,
  up(db: Database) {
    // Add language column to app_settings table
    db.exec(`
      ALTER TABLE app_settings
      ADD COLUMN language TEXT NOT NULL DEFAULT 'auto'
    `);
  },
};
