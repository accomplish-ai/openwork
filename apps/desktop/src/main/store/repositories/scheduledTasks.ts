// apps/desktop/src/main/store/repositories/scheduledTasks.ts

import type {
  ScheduledTask,
  ScheduleType,
  ScheduleStatus,
  CreateScheduleConfig,
  UpdateScheduleConfig,
} from '@accomplish/shared';
import { getDatabase } from '../db';

/**
 * Generate a unique schedule ID
 */
function createScheduleId(): string {
  return `sched_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

interface ScheduledTaskRow {
  id: string;
  prompt: string;
  schedule_type: string;
  scheduled_at: string | null;
  cron_expression: string | null;
  timezone: string;
  next_run_at: string | null;
  last_run_at: string | null;
  last_task_id: string | null;
  status: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

function rowToScheduledTask(row: ScheduledTaskRow): ScheduledTask {
  return {
    id: row.id,
    prompt: row.prompt,
    scheduleType: row.schedule_type as ScheduleType,
    scheduledAt: row.scheduled_at || undefined,
    cronExpression: row.cron_expression || undefined,
    timezone: row.timezone,
    nextRunAt: row.next_run_at || undefined,
    lastRunAt: row.last_run_at || undefined,
    lastTaskId: row.last_task_id || undefined,
    status: row.status as ScheduleStatus,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Create a new scheduled task
 */
export function createScheduledTask(config: CreateScheduleConfig): ScheduledTask {
  const db = getDatabase();
  const now = new Date().toISOString();
  const id = createScheduleId();

  // Compute initial next_run_at
  let nextRunAt: string | null = null;
  if (config.scheduleType === 'one-time' && config.scheduledAt) {
    nextRunAt = config.scheduledAt;
  }
  // For recurring, next_run_at will be computed by the scheduler after creation

  db.prepare(`
    INSERT INTO scheduled_tasks (
      id, prompt, schedule_type, scheduled_at, cron_expression, timezone,
      next_run_at, last_run_at, last_task_id, status, enabled, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'active', 1, ?, ?)
  `).run(
    id,
    config.prompt,
    config.scheduleType,
    config.scheduledAt || null,
    config.cronExpression || null,
    config.timezone,
    nextRunAt,
    now,
    now
  );

  return getScheduledTask(id)!;
}

/**
 * Get a scheduled task by ID
 */
export function getScheduledTask(id: string): ScheduledTask | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(id) as
    | ScheduledTaskRow
    | undefined;
  return row ? rowToScheduledTask(row) : null;
}

/**
 * Get all scheduled tasks, ordered by next run time
 */
export function getAllScheduledTasks(): ScheduledTask[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT * FROM scheduled_tasks
       WHERE status != 'cancelled'
       ORDER BY
         CASE WHEN next_run_at IS NULL THEN 1 ELSE 0 END,
         next_run_at ASC`
    )
    .all() as ScheduledTaskRow[];
  return rows.map(rowToScheduledTask);
}

/**
 * Get all active scheduled tasks
 */
export function getActiveScheduledTasks(): ScheduledTask[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT * FROM scheduled_tasks
       WHERE status = 'active' AND enabled = 1
       ORDER BY next_run_at ASC`
    )
    .all() as ScheduledTaskRow[];
  return rows.map(rowToScheduledTask);
}

/**
 * Get scheduled tasks that are ready to run (next_run_at <= now)
 */
export function getSchedulesReadyToRun(now: string): ScheduledTask[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT * FROM scheduled_tasks
       WHERE status = 'active'
         AND enabled = 1
         AND next_run_at IS NOT NULL
         AND next_run_at <= ?
       ORDER BY next_run_at ASC`
    )
    .all(now) as ScheduledTaskRow[];
  return rows.map(rowToScheduledTask);
}

/**
 * Update a scheduled task
 */
export function updateScheduledTask(id: string, updates: UpdateScheduleConfig): void {
  const db = getDatabase();
  const now = new Date().toISOString();

  const fields: string[] = ['updated_at = ?'];
  const values: (string | number | null)[] = [now];

  if (updates.prompt !== undefined) {
    fields.push('prompt = ?');
    values.push(updates.prompt);
  }
  if (updates.scheduleType !== undefined) {
    fields.push('schedule_type = ?');
    values.push(updates.scheduleType);
  }
  if (updates.scheduledAt !== undefined) {
    fields.push('scheduled_at = ?');
    values.push(updates.scheduledAt);
  }
  if (updates.cronExpression !== undefined) {
    fields.push('cron_expression = ?');
    values.push(updates.cronExpression);
  }
  if (updates.timezone !== undefined) {
    fields.push('timezone = ?');
    values.push(updates.timezone);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.enabled !== undefined) {
    fields.push('enabled = ?');
    values.push(updates.enabled ? 1 : 0);
  }

  values.push(id);
  db.prepare(`UPDATE scheduled_tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

/**
 * Update the next run time for a schedule
 */
export function updateNextRunTime(id: string, nextRunAt: string | null): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare('UPDATE scheduled_tasks SET next_run_at = ?, updated_at = ? WHERE id = ?').run(
    nextRunAt,
    now,
    id
  );
}

/**
 * Mark a schedule as executed (update last_run_at and last_task_id)
 */
export function markScheduleExecuted(id: string, taskId: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare(
    'UPDATE scheduled_tasks SET last_run_at = ?, last_task_id = ?, updated_at = ? WHERE id = ?'
  ).run(now, taskId, now, id);
}

/**
 * Toggle a schedule's enabled status
 */
export function toggleSchedule(id: string, enabled: boolean): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare('UPDATE scheduled_tasks SET enabled = ?, updated_at = ? WHERE id = ?').run(
    enabled ? 1 : 0,
    now,
    id
  );
}

/**
 * Update schedule status
 */
export function updateScheduleStatus(id: string, status: ScheduleStatus): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare('UPDATE scheduled_tasks SET status = ?, updated_at = ? WHERE id = ?').run(
    status,
    now,
    id
  );
}

/**
 * Delete a scheduled task
 */
export function deleteScheduledTask(id: string): void {
  const db = getDatabase();
  db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(id);
}

/**
 * Get count of active scheduled tasks
 */
export function getActiveScheduleCount(): number {
  const db = getDatabase();
  const result = db
    .prepare(
      `SELECT COUNT(*) as count FROM scheduled_tasks
       WHERE status = 'active' AND enabled = 1`
    )
    .get() as { count: number };
  return result.count;
}
