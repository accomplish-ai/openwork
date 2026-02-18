import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration: Migration = {
  version: 9,
  up(db: Database): void {
    db.exec(`
      ALTER TABLE app_settings
      ADD COLUMN cloud_browser_config TEXT
    `);
    console.log('[v009] Added cloud_browser_config column');
  },
};

