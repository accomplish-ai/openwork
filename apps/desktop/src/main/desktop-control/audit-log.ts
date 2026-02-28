/**
 * Audit Log — in-memory ring buffer for desktop-control operation tracing.
 *
 * Records structured entries for every service operation (readiness checks,
 * live-screen sessions, action execution). Entries auto-evict once the
 * buffer exceeds MAX_ENTRIES.
 */

export type AuditAction =
  | 'readiness_check'
  | 'action_execute'
  | 'live_screen_start'
  | 'live_screen_stop'
  | 'live_screen_frame'
  | 'context_capture'
  | 'clear_sensitive_data';

export type AuditOutcome = 'success' | 'failure' | 'rate_limited' | 'permission_denied';

export interface AuditEntry {
  timestamp: number;
  action: AuditAction;
  outcome: AuditOutcome;
  sessionId?: string;
  durationMs?: number;
  details?: Record<string, unknown>;
}

const MAX_ENTRIES = 500;

export class AuditLog {
  private entries: AuditEntry[] = [];

  record(entry: AuditEntry): void {
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(-MAX_ENTRIES);
    }
  }

  getEntries(): ReadonlyArray<AuditEntry> {
    return this.entries;
  }

  getRecentEntries(count: number): ReadonlyArray<AuditEntry> {
    return this.entries.slice(-count);
  }

  getEntriesByAction(action: AuditAction): ReadonlyArray<AuditEntry> {
    return this.entries.filter((e) => e.action === action);
  }

  getEntriesSince(since: number): ReadonlyArray<AuditEntry> {
    return this.entries.filter((e) => e.timestamp >= since);
  }

  size(): number {
    return this.entries.length;
  }

  clear(): void {
    this.entries = [];
  }
}

let defaultAuditLog: AuditLog | null = null;

export function getAuditLog(): AuditLog {
  if (!defaultAuditLog) {
    defaultAuditLog = new AuditLog();
  }
  return defaultAuditLog;
}

export function resetAuditLog(): void {
  defaultAuditLog = null;
}
