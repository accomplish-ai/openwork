import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Mock socket-path so acquirePidLock defaults don't touch the real home directory
vi.mock('../../../src/daemon/socket-path.js', () => ({
  getPidFilePath: () => '/tmp/mock-daemon.pid',
  getDaemonDir: () => '/tmp',
}));

import { acquirePidLock, PidLockError } from '../../../src/daemon/pid-lock.js';
import type { PidLockPayload } from '../../../src/daemon/pid-lock.js';

describe('acquirePidLock', () => {
  let tmpDir: string;
  let pidPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pid-lock-test-'));
    pidPath = path.join(tmpDir, 'daemon.pid');
  });

  afterEach(() => {
    // Clean up temp directory
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('successfully acquires a lock when no lock file exists', () => {
    const handle = acquirePidLock(pidPath);
    expect(handle).toBeDefined();
    expect(handle.pidPath).toBe(pidPath);
    expect(typeof handle.release).toBe('function');
    expect(fs.existsSync(pidPath)).toBe(true);
    handle.release();
  });

  it('release removes the lock file', () => {
    const handle = acquirePidLock(pidPath);
    expect(fs.existsSync(pidPath)).toBe(true);
    handle.release();
    expect(fs.existsSync(pidPath)).toBe(false);
  });

  it('throws PidLockError when another live process holds the lock', () => {
    // Write a lock file with the current process PID (which is alive)
    const payload: PidLockPayload = {
      pid: process.pid,
      createdAt: new Date().toISOString(),
      startTime: Date.now(),
    };
    fs.writeFileSync(pidPath, JSON.stringify(payload));

    expect(() => acquirePidLock(pidPath)).toThrow(PidLockError);
    try {
      acquirePidLock(pidPath);
    } catch (err) {
      expect(err).toBeInstanceOf(PidLockError);
      expect((err as PidLockError).existingPid).toBe(process.pid);
    }
  });

  it('removes stale lock (dead PID) and acquires successfully', () => {
    // Use a PID that is extremely unlikely to be alive
    const deadPid = 999999;
    const payload: PidLockPayload = {
      pid: deadPid,
      createdAt: new Date(Date.now() - 120_000).toISOString(),
      startTime: Date.now() - 120_000,
    };
    fs.writeFileSync(pidPath, JSON.stringify(payload));

    const handle = acquirePidLock(pidPath);
    expect(handle).toBeDefined();
    expect(handle.pidPath).toBe(pidPath);

    // Verify the new lock file contains current process PID
    const newPayload = JSON.parse(fs.readFileSync(pidPath, 'utf-8')) as PidLockPayload;
    expect(newPayload.pid).toBe(process.pid);
    handle.release();
  });

  it('double release is a no-op (does not throw)', () => {
    const handle = acquirePidLock(pidPath);
    handle.release();
    expect(() => handle.release()).not.toThrow();
  });

  it('lock file contains valid JSON with pid, createdAt, startTime', () => {
    const handle = acquirePidLock(pidPath);
    const raw = fs.readFileSync(pidPath, 'utf-8');
    const payload = JSON.parse(raw) as PidLockPayload;

    expect(typeof payload.pid).toBe('number');
    expect(payload.pid).toBe(process.pid);
    expect(typeof payload.createdAt).toBe('string');
    // Verify createdAt is a valid ISO date string
    expect(Number.isNaN(Date.parse(payload.createdAt))).toBe(false);
    expect(typeof payload.startTime).toBe('number');
    expect(payload.startTime).toBeGreaterThan(0);

    handle.release();
  });
});
