/**
 * Unit tests for TaskScheduler
 *
 * Tests the TaskScheduler class in src/main/scheduler/index.ts:
 * - start/stop lifecycle
 * - handleMissedSchedules behavior
 * - executeSchedule logic
 * - computeNextRun calculations
 *
 * Mocked components:
 * - better-sqlite3: Database operations
 * - Repository functions: scheduledTasks, taskHistory
 * - TaskManager: Task execution
 * - Electron: BrowserWindow IPC
 * - cron-parser: Next run calculation
 *
 * @module __tests__/unit/main/scheduler/task-scheduler.unit.test
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { ScheduledTask } from '@accomplish/shared';

// Mock electron before importing module
const mockWebContentsSend = vi.fn();
const mockWebContentsIsDestroyed = vi.fn(() => false);
const mockWindowIsDestroyed = vi.fn(() => false);

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => [
      {
        isDestroyed: mockWindowIsDestroyed,
        webContents: {
          isDestroyed: mockWebContentsIsDestroyed,
          send: mockWebContentsSend,
        },
      },
    ]),
  },
}));

// Mock better-sqlite3
vi.mock('better-sqlite3', () => {
  class MockDatabase {
    pragma = vi.fn().mockReturnThis();
    prepare = vi.fn().mockReturnValue({
      run: vi.fn(),
      get: vi.fn().mockReturnValue(null),
      all: vi.fn().mockReturnValue([]),
    });
    exec = vi.fn();
    transaction = vi.fn((fn: () => unknown) => () => fn());
    close = vi.fn();
  }
  return { default: MockDatabase };
});

// Mock repositories
const mockScheduledTasksRepo = {
  getActiveScheduledTasks: vi.fn(() => []),
  getSchedulesReadyToRun: vi.fn(() => []),
  getScheduledTask: vi.fn(),
  updateScheduleStatus: vi.fn(),
  updateScheduleExecutionStatus: vi.fn(),
  updateNextRunTime: vi.fn(),
  markScheduleExecuted: vi.fn(),
  updateScheduledTask: vi.fn(),
  claimDueScheduleExecution: vi.fn(() => true),
  claimManualScheduleExecution: vi.fn(() => true),
};

vi.mock('@main/store/repositories/scheduledTasks', () => mockScheduledTasksRepo);

const mockTaskHistoryRepo = {
  saveTask: vi.fn(),
  addTaskMessage: vi.fn(),
  updateTaskStatus: vi.fn(),
  updateTaskSessionId: vi.fn(),
  saveTodosForTask: vi.fn(),
  clearTodosForTask: vi.fn(),
};

vi.mock('@main/store/repositories/taskHistory', () => mockTaskHistoryRepo);

// Mock task manager
const mockStartTask = vi.fn().mockImplementation(async (taskId: string, config: { prompt: string }, _callbacks: unknown) => {
  return {
    id: taskId,
    prompt: config.prompt,
    status: 'running',
    messages: [],
    createdAt: new Date().toISOString(),
  };
});
const mockTaskManager = {
  startTask: mockStartTask,
  getSessionId: vi.fn(() => null),
};

vi.mock('@main/opencode/task-manager', () => ({
  getTaskManager: () => mockTaskManager,
}));

// Mock app settings repository
const mockGetDebugMode = vi.fn(() => false);
vi.mock('@main/store/repositories/appSettings', () => ({
  getDebugMode: mockGetDebugMode,
}));

// Mock cron-parser
const mockCronParse = vi.fn();
vi.mock('cron-parser', () => ({
  CronExpressionParser: {
    parse: mockCronParse,
  },
}));

describe('TaskScheduler', () => {
  let TaskScheduler: typeof import('@main/scheduler').TaskScheduler;
  let getScheduler: typeof import('@main/scheduler').getScheduler;
  let disposeScheduler: typeof import('@main/scheduler').disposeScheduler;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.useFakeTimers();

    // Default mock for cron-parser
    mockCronParse.mockReturnValue({
      next: () => ({
        toISOString: () => '2026-02-05T09:00:00.000Z',
      }),
    });

    // Re-import module to get fresh state
    const module = await import('@main/scheduler');
    TaskScheduler = module.TaskScheduler;
    getScheduler = module.getScheduler;
    disposeScheduler = module.disposeScheduler;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('start() / stop()', () => {
    it('should start the scheduler and run initial check', async () => {
      // Arrange
      const scheduler = new TaskScheduler();

      // Act
      scheduler.start();

      // Wait for initial check
      await vi.advanceTimersByTimeAsync(0);

      // Assert - getSchedulesReadyToRun should be called during initial check
      expect(mockScheduledTasksRepo.getSchedulesReadyToRun).toHaveBeenCalled();

      // Cleanup
      scheduler.stop();
    });

    it('should not start twice if already running', async () => {
      // Arrange
      const scheduler = new TaskScheduler();
      const consoleSpy = vi.spyOn(console, 'log');

      // Act
      scheduler.start();
      scheduler.start();

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Already running'));

      // Cleanup
      scheduler.stop();
    });

    it('should stop gracefully', () => {
      // Arrange
      const scheduler = new TaskScheduler();
      scheduler.start();

      // Act
      scheduler.stop();

      // Assert - no error thrown
      expect(true).toBe(true);
    });

    it('should be safe to stop when not running', () => {
      // Arrange
      const scheduler = new TaskScheduler();

      // Act & Assert - should not throw
      scheduler.stop();
    });

    it('should check schedules at regular intervals', async () => {
      // Arrange
      const scheduler = new TaskScheduler();
      scheduler.start();

      // Clear initial call count
      vi.clearAllMocks();

      // Act - advance time by 1 minute
      await vi.advanceTimersByTimeAsync(60_000);

      // Assert
      expect(mockScheduledTasksRepo.getSchedulesReadyToRun).toHaveBeenCalledTimes(1);

      // Advance another minute
      await vi.advanceTimersByTimeAsync(60_000);
      expect(mockScheduledTasksRepo.getSchedulesReadyToRun).toHaveBeenCalledTimes(2);

      // Cleanup
      scheduler.stop();
    });
  });

  describe('handleMissedSchedules()', () => {
    it('should return missed one-time schedules instead of auto-completing them', () => {
      // Arrange
      const scheduler = new TaskScheduler();
      const missedSchedule: ScheduledTask = {
        id: 'sched_1',
        prompt: 'Missed task',
        scheduleType: 'one-time',
        scheduledAt: '2026-02-01T09:00:00.000Z',
        timezone: 'UTC',
        nextRunAt: '2026-02-01T09:00:00.000Z',
        status: 'active',
        executionStatus: 'pending',
        enabled: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
      mockScheduledTasksRepo.getActiveScheduledTasks.mockReturnValue([missedSchedule]);

      // Set current time to after the scheduled time
      vi.setSystemTime(new Date('2026-02-05T00:00:00.000Z'));

      // Act
      const result = scheduler.handleMissedSchedules();

      // Assert – no longer auto-completed; returned for user decision
      expect(result).toHaveLength(1);
      expect(result[0].schedule.id).toBe('sched_1');
      expect(result[0].missedAt).toBe('2026-02-01T09:00:00.000Z');
      expect(mockScheduledTasksRepo.updateScheduleStatus).not.toHaveBeenCalled();
    });

    it('should silently advance missed recurring schedules and not return them', () => {
      // Arrange
      const scheduler = new TaskScheduler();
      const missedSchedule: ScheduledTask = {
        id: 'sched_2',
        prompt: 'Recurring task',
        scheduleType: 'recurring',
        cronExpression: '0 9 * * *',
        timezone: 'UTC',
        nextRunAt: '2026-02-01T09:00:00.000Z',
        status: 'active',
        executionStatus: 'pending',
        enabled: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
      mockScheduledTasksRepo.getActiveScheduledTasks.mockReturnValue([missedSchedule]);

      // Set current time to after the scheduled time
      vi.setSystemTime(new Date('2026-02-05T00:00:00.000Z'));

      // Act
      const result = scheduler.handleMissedSchedules();

      // Assert – recurring schedules silently advance, not returned
      expect(result).toHaveLength(0);
      expect(mockScheduledTasksRepo.updateNextRunTime).toHaveBeenCalledWith(
        'sched_2',
        '2026-02-05T09:00:00.000Z'
      );
      expect(mockScheduledTasksRepo.updateScheduleStatus).not.toHaveBeenCalled();
    });

    it('should skip schedules with future nextRunAt', () => {
      // Arrange
      const scheduler = new TaskScheduler();
      const futureSchedule: ScheduledTask = {
        id: 'sched_3',
        prompt: 'Future task',
        scheduleType: 'recurring',
        cronExpression: '0 9 * * *',
        timezone: 'UTC',
        nextRunAt: '2026-02-10T09:00:00.000Z',
        status: 'active',
        executionStatus: 'pending',
        enabled: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
      mockScheduledTasksRepo.getActiveScheduledTasks.mockReturnValue([futureSchedule]);

      // Set current time before the scheduled time
      vi.setSystemTime(new Date('2026-02-05T00:00:00.000Z'));

      // Act
      const result = scheduler.handleMissedSchedules();

      // Assert
      expect(result).toHaveLength(0);
      expect(mockScheduledTasksRepo.updateScheduleStatus).not.toHaveBeenCalled();
      expect(mockScheduledTasksRepo.updateNextRunTime).not.toHaveBeenCalled();
    });

    it('should skip schedules without nextRunAt', () => {
      // Arrange
      const scheduler = new TaskScheduler();
      const scheduleWithoutNextRun: ScheduledTask = {
        id: 'sched_4',
        prompt: 'Task without next run',
        scheduleType: 'recurring',
        cronExpression: '0 9 * * *',
        timezone: 'UTC',
        nextRunAt: undefined,
        status: 'active',
        executionStatus: 'pending',
        enabled: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
      mockScheduledTasksRepo.getActiveScheduledTasks.mockReturnValue([scheduleWithoutNextRun]);

      // Act
      const result = scheduler.handleMissedSchedules();

      // Assert
      expect(result).toHaveLength(0);
      expect(mockScheduledTasksRepo.updateScheduleStatus).not.toHaveBeenCalled();
      expect(mockScheduledTasksRepo.updateNextRunTime).not.toHaveBeenCalled();
    });

    it('should handle empty active schedules list', () => {
      // Arrange
      const scheduler = new TaskScheduler();
      mockScheduledTasksRepo.getActiveScheduledTasks.mockReturnValue([]);

      // Act
      const result = scheduler.handleMissedSchedules();

      // Assert
      expect(result).toHaveLength(0);
    });
  });

  describe('dismissMissedSchedule()', () => {
    it('should mark schedule as completed with failed execution status', () => {
      // Arrange
      const scheduler = new TaskScheduler();

      // Act
      scheduler.dismissMissedSchedule('sched_dismiss_1');

      // Assert
      expect(mockScheduledTasksRepo.updateScheduleStatus).toHaveBeenCalledWith(
        'sched_dismiss_1',
        'completed'
      );
      expect(mockScheduledTasksRepo.updateScheduleExecutionStatus).toHaveBeenCalledWith(
        'sched_dismiss_1',
        'failed',
        'Missed scheduled time (dismissed by user)'
      );
    });
  });

  describe('executeScheduleNow()', () => {
    it('should throw if schedule not found', async () => {
      // Arrange
      const scheduler = new TaskScheduler();
      mockScheduledTasksRepo.getScheduledTask.mockReturnValue(null);

      // Act & Assert
      await expect(scheduler.executeScheduleNow('non_existent')).rejects.toThrow('not found');
    });

    it('should throw if schedule is not active', async () => {
      // Arrange
      const scheduler = new TaskScheduler();
      const pausedSchedule: ScheduledTask = {
        id: 'sched_paused',
        prompt: 'Paused task',
        scheduleType: 'one-time',
        scheduledAt: '2026-03-01T09:00:00.000Z',
        timezone: 'UTC',
        nextRunAt: '2026-03-01T09:00:00.000Z',
        status: 'paused',
        executionStatus: 'pending',
        enabled: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
      mockScheduledTasksRepo.getScheduledTask.mockReturnValue(pausedSchedule);

      // Act & Assert
      await expect(scheduler.executeScheduleNow('sched_paused')).rejects.toThrow('not active');
    });

    it('should throw if schedule is already running', async () => {
      // Arrange
      const scheduler = new TaskScheduler();
      const runningSchedule: ScheduledTask = {
        id: 'sched_running',
        prompt: 'Running task',
        scheduleType: 'one-time',
        scheduledAt: '2026-03-01T09:00:00.000Z',
        timezone: 'UTC',
        nextRunAt: '2026-03-01T09:00:00.000Z',
        status: 'active',
        executionStatus: 'running',
        enabled: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
      mockScheduledTasksRepo.getScheduledTask.mockReturnValue(runningSchedule);

      // Act & Assert
      await expect(scheduler.executeScheduleNow('sched_running')).rejects.toThrow('already running');
    });

    it('should execute active schedule', async () => {
      // Arrange
      const scheduler = new TaskScheduler();
      const activeSchedule: ScheduledTask = {
        id: 'sched_active',
        prompt: 'Active task',
        scheduleType: 'one-time',
        scheduledAt: '2026-03-01T09:00:00.000Z',
        timezone: 'UTC',
        nextRunAt: '2026-03-01T09:00:00.000Z',
        status: 'active',
        executionStatus: 'pending',
        enabled: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
      mockScheduledTasksRepo.getScheduledTask.mockReturnValue(activeSchedule);

      // Act
      await scheduler.executeScheduleNow('sched_active');

      // Assert – manual trigger uses claimManualScheduleExecution
      expect(mockScheduledTasksRepo.claimManualScheduleExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'sched_active',
          nextScheduleStatus: 'completed',
        })
      );
      expect(mockTaskHistoryRepo.saveTask).toHaveBeenCalled();
      expect(mockStartTask).toHaveBeenCalled();
    });
  });

  describe('scheduleNext()', () => {
    it('should compute initial nextRunAt for new recurring schedules', () => {
      // Arrange
      const scheduler = new TaskScheduler();
      const newSchedule: ScheduledTask = {
        id: 'sched_new',
        prompt: 'New recurring task',
        scheduleType: 'recurring',
        cronExpression: '0 9 * * *',
        timezone: 'UTC',
        nextRunAt: undefined,
        status: 'active',
        executionStatus: 'pending',
        enabled: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };

      // Act
      scheduler.scheduleNext(newSchedule);

      // Assert
      expect(mockScheduledTasksRepo.updateNextRunTime).toHaveBeenCalledWith(
        'sched_new',
        '2026-02-05T09:00:00.000Z'
      );
    });

    it('should not update if nextRunAt already set', () => {
      // Arrange
      const scheduler = new TaskScheduler();
      const existingSchedule: ScheduledTask = {
        id: 'sched_existing',
        prompt: 'Existing schedule',
        scheduleType: 'recurring',
        cronExpression: '0 9 * * *',
        timezone: 'UTC',
        nextRunAt: '2026-03-01T09:00:00.000Z',
        status: 'active',
        executionStatus: 'pending',
        enabled: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };

      // Act
      scheduler.scheduleNext(existingSchedule);

      // Assert
      expect(mockScheduledTasksRepo.updateNextRunTime).not.toHaveBeenCalled();
    });

    it('should be a no-op for one-time schedules', () => {
      // Arrange
      const scheduler = new TaskScheduler();
      const oneTimeSchedule: ScheduledTask = {
        id: 'sched_onetime',
        prompt: 'One-time task',
        scheduleType: 'one-time',
        scheduledAt: '2026-03-01T09:00:00.000Z',
        timezone: 'UTC',
        nextRunAt: '2026-03-01T09:00:00.000Z',
        status: 'active',
        executionStatus: 'pending',
        enabled: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };

      // Act
      scheduler.scheduleNext(oneTimeSchedule);

      // Assert
      expect(mockScheduledTasksRepo.updateNextRunTime).not.toHaveBeenCalled();
    });
  });

  describe('computeNextRun()', () => {
    it('should return ISO string for valid cron', () => {
      // Arrange
      const scheduler = new TaskScheduler();
      mockCronParse.mockReturnValue({
        next: () => ({
          toISOString: () => '2026-02-05T15:00:00.000Z',
        }),
      });

      // Act
      const result = scheduler.computeNextRun('0 15 * * *', 'UTC');

      // Assert
      expect(result).toBe('2026-02-05T15:00:00.000Z');
      expect(mockCronParse).toHaveBeenCalledWith('0 15 * * *', expect.objectContaining({
        tz: 'UTC',
      }));
    });

    it('should return null for invalid cron', () => {
      // Arrange
      const scheduler = new TaskScheduler();
      const consoleSpy = vi.spyOn(console, 'error');
      mockCronParse.mockImplementation(() => {
        throw new Error('Invalid cron');
      });

      // Act
      const result = scheduler.computeNextRun('invalid', 'UTC');

      // Assert
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should respect timezone parameter', () => {
      // Arrange
      const scheduler = new TaskScheduler();

      // Act
      scheduler.computeNextRun('0 9 * * *', 'America/New_York');

      // Assert
      expect(mockCronParse).toHaveBeenCalledWith('0 9 * * *', expect.objectContaining({
        tz: 'America/New_York',
      }));
    });
  });

  describe('Singleton Functions', () => {
    describe('getScheduler()', () => {
      it('should return singleton instance', () => {
        // Act
        const scheduler1 = getScheduler();
        const scheduler2 = getScheduler();

        // Assert
        expect(scheduler1).toBe(scheduler2);

        // Cleanup
        disposeScheduler();
      });

      it('should create new instance if none exists', () => {
        // Arrange
        disposeScheduler();

        // Act
        const scheduler = getScheduler();

        // Assert
        expect(scheduler).toBeInstanceOf(TaskScheduler);

        // Cleanup
        disposeScheduler();
      });
    });

    describe('disposeScheduler()', () => {
      it('should dispose singleton and allow recreation', () => {
        // Arrange
        const scheduler1 = getScheduler();

        // Act
        disposeScheduler();
        const scheduler2 = getScheduler();

        // Assert
        expect(scheduler2).not.toBe(scheduler1);

        // Cleanup
        disposeScheduler();
      });

      it('should be safe to call multiple times', () => {
        // Act & Assert - should not throw
        disposeScheduler();
        disposeScheduler();
        disposeScheduler();
      });

      it('should stop the scheduler', () => {
        // Arrange
        const scheduler = getScheduler();
        scheduler.start();

        // Act
        disposeScheduler();

        // Advance time - should not trigger any checks
        vi.advanceTimersByTime(120_000);

        // Assert - getSchedulesReadyToRun should not be called after dispose
        // (only the initial check before dispose)
        const callsAfterDispose = mockScheduledTasksRepo.getSchedulesReadyToRun.mock.calls.length;
        expect(callsAfterDispose).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('Schedule Execution', () => {
    it('should mark one-time schedule as completed after execution', async () => {
      // Arrange
      const scheduler = new TaskScheduler();
      const oneTimeSchedule: ScheduledTask = {
        id: 'sched_onetime_exec',
        prompt: 'One-time execution',
        scheduleType: 'one-time',
        scheduledAt: '2026-02-04T09:00:00.000Z',
        timezone: 'UTC',
        nextRunAt: '2026-02-04T09:00:00.000Z',
        status: 'active',
        executionStatus: 'pending',
        enabled: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
      mockScheduledTasksRepo.getSchedulesReadyToRun.mockReturnValue([oneTimeSchedule]);
      vi.setSystemTime(new Date('2026-02-04T09:01:00.000Z'));

      // Act
      scheduler.start();
      await vi.advanceTimersByTimeAsync(0);

      // Assert – the atomic claim sets the schedule to completed and executionStatus to running
      expect(mockScheduledTasksRepo.claimDueScheduleExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'sched_onetime_exec',
          nextRunAt: null,
          nextScheduleStatus: 'completed',
        })
      );

      // Cleanup
      scheduler.stop();
    });

    it('should update next run time for recurring schedule after execution', async () => {
      // Arrange
      const scheduler = new TaskScheduler();
      const recurringSchedule: ScheduledTask = {
        id: 'sched_recurring_exec',
        prompt: 'Recurring execution',
        scheduleType: 'recurring',
        cronExpression: '0 9 * * *',
        timezone: 'UTC',
        nextRunAt: '2026-02-04T09:00:00.000Z',
        status: 'active',
        executionStatus: 'pending',
        enabled: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
      mockScheduledTasksRepo.getSchedulesReadyToRun.mockReturnValue([recurringSchedule]);
      vi.setSystemTime(new Date('2026-02-04T09:01:00.000Z'));

      // Act
      scheduler.start();
      await vi.advanceTimersByTimeAsync(0);

      // Assert – the atomic claim advances nextRunAt and does NOT set nextScheduleStatus for recurring
      expect(mockScheduledTasksRepo.claimDueScheduleExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'sched_recurring_exec',
          nextRunAt: expect.any(String),
          nextScheduleStatus: undefined,
        })
      );

      // Cleanup
      scheduler.stop();
    });

    it('should call markScheduleExecuted with task ID', async () => {
      // Arrange
      const scheduler = new TaskScheduler();
      const schedule: ScheduledTask = {
        id: 'sched_exec_mark',
        prompt: 'Task to mark',
        scheduleType: 'one-time',
        scheduledAt: '2026-02-04T09:00:00.000Z',
        timezone: 'UTC',
        nextRunAt: '2026-02-04T09:00:00.000Z',
        status: 'active',
        executionStatus: 'pending',
        enabled: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
      mockScheduledTasksRepo.getSchedulesReadyToRun.mockReturnValue([schedule]);
      vi.setSystemTime(new Date('2026-02-04T09:01:00.000Z'));

      // Act
      scheduler.start();
      await vi.advanceTimersByTimeAsync(0);

      // Assert
      expect(mockScheduledTasksRepo.markScheduleExecuted).toHaveBeenCalledWith(
        'sched_exec_mark',
        expect.stringMatching(/^task_/)
      );

      // Cleanup
      scheduler.stop();
    });

    it('should emit task:update complete with result payload', async () => {
      // Arrange
      const scheduler = new TaskScheduler();
      const schedule: ScheduledTask = {
        id: 'sched_ipc_complete',
        prompt: 'IPC complete shape',
        scheduleType: 'one-time',
        scheduledAt: '2026-02-04T09:00:00.000Z',
        timezone: 'UTC',
        nextRunAt: '2026-02-04T09:00:00.000Z',
        status: 'active',
        executionStatus: 'pending',
        enabled: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
      mockScheduledTasksRepo.getSchedulesReadyToRun.mockReturnValue([schedule]);
      vi.setSystemTime(new Date('2026-02-04T09:01:00.000Z'));

      // Act
      scheduler.start();
      await vi.advanceTimersByTimeAsync(0);

      const taskId = mockStartTask.mock.calls[0][0] as string;
      const callbacks = mockStartTask.mock.calls[0][2] as { onComplete?: (result: unknown) => void };

      callbacks.onComplete?.({ status: 'success', sessionId: 'sess_1', durationMs: 123 });

      // Assert
      expect(mockWebContentsSend).toHaveBeenCalledWith(
        'task:update',
        expect.objectContaining({
          taskId,
          type: 'complete',
          result: expect.objectContaining({ status: 'success' }),
        })
      );

      // Cleanup
      scheduler.stop();
    });

    it('should emit todo:update and persist todos', async () => {
      // Arrange
      const scheduler = new TaskScheduler();
      const schedule: ScheduledTask = {
        id: 'sched_ipc_todos',
        prompt: 'IPC todo shape',
        scheduleType: 'one-time',
        scheduledAt: '2026-02-04T09:00:00.000Z',
        timezone: 'UTC',
        nextRunAt: '2026-02-04T09:00:00.000Z',
        status: 'active',
        executionStatus: 'pending',
        enabled: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
      mockScheduledTasksRepo.getSchedulesReadyToRun.mockReturnValue([schedule]);
      vi.setSystemTime(new Date('2026-02-04T09:01:00.000Z'));

      // Act
      scheduler.start();
      await vi.advanceTimersByTimeAsync(0);

      const taskId = mockStartTask.mock.calls[0][0] as string;
      const callbacks = mockStartTask.mock.calls[0][2] as { onTodoUpdate?: (todos: unknown) => void };

      const todos = [{ id: 't1', content: 'Do thing', status: 'pending', priority: 'high' }];
      callbacks.onTodoUpdate?.(todos);

      // Assert
      expect(mockTaskHistoryRepo.saveTodosForTask).toHaveBeenCalledWith(taskId, todos);
      expect(mockWebContentsSend).toHaveBeenCalledWith('todo:update', { taskId, todos });

      // Cleanup
      scheduler.stop();
    });

    it('should only emit debug:log when debug mode enabled', async () => {
      // Arrange
      const scheduler = new TaskScheduler();
      const schedule: ScheduledTask = {
        id: 'sched_ipc_debug',
        prompt: 'IPC debug shape',
        scheduleType: 'one-time',
        scheduledAt: '2026-02-04T09:00:00.000Z',
        timezone: 'UTC',
        nextRunAt: '2026-02-04T09:00:00.000Z',
        status: 'active',
        executionStatus: 'pending',
        enabled: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
      mockScheduledTasksRepo.getSchedulesReadyToRun.mockReturnValue([schedule]);
      vi.setSystemTime(new Date('2026-02-04T09:01:00.000Z'));

      // Act
      scheduler.start();
      await vi.advanceTimersByTimeAsync(0);

      const taskId = mockStartTask.mock.calls[0][0] as string;
      const callbacks = mockStartTask.mock.calls[0][2] as { onDebug?: (log: unknown) => void };

      callbacks.onDebug?.({ type: 'info', message: 'hello', data: { a: 1 } });
      expect(mockWebContentsSend).not.toHaveBeenCalledWith(
        'debug:log',
        expect.objectContaining({ taskId })
      );

      mockGetDebugMode.mockReturnValue(true);
      callbacks.onDebug?.({ type: 'info', message: 'hello', data: { a: 1 } });
      expect(mockWebContentsSend).toHaveBeenCalledWith(
        'debug:log',
        expect.objectContaining({
          taskId,
          type: 'info',
          message: 'hello',
          timestamp: expect.any(String),
        })
      );

      // Cleanup
      scheduler.stop();
    });
  });
});
