import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration: Migration = {
  version: 9,
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE messaging_integrations (
        provider_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'disconnected' CHECK(status IN ('disconnected', 'connecting', 'qr_ready', 'connected', 'reconnecting', 'logged_out')),
        phone_number TEXT,
        owner_jid TEXT,
        owner_lid TEXT,
        last_connected_at INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  },
  down: (db: Database) => {
    db.exec('DROP TABLE IF EXISTS messaging_integrations');
  },
};
