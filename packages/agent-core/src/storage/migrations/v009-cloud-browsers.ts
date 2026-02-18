import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration: Migration = {
  version: 9,
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS cloud_browsers (
        provider_id TEXT PRIMARY KEY,
        config TEXT NOT NULL DEFAULT '{}',
        enabled INTEGER NOT NULL DEFAULT 0,
        last_validated INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  },
  down: (db: Database) => {
    db.exec(`DROP TABLE IF EXISTS cloud_browsers`);
  },
};
