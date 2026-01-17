/**
 * Unit tests for Process Tracker utility
 *
 * Tests the process tracking system that prevents zombie processes
 * by tracking spawned child processes and cleaning them up on app quit.
 *
 * @module __tests__/unit/main/utils/process-tracker.unit.test
 */

import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';

// Store original process.kill to restore later
const originalProcessKill = process.kill;

// Create mock for process.kill
const mockProcessKill = vi.fn();

describe('Process Tracker Module', () => {
  let ProcessTracker: typeof import('@main/utils/process-tracker').ProcessTracker;
  let getProcessTracker: typeof import('@main/utils/process-tracker').getProcessTracker;
  let disposeProcessTracker: typeof import('@main/utils/process-tracker').disposeProcessTracker;

  beforeAll(() => {
    // Replace process.kill before module is loaded
    process.kill = mockProcessKill as unknown as typeof process.kill;
  });

  afterAll(() => {
    // Restore original process.kill
    process.kill = originalProcessKill;
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    mockProcessKill.mockReset();
    vi.resetModules();

    // Suppress console output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Re-import module to get fresh state
    const module = await import('@main/utils/process-tracker');
    ProcessTracker = module.ProcessTracker;
    getProcessTracker = module.getProcessTracker;
    disposeProcessTracker = module.disposeProcessTracker;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ProcessTracker Class', () => {
    describe('trackProcess()', () => {
      it('should track a process by PID', () => {
        // Arrange
        const tracker = new ProcessTracker();

        // Act
        tracker.trackProcess(12345, 'test-process');

        // Assert
        expect(tracker.isTracked(12345)).toBe(true);
        expect(tracker.getTrackedCount()).toBe(1);
      });

      it('should track multiple processes', () => {
        // Arrange
        const tracker = new ProcessTracker();

        // Act
        tracker.trackProcess(12345, 'process-1');
        tracker.trackProcess(12346, 'process-2');
        tracker.trackProcess(12347, 'process-3');

        // Assert
        expect(tracker.getTrackedCount()).toBe(3);
        expect(tracker.getTrackedPids()).toContain(12345);
        expect(tracker.getTrackedPids()).toContain(12346);
        expect(tracker.getTrackedPids()).toContain(12347);
      });

      it('should not duplicate PIDs when tracking same process twice', () => {
        // Arrange
        const tracker = new ProcessTracker();

        // Act
        tracker.trackProcess(12345, 'process-1');
        tracker.trackProcess(12345, 'process-1-updated');

        // Assert
        expect(tracker.getTrackedCount()).toBe(1);
      });
    });

    describe('untrackProcess()', () => {
      it('should remove a tracked process', () => {
        // Arrange
        const tracker = new ProcessTracker();
        tracker.trackProcess(12345, 'test-process');

        // Act
        tracker.untrackProcess(12345);

        // Assert
        expect(tracker.isTracked(12345)).toBe(false);
        expect(tracker.getTrackedCount()).toBe(0);
      });

      it('should handle untracking non-existent process gracefully', () => {
        // Arrange
        const tracker = new ProcessTracker();

        // Act & Assert - should not throw
        expect(() => tracker.untrackProcess(99999)).not.toThrow();
      });
    });

    describe('killProcess()', () => {
      it('should kill a specific tracked process', () => {
        // Arrange
        const tracker = new ProcessTracker();
        tracker.trackProcess(12345, 'test-process');

        // Act
        const result = tracker.killProcess(12345);

        // Assert
        expect(result).toBe(true);
        expect(mockProcessKill).toHaveBeenCalledWith(12345, 'SIGTERM');
        expect(tracker.isTracked(12345)).toBe(false);
      });

      it('should return false for non-tracked process', () => {
        // Arrange
        const tracker = new ProcessTracker();

        // Act
        const result = tracker.killProcess(99999);

        // Assert
        expect(result).toBe(false);
        expect(mockProcessKill).not.toHaveBeenCalled();
      });

      it('should handle kill errors gracefully', () => {
        // Arrange
        const tracker = new ProcessTracker();
        tracker.trackProcess(12345, 'test-process');
        mockProcessKill.mockImplementationOnce(() => {
          throw new Error('ESRCH: No such process');
        });

        // Act & Assert - should not throw
        expect(() => tracker.killProcess(12345)).not.toThrow();
        expect(tracker.isTracked(12345)).toBe(false);
      });
    });

    describe('killAllTrackedProcesses()', () => {
      it('should kill all tracked processes', () => {
        // Arrange
        const tracker = new ProcessTracker();
        tracker.trackProcess(12345, 'process-1');
        tracker.trackProcess(12346, 'process-2');
        tracker.trackProcess(12347, 'process-3');

        // Act
        tracker.killAllTrackedProcesses();

        // Assert
        expect(mockProcessKill).toHaveBeenCalledTimes(3);
        expect(tracker.getTrackedCount()).toBe(0);
      });

      it('should continue killing remaining processes even if some fail', () => {
        // Arrange
        const tracker = new ProcessTracker();
        tracker.trackProcess(12345, 'process-1');
        tracker.trackProcess(12346, 'process-2');
        tracker.trackProcess(12347, 'process-3');

        // First call throws, others succeed
        mockProcessKill
          .mockImplementationOnce(() => { throw new Error('ESRCH'); })
          .mockImplementation(() => {});

        // Act
        tracker.killAllTrackedProcesses();

        // Assert - all three should be attempted
        expect(mockProcessKill).toHaveBeenCalledTimes(3);
        expect(tracker.getTrackedCount()).toBe(0);
      });

      it('should use SIGKILL when forceful kill requested', () => {
        // Arrange
        const tracker = new ProcessTracker();
        tracker.trackProcess(12345, 'process-1');

        // Act
        tracker.killAllTrackedProcesses('SIGKILL');

        // Assert
        expect(mockProcessKill).toHaveBeenCalledWith(12345, 'SIGKILL');
      });
    });

    describe('getProcessInfo()', () => {
      it('should return process info for tracked process', () => {
        // Arrange
        const tracker = new ProcessTracker();
        tracker.trackProcess(12345, 'test-process');

        // Act
        const info = tracker.getProcessInfo(12345);

        // Assert
        expect(info).toBeDefined();
        expect(info?.name).toBe('test-process');
        expect(info?.pid).toBe(12345);
        expect(info?.startTime).toBeDefined();
      });

      it('should return undefined for non-tracked process', () => {
        // Arrange
        const tracker = new ProcessTracker();

        // Act
        const info = tracker.getProcessInfo(99999);

        // Assert
        expect(info).toBeUndefined();
      });
    });
  });

  describe('Singleton Functions', () => {
    describe('getProcessTracker()', () => {
      it('should return singleton instance', () => {
        // Act
        const tracker1 = getProcessTracker();
        const tracker2 = getProcessTracker();

        // Assert
        expect(tracker1).toBe(tracker2);
      });
    });

    describe('disposeProcessTracker()', () => {
      it('should kill all processes and clear singleton', () => {
        // Arrange
        const tracker = getProcessTracker();
        tracker.trackProcess(12345, 'test');

        // Act
        disposeProcessTracker();
        const newTracker = getProcessTracker();

        // Assert
        expect(mockProcessKill).toHaveBeenCalled();
        expect(newTracker).not.toBe(tracker);
      });

      it('should be safe to call multiple times', () => {
        // Act & Assert - should not throw
        disposeProcessTracker();
        disposeProcessTracker();
        disposeProcessTracker();
      });
    });
  });
});
