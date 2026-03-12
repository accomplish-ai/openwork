import type { Migration } from './index.js';

export const migration: Migration = {
  version: 9,
  up: (db) => {
    db.exec(`ALTER TABLE app_settings ADD COLUMN sandbox_config TEXT DEFAULT NULL`);
  },
  down: (db) => {
    db.exec(`ALTER TABLE app_settings DROP COLUMN sandbox_config`);
  },
};
