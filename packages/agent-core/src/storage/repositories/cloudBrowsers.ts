import type { CloudBrowserConfig, CloudBrowserProviderId } from '../../common/types/cloudBrowser.js';
import { getDatabase } from '../database.js';

interface CloudBrowserRow {
  provider_id: string;
  config: string;
  enabled: number;
  last_validated: number | null;
  created_at: string;
  updated_at: string;
}

export function getCloudBrowserConfig(providerId: CloudBrowserProviderId): CloudBrowserConfig | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM cloud_browsers WHERE provider_id = ?').get(providerId) as CloudBrowserRow | undefined;
  if (!row) {
    return null;
  }
  return {
    providerId: row.provider_id as CloudBrowserProviderId,
    config: row.config,
    enabled: row.enabled === 1,
    lastValidated: row.last_validated ?? undefined,
  };
}

export function setCloudBrowserConfig(providerId: CloudBrowserProviderId, config: string, enabled: boolean): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO cloud_browsers (provider_id, config, enabled, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(provider_id) DO UPDATE SET
      config = excluded.config,
      enabled = excluded.enabled,
      updated_at = datetime('now')
  `).run(providerId, config, enabled ? 1 : 0);
}

export function deleteCloudBrowserConfig(providerId: CloudBrowserProviderId): void {
  const db = getDatabase();
  db.prepare('DELETE FROM cloud_browsers WHERE provider_id = ?').run(providerId);
}

export function setCloudBrowserLastValidated(providerId: CloudBrowserProviderId, timestamp: number): void {
  const db = getDatabase();
  const result = db.prepare("UPDATE cloud_browsers SET last_validated = ?, updated_at = datetime('now') WHERE provider_id = ?").run(timestamp, providerId);
  if (result.changes === 0) {
    console.warn(`[CloudBrowsers] No config found for provider '${providerId}' to update last_validated`);
  }
}
