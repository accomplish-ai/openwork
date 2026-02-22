import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  isAbortError,
  isFatalError,
  isTransientError,
  installCrashHandlers,
} from '../../../src/daemon/unhandled-rejections.js';

describe('unhandled-rejections', () => {
  describe('isAbortError', () => {
    it('detects AbortError by name', () => {
      const err = new Error('some message');
      err.name = 'AbortError';
      expect(isAbortError(err)).toBe(true);
    });

    it('detects AbortError by message', () => {
      const err = new Error('This operation was aborted');
      expect(isAbortError(err)).toBe(true);
    });

    it('returns false for a regular error', () => {
      const err = new Error('Something went wrong');
      expect(isAbortError(err)).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(isAbortError(null)).toBe(false);
      expect(isAbortError(undefined)).toBe(false);
    });

    it('returns false for non-object', () => {
      expect(isAbortError('AbortError')).toBe(false);
      expect(isAbortError(42)).toBe(false);
    });
  });

  describe('isFatalError', () => {
    it('detects ERR_OUT_OF_MEMORY', () => {
      const err = Object.assign(new Error('OOM'), { code: 'ERR_OUT_OF_MEMORY' });
      expect(isFatalError(err)).toBe(true);
    });

    it('detects ERR_SCRIPT_EXECUTION_TIMEOUT', () => {
      const err = Object.assign(new Error('timeout'), { code: 'ERR_SCRIPT_EXECUTION_TIMEOUT' });
      expect(isFatalError(err)).toBe(true);
    });

    it('detects ERR_WORKER_OUT_OF_MEMORY', () => {
      const err = Object.assign(new Error('worker OOM'), { code: 'ERR_WORKER_OUT_OF_MEMORY' });
      expect(isFatalError(err)).toBe(true);
    });

    it('detects ERR_WORKER_UNCAUGHT_EXCEPTION', () => {
      const err = Object.assign(new Error('worker uncaught'), {
        code: 'ERR_WORKER_UNCAUGHT_EXCEPTION',
      });
      expect(isFatalError(err)).toBe(true);
    });

    it('detects ERR_WORKER_INITIALIZATION_FAILED', () => {
      const err = Object.assign(new Error('worker init'), {
        code: 'ERR_WORKER_INITIALIZATION_FAILED',
      });
      expect(isFatalError(err)).toBe(true);
    });

    it('returns false for non-fatal errors', () => {
      const err = Object.assign(new Error('normal'), { code: 'ECONNRESET' });
      expect(isFatalError(err)).toBe(false);
    });

    it('returns false for errors without code', () => {
      expect(isFatalError(new Error('generic'))).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(isFatalError(null)).toBe(false);
      expect(isFatalError(undefined)).toBe(false);
    });
  });

  describe('isTransientError', () => {
    it('detects ECONNRESET', () => {
      const err = Object.assign(new Error('reset'), { code: 'ECONNRESET' });
      expect(isTransientError(err)).toBe(true);
    });

    it('detects ETIMEDOUT', () => {
      const err = Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' });
      expect(isTransientError(err)).toBe(true);
    });

    it('detects ECONNREFUSED', () => {
      const err = Object.assign(new Error('refused'), { code: 'ECONNREFUSED' });
      expect(isTransientError(err)).toBe(true);
    });

    it('detects ENOTFOUND', () => {
      const err = Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
      expect(isTransientError(err)).toBe(true);
    });

    it('detects EPIPE', () => {
      const err = Object.assign(new Error('pipe'), { code: 'EPIPE' });
      expect(isTransientError(err)).toBe(true);
    });

    it('detects UND_ERR_CONNECT_TIMEOUT', () => {
      const err = Object.assign(new Error('connect timeout'), { code: 'UND_ERR_CONNECT_TIMEOUT' });
      expect(isTransientError(err)).toBe(true);
    });

    it('follows cause chain to find transient code', () => {
      const cause = Object.assign(new Error('inner'), { code: 'ECONNRESET' });
      const outer = Object.assign(new Error('outer'), { cause });
      expect(isTransientError(outer)).toBe(true);
    });

    it('follows deeply nested cause chain', () => {
      const innermost = Object.assign(new Error('innermost'), { code: 'ETIMEDOUT' });
      const middle = Object.assign(new Error('middle'), { cause: innermost });
      const outer = Object.assign(new Error('outer'), { cause: middle });
      expect(isTransientError(outer)).toBe(true);
    });

    it("handles TypeError('fetch failed') without cause", () => {
      const err = new TypeError('fetch failed');
      expect(isTransientError(err)).toBe(true);
    });

    it("handles TypeError('fetch failed') with transient cause", () => {
      const cause = Object.assign(new Error('connect'), { code: 'ECONNREFUSED' });
      const err = Object.assign(new TypeError('fetch failed'), { cause });
      expect(isTransientError(err)).toBe(true);
    });

    it('returns false for non-transient errors', () => {
      const err = Object.assign(new Error('fatal'), { code: 'ERR_OUT_OF_MEMORY' });
      expect(isTransientError(err)).toBe(false);
    });

    it('returns false for errors without code or cause', () => {
      expect(isTransientError(new Error('generic'))).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(isTransientError(null)).toBe(false);
      expect(isTransientError(undefined)).toBe(false);
    });

    it('detects transient error in AggregateError', () => {
      const transient = Object.assign(new Error('reset'), { code: 'ECONNRESET' });
      const normal = new Error('normal');
      const agg = new AggregateError([normal, transient], 'aggregate');
      expect(isTransientError(agg)).toBe(true);
    });
  });

  describe('installCrashHandlers', () => {
    afterEach(() => {
      process.removeAllListeners('unhandledRejection');
      process.removeAllListeners('uncaughtException');
    });

    it('registers process event handlers', () => {
      const listenersBefore = {
        rejection: process.listenerCount('unhandledRejection'),
        exception: process.listenerCount('uncaughtException'),
      };

      installCrashHandlers();

      expect(process.listenerCount('unhandledRejection')).toBe(listenersBefore.rejection + 1);
      expect(process.listenerCount('uncaughtException')).toBe(listenersBefore.exception + 1);
    });

    it('uses the provided logger', () => {
      const logger = {
        warn: vi.fn(),
        error: vi.fn(),
      };

      installCrashHandlers({ logger });

      // Emit an abort error rejection - should be warned, not errored
      const abortErr = new Error('This operation was aborted');
      process.emit('unhandledRejection', abortErr, Promise.resolve());

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Suppressed AbortError'),
      );
    });
  });
});
