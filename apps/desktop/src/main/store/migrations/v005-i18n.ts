// apps/desktop/src/main/store/migrations/v005-i18n.ts

import type { Database } from 'better-sqlite3';
import type { Migration } from './index';

/**
 * Migration v005: Add language support for internationalization (i18n)
 *
 * Adds:
 * - language field to app_settings table (defaults to 'en')
 */
export const migration: Migration = {
  version: 5,
  up(db: Database): void {
    console.log('[v005] Adding language field to app_settings...');

    // Add language column to app_settings table
    db.exec(`
      ALTER TABLE app_settings
      ADD COLUMN language TEXT NOT NULL DEFAULT 'en'
    `);

    console.log('[v005] Migration complete');
  },

  down(db: Database): void {
    // SQLite doesn't support DROP COLUMN directly, so we would need to:
    // 1. Create new table without language column
    // 2. Copy data
    // 3. Drop old table
    // 4. Rename new table
    // For simplicity, we don't implement rollback for this migration
    console.log('[v005] Rollback not implemented');
  },
};
