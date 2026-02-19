import { getDatabase } from '../database.js';
import type {
  CloudProviderAccount,
  CloudBrowserProviderId,
  CloudBrowserConfig,
} from '../../common/types/cloudProviders.js';
import { safeParseJsonWithFallback } from '../../utils/json.js';
import { encryptString, decryptString, isEncryptionAvailable } from '../encryption.js';

interface CloudProviderRow {
  id: number;
  provider_id: string;
  config: string | null;
  enabled: number;
  created_at: number;
  updated_at: number;
}

export function getAllCloudProviders(): CloudProviderAccount[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM cloud_providers').all() as CloudProviderRow[];

  return rows.map((row) => ({
    id: String(row.id),
    providerId: row.provider_id as CloudBrowserProviderId,
    name: formatProviderName(row.provider_id),
    config: parseConfig(row.config),
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function getCloudProvider(providerId: CloudBrowserProviderId): CloudProviderAccount | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM cloud_providers WHERE provider_id = ?').get(providerId) as
    | CloudProviderRow
    | undefined;

  if (!row) return null;

  return {
    id: String(row.id),
    providerId: row.provider_id as CloudBrowserProviderId,
    name: formatProviderName(row.provider_id),
    config: parseConfig(row.config),
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function saveCloudProviderConfig(
  providerId: CloudBrowserProviderId,
  config: CloudBrowserConfig['config'],
): void {
  const db = getDatabase();
  const now = Date.now();

  let configString = JSON.stringify(config);
  if (isEncryptionAvailable()) {
    try {
      const encrypted = encryptString(configString);
      configString = `enc:${encrypted.toString('base64')}`;
    } catch (error) {
      console.error('Failed to encrypt cloud provider config:', error);
      throw error;
    }
  } else {
    throw new Error('Encryption is not available. Cannot save cloud provider config securely.');
  }

  const existing = db
    .prepare('SELECT id FROM cloud_providers WHERE provider_id = ?')
    .get(providerId);

  if (existing) {
    db.prepare(
      `
      UPDATE cloud_providers 
      SET config = ?, updated_at = ? 
      WHERE provider_id = ?
    `,
    ).run(configString, now, providerId);
  } else {
    db.prepare(
      `
      INSERT INTO cloud_providers (provider_id, config, enabled, created_at, updated_at)
      VALUES (?, ?, 1, ?, ?)
    `,
    ).run(providerId, configString, now, now);
  }
}

export function setCloudProviderEnabled(
  providerId: CloudBrowserProviderId,
  enabled: boolean,
): void {
  const db = getDatabase();
  db.prepare('UPDATE cloud_providers SET enabled = ?, updated_at = ? WHERE provider_id = ?').run(
    enabled ? 1 : 0,
    Date.now(),
    providerId,
  );
}

function formatProviderName(id: string): string {
  if (id === 'browserbase') return 'Browserbase';
  if (id === 'brightdata') return 'Bright Data';
  return id;
}

function parseConfig(configStr: string | null): CloudBrowserConfig {
  if (!configStr) return {} as CloudBrowserConfig;

  if (configStr.startsWith('enc:')) {
    try {
      const base64 = configStr.slice(4);
      const buffer = Buffer.from(base64, 'base64');
      const decrypted = decryptString(buffer);
      const parsed = safeParseJsonWithFallback(decrypted);
      return (parsed || {}) as CloudBrowserConfig;
    } catch (error) {
      console.error('Failed to decrypt config:', error);
      return {} as CloudBrowserConfig;
    }
  }

  const parsed = safeParseJsonWithFallback(configStr);
  return (parsed || {}) as CloudBrowserConfig;
}
