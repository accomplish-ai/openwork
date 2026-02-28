import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { DesktopActionRequest, ToolFailure } from '@accomplish/shared';

// vi.hoisted runs before vi.mock factories, making the mock accessible.
const mocks = vi.hoisted(() => ({
  execFileAsync: vi.fn(),
}));

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('util')>();
  return {
    ...actual,
    promisify: () => mocks.execFileAsync,
  };
});

import {
  executeDesktopAction,
  buildFailure,
  isPermissionError,
  validateCoordinate,
} from '@main/desktop-control/action-executor';

function setupExecFileSuccess(stdout = '', stderr = '') {
  mocks.execFileAsync.mockResolvedValue({ stdout, stderr });
}

function setupExecFileError(error: {
  stderr?: string;
  message?: string;
  code?: string;
  killed?: boolean;
}) {
  const err = Object.assign(new Error(error.message ?? 'exec failed'), {
    stderr: error.stderr,
    code: error.code,
    killed: error.killed,
  });
  mocks.execFileAsync.mockRejectedValue(err);
}

beforeEach(() => {
  mocks.execFileAsync.mockReset();
});

describe('executeDesktopAction', () => {
  describe('move_mouse', () => {
    it('executes python3 with move script and coordinates', async () => {
      setupExecFileSuccess();
      const request: DesktopActionRequest = { type: 'move_mouse', x: 100, y: 200 };
      const result = await executeDesktopAction(request);

      expect(result.action).toEqual({ type: 'move_mouse', x: 100, y: 200 });
      expect(result.message).toContain('100');
      expect(result.message).toContain('200');
      expect(result.executedAt).toBeTruthy();
      expect(mocks.execFileAsync).toHaveBeenCalled();
      expect(mocks.execFileAsync).toHaveBeenCalledWith(
        'python3',
        expect.arrayContaining(['100', '214']),
        expect.any(Object)
      );
    });

    it('clamps coordinates to valid range', async () => {
      setupExecFileSuccess();
      const request: DesktopActionRequest = { type: 'move_mouse', x: -50, y: 200000 };
      const result = await executeDesktopAction(request);

      expect(result.action).toEqual({ type: 'move_mouse', x: 0, y: 100000 });
    });

    it('rounds coordinates to integers', async () => {
      setupExecFileSuccess();
      const request: DesktopActionRequest = { type: 'move_mouse', x: 100.7, y: 200.3 };
      const result = await executeDesktopAction(request);

      expect(result.action).toEqual({ type: 'move_mouse', x: 101, y: 200 });
    });
  });

  describe('click', () => {
    it('executes click at coordinates with default left button', async () => {
      setupExecFileSuccess();
      const request: DesktopActionRequest = { type: 'click', x: 50, y: 75 };
      const result = await executeDesktopAction(request);

      expect(result.action.type).toBe('click');
      expect(result.message).toContain('left');
    });

    it('supports right-click', async () => {
      setupExecFileSuccess();
      const request: DesktopActionRequest = { type: 'click', x: 50, y: 75, button: 'right' };
      const result = await executeDesktopAction(request);

      expect(result.message).toContain('right');
    });
  });

  describe('double_click', () => {
    it('executes double-click at coordinates', async () => {
      setupExecFileSuccess();
      const request: DesktopActionRequest = { type: 'double_click', x: 50, y: 75 };
      const result = await executeDesktopAction(request);

      expect(result.action.type).toBe('double_click');
      expect(result.message).toContain('Double-clicked');
    });
  });

  describe('scroll', () => {
    it('scrolls with default amount', async () => {
      setupExecFileSuccess();
      const request: DesktopActionRequest = { type: 'scroll', direction: 'down' };
      const result = await executeDesktopAction(request);

      expect(result.action.type).toBe('scroll');
      expect(result.message).toContain('down');
    });

    it('rejects invalid direction', async () => {
      const request = { type: 'scroll', direction: 'sideways' } as unknown as DesktopActionRequest;
      await expect(executeDesktopAction(request)).rejects.toMatchObject({
        code: 'ERR_VALIDATION_ERROR',
      });
    });

    it('clamps scroll amount', async () => {
      setupExecFileSuccess();
      const request: DesktopActionRequest = { type: 'scroll', direction: 'up', amount: 999 };
      const result = await executeDesktopAction(request);

      // Amount should be clamped to MAX_SCROLL_AMOUNT (100)
      if (result.action.type === 'scroll') {
        expect(result.action.amount).toBe(100);
      }
    });
  });

  describe('type_text', () => {
    it('types text via osascript', async () => {
      setupExecFileSuccess();
      const request: DesktopActionRequest = { type: 'type_text', text: 'hello' };
      const result = await executeDesktopAction(request);

      expect(result.action.type).toBe('type_text');
      expect(result.message).toContain('5 chars');
    });

    it('rejects empty text', async () => {
      const request: DesktopActionRequest = { type: 'type_text', text: '' };
      await expect(executeDesktopAction(request)).rejects.toMatchObject({
        code: 'ERR_VALIDATION_ERROR',
      });
    });
  });

  describe('press_key', () => {
    it('presses a named key', async () => {
      setupExecFileSuccess();
      const request: DesktopActionRequest = { type: 'press_key', key: 'return' };
      const result = await executeDesktopAction(request);

      expect(result.action.type).toBe('press_key');
      expect(result.message).toContain('return');
    });

    it('presses a key with modifiers', async () => {
      setupExecFileSuccess();
      const request: DesktopActionRequest = {
        type: 'press_key',
        key: 'c',
        modifiers: ['command'],
      };
      const result = await executeDesktopAction(request);

      expect(result.message).toContain('command');
    });

    it('rejects empty key', async () => {
      const request: DesktopActionRequest = { type: 'press_key', key: '' };
      await expect(executeDesktopAction(request)).rejects.toMatchObject({
        code: 'ERR_VALIDATION_ERROR',
      });
    });
  });

  describe('activate_app', () => {
    it('activates an app by name', async () => {
      setupExecFileSuccess();
      const request: DesktopActionRequest = { type: 'activate_app', appName: 'Safari' };
      const result = await executeDesktopAction(request);

      expect(result.action.type).toBe('activate_app');
      expect(result.message).toContain('Safari');
    });

    it('rejects empty app name', async () => {
      const request: DesktopActionRequest = { type: 'activate_app', appName: '' };
      await expect(executeDesktopAction(request)).rejects.toMatchObject({
        code: 'ERR_VALIDATION_ERROR',
      });
    });
  });

  describe('error handling', () => {
    it('throws ERR_PERMISSION_DENIED on accessibility errors', async () => {
      setupExecFileError({ stderr: 'not authorized to perform accessibility actions' });
      const request: DesktopActionRequest = { type: 'move_mouse', x: 100, y: 200 };

      await expect(executeDesktopAction(request)).rejects.toMatchObject({
        code: 'ERR_PERMISSION_DENIED',
      });
    });

    it('throws ERR_TIMEOUT when process is killed', async () => {
      setupExecFileError({ killed: true, code: 'ETIMEDOUT', message: 'killed' });
      const request: DesktopActionRequest = { type: 'move_mouse', x: 100, y: 200 };

      await expect(executeDesktopAction(request)).rejects.toMatchObject({
        code: 'ERR_TIMEOUT',
      });
    });

    it('throws ERR_UNKNOWN for other errors', async () => {
      setupExecFileError({ stderr: 'some random python error' });
      const request: DesktopActionRequest = { type: 'move_mouse', x: 100, y: 200 };

      await expect(executeDesktopAction(request)).rejects.toMatchObject({
        code: 'ERR_UNKNOWN',
      });
    });

    it('rejects unknown action type', async () => {
      const request = { type: 'fly_drone' } as unknown as DesktopActionRequest;
      await expect(executeDesktopAction(request)).rejects.toMatchObject({
        code: 'ERR_VALIDATION_ERROR',
      });
    });
  });
});

describe('buildFailure', () => {
  it('creates a ToolFailure with correct category mapping', () => {
    const failure = buildFailure('ERR_PERMISSION_DENIED', 'no access');
    expect(failure.code).toBe('ERR_PERMISSION_DENIED');
    expect(failure.category).toBe('permission');
    expect(failure.source).toBe('action_execution');
    expect(failure.retryable).toBe(false);
  });

  it('marks timeout and unavailable as retryable', () => {
    expect(buildFailure('ERR_TIMEOUT', 'timeout').retryable).toBe(true);
    expect(buildFailure('ERR_UNAVAILABLE_BINARY', 'missing').retryable).toBe(true);
    expect(buildFailure('ERR_VALIDATION_ERROR', 'bad input').retryable).toBe(false);
  });
});

describe('isPermissionError', () => {
  it('detects accessibility-related errors', () => {
    expect(isPermissionError('Not Authorized to send apple events')).toBe(true);
    expect(isPermissionError('assistive access is not enabled')).toBe(true);
    expect(isPermissionError('permission denied')).toBe(true);
    expect(isPermissionError('some error (-1719)')).toBe(true);
  });

  it('returns false for non-permission errors', () => {
    expect(isPermissionError('file not found')).toBe(false);
    expect(isPermissionError('syntax error')).toBe(false);
  });
});

describe('validateCoordinate', () => {
  it('rejects non-finite values', () => {
    expect(() => validateCoordinate(NaN, 'x')).toThrow();
    expect(() => validateCoordinate(Infinity, 'y')).toThrow();
    expect(() => validateCoordinate('10' as any, 'x')).toThrow();
  });

  it('clamps out-of-range values', () => {
    expect(validateCoordinate(-100, 'x')).toBe(0);
    expect(validateCoordinate(200000, 'y')).toBe(100000);
  });

  it('rounds to integer', () => {
    expect(validateCoordinate(50.7, 'x')).toBe(51);
    expect(validateCoordinate(50.2, 'x')).toBe(50);
  });
});
