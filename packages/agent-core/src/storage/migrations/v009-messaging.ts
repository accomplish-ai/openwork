import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration: Migration = {
  version: 9,
  up: (db: Database) => {
    db.exec(`ALTER TABLE app_settings ADD COLUMN messaging_config TEXT DEFAULT NULL`);
  },
};
