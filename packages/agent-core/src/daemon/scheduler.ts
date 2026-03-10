/**
 * Task Scheduler
 *
 * Lightweight cron-based task scheduler for the daemon. Stores scheduled tasks
 * in memory and fires them via a DaemonClient `task.start` call.
 *
 * Uses simple cron matching (no external dependencies). For production,
 * consider replacing with a library like `cron` or `node-schedule`.
 *
 * ESM module — use .js extensions on imports.
 */

import type { ScheduledTask } from '../common/types/daemon.js';

type ScheduledTaskCallback = (task: ScheduledTask) => void;

const schedules = new Map<string, ScheduledTask>();
let timerId: ReturnType<typeof setInterval> | null = null;
let onFireCallback: ScheduledTaskCallback | null = null;

/**
 * Parse a cron expression into its 5 fields.
 * Supports: minute hour day-of-month month day-of-week
 * Supports: * (any), numbers, ranges (1-5), commas (1,3,5)
 */
function parseCronField(field: string, min: number, max: number): number[] {
  if (field === '*') {
    const result: number[] = [];
    for (let i = min; i <= max; i++) {
      result.push(i);
    }
    return result;
  }

  const values: number[] = [];
  const parts = field.split(',');

  for (const part of parts) {
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number);
      for (let i = start; i <= end; i++) {
        values.push(i);
      }
    } else {
      values.push(Number(part));
    }
  }

  return values.filter((v) => v >= min && v <= max);
}

function matchesCron(cron: string, date: Date): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    return false;
  }

  const [minuteField, hourField, domField, monthField, dowField] = parts;

  const minutes = parseCronField(minuteField, 0, 59);
  const hours = parseCronField(hourField, 0, 23);
  const doms = parseCronField(domField, 1, 31);
  const months = parseCronField(monthField, 1, 12);
  const dows = parseCronField(dowField, 0, 6);

  return (
    minutes.includes(date.getMinutes()) &&
    hours.includes(date.getHours()) &&
    doms.includes(date.getDate()) &&
    months.includes(date.getMonth() + 1) &&
    dows.includes(date.getDay())
  );
}

/**
 * Calculate the next run time for a cron expression.
 * Returns ISO string or undefined if can't determine within 7 days.
 */
function getNextRunTime(cron: string): string | undefined {
  const now = new Date();
  const check = new Date(now);
  check.setSeconds(0);
  check.setMilliseconds(0);
  check.setMinutes(check.getMinutes() + 1);

  // Search up to 7 days ahead
  const maxMinutes = 7 * 24 * 60;
  for (let i = 0; i < maxMinutes; i++) {
    if (matchesCron(cron, check)) {
      return check.toISOString();
    }
    check.setMinutes(check.getMinutes() + 1);
  }
  return undefined;
}

/**
 * Add a scheduled task. Returns the created ScheduledTask.
 */
export function addScheduledTask(cron: string, prompt: string): ScheduledTask {
  const id = `sched-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const task: ScheduledTask = {
    id,
    cron,
    prompt,
    enabled: true,
    createdAt: new Date().toISOString(),
    nextRunAt: getNextRunTime(cron),
  };

  schedules.set(id, task);
  console.log('[Scheduler] Added schedule:', id, cron, prompt.slice(0, 50));

  // Start the timer if not running
  if (!timerId) {
    startTimer();
  }

  return task;
}

/**
 * List all scheduled tasks.
 */
export function listScheduledTasks(): ScheduledTask[] {
  return Array.from(schedules.values());
}

/**
 * Cancel (remove) a scheduled task.
 */
export function cancelScheduledTask(scheduleId: string): void {
  schedules.delete(scheduleId);
  console.log('[Scheduler] Cancelled schedule:', scheduleId);

  if (schedules.size === 0 && timerId) {
    stopTimer();
  }
}

/**
 * Set the callback to invoke when a scheduled task fires.
 */
export function onScheduledTaskFire(callback: ScheduledTaskCallback): void {
  onFireCallback = callback;
}

/**
 * Stop the scheduler and clear all schedules.
 */
export function disposeScheduler(): void {
  stopTimer();
  schedules.clear();
  onFireCallback = null;
  console.log('[Scheduler] Disposed');
}

// ── Internal timer ───────────────────────────────────────────────────

function startTimer(): void {
  // Check every 60 seconds (aligned to minute boundaries)
  timerId = setInterval(() => {
    tick();
  }, 60_000);

  console.log('[Scheduler] Timer started');
}

function stopTimer(): void {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
    console.log('[Scheduler] Timer stopped');
  }
}

function tick(): void {
  const now = new Date();

  for (const task of schedules.values()) {
    if (!task.enabled) {
      continue;
    }

    if (matchesCron(task.cron, now)) {
      console.log('[Scheduler] Firing scheduled task:', task.id, task.prompt.slice(0, 50));
      task.lastRunAt = now.toISOString();
      task.nextRunAt = getNextRunTime(task.cron);

      if (onFireCallback) {
        try {
          onFireCallback(task);
        } catch (err) {
          console.error('[Scheduler] Callback error for task', task.id, err);
        }
      }
    }
  }
}
