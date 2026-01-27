// apps/desktop/src/main/store/migrations/v005-theme.ts

import type { Database } from 'better-sqlite3';
import type { Migration } from './index';

export const migration: Migration = {
  version: 5,
  up(db: Database): void {
    // Add theme column to app_settings table
    db.exec(`
      ALTER TABLE app_settings ADD COLUMN theme TEXT DEFAULT 'light';
    `);

    console.log('[Migration v005] Added theme column to app_settings');
  },
};
