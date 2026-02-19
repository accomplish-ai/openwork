import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration: Migration = {
  version: 9,
  up: (db: Database) => {
    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS cloud_providers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id TEXT NOT NULL UNIQUE,
        config TEXT,
        enabled INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `,
    ).run();
  },
  down: (db: Database) => {
    db.prepare('DROP TABLE IF EXISTS cloud_providers').run();
  },
};
