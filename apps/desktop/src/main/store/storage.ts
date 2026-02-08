import { app } from 'electron';
import path from 'path';
import { createStorage, type StorageAPI } from '@accomplish_ai/agent-core';
import BetterSqlite3, { type Database } from 'better-sqlite3';
import { importLegacyElectronStoreData } from './electronStoreImport';

let _storage: StorageAPI | null = null;

export function getDatabasePath(): string {
  const dbName = app.isPackaged ? 'accomplish.db' : 'accomplish-dev.db';
  return path.join(app.getPath('userData'), dbName);
}

export function getStorage(): StorageAPI {
  if (!_storage) {
    _storage = createStorage({
      databasePath: getDatabasePath(),
      runMigrations: true,
      userDataPath: app.getPath('userData'),
      secureStorageFileName: app.isPackaged
        ? 'secure-storage.json'
        : 'secure-storage-dev.json',
    });
  }
  return _storage;
}

/**
 * Initialize both the database and secure storage.
 * On first run, also imports data from the legacy electron-store format.
 */
export function initializeStorage(): void {
  const storage = getStorage();
  if (!storage.isDatabaseInitialized()) {
    storage.initialize();

    // One-time legacy data import from old electron-store format
    // Open a separate connection to the same DB for raw SQL access
    const dbPath = getDatabasePath();
    const db: Database = new BetterSqlite3(dbPath);
    try {
      importLegacyElectronStoreData(db);
    } finally {
      db.close();
    }
  }
}

export function closeStorage(): void {
  if (_storage) {
    _storage.close();
    _storage = null;
  }
}
