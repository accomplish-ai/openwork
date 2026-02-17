import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration: Migration = {
  version: 9,
  up: (db: Database) => {
    // Add huggingface_config column to app_settings table
    db.exec(`
      ALTER TABLE app_settings 
      ADD COLUMN huggingface_config TEXT
    `);
  },
};