import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration: Migration = {
  version: 7,
  up: (db: Database) => {
    db.exec(`ALTER TABLE app_settings ADD COLUMN sandbox_config TEXT`);
  },
};
