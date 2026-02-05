/**
 * Integration tests for scheduledTasks repository
 * Tests the scheduledTasks repository API behavior
 * @module __tests__/integration/main/scheduledTasks.integration.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  ScheduledTask,
  CreateScheduleConfig,
  UpdateScheduleConfig,
  ScheduleStatus,
  ScheduleExecutionStatus,
} from '@accomplish/shared';

// In-memory storage for mock
let mockScheduleStore: Map<string, ScheduledTask> = new Map();
let idCounter = 0;

function resetMockStore() {
  mockScheduleStore = new Map();
  idCounter = 0;
}

function createScheduleId(): string {
  idCounter++;
  return `sched_${Date.now()}_${idCounter}`;
}

// Mock the scheduledTasks repository with in-memory behavior
vi.mock('@main/store/repositories/scheduledTasks', () => ({
  createScheduledTask: vi.fn((config: CreateScheduleConfig): ScheduledTask => {
    const now = new Date().toISOString();
    const id = createScheduleId();

    let nextRunAt: string | undefined = undefined;
    if (config.scheduleType === 'one-time' && config.scheduledAt) {
      nextRunAt = config.scheduledAt;
    }

    const schedule: ScheduledTask = {
      id,
      prompt: config.prompt,
      scheduleType: config.scheduleType,
      scheduledAt: config.scheduledAt,
      cronExpression: config.cronExpression,
      timezone: config.timezone,
      nextRunAt,
      lastRunAt: undefined,
      lastTaskId: undefined,
      status: 'active',
      executionStatus: 'pending',
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };

    mockScheduleStore.set(id, schedule);
    return schedule;
  }),

  getScheduledTask: vi.fn((id: string): ScheduledTask | null => {
    return mockScheduleStore.get(id) || null;
  }),

  getAllScheduledTasks: vi.fn((): ScheduledTask[] => {
    return Array.from(mockScheduleStore.values())
      .filter((s) => s.status !== 'cancelled')
      .sort((a, b) => {
        if (!a.nextRunAt && !b.nextRunAt) return 0;
        if (!a.nextRunAt) return 1;
        if (!b.nextRunAt) return -1;
        return a.nextRunAt.localeCompare(b.nextRunAt);
      });
  }),

  getActiveScheduledTasks: vi.fn((): ScheduledTask[] => {
    return Array.from(mockScheduleStore.values())
      .filter((s) => s.status === 'active' && s.enabled)
      .sort((a, b) => {
        if (!a.nextRunAt && !b.nextRunAt) return 0;
        if (!a.nextRunAt) return 1;
        if (!b.nextRunAt) return -1;
        return a.nextRunAt.localeCompare(b.nextRunAt);
      });
  }),

  getSchedulesReadyToRun: vi.fn((now: string): ScheduledTask[] => {
    return Array.from(mockScheduleStore.values())
      .filter(
        (s) =>
          s.status === 'active' &&
          s.enabled &&
          s.nextRunAt &&
          s.nextRunAt <= now &&
          s.executionStatus !== 'running'
      )
      .sort((a, b) => {
        if (!a.nextRunAt || !b.nextRunAt) return 0;
        return a.nextRunAt.localeCompare(b.nextRunAt);
      });
  }),

  updateScheduledTask: vi.fn((id: string, updates: UpdateScheduleConfig): void => {
    const schedule = mockScheduleStore.get(id);
    if (schedule) {
      const now = new Date().toISOString();
      if (updates.prompt !== undefined) schedule.prompt = updates.prompt;
      if (updates.scheduleType !== undefined) schedule.scheduleType = updates.scheduleType;
      if (updates.scheduledAt !== undefined) schedule.scheduledAt = updates.scheduledAt;
      if (updates.cronExpression !== undefined) schedule.cronExpression = updates.cronExpression;
      if (updates.timezone !== undefined) schedule.timezone = updates.timezone;
      if (updates.status !== undefined) schedule.status = updates.status;
      if (updates.enabled !== undefined) schedule.enabled = updates.enabled;
      schedule.updatedAt = now;
    }
  }),

  updateNextRunTime: vi.fn((id: string, nextRunAt: string | null): void => {
    const schedule = mockScheduleStore.get(id);
    if (schedule) {
      schedule.nextRunAt = nextRunAt || undefined;
      schedule.updatedAt = new Date().toISOString();
    }
  }),

  markScheduleExecuted: vi.fn((id: string, taskId: string): void => {
    const schedule = mockScheduleStore.get(id);
    if (schedule) {
      const now = new Date().toISOString();
      schedule.lastRunAt = now;
      schedule.lastTaskId = taskId;
      schedule.updatedAt = now;
    }
  }),

  toggleSchedule: vi.fn((id: string, enabled: boolean): void => {
    const schedule = mockScheduleStore.get(id);
    if (schedule) {
      schedule.enabled = enabled;
      schedule.updatedAt = new Date().toISOString();
    }
  }),

  updateScheduleStatus: vi.fn((id: string, status: ScheduleStatus): void => {
    const schedule = mockScheduleStore.get(id);
    if (schedule) {
      schedule.status = status;
      schedule.updatedAt = new Date().toISOString();
    }
  }),

  updateScheduleExecutionStatus: vi.fn(
    (id: string, executionStatus: ScheduleExecutionStatus, executionError?: string | null): void => {
      const schedule = mockScheduleStore.get(id);
      if (schedule) {
        schedule.executionStatus = executionStatus;
        schedule.executionError = executionError ?? undefined;
        schedule.updatedAt = new Date().toISOString();
      }
    }
  ),

  claimDueScheduleExecution: vi.fn(
    (params: {
      id: string;
      now: string;
      nextRunAt: string | null;
      nextScheduleStatus?: string;
    }): boolean => {
      const schedule = mockScheduleStore.get(params.id);
      if (!schedule) return false;
      if (schedule.executionStatus === 'running') return false;
      if (schedule.status !== 'active' || !schedule.enabled) return false;

      schedule.executionStatus = 'running';
      schedule.lastRunAt = params.now;
      schedule.nextRunAt = params.nextRunAt ?? undefined;
      if (params.nextScheduleStatus) {
        schedule.status = params.nextScheduleStatus as ScheduleStatus;
      }
      schedule.updatedAt = new Date().toISOString();
      return true;
    }
  ),

  claimManualScheduleExecution: vi.fn(
    (params: {
      id: string;
      now: string;
      nextRunAt: string | null;
      nextScheduleStatus?: string;
    }): boolean => {
      const schedule = mockScheduleStore.get(params.id);
      if (!schedule) return false;
      if (schedule.executionStatus === 'running') return false;

      schedule.executionStatus = 'running';
      schedule.lastRunAt = params.now;
      schedule.nextRunAt = params.nextRunAt ?? undefined;
      if (params.nextScheduleStatus) {
        schedule.status = params.nextScheduleStatus as ScheduleStatus;
      }
      schedule.updatedAt = new Date().toISOString();
      return true;
    }
  ),

  deleteScheduledTask: vi.fn((id: string): void => {
    mockScheduleStore.delete(id);
  }),

  getActiveScheduleCount: vi.fn((): number => {
    return Array.from(mockScheduleStore.values()).filter(
      (s) => s.status === 'active' && s.enabled
    ).length;
  }),
}));

// Helper to create a one-time schedule config
function createOneTimeConfig(prompt: string, scheduledAt?: string): CreateScheduleConfig {
  return {
    prompt,
    scheduleType: 'one-time',
    scheduledAt: scheduledAt || '2026-03-01T09:00:00.000Z',
    timezone: 'UTC',
  };
}

// Helper to create a recurring schedule config
function createRecurringConfig(prompt: string, cronExpression?: string): CreateScheduleConfig {
  return {
    prompt,
    scheduleType: 'recurring',
    cronExpression: cronExpression || '0 9 * * *',
    timezone: 'America/New_York',
  };
}

describe('scheduledTasks Integration', () => {
  beforeEach(() => {
    resetMockStore();
    vi.clearAllMocks();
  });

  describe('createScheduledTask', () => {
    it('should create a one-time schedule with generated ID', async () => {
      // Arrange
      const { createScheduledTask } = await import('@main/store/repositories/scheduledTasks');
      const config = createOneTimeConfig('Test one-time task');

      // Act
      const result = createScheduledTask(config);

      // Assert
      expect(result.id).toMatch(/^sched_\d+_\d+$/);
      expect(result.prompt).toBe('Test one-time task');
      expect(result.scheduleType).toBe('one-time');
      expect(result.scheduledAt).toBe('2026-03-01T09:00:00.000Z');
      expect(result.status).toBe('active');
      expect(result.enabled).toBe(true);
    });

    it('should set nextRunAt to scheduledAt for one-time schedules', async () => {
      // Arrange
      const { createScheduledTask } = await import('@main/store/repositories/scheduledTasks');
      const config = createOneTimeConfig('Task', '2026-04-15T14:30:00.000Z');

      // Act
      const result = createScheduledTask(config);

      // Assert
      expect(result.nextRunAt).toBe('2026-04-15T14:30:00.000Z');
    });

    it('should create recurring schedule without nextRunAt (computed by scheduler)', async () => {
      // Arrange
      const { createScheduledTask } = await import('@main/store/repositories/scheduledTasks');
      const config = createRecurringConfig('Daily task', '0 9 * * *');

      // Act
      const result = createScheduledTask(config);

      // Assert
      expect(result.scheduleType).toBe('recurring');
      expect(result.cronExpression).toBe('0 9 * * *');
      expect(result.nextRunAt).toBeUndefined();
    });

    it('should set createdAt and updatedAt timestamps', async () => {
      // Arrange
      const { createScheduledTask } = await import('@main/store/repositories/scheduledTasks');
      const config = createOneTimeConfig('Task with timestamps');

      // Act
      const result = createScheduledTask(config);

      // Assert
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
      expect(new Date(result.createdAt).getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('getScheduledTask', () => {
    it('should return task if exists', async () => {
      // Arrange
      const { createScheduledTask, getScheduledTask } = await import(
        '@main/store/repositories/scheduledTasks'
      );
      const created = createScheduledTask(createOneTimeConfig('Retrieve me'));

      // Act
      const result = getScheduledTask(created.id);

      // Assert
      expect(result).toBeDefined();
      expect(result?.id).toBe(created.id);
      expect(result?.prompt).toBe('Retrieve me');
    });

    it('should return null if not found', async () => {
      // Arrange
      const { getScheduledTask } = await import('@main/store/repositories/scheduledTasks');

      // Act
      const result = getScheduledTask('non-existent-id');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('getAllScheduledTasks', () => {
    it('should return empty array when no tasks exist', async () => {
      // Arrange
      const { getAllScheduledTasks } = await import('@main/store/repositories/scheduledTasks');

      // Act
      const result = getAllScheduledTasks();

      // Assert
      expect(result).toEqual([]);
    });

    it('should return all non-cancelled tasks', async () => {
      // Arrange
      const { createScheduledTask, getAllScheduledTasks, updateScheduleStatus } = await import(
        '@main/store/repositories/scheduledTasks'
      );
      createScheduledTask(createOneTimeConfig('Task 1'));
      createScheduledTask(createOneTimeConfig('Task 2'));
      const task3 = createScheduledTask(createOneTimeConfig('Task 3'));
      updateScheduleStatus(task3.id, 'cancelled');

      // Act
      const result = getAllScheduledTasks();

      // Assert
      expect(result).toHaveLength(2);
      expect(result.every((s) => s.status !== 'cancelled')).toBe(true);
    });

    it('should order by nextRunAt with nulls last', async () => {
      // Arrange
      const { createScheduledTask, getAllScheduledTasks, updateNextRunTime } = await import(
        '@main/store/repositories/scheduledTasks'
      );
      const later = createScheduledTask(createOneTimeConfig('Later', '2026-06-01T09:00:00.000Z'));
      const recurring = createScheduledTask(createRecurringConfig('No time yet'));
      const earlier = createScheduledTask(createOneTimeConfig('Earlier', '2026-03-01T09:00:00.000Z'));

      // Set nextRunAt for recurring (simulating scheduler behavior)
      updateNextRunTime(recurring.id, '2026-04-15T09:00:00.000Z');

      // Act
      const result = getAllScheduledTasks();

      // Assert
      expect(result[0].id).toBe(earlier.id);
      expect(result[1].id).toBe(recurring.id);
      expect(result[2].id).toBe(later.id);
    });
  });

  describe('getActiveScheduledTasks', () => {
    it('should return only active and enabled tasks', async () => {
      // Arrange
      const { createScheduledTask, getActiveScheduledTasks, toggleSchedule, updateScheduleStatus } =
        await import('@main/store/repositories/scheduledTasks');

      createScheduledTask(createOneTimeConfig('Active 1'));
      const paused = createScheduledTask(createOneTimeConfig('Paused'));
      const disabled = createScheduledTask(createOneTimeConfig('Disabled'));
      createScheduledTask(createOneTimeConfig('Active 2'));

      updateScheduleStatus(paused.id, 'paused');
      toggleSchedule(disabled.id, false);

      // Act
      const result = getActiveScheduledTasks();

      // Assert
      expect(result).toHaveLength(2);
      expect(result.every((s) => s.status === 'active' && s.enabled)).toBe(true);
    });
  });

  describe('getSchedulesReadyToRun', () => {
    it('should return schedules where nextRunAt <= now', async () => {
      // Arrange
      const { createScheduledTask, getSchedulesReadyToRun } = await import(
        '@main/store/repositories/scheduledTasks'
      );

      createScheduledTask(createOneTimeConfig('Past', '2026-02-01T09:00:00.000Z'));
      createScheduledTask(createOneTimeConfig('Future', '2026-12-01T09:00:00.000Z'));
      createScheduledTask(createOneTimeConfig('Now-ish', '2026-02-04T12:00:00.000Z'));

      const now = '2026-02-04T12:00:00.000Z';

      // Act
      const result = getSchedulesReadyToRun(now);

      // Assert
      expect(result).toHaveLength(2);
      expect(result.every((s) => s.nextRunAt && s.nextRunAt <= now)).toBe(true);
    });

    it('should only return active and enabled schedules', async () => {
      // Arrange
      const { createScheduledTask, getSchedulesReadyToRun, toggleSchedule, updateScheduleStatus } =
        await import('@main/store/repositories/scheduledTasks');

      createScheduledTask(createOneTimeConfig('Ready', '2026-02-01T09:00:00.000Z'));
      const disabled = createScheduledTask(createOneTimeConfig('Disabled past', '2026-02-01T09:00:00.000Z'));
      const paused = createScheduledTask(createOneTimeConfig('Paused past', '2026-02-01T09:00:00.000Z'));

      toggleSchedule(disabled.id, false);
      updateScheduleStatus(paused.id, 'paused');

      const now = '2026-02-04T12:00:00.000Z';

      // Act
      const result = getSchedulesReadyToRun(now);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].prompt).toBe('Ready');
    });

    it('should return empty array when no schedules are due', async () => {
      // Arrange
      const { createScheduledTask, getSchedulesReadyToRun } = await import(
        '@main/store/repositories/scheduledTasks'
      );

      createScheduledTask(createOneTimeConfig('Future 1', '2026-12-01T09:00:00.000Z'));
      createScheduledTask(createOneTimeConfig('Future 2', '2026-12-15T09:00:00.000Z'));

      const now = '2026-02-04T12:00:00.000Z';

      // Act
      const result = getSchedulesReadyToRun(now);

      // Assert
      expect(result).toHaveLength(0);
    });
  });

  describe('updateScheduledTask', () => {
    it('should update specified fields only', async () => {
      // Arrange
      const { createScheduledTask, getScheduledTask, updateScheduledTask } = await import(
        '@main/store/repositories/scheduledTasks'
      );
      const schedule = createScheduledTask(createOneTimeConfig('Original'));
      const originalTimezone = schedule.timezone;

      // Act
      updateScheduledTask(schedule.id, { prompt: 'Updated prompt' });
      const result = getScheduledTask(schedule.id);

      // Assert
      expect(result?.prompt).toBe('Updated prompt');
      expect(result?.timezone).toBe(originalTimezone);
    });

    it('should update updatedAt timestamp', async () => {
      // Arrange
      const { createScheduledTask, getScheduledTask, updateScheduledTask } = await import(
        '@main/store/repositories/scheduledTasks'
      );
      const schedule = createScheduledTask(createOneTimeConfig('Task'));
      const originalUpdatedAt = schedule.updatedAt;

      // Wait a tiny bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Act
      updateScheduledTask(schedule.id, { prompt: 'Updated' });
      const result = getScheduledTask(schedule.id);

      // Assert
      expect(result?.updatedAt).not.toBe(originalUpdatedAt);
    });
  });

  describe('updateNextRunTime', () => {
    it('should update next_run_at field', async () => {
      // Arrange
      const { createScheduledTask, getScheduledTask, updateNextRunTime } = await import(
        '@main/store/repositories/scheduledTasks'
      );
      const schedule = createScheduledTask(createRecurringConfig('Recurring'));
      expect(schedule.nextRunAt).toBeUndefined();

      // Act
      updateNextRunTime(schedule.id, '2026-03-01T09:00:00.000Z');
      const result = getScheduledTask(schedule.id);

      // Assert
      expect(result?.nextRunAt).toBe('2026-03-01T09:00:00.000Z');
    });

    it('should allow setting nextRunAt to null', async () => {
      // Arrange
      const { createScheduledTask, getScheduledTask, updateNextRunTime } = await import(
        '@main/store/repositories/scheduledTasks'
      );
      const schedule = createScheduledTask(createOneTimeConfig('One-time'));
      expect(schedule.nextRunAt).toBeDefined();

      // Act
      updateNextRunTime(schedule.id, null);
      const result = getScheduledTask(schedule.id);

      // Assert
      expect(result?.nextRunAt).toBeUndefined();
    });
  });

  describe('markScheduleExecuted', () => {
    it('should set last_run_at and last_task_id', async () => {
      // Arrange
      const { createScheduledTask, getScheduledTask, markScheduleExecuted } = await import(
        '@main/store/repositories/scheduledTasks'
      );
      const schedule = createScheduledTask(createOneTimeConfig('Task'));
      expect(schedule.lastRunAt).toBeUndefined();
      expect(schedule.lastTaskId).toBeUndefined();

      // Act
      markScheduleExecuted(schedule.id, 'task_123');
      const result = getScheduledTask(schedule.id);

      // Assert
      expect(result?.lastRunAt).toBeDefined();
      expect(result?.lastTaskId).toBe('task_123');
    });

    it('should update updatedAt timestamp', async () => {
      // Arrange
      const { createScheduledTask, getScheduledTask, markScheduleExecuted } = await import(
        '@main/store/repositories/scheduledTasks'
      );
      const schedule = createScheduledTask(createOneTimeConfig('Task'));
      const originalUpdatedAt = schedule.updatedAt;

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Act
      markScheduleExecuted(schedule.id, 'task_123');
      const result = getScheduledTask(schedule.id);

      // Assert
      expect(result?.updatedAt).not.toBe(originalUpdatedAt);
    });
  });

  describe('toggleSchedule', () => {
    it('should toggle enabled flag to false', async () => {
      // Arrange
      const { createScheduledTask, getScheduledTask, toggleSchedule } = await import(
        '@main/store/repositories/scheduledTasks'
      );
      const schedule = createScheduledTask(createOneTimeConfig('Task'));
      expect(schedule.enabled).toBe(true);

      // Act
      toggleSchedule(schedule.id, false);
      const result = getScheduledTask(schedule.id);

      // Assert
      expect(result?.enabled).toBe(false);
    });

    it('should toggle enabled flag to true', async () => {
      // Arrange
      const { createScheduledTask, getScheduledTask, toggleSchedule } = await import(
        '@main/store/repositories/scheduledTasks'
      );
      const schedule = createScheduledTask(createOneTimeConfig('Task'));
      toggleSchedule(schedule.id, false);

      // Act
      toggleSchedule(schedule.id, true);
      const result = getScheduledTask(schedule.id);

      // Assert
      expect(result?.enabled).toBe(true);
    });
  });

  describe('updateScheduleStatus', () => {
    it('should update status to completed', async () => {
      // Arrange
      const { createScheduledTask, getScheduledTask, updateScheduleStatus } = await import(
        '@main/store/repositories/scheduledTasks'
      );
      const schedule = createScheduledTask(createOneTimeConfig('Task'));

      // Act
      updateScheduleStatus(schedule.id, 'completed');
      const result = getScheduledTask(schedule.id);

      // Assert
      expect(result?.status).toBe('completed');
    });

    it('should update status to paused', async () => {
      // Arrange
      const { createScheduledTask, getScheduledTask, updateScheduleStatus } = await import(
        '@main/store/repositories/scheduledTasks'
      );
      const schedule = createScheduledTask(createOneTimeConfig('Task'));

      // Act
      updateScheduleStatus(schedule.id, 'paused');
      const result = getScheduledTask(schedule.id);

      // Assert
      expect(result?.status).toBe('paused');
    });

    it('should update status to cancelled', async () => {
      // Arrange
      const { createScheduledTask, getScheduledTask, updateScheduleStatus } = await import(
        '@main/store/repositories/scheduledTasks'
      );
      const schedule = createScheduledTask(createOneTimeConfig('Task'));

      // Act
      updateScheduleStatus(schedule.id, 'cancelled');
      const result = getScheduledTask(schedule.id);

      // Assert
      expect(result?.status).toBe('cancelled');
    });
  });

  describe('deleteScheduledTask', () => {
    it('should remove task from database', async () => {
      // Arrange
      const { createScheduledTask, getScheduledTask, deleteScheduledTask } = await import(
        '@main/store/repositories/scheduledTasks'
      );
      const schedule = createScheduledTask(createOneTimeConfig('Delete me'));
      expect(getScheduledTask(schedule.id)).toBeDefined();

      // Act
      deleteScheduledTask(schedule.id);
      const result = getScheduledTask(schedule.id);

      // Assert
      expect(result).toBeNull();
    });

    it('should not throw when deleting non-existent task', async () => {
      // Arrange
      const { deleteScheduledTask } = await import('@main/store/repositories/scheduledTasks');

      // Act & Assert
      expect(() => deleteScheduledTask('non-existent')).not.toThrow();
    });
  });

  describe('getActiveScheduleCount', () => {
    it('should return count of active + enabled schedules', async () => {
      // Arrange
      const { createScheduledTask, getActiveScheduleCount, toggleSchedule, updateScheduleStatus } =
        await import('@main/store/repositories/scheduledTasks');

      createScheduledTask(createOneTimeConfig('Active 1'));
      createScheduledTask(createOneTimeConfig('Active 2'));
      const disabled = createScheduledTask(createOneTimeConfig('Disabled'));
      const paused = createScheduledTask(createOneTimeConfig('Paused'));

      toggleSchedule(disabled.id, false);
      updateScheduleStatus(paused.id, 'paused');

      // Act
      const result = getActiveScheduleCount();

      // Assert
      expect(result).toBe(2);
    });

    it('should return 0 when none exist', async () => {
      // Arrange
      const { getActiveScheduleCount } = await import('@main/store/repositories/scheduledTasks');

      // Act
      const result = getActiveScheduleCount();

      // Assert
      expect(result).toBe(0);
    });
  });

  describe('updateScheduleExecutionStatus', () => {
    it('should update execution status to running', async () => {
      const { createScheduledTask, getScheduledTask, updateScheduleExecutionStatus } = await import(
        '@main/store/repositories/scheduledTasks'
      );
      const schedule = createScheduledTask(createOneTimeConfig('Task'));
      expect(schedule.executionStatus).toBe('pending');

      updateScheduleExecutionStatus(schedule.id, 'running');
      const result = getScheduledTask(schedule.id);

      expect(result?.executionStatus).toBe('running');
      expect(result?.executionError).toBeUndefined();
    });

    it('should set execution error when status is failed', async () => {
      const { createScheduledTask, getScheduledTask, updateScheduleExecutionStatus } = await import(
        '@main/store/repositories/scheduledTasks'
      );
      const schedule = createScheduledTask(createOneTimeConfig('Task'));

      updateScheduleExecutionStatus(schedule.id, 'failed', 'Something went wrong');
      const result = getScheduledTask(schedule.id);

      expect(result?.executionStatus).toBe('failed');
      expect(result?.executionError).toBe('Something went wrong');
    });

    it('should clear execution error when status becomes completed', async () => {
      const { createScheduledTask, getScheduledTask, updateScheduleExecutionStatus } = await import(
        '@main/store/repositories/scheduledTasks'
      );
      const schedule = createScheduledTask(createOneTimeConfig('Task'));

      // First fail it
      updateScheduleExecutionStatus(schedule.id, 'failed', 'Error msg');
      // Then complete it
      updateScheduleExecutionStatus(schedule.id, 'completed', null);
      const result = getScheduledTask(schedule.id);

      expect(result?.executionStatus).toBe('completed');
      expect(result?.executionError).toBeUndefined();
    });
  });

  describe('claimDueScheduleExecution', () => {
    it('should claim a pending schedule for execution', async () => {
      const { createScheduledTask, getScheduledTask, claimDueScheduleExecution } = await import(
        '@main/store/repositories/scheduledTasks'
      );
      const schedule = createScheduledTask(createOneTimeConfig('Task', '2026-02-01T09:00:00.000Z'));

      const claimed = claimDueScheduleExecution({
        id: schedule.id,
        now: '2026-02-04T12:00:00.000Z',
        nextRunAt: null,
        nextScheduleStatus: 'completed',
      });

      expect(claimed).toBe(true);
      const result = getScheduledTask(schedule.id);
      expect(result?.executionStatus).toBe('running');
      expect(result?.status).toBe('completed');
      expect(result?.nextRunAt).toBeUndefined();
    });

    it('should reject claiming an already running schedule', async () => {
      const { createScheduledTask, claimDueScheduleExecution, updateScheduleExecutionStatus } =
        await import('@main/store/repositories/scheduledTasks');
      const schedule = createScheduledTask(createOneTimeConfig('Task', '2026-02-01T09:00:00.000Z'));

      // Set to running first
      updateScheduleExecutionStatus(schedule.id, 'running');

      const claimed = claimDueScheduleExecution({
        id: schedule.id,
        now: '2026-02-04T12:00:00.000Z',
        nextRunAt: null,
      });

      expect(claimed).toBe(false);
    });

    it('should advance nextRunAt for recurring schedules', async () => {
      const { createScheduledTask, getScheduledTask, claimDueScheduleExecution, updateNextRunTime } =
        await import('@main/store/repositories/scheduledTasks');
      const schedule = createScheduledTask(createRecurringConfig('Recurring'));
      updateNextRunTime(schedule.id, '2026-02-04T09:00:00.000Z');

      const claimed = claimDueScheduleExecution({
        id: schedule.id,
        now: '2026-02-04T09:01:00.000Z',
        nextRunAt: '2026-02-05T09:00:00.000Z',
      });

      expect(claimed).toBe(true);
      const result = getScheduledTask(schedule.id);
      expect(result?.executionStatus).toBe('running');
      expect(result?.nextRunAt).toBe('2026-02-05T09:00:00.000Z');
      expect(result?.status).toBe('active'); // Recurring stays active
    });
  });

  describe('claimManualScheduleExecution', () => {
    it('should claim a schedule for manual execution', async () => {
      const { createScheduledTask, getScheduledTask, claimManualScheduleExecution } = await import(
        '@main/store/repositories/scheduledTasks'
      );
      const schedule = createScheduledTask(createOneTimeConfig('Task', '2026-03-01T09:00:00.000Z'));

      const claimed = claimManualScheduleExecution({
        id: schedule.id,
        now: '2026-02-04T12:00:00.000Z',
        nextRunAt: null,
        nextScheduleStatus: 'completed',
      });

      expect(claimed).toBe(true);
      const result = getScheduledTask(schedule.id);
      expect(result?.executionStatus).toBe('running');
    });

    it('should reject claiming an already running schedule', async () => {
      const { createScheduledTask, claimManualScheduleExecution, updateScheduleExecutionStatus } =
        await import('@main/store/repositories/scheduledTasks');
      const schedule = createScheduledTask(createOneTimeConfig('Task', '2026-02-01T09:00:00.000Z'));

      updateScheduleExecutionStatus(schedule.id, 'running');

      const claimed = claimManualScheduleExecution({
        id: schedule.id,
        now: '2026-02-04T12:00:00.000Z',
        nextRunAt: null,
      });

      expect(claimed).toBe(false);
    });
  });

  describe('getSchedulesReadyToRun (executionStatus filtering)', () => {
    it('should exclude running schedules from ready-to-run', async () => {
      const {
        createScheduledTask,
        getSchedulesReadyToRun,
        updateScheduleExecutionStatus,
      } = await import('@main/store/repositories/scheduledTasks');

      const ready = createScheduledTask(createOneTimeConfig('Ready', '2026-02-01T09:00:00.000Z'));
      const running = createScheduledTask(createOneTimeConfig('Running', '2026-02-01T09:00:00.000Z'));
      updateScheduleExecutionStatus(running.id, 'running');

      const result = getSchedulesReadyToRun('2026-02-04T12:00:00.000Z');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(ready.id);
    });
  });
});
