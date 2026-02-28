import { describe, expect, it, beforeEach } from 'vitest';
import { AuditLog, getAuditLog, resetAuditLog, type AuditEntry } from '@main/desktop-control/audit-log';

function makeEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    timestamp: Date.now(),
    action: 'readiness_check',
    outcome: 'success',
    ...overrides,
  };
}

describe('AuditLog', () => {
  let log: AuditLog;

  beforeEach(() => {
    log = new AuditLog();
  });

  it('starts empty', () => {
    expect(log.size()).toBe(0);
    expect(log.getEntries()).toEqual([]);
  });

  it('records entries and returns them', () => {
    log.record(makeEntry());
    log.record(makeEntry({ action: 'action_execute' }));

    expect(log.size()).toBe(2);
    expect(log.getEntries()[0].action).toBe('readiness_check');
    expect(log.getEntries()[1].action).toBe('action_execute');
  });

  it('evicts oldest entries when exceeding max capacity (500)', () => {
    for (let i = 0; i < 510; i++) {
      log.record(makeEntry({ timestamp: i }));
    }

    expect(log.size()).toBe(500);
    // The first entry should be timestamp 10 (first 10 evicted)
    expect(log.getEntries()[0].timestamp).toBe(10);
  });

  it('returns recent entries', () => {
    for (let i = 0; i < 10; i++) {
      log.record(makeEntry({ timestamp: i }));
    }

    const recent = log.getRecentEntries(3);
    expect(recent).toHaveLength(3);
    expect(recent[0].timestamp).toBe(7);
    expect(recent[2].timestamp).toBe(9);
  });

  it('filters entries by action', () => {
    log.record(makeEntry({ action: 'readiness_check' }));
    log.record(makeEntry({ action: 'action_execute' }));
    log.record(makeEntry({ action: 'readiness_check' }));

    const filtered = log.getEntriesByAction('readiness_check');
    expect(filtered).toHaveLength(2);
  });

  it('filters entries since a timestamp', () => {
    log.record(makeEntry({ timestamp: 100 }));
    log.record(makeEntry({ timestamp: 200 }));
    log.record(makeEntry({ timestamp: 300 }));

    const since = log.getEntriesSince(200);
    expect(since).toHaveLength(2);
  });

  it('clears all entries', () => {
    log.record(makeEntry());
    log.record(makeEntry());
    log.clear();

    expect(log.size()).toBe(0);
    expect(log.getEntries()).toEqual([]);
  });

  it('records optional fields', () => {
    log.record(
      makeEntry({
        sessionId: 'session-1',
        durationMs: 42,
        details: { foo: 'bar' },
      }),
    );

    const entry = log.getEntries()[0];
    expect(entry.sessionId).toBe('session-1');
    expect(entry.durationMs).toBe(42);
    expect(entry.details).toEqual({ foo: 'bar' });
  });
});

describe('getAuditLog / resetAuditLog', () => {
  beforeEach(() => {
    resetAuditLog();
  });

  it('returns a singleton instance', () => {
    const a = getAuditLog();
    const b = getAuditLog();
    expect(a).toBe(b);
  });

  it('resets the singleton', () => {
    const a = getAuditLog();
    a.record(makeEntry());
    expect(a.size()).toBe(1);

    resetAuditLog();

    const b = getAuditLog();
    expect(b).not.toBe(a);
    expect(b.size()).toBe(0);
  });
});
