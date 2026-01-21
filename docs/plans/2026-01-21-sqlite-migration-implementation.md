# SQLite Storage Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace electron-store JSON files with SQLite database for app-settings, provider-settings, and task-history stores.

**Architecture:** Single SQLite database with unified schema versioning. Migration runner blocks startup if schema is from a future version. Legacy JSON data imported on first run, then renamed.

**Tech Stack:** better-sqlite3, Electron, TypeScript

---

## Task 1: Add better-sqlite3 Dependency

**Files:**
- Modify: `apps/desktop/package.json:41-68` (dependencies section)

**Step 1: Add dependencies**

```bash
cd /Users/matan/Developer/Accomplish/openwork/.worktrees/sqlite-migration/apps/desktop
pnpm add better-sqlite3
pnpm add -D @types/better-sqlite3
```

**Step 2: Verify installation**

Run: `pnpm typecheck`
Expected: PASS (no type errors)

**Step 3: Verify electron-rebuild handles it**

Run: `pnpm postinstall`
Expected: better-sqlite3 rebuilds for Electron

**Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat(storage): add better-sqlite3 dependency"
```

---

## Task 2: Create Migration Error Classes

**Files:**
- Create: `apps/desktop/src/main/store/migrations/errors.ts`

**Step 1: Create the errors file**

```typescript
// apps/desktop/src/main/store/migrations/errors.ts

/**
 * Thrown when the database schema version is newer than the app supports.
 * User must update the app to continue.
 */
export class FutureSchemaError extends Error {
  name = 'FutureSchemaError' as const;

  constructor(
    public readonly storedVersion: number,
    public readonly appVersion: number
  ) {
    super(
      `Database schema v${storedVersion} is newer than app supports (v${appVersion}). Please update Openwork.`
    );
  }
}

/**
 * Thrown when a migration fails to apply.
 */
export class MigrationError extends Error {
  name = 'MigrationError' as const;

  constructor(
    public readonly version: number,
    public readonly cause: Error
  ) {
    super(`Migration to v${version} failed: ${cause.message}`);
  }
}

/**
 * Thrown when the database file is corrupted or unreadable.
 */
export class CorruptDatabaseError extends Error {
  name = 'CorruptDatabaseError' as const;

  constructor(message: string) {
    super(`Database corrupted: ${message}`);
  }
}
```

**Step 2: Verify types**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/desktop/src/main/store/migrations/errors.ts
git commit -m "feat(storage): add migration error classes"
```

---

## Task 3: Create Database Connection Module

**Files:**
- Create: `apps/desktop/src/main/store/db.ts`

**Step 1: Create db.ts**

```typescript
// apps/desktop/src/main/store/db.ts

import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

let _db: Database.Database | null = null;

/**
 * Get the database file path based on environment.
 */
export function getDatabasePath(): string {
  const dbName = app.isPackaged ? 'openwork.db' : 'openwork-dev.db';
  return path.join(app.getPath('userData'), dbName);
}

/**
 * Get or create the database connection.
 * Migrations are NOT run here - call runMigrations() separately after getting the database.
 */
export function getDatabase(): Database.Database {
  if (!_db) {
    const dbPath = getDatabasePath();
    console.log('[DB] Opening database at:', dbPath);

    _db = new Database(dbPath);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
  }
  return _db;
}

/**
 * Close the database connection.
 * Call this on app shutdown.
 */
export function closeDatabase(): void {
  if (_db) {
    console.log('[DB] Closing database connection');
    _db.close();
    _db = null;
  }
}

/**
 * Reset the database by backing up and removing the current file.
 * Used for recovery from corruption.
 */
export function resetDatabase(): void {
  closeDatabase();

  const dbPath = getDatabasePath();
  if (fs.existsSync(dbPath)) {
    const backupPath = `${dbPath}.corrupt.${Date.now()}`;
    console.log('[DB] Backing up corrupt database to:', backupPath);
    fs.renameSync(dbPath, backupPath);
  }

  // Also remove WAL and SHM files if they exist
  const walPath = `${dbPath}-wal`;
  const shmPath = `${dbPath}-shm`;
  if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
  if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
}

/**
 * Check if the database file exists.
 */
export function databaseExists(): boolean {
  return fs.existsSync(getDatabasePath());
}
```

**Step 2: Verify types**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/desktop/src/main/store/db.ts
git commit -m "feat(storage): add database connection module"
```

---

## Task 4: Create Migration Runner

**Files:**
- Create: `apps/desktop/src/main/store/migrations/index.ts`

**Step 1: Create migration runner**

```typescript
// apps/desktop/src/main/store/migrations/index.ts

import type { Database } from 'better-sqlite3';
import { FutureSchemaError, MigrationError } from './errors';

export interface Migration {
  version: number;
  up: (db: Database) => void;
}

// Import migrations - will be added as we create them
const migrations: Migration[] = [];

/**
 * Current schema version supported by this app.
 * Increment this when adding new migrations.
 */
export const CURRENT_VERSION = 0; // Will be 1 after v001-initial is added

/**
 * Get the stored schema version from the database.
 * Returns 0 if no version is set (fresh database).
 */
export function getStoredVersion(db: Database): number {
  try {
    const tableExists = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_meta'"
      )
      .get();

    if (!tableExists) {
      return 0;
    }

    const row = db
      .prepare("SELECT value FROM schema_meta WHERE key = 'version'")
      .get() as { value: string } | undefined;

    return row ? parseInt(row.value, 10) : 0;
  } catch {
    return 0;
  }
}

/**
 * Set the schema version in the database.
 */
export function setStoredVersion(db: Database, version: number): void {
  db.prepare(
    "INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', ?)"
  ).run(String(version));
}

/**
 * Run all pending migrations.
 * Throws FutureSchemaError if the database is from a newer app version.
 */
export function runMigrations(db: Database): void {
  const storedVersion = getStoredVersion(db);

  console.log(
    `[Migrations] Stored version: ${storedVersion}, App version: ${CURRENT_VERSION}`
  );

  // Block if database is from a newer app version
  if (storedVersion > CURRENT_VERSION) {
    throw new FutureSchemaError(storedVersion, CURRENT_VERSION);
  }

  // No migrations to run
  if (storedVersion === CURRENT_VERSION) {
    console.log('[Migrations] Database is up to date');
    return;
  }

  // Run pending migrations
  for (const migration of migrations) {
    if (migration.version > storedVersion) {
      console.log(`[Migrations] Running migration v${migration.version}`);

      try {
        db.transaction(() => {
          migration.up(db);
          setStoredVersion(db, migration.version);
        })();
        console.log(`[Migrations] Migration v${migration.version} complete`);
      } catch (err) {
        throw new MigrationError(
          migration.version,
          err instanceof Error ? err : new Error(String(err))
        );
      }
    }
  }

  console.log('[Migrations] All migrations complete');
}

/**
 * Register a migration. Called by migration files.
 */
export function registerMigration(migration: Migration): void {
  migrations.push(migration);
  migrations.sort((a, b) => a.version - b.version);
}

// Re-export errors for convenience
export { FutureSchemaError, MigrationError, CorruptDatabaseError } from './errors';
```

**Step 2: Verify types**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/desktop/src/main/store/migrations/index.ts
git commit -m "feat(storage): add migration runner"
```

---

## Task 5: Create Initial Migration (Schema + Legacy Import)

**Files:**
- Create: `apps/desktop/src/main/store/migrations/v001-initial.ts`
- Modify: `apps/desktop/src/main/store/migrations/index.ts` (import + CURRENT_VERSION)

**Step 1: Create v001-initial.ts**

```typescript
// apps/desktop/src/main/store/migrations/v001-initial.ts

import type { Database } from 'better-sqlite3';
import Store from 'electron-store';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { registerMigration } from './index';

/**
 * Get store name based on environment (dev vs packaged).
 */
function getStoreName(baseName: string): string {
  return app.isPackaged ? baseName : `${baseName}-dev`;
}

/**
 * Import app settings from legacy electron-store.
 */
function importAppSettings(db: Database): void {
  try {
    const legacy = new Store<Record<string, unknown>>({
      name: getStoreName('app-settings'),
    });

    if (legacy.size === 0) {
      console.log('[v001] No legacy app-settings to import');
      return;
    }

    console.log('[v001] Importing app-settings...');

    db.prepare(
      `UPDATE app_settings SET
        debug_mode = ?,
        onboarding_complete = ?,
        selected_model = ?,
        ollama_config = ?,
        litellm_config = ?
      WHERE id = 1`
    ).run(
      legacy.get('debugMode') ? 1 : 0,
      legacy.get('onboardingComplete') ? 1 : 0,
      JSON.stringify(legacy.get('selectedModel') ?? null),
      JSON.stringify(legacy.get('ollamaConfig') ?? null),
      JSON.stringify(legacy.get('litellmConfig') ?? null)
    );

    console.log('[v001] App settings imported');
  } catch (err) {
    console.error('[v001] Failed to import app-settings:', err);
  }
}

/**
 * Import provider settings from legacy electron-store.
 */
function importProviderSettings(db: Database): void {
  try {
    const legacy = new Store<Record<string, unknown>>({
      name: getStoreName('provider-settings'),
    });

    if (legacy.size === 0) {
      console.log('[v001] No legacy provider-settings to import');
      return;
    }

    console.log('[v001] Importing provider-settings...');

    // Import provider_meta
    db.prepare(
      `UPDATE provider_meta SET
        active_provider_id = ?,
        debug_mode = ?
      WHERE id = 1`
    ).run(
      legacy.get('activeProviderId') as string | null,
      legacy.get('debugMode') ? 1 : 0
    );

    // Import connected providers
    const connectedProviders = legacy.get('connectedProviders') as Record<
      string,
      Record<string, unknown>
    > | null;

    if (connectedProviders) {
      const insertProvider = db.prepare(
        `INSERT OR REPLACE INTO providers
          (provider_id, connection_status, selected_model_id, credentials_type, credentials_data, last_connected_at, available_models)
        VALUES (?, ?, ?, ?, ?, ?, ?)`
      );

      for (const [providerId, provider] of Object.entries(connectedProviders)) {
        if (!provider) continue;

        const credentials = provider.credentials as Record<string, unknown> | undefined;
        insertProvider.run(
          providerId,
          provider.connectionStatus as string || 'disconnected',
          provider.selectedModelId as string | null,
          credentials?.type as string || 'api_key',
          JSON.stringify(credentials ?? {}),
          provider.lastConnectedAt as string | null,
          JSON.stringify(provider.availableModels ?? null)
        );
      }
    }

    console.log('[v001] Provider settings imported');
  } catch (err) {
    console.error('[v001] Failed to import provider-settings:', err);
  }
}

/**
 * Import task history from legacy electron-store.
 */
function importTaskHistory(db: Database): void {
  try {
    const legacy = new Store<Record<string, unknown>>({
      name: getStoreName('task-history'),
    });

    if (legacy.size === 0) {
      console.log('[v001] No legacy task-history to import');
      return;
    }

    console.log('[v001] Importing task-history...');

    const tasks = legacy.get('tasks') as Array<Record<string, unknown>> | null;
    if (!tasks || tasks.length === 0) {
      console.log('[v001] No tasks to import');
      return;
    }

    const insertTask = db.prepare(
      `INSERT OR REPLACE INTO tasks
        (id, prompt, summary, status, session_id, created_at, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const insertMessage = db.prepare(
      `INSERT INTO task_messages
        (id, task_id, type, content, tool_name, tool_input, timestamp, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const insertAttachment = db.prepare(
      `INSERT INTO task_attachments
        (message_id, type, data, label)
      VALUES (?, ?, ?, ?)`
    );

    for (const task of tasks) {
      insertTask.run(
        task.id as string,
        task.prompt as string,
        task.summary as string | null,
        task.status as string,
        task.sessionId as string | null,
        task.createdAt as string,
        task.startedAt as string | null,
        task.completedAt as string | null
      );

      const messages = task.messages as Array<Record<string, unknown>> | null;
      if (messages) {
        let sortOrder = 0;
        for (const msg of messages) {
          insertMessage.run(
            msg.id as string,
            task.id as string,
            msg.type as string,
            msg.content as string,
            msg.toolName as string | null,
            msg.toolInput ? JSON.stringify(msg.toolInput) : null,
            msg.timestamp as string,
            sortOrder++
          );

          const attachments = msg.attachments as Array<Record<string, unknown>> | null;
          if (attachments) {
            for (const att of attachments) {
              insertAttachment.run(
                msg.id as string,
                att.type as string,
                att.data as string,
                att.label as string | null
              );
            }
          }
        }
      }
    }

    console.log(`[v001] Imported ${tasks.length} tasks`);
  } catch (err) {
    console.error('[v001] Failed to import task-history:', err);
  }
}

/**
 * Rename legacy JSON store files after successful import.
 */
function cleanupLegacyStores(): void {
  const storeNames = ['app-settings', 'provider-settings', 'task-history'];
  const suffix = app.isPackaged ? '' : '-dev';
  const userDataPath = app.getPath('userData');

  for (const name of storeNames) {
    const legacyPath = path.join(userDataPath, `${name}${suffix}.json`);
    if (fs.existsSync(legacyPath)) {
      const migratedPath = `${legacyPath}.migrated`;
      try {
        fs.renameSync(legacyPath, migratedPath);
        console.log(`[v001] Renamed ${legacyPath} to ${migratedPath}`);
      } catch (err) {
        console.error(`[v001] Failed to rename ${legacyPath}:`, err);
      }
    }
  }
}

// Register the migration
registerMigration({
  version: 1,
  up: (db: Database) => {
    // Create schema_meta table
    db.exec(`
      CREATE TABLE schema_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    // Create app_settings table
    db.exec(`
      CREATE TABLE app_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        debug_mode INTEGER NOT NULL DEFAULT 0,
        onboarding_complete INTEGER NOT NULL DEFAULT 0,
        selected_model TEXT,
        ollama_config TEXT,
        litellm_config TEXT
      )
    `);

    // Create provider tables
    db.exec(`
      CREATE TABLE provider_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        active_provider_id TEXT,
        debug_mode INTEGER NOT NULL DEFAULT 0
      )
    `);

    db.exec(`
      CREATE TABLE providers (
        provider_id TEXT PRIMARY KEY,
        connection_status TEXT NOT NULL DEFAULT 'disconnected',
        selected_model_id TEXT,
        credentials_type TEXT NOT NULL,
        credentials_data TEXT,
        last_connected_at TEXT,
        available_models TEXT
      )
    `);

    // Create task tables
    db.exec(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        prompt TEXT NOT NULL,
        summary TEXT,
        status TEXT NOT NULL,
        session_id TEXT,
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT
      )
    `);

    db.exec(`
      CREATE TABLE task_messages (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        tool_name TEXT,
        tool_input TEXT,
        timestamp TEXT NOT NULL,
        sort_order INTEGER NOT NULL
      )
    `);

    db.exec(`
      CREATE TABLE task_attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT NOT NULL REFERENCES task_messages(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        label TEXT
      )
    `);

    // Create indexes
    db.exec(`CREATE INDEX idx_tasks_created_at ON tasks(created_at DESC)`);
    db.exec(`CREATE INDEX idx_messages_task_id ON task_messages(task_id)`);

    // Insert default rows for single-row tables
    db.exec(`INSERT INTO app_settings (id) VALUES (1)`);
    db.exec(`INSERT INTO provider_meta (id) VALUES (1)`);

    // Import legacy data
    importAppSettings(db);
    importProviderSettings(db);
    importTaskHistory(db);

    // Cleanup legacy files (outside transaction is fine)
    cleanupLegacyStores();
  },
});
```

**Step 2: Update migration index to set CURRENT_VERSION and import v001**

Edit `apps/desktop/src/main/store/migrations/index.ts`:

At the top, add the import:
```typescript
import './v001-initial';
```

Change `CURRENT_VERSION`:
```typescript
export const CURRENT_VERSION = 1;
```

**Step 3: Verify types**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/desktop/src/main/store/migrations/
git commit -m "feat(storage): add initial migration with legacy import"
```

---

## Task 6: Create App Settings Repository

**Files:**
- Create: `apps/desktop/src/main/store/repositories/appSettings.ts`

**Step 1: Create the repository**

```typescript
// apps/desktop/src/main/store/repositories/appSettings.ts

import type { SelectedModel, OllamaConfig, LiteLLMConfig } from '@accomplish/shared';
import { getDatabase } from '../db';

interface AppSettingsRow {
  id: number;
  debug_mode: number;
  onboarding_complete: number;
  selected_model: string | null;
  ollama_config: string | null;
  litellm_config: string | null;
}

interface AppSettings {
  debugMode: boolean;
  onboardingComplete: boolean;
  selectedModel: SelectedModel | null;
  ollamaConfig: OllamaConfig | null;
  litellmConfig: LiteLLMConfig | null;
}

function getRow(): AppSettingsRow {
  const db = getDatabase();
  return db.prepare('SELECT * FROM app_settings WHERE id = 1').get() as AppSettingsRow;
}

export function getDebugMode(): boolean {
  return getRow().debug_mode === 1;
}

export function setDebugMode(enabled: boolean): void {
  const db = getDatabase();
  db.prepare('UPDATE app_settings SET debug_mode = ? WHERE id = 1').run(enabled ? 1 : 0);
}

export function getOnboardingComplete(): boolean {
  return getRow().onboarding_complete === 1;
}

export function setOnboardingComplete(complete: boolean): void {
  const db = getDatabase();
  db.prepare('UPDATE app_settings SET onboarding_complete = ? WHERE id = 1').run(
    complete ? 1 : 0
  );
}

export function getSelectedModel(): SelectedModel | null {
  const row = getRow();
  if (!row.selected_model) return null;
  try {
    return JSON.parse(row.selected_model) as SelectedModel;
  } catch {
    return null;
  }
}

export function setSelectedModel(model: SelectedModel): void {
  const db = getDatabase();
  db.prepare('UPDATE app_settings SET selected_model = ? WHERE id = 1').run(
    JSON.stringify(model)
  );
}

export function getOllamaConfig(): OllamaConfig | null {
  const row = getRow();
  if (!row.ollama_config) return null;
  try {
    return JSON.parse(row.ollama_config) as OllamaConfig;
  } catch {
    return null;
  }
}

export function setOllamaConfig(config: OllamaConfig | null): void {
  const db = getDatabase();
  db.prepare('UPDATE app_settings SET ollama_config = ? WHERE id = 1').run(
    config ? JSON.stringify(config) : null
  );
}

export function getLiteLLMConfig(): LiteLLMConfig | null {
  const row = getRow();
  if (!row.litellm_config) return null;
  try {
    return JSON.parse(row.litellm_config) as LiteLLMConfig;
  } catch {
    return null;
  }
}

export function setLiteLLMConfig(config: LiteLLMConfig | null): void {
  const db = getDatabase();
  db.prepare('UPDATE app_settings SET litellm_config = ? WHERE id = 1').run(
    config ? JSON.stringify(config) : null
  );
}

export function getAppSettings(): AppSettings {
  const row = getRow();
  return {
    debugMode: row.debug_mode === 1,
    onboardingComplete: row.onboarding_complete === 1,
    selectedModel: row.selected_model ? JSON.parse(row.selected_model) : null,
    ollamaConfig: row.ollama_config ? JSON.parse(row.ollama_config) : null,
    litellmConfig: row.litellm_config ? JSON.parse(row.litellm_config) : null,
  };
}

export function clearAppSettings(): void {
  const db = getDatabase();
  db.prepare(
    `UPDATE app_settings SET
      debug_mode = 0,
      onboarding_complete = 0,
      selected_model = NULL,
      ollama_config = NULL,
      litellm_config = NULL
    WHERE id = 1`
  ).run();
}
```

**Step 2: Verify types**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/desktop/src/main/store/repositories/appSettings.ts
git commit -m "feat(storage): add app settings repository"
```

---

## Task 7: Create Provider Settings Repository

**Files:**
- Create: `apps/desktop/src/main/store/repositories/providerSettings.ts`

**Step 1: Create the repository**

```typescript
// apps/desktop/src/main/store/repositories/providerSettings.ts

import type {
  ProviderSettings,
  ProviderId,
  ConnectedProvider,
  ProviderCredentials,
} from '@accomplish/shared';
import { getDatabase } from '../db';

interface ProviderMetaRow {
  id: number;
  active_provider_id: string | null;
  debug_mode: number;
}

interface ProviderRow {
  provider_id: string;
  connection_status: string;
  selected_model_id: string | null;
  credentials_type: string;
  credentials_data: string | null;
  last_connected_at: string | null;
  available_models: string | null;
}

function getMetaRow(): ProviderMetaRow {
  const db = getDatabase();
  return db.prepare('SELECT * FROM provider_meta WHERE id = 1').get() as ProviderMetaRow;
}

function rowToProvider(row: ProviderRow): ConnectedProvider {
  let credentials: ProviderCredentials;
  try {
    credentials = JSON.parse(row.credentials_data || '{}') as ProviderCredentials;
  } catch {
    credentials = { type: 'api_key', keyPrefix: '' };
  }

  return {
    providerId: row.provider_id as ProviderId,
    connectionStatus: row.connection_status as ConnectedProvider['connectionStatus'],
    selectedModelId: row.selected_model_id,
    credentials,
    lastConnectedAt: row.last_connected_at || new Date().toISOString(),
    availableModels: row.available_models ? JSON.parse(row.available_models) : undefined,
  };
}

export function getProviderSettings(): ProviderSettings {
  const db = getDatabase();
  const meta = getMetaRow();

  const rows = db.prepare('SELECT * FROM providers').all() as ProviderRow[];
  const connectedProviders: Partial<Record<ProviderId, ConnectedProvider>> = {};

  for (const row of rows) {
    connectedProviders[row.provider_id as ProviderId] = rowToProvider(row);
  }

  return {
    activeProviderId: meta.active_provider_id as ProviderId | null,
    connectedProviders,
    debugMode: meta.debug_mode === 1,
  };
}

export function setActiveProvider(providerId: ProviderId | null): void {
  const db = getDatabase();
  db.prepare('UPDATE provider_meta SET active_provider_id = ? WHERE id = 1').run(providerId);
}

export function getActiveProviderId(): ProviderId | null {
  return getMetaRow().active_provider_id as ProviderId | null;
}

export function getConnectedProvider(providerId: ProviderId): ConnectedProvider | null {
  const db = getDatabase();
  const row = db
    .prepare('SELECT * FROM providers WHERE provider_id = ?')
    .get(providerId) as ProviderRow | undefined;

  return row ? rowToProvider(row) : null;
}

export function setConnectedProvider(
  providerId: ProviderId,
  provider: ConnectedProvider
): void {
  const db = getDatabase();
  db.prepare(
    `INSERT OR REPLACE INTO providers
      (provider_id, connection_status, selected_model_id, credentials_type, credentials_data, last_connected_at, available_models)
    VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    providerId,
    provider.connectionStatus,
    provider.selectedModelId,
    provider.credentials.type,
    JSON.stringify(provider.credentials),
    provider.lastConnectedAt,
    provider.availableModels ? JSON.stringify(provider.availableModels) : null
  );
}

export function removeConnectedProvider(providerId: ProviderId): void {
  const db = getDatabase();

  db.transaction(() => {
    db.prepare('DELETE FROM providers WHERE provider_id = ?').run(providerId);

    // If this was the active provider, clear it
    const meta = getMetaRow();
    if (meta.active_provider_id === providerId) {
      db.prepare('UPDATE provider_meta SET active_provider_id = NULL WHERE id = 1').run();
    }
  })();
}

export function updateProviderModel(providerId: ProviderId, modelId: string | null): void {
  const db = getDatabase();
  db.prepare('UPDATE providers SET selected_model_id = ? WHERE provider_id = ?').run(
    modelId,
    providerId
  );
}

export function setProviderDebugMode(enabled: boolean): void {
  const db = getDatabase();
  db.prepare('UPDATE provider_meta SET debug_mode = ? WHERE id = 1').run(enabled ? 1 : 0);
}

export function getProviderDebugMode(): boolean {
  return getMetaRow().debug_mode === 1;
}

export function clearProviderSettings(): void {
  const db = getDatabase();
  db.transaction(() => {
    db.prepare('DELETE FROM providers').run();
    db.prepare(
      'UPDATE provider_meta SET active_provider_id = NULL, debug_mode = 0 WHERE id = 1'
    ).run();
  })();
}

export function getActiveProviderModel(): {
  provider: ProviderId;
  model: string;
  baseUrl?: string;
} | null {
  const activeId = getActiveProviderId();
  if (!activeId) return null;

  const provider = getConnectedProvider(activeId);
  if (!provider || !provider.selectedModelId) return null;

  const result: { provider: ProviderId; model: string; baseUrl?: string } = {
    provider: activeId,
    model: provider.selectedModelId,
  };

  if (provider.credentials.type === 'ollama') {
    result.baseUrl = provider.credentials.serverUrl;
  } else if (provider.credentials.type === 'litellm') {
    result.baseUrl = provider.credentials.serverUrl;
  }

  return result;
}

export function hasReadyProvider(): boolean {
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT COUNT(*) as count FROM providers
       WHERE connection_status = 'connected' AND selected_model_id IS NOT NULL`
    )
    .get() as { count: number };

  return row.count > 0;
}

export function getConnectedProviderIds(): ProviderId[] {
  const db = getDatabase();
  const rows = db
    .prepare("SELECT provider_id FROM providers WHERE connection_status = 'connected'")
    .all() as Array<{ provider_id: string }>;

  return rows.map((r) => r.provider_id as ProviderId);
}
```

**Step 2: Verify types**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/desktop/src/main/store/repositories/providerSettings.ts
git commit -m "feat(storage): add provider settings repository"
```

---

## Task 8: Create Task History Repository

**Files:**
- Create: `apps/desktop/src/main/store/repositories/taskHistory.ts`

**Step 1: Create the repository**

```typescript
// apps/desktop/src/main/store/repositories/taskHistory.ts

import type { Task, TaskMessage, TaskStatus, TaskAttachment } from '@accomplish/shared';
import { getDatabase } from '../db';

export interface StoredTask {
  id: string;
  prompt: string;
  summary?: string;
  status: TaskStatus;
  messages: TaskMessage[];
  sessionId?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

interface TaskRow {
  id: string;
  prompt: string;
  summary: string | null;
  status: string;
  session_id: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface MessageRow {
  id: string;
  task_id: string;
  type: string;
  content: string;
  tool_name: string | null;
  tool_input: string | null;
  timestamp: string;
  sort_order: number;
}

interface AttachmentRow {
  id: number;
  message_id: string;
  type: string;
  data: string;
  label: string | null;
}

const MAX_HISTORY_ITEMS = 100;

function getMessagesForTask(taskId: string): TaskMessage[] {
  const db = getDatabase();

  const messageRows = db
    .prepare(
      'SELECT * FROM task_messages WHERE task_id = ? ORDER BY sort_order ASC'
    )
    .all(taskId) as MessageRow[];

  const messages: TaskMessage[] = [];

  for (const row of messageRows) {
    const attachmentRows = db
      .prepare('SELECT * FROM task_attachments WHERE message_id = ?')
      .all(row.id) as AttachmentRow[];

    const attachments: TaskAttachment[] | undefined =
      attachmentRows.length > 0
        ? attachmentRows.map((a) => ({
            type: a.type as 'screenshot' | 'json',
            data: a.data,
            label: a.label || undefined,
          }))
        : undefined;

    messages.push({
      id: row.id,
      type: row.type as TaskMessage['type'],
      content: row.content,
      toolName: row.tool_name || undefined,
      toolInput: row.tool_input ? JSON.parse(row.tool_input) : undefined,
      timestamp: row.timestamp,
      attachments,
    });
  }

  return messages;
}

function rowToTask(row: TaskRow): StoredTask {
  return {
    id: row.id,
    prompt: row.prompt,
    summary: row.summary || undefined,
    status: row.status as TaskStatus,
    sessionId: row.session_id || undefined,
    createdAt: row.created_at,
    startedAt: row.started_at || undefined,
    completedAt: row.completed_at || undefined,
    messages: getMessagesForTask(row.id),
  };
}

export function getTasks(): StoredTask[] {
  const db = getDatabase();
  const rows = db
    .prepare('SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?')
    .all(MAX_HISTORY_ITEMS) as TaskRow[];

  return rows.map(rowToTask);
}

export function getTask(taskId: string): StoredTask | undefined {
  const db = getDatabase();
  const row = db
    .prepare('SELECT * FROM tasks WHERE id = ?')
    .get(taskId) as TaskRow | undefined;

  return row ? rowToTask(row) : undefined;
}

export function saveTask(task: Task): void {
  const db = getDatabase();

  db.transaction(() => {
    // Upsert task
    db.prepare(
      `INSERT OR REPLACE INTO tasks
        (id, prompt, summary, status, session_id, created_at, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      task.id,
      task.prompt,
      task.summary || null,
      task.status,
      task.sessionId || null,
      task.createdAt,
      task.startedAt || null,
      task.completedAt || null
    );

    // Delete existing messages and attachments (cascade handles attachments)
    db.prepare('DELETE FROM task_messages WHERE task_id = ?').run(task.id);

    // Insert messages
    const insertMessage = db.prepare(
      `INSERT INTO task_messages
        (id, task_id, type, content, tool_name, tool_input, timestamp, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const insertAttachment = db.prepare(
      `INSERT INTO task_attachments (message_id, type, data, label) VALUES (?, ?, ?, ?)`
    );

    let sortOrder = 0;
    for (const msg of task.messages || []) {
      insertMessage.run(
        msg.id,
        task.id,
        msg.type,
        msg.content,
        msg.toolName || null,
        msg.toolInput ? JSON.stringify(msg.toolInput) : null,
        msg.timestamp,
        sortOrder++
      );

      if (msg.attachments) {
        for (const att of msg.attachments) {
          insertAttachment.run(msg.id, att.type, att.data, att.label || null);
        }
      }
    }

    // Enforce max history limit
    db.prepare(
      `DELETE FROM tasks WHERE id NOT IN (
        SELECT id FROM tasks ORDER BY created_at DESC LIMIT ?
      )`
    ).run(MAX_HISTORY_ITEMS);
  })();
}

export function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
  completedAt?: string
): void {
  const db = getDatabase();

  if (completedAt) {
    db.prepare('UPDATE tasks SET status = ?, completed_at = ? WHERE id = ?').run(
      status,
      completedAt,
      taskId
    );
  } else {
    db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(status, taskId);
  }
}

export function addTaskMessage(taskId: string, message: TaskMessage): void {
  const db = getDatabase();

  db.transaction(() => {
    // Get the next sort_order
    const maxOrder = db
      .prepare('SELECT MAX(sort_order) as max FROM task_messages WHERE task_id = ?')
      .get(taskId) as { max: number | null };

    const sortOrder = (maxOrder.max ?? -1) + 1;

    db.prepare(
      `INSERT INTO task_messages
        (id, task_id, type, content, tool_name, tool_input, timestamp, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      message.id,
      taskId,
      message.type,
      message.content,
      message.toolName || null,
      message.toolInput ? JSON.stringify(message.toolInput) : null,
      message.timestamp,
      sortOrder
    );

    if (message.attachments) {
      const insertAttachment = db.prepare(
        `INSERT INTO task_attachments (message_id, type, data, label) VALUES (?, ?, ?, ?)`
      );

      for (const att of message.attachments) {
        insertAttachment.run(message.id, att.type, att.data, att.label || null);
      }
    }
  })();
}

export function updateTaskSessionId(taskId: string, sessionId: string): void {
  const db = getDatabase();
  db.prepare('UPDATE tasks SET session_id = ? WHERE id = ?').run(sessionId, taskId);
}

export function updateTaskSummary(taskId: string, summary: string): void {
  const db = getDatabase();
  db.prepare('UPDATE tasks SET summary = ? WHERE id = ?').run(summary, taskId);
}

export function deleteTask(taskId: string): void {
  const db = getDatabase();
  db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
}

export function clearHistory(): void {
  const db = getDatabase();
  db.prepare('DELETE FROM tasks').run();
}

export function setMaxHistoryItems(_max: number): void {
  // Note: MAX_HISTORY_ITEMS is a constant now, but we keep this function
  // for API compatibility. In the future, this could be stored in a settings table.
  console.log('[TaskHistory] setMaxHistoryItems is deprecated, using constant limit');
}

export function clearTaskHistoryStore(): void {
  clearHistory();
}

// For backwards compatibility with the debounced flush
export function flushPendingTasks(): void {
  // No-op: SQLite writes are immediate, no debouncing needed
}
```

**Step 2: Verify types**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/desktop/src/main/store/repositories/taskHistory.ts
git commit -m "feat(storage): add task history repository"
```

---

## Task 9: Update Main Process Startup

**Files:**
- Modify: `apps/desktop/src/main/index.ts:1-10` (imports)
- Modify: `apps/desktop/src/main/index.ts:144-156` (whenReady)
- Modify: `apps/desktop/src/main/index.ts:191-197` (before-quit)

**Step 1: Update imports**

Add at top of file (around line 7):
```typescript
import { getDatabase, closeDatabase } from './store/db';
import { runMigrations, FutureSchemaError } from './store/migrations';
```

**Step 2: Update app.whenReady to initialize database**

Replace the `app.whenReady().then(async () => {` block (lines 144-181) with:

```typescript
  app.whenReady().then(async () => {
    console.log('[Main] Electron app ready, version:', app.getVersion());

    // Initialize database and run migrations
    try {
      const db = getDatabase();
      runMigrations(db);
      console.log('[Main] Database initialized');
    } catch (err) {
      if (err instanceof FutureSchemaError) {
        const { dialog } = await import('electron');
        await dialog.showMessageBox({
          type: 'error',
          title: 'Update Required',
          message: `This data was created by a newer version of Openwork (schema v${err.storedVersion}).`,
          detail: `Your app supports up to schema v${err.appVersion}. Please update Openwork to continue.`,
          buttons: ['Quit'],
        });
        app.quit();
        return;
      }
      console.error('[Main] Database initialization failed:', err);
      throw err;
    }

    // Check for fresh install and cleanup old data (now handled by migration)
    // The migration imports legacy data automatically, so this is now just for
    // detecting reinstalls via bundle mtime
    try {
      const didCleanup = await checkAndCleanupFreshInstall();
      if (didCleanup) {
        console.log('[Main] Cleaned up data from previous installation');
      }
    } catch (err) {
      console.error('[Main] Fresh install cleanup failed:', err);
    }

    // Set dock icon on macOS
    if (process.platform === 'darwin' && app.dock) {
      const iconPath = app.isPackaged
        ? path.join(process.resourcesPath, 'icon.png')
        : path.join(process.env.APP_ROOT!, 'resources', 'icon.png');
      const icon = nativeImage.createFromPath(iconPath);
      if (!icon.isEmpty()) {
        app.dock.setIcon(icon);
      }
    }

    // Register IPC handlers before creating window
    registerIPCHandlers();
    console.log('[Main] IPC handlers registered');

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
        console.log('[Main] Application reactivated; recreated window');
      }
    });
  });
```

**Step 3: Update before-quit handler**

Replace the `app.on('before-quit', ...)` handler (around line 192) with:

```typescript
app.on('before-quit', () => {
  console.log('[Main] App before-quit event fired');
  flushPendingTasks(); // No-op for SQLite, kept for compatibility
  disposeTaskManager();
  closeDatabase(); // Close SQLite connection
});
```

**Step 4: Verify types**

Run: `pnpm typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/src/main/index.ts
git commit -m "feat(storage): integrate SQLite in main process startup"
```

---

## Task 10: Replace Old Store Imports Throughout Codebase

**Files:**
- Modify: `apps/desktop/src/main/store/appSettings.ts` (redirect exports)
- Modify: `apps/desktop/src/main/store/providerSettings.ts` (redirect exports)
- Modify: `apps/desktop/src/main/store/taskHistory.ts` (redirect exports)

**Step 1: Replace appSettings.ts with re-exports**

Replace entire contents of `apps/desktop/src/main/store/appSettings.ts`:

```typescript
// Re-export from new SQLite repository for backwards compatibility
export {
  getDebugMode,
  setDebugMode,
  getOnboardingComplete,
  setOnboardingComplete,
  getSelectedModel,
  setSelectedModel,
  getOllamaConfig,
  setOllamaConfig,
  getLiteLLMConfig,
  setLiteLLMConfig,
  getAppSettings,
  clearAppSettings,
} from './repositories/appSettings';
```

**Step 2: Replace providerSettings.ts with re-exports**

Replace entire contents of `apps/desktop/src/main/store/providerSettings.ts`:

```typescript
// Re-export from new SQLite repository for backwards compatibility
export {
  getProviderSettings,
  setActiveProvider,
  getActiveProviderId,
  getConnectedProvider,
  setConnectedProvider,
  removeConnectedProvider,
  updateProviderModel,
  setProviderDebugMode,
  getProviderDebugMode,
  clearProviderSettings,
  getActiveProviderModel,
  hasReadyProvider,
  getConnectedProviderIds,
} from './repositories/providerSettings';
```

**Step 3: Replace taskHistory.ts with re-exports**

Replace entire contents of `apps/desktop/src/main/store/taskHistory.ts`:

```typescript
// Re-export from new SQLite repository for backwards compatibility
export type { StoredTask } from './repositories/taskHistory';
export {
  getTasks,
  getTask,
  saveTask,
  updateTaskStatus,
  addTaskMessage,
  updateTaskSessionId,
  updateTaskSummary,
  deleteTask,
  clearHistory,
  setMaxHistoryItems,
  clearTaskHistoryStore,
  flushPendingTasks,
} from './repositories/taskHistory';
```

**Step 4: Verify types**

Run: `pnpm typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/src/main/store/appSettings.ts apps/desktop/src/main/store/providerSettings.ts apps/desktop/src/main/store/taskHistory.ts
git commit -m "refactor(storage): replace old stores with SQLite re-exports"
```

---

## Task 11: Update electron-builder Config

**Files:**
- Modify: `apps/desktop/package.json:103-126` (build.files and build.asarUnpack)

**Step 1: Add better-sqlite3 to files and asarUnpack**

In the `build.files` array, add:
```json
"node_modules/better-sqlite3/**"
```

In the `build.asarUnpack` array, add:
```json
"node_modules/better-sqlite3/build/**/*.node",
"node_modules/better-sqlite3/package.json"
```

**Step 2: Verify build still works**

Run: `pnpm build`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/desktop/package.json
git commit -m "build(storage): add better-sqlite3 to electron-builder config"
```

---

## Task 12: Test the Migration End-to-End

**Step 1: Clean start with existing JSON data**

```bash
# Create some test data first using old stores (start app, go through onboarding)
pnpm dev
# Complete onboarding, run a task, then quit

# Verify JSON files exist
ls -la ~/Library/Application\ Support/Openwork/*.json
```

**Step 2: Run with new SQLite code**

```bash
pnpm dev
```

**Step 3: Verify migration**

```bash
# Check SQLite database was created
ls -la ~/Library/Application\ Support/Openwork/*.db

# Check JSON files were renamed
ls -la ~/Library/Application\ Support/Openwork/*.migrated

# Verify data was preserved (app should show same state)
```

**Step 4: Clean start test**

```bash
CLEAN_START=1 pnpm dev
# Should work with fresh database
```

**Step 5: Commit any fixes if needed**

---

## Task 13: Update CLAUDE.md Documentation

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add SQLite documentation section**

Add after the "Store" section (around line 30):

```markdown
### SQLite Database

The app uses SQLite (better-sqlite3) for persistent storage:
- Database file: `{userData}/openwork.db` (or `openwork-dev.db` in dev)
- Schema migrations in `src/main/store/migrations/`
- Repositories in `src/main/store/repositories/`

**Adding a new migration:**
1. Create `src/main/store/migrations/vNNN-description.ts`
2. Call `registerMigration({ version: N, up: (db) => {...} })`
3. Increment `CURRENT_VERSION` in `migrations/index.ts`
4. Import the new migration file in `migrations/index.ts`
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add SQLite storage documentation"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Add better-sqlite3 dependency | package.json |
| 2 | Create migration error classes | migrations/errors.ts |
| 3 | Create database connection module | db.ts |
| 4 | Create migration runner | migrations/index.ts |
| 5 | Create initial migration with legacy import | migrations/v001-initial.ts |
| 6 | Create app settings repository | repositories/appSettings.ts |
| 7 | Create provider settings repository | repositories/providerSettings.ts |
| 8 | Create task history repository | repositories/taskHistory.ts |
| 9 | Update main process startup | index.ts |
| 10 | Replace old store imports | appSettings.ts, providerSettings.ts, taskHistory.ts |
| 11 | Update electron-builder config | package.json |
| 12 | Test migration end-to-end | (manual testing) |
| 13 | Update documentation | CLAUDE.md |
