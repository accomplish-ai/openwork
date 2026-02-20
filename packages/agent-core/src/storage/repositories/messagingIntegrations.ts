import type { MessagingProviderId, MessagingConnectionStatus, MessagingIntegrationConfig } from '../../common/types/messaging.js';
import { getDatabase } from '../database.js';

interface MessagingIntegrationRow {
  provider_id: string;
  enabled: number;
  status: string;
  phone_number: string | null;
  owner_jid: string | null;
  owner_lid: string | null;
  last_connected_at: number | null;
}

function rowToConfig(row: MessagingIntegrationRow): MessagingIntegrationConfig {
  return {
    providerId: row.provider_id as MessagingProviderId,
    enabled: row.enabled === 1,
    status: row.status as MessagingConnectionStatus,
    phoneNumber: row.phone_number ?? undefined,
    ownerJid: row.owner_jid ?? undefined,
    ownerLid: row.owner_lid ?? undefined,
    lastConnectedAt: row.last_connected_at ?? undefined,
  };
}

export function getMessagingConfig(providerId: MessagingProviderId): MessagingIntegrationConfig | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM messaging_integrations WHERE provider_id = ?').get(providerId) as MessagingIntegrationRow | undefined;
  return row ? rowToConfig(row) : null;
}

export function upsertMessagingConfig(
  providerId: MessagingProviderId,
  config: Omit<MessagingIntegrationConfig, 'providerId'>,
): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO messaging_integrations (provider_id, enabled, status, phone_number, owner_jid, owner_lid, last_connected_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(provider_id) DO UPDATE SET
      enabled = excluded.enabled,
      status = excluded.status,
      phone_number = COALESCE(excluded.phone_number, phone_number),
      owner_jid = COALESCE(excluded.owner_jid, owner_jid),
      owner_lid = COALESCE(excluded.owner_lid, owner_lid),
      last_connected_at = COALESCE(excluded.last_connected_at, last_connected_at),
      updated_at = datetime('now')
  `).run(providerId, config.enabled ? 1 : 0, config.status, config.phoneNumber ?? null, config.ownerJid ?? null, config.ownerLid ?? null, config.lastConnectedAt ?? null);
}

export function setMessagingStatus(providerId: MessagingProviderId, status: MessagingConnectionStatus): void {
  const db = getDatabase();
  db.prepare("UPDATE messaging_integrations SET status = ?, updated_at = datetime('now') WHERE provider_id = ?").run(status, providerId);
}

export function deleteMessagingConfig(providerId: MessagingProviderId): void {
  const db = getDatabase();
  db.prepare('DELETE FROM messaging_integrations WHERE provider_id = ?').run(providerId);
}
