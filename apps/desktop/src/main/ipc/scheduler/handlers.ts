// apps/desktop/src/main/ipc/scheduler/handlers.ts

import type { CreateScheduleConfig, ScheduledTask, UpdateScheduleConfig } from '@accomplish/shared';
import * as repo from '../../store/repositories/scheduledTasks';
import { getScheduler } from '../../scheduler';
import { validateCreateSchedule, validateUpdateSchedule } from './validation';

/**
 * Create a new scheduled task
 */
export function createSchedule(config: CreateScheduleConfig): ScheduledTask {
  const validated = validateCreateSchedule(config);
  const schedule = repo.createScheduledTask(validated);

  // Ensure scheduler computes next run time for recurring schedules
  getScheduler().scheduleNext(schedule);

  return schedule;
}

/**
 * List all scheduled tasks
 */
export function listSchedules(): ScheduledTask[] {
  return repo.getAllScheduledTasks();
}

/**
 * Get a single scheduled task by ID
 */
export function getSchedule(id: string): ScheduledTask | null {
  return repo.getScheduledTask(id);
}

/**
 * Update a scheduled task
 */
export function updateSchedule(id: string, updates: UpdateScheduleConfig): void {
  const existing = repo.getScheduledTask(id);
  if (!existing) {
    throw new Error(`Schedule ${id} not found`);
  }

  const validated = validateUpdateSchedule(existing, updates);
  repo.updateScheduledTask(id, validated);

  // If scheduledAt changed for one-time schedule, update nextRunAt to match
  if (validated.scheduledAt) {
    repo.updateNextRunTime(id, validated.scheduledAt);
  }

  // If cron expression changed, recompute next run time
  if (validated.scheduleType === 'recurring' || validated.cronExpression || validated.timezone) {
    const schedule = repo.getScheduledTask(id);
    if (schedule && schedule.scheduleType === 'recurring' && schedule.cronExpression) {
      const nextRun = getScheduler().computeNextRun(
        schedule.cronExpression,
        schedule.timezone
      );
      if (nextRun) {
        repo.updateNextRunTime(id, nextRun);
        // Keep last execution status, but clear any config-related error.
        repo.updateScheduleExecutionStatus(id, schedule.executionStatus, null);
      } else {
        // Validation should prevent this, but guard against corrupted/legacy data.
        repo.updateNextRunTime(id, null);
        repo.updateScheduledTask(id, { enabled: false });
        repo.updateScheduleExecutionStatus(
          id,
          'failed',
          'Invalid cron expression for timezone (failed to compute next run)'
        );
      }
    }
  }
}

/**
 * Delete a scheduled task
 */
export function deleteSchedule(id: string): void {
  repo.deleteScheduledTask(id);
}

/**
 * Toggle a schedule's enabled status
 */
export function toggleSchedule(id: string, enabled: boolean): void {
  repo.toggleSchedule(id, enabled);
}

/**
 * Run a schedule immediately (manual trigger)
 */
export async function runScheduleNow(id: string): Promise<void> {
  await getScheduler().executeScheduleNow(id);
}

/**
 * Dismiss a missed one-time schedule (user chose not to run it)
 */
export function dismissMissedSchedule(id: string): void {
  getScheduler().dismissMissedSchedule(id);
}

/**
 * Get count of active schedules
 */
export function getActiveScheduleCount(): number {
  return repo.getActiveScheduleCount();
}
