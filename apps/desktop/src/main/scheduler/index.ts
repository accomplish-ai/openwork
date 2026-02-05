/**
 * TaskScheduler - Manages scheduled task execution
 *
 * Runs a background loop that checks for due schedules every minute
 * and executes them using the existing TaskManager infrastructure.
 */

import { CronExpressionParser } from 'cron-parser';
import { BrowserWindow } from 'electron';
import type { ScheduledTask, MissedScheduleInfo, TaskConfig, TaskMessage, Task, TaskStatus, OpenCodeMessage } from '@accomplish/shared';
import * as repo from '../store/repositories/scheduledTasks';
import { getTaskManager } from '../opencode/task-manager';
import * as taskHistoryRepo from '../store/repositories/taskHistory';
import { getDebugMode } from '../store/repositories/appSettings';

/**
 * Check interval in milliseconds (every minute)
 */
const CHECK_INTERVAL_MS = 60_000;

/**
 * Generate a unique task ID
 */
function createTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Generate a unique message ID
 */
function createMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Convert OpenCode message to TaskMessage format
 * Simplified version for scheduled tasks - just handles text and tool messages
 */
function toTaskMessage(msg: OpenCodeMessage): TaskMessage | null {
  if (!msg.type) return null;

  // Handle text content
  if (msg.type === 'text') {
    const textMsg = msg as { type: 'text'; part: { text: string } };
    if (textMsg.part?.text) {
      return {
        id: createMessageId(),
        type: 'assistant',
        content: textMsg.part.text,
        timestamp: new Date().toISOString(),
      };
    }
    return null;
  }

  // Handle tool calls
  if (msg.type === 'tool_call') {
    const toolMsg = msg as { type: 'tool_call'; part: { tool: string; input?: unknown } };
    return {
      id: createMessageId(),
      type: 'tool',
      content: `Using tool: ${toolMsg.part.tool}`,
      toolName: toolMsg.part.tool,
      toolInput: toolMsg.part.input,
      timestamp: new Date().toISOString(),
    };
  }

  // Handle tool_use messages (combined tool call + result)
  if (msg.type === 'tool_use') {
    const toolUseMsg = msg as {
      type: 'tool_use';
      part: { tool?: string; state?: { input?: unknown; output?: string; status?: string } };
    };
    const toolName = toolUseMsg.part.tool || 'unknown';
    const toolInput = toolUseMsg.part.state?.input;
    const status = toolUseMsg.part.state?.status;

    // Only create message for completed/error status
    if (status === 'completed' || status === 'error') {
      return {
        id: createMessageId(),
        type: 'tool',
        content: `Tool ${toolName} ${status}`,
        toolName,
        toolInput,
        timestamp: new Date().toISOString(),
      };
    }
    return null;
  }

  return null;
}

/**
 * TaskScheduler class for managing cron-based task scheduling
 */
export class TaskScheduler {
  private checkInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isChecking = false;

  /**
   * Start the scheduler loop
   */
  start(): void {
    if (this.isRunning) {
      console.log('[TaskScheduler] Already running');
      return;
    }

    console.log('[TaskScheduler] Starting scheduler');
    this.isRunning = true;

    // Run an initial check
    this.checkSchedules().catch((err) => {
      console.error('[TaskScheduler] Error during initial check:', err);
    });

    // Set up the interval
    this.checkInterval = setInterval(() => {
      this.checkSchedules().catch((err) => {
        console.error('[TaskScheduler] Error during scheduled check:', err);
      });
    }, CHECK_INTERVAL_MS);
  }

  /**
   * Stop the scheduler loop
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    console.log('[TaskScheduler] Stopping scheduler');

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    this.isRunning = false;
  }

  /**
   * Handle missed schedules on startup
   * For recurring schedules, computes the next future run time
   * For one-time schedules that are past due, marks them as completed
   */
  /**
   * Check for schedules that were due while the app was offline.
   *
   * - **One-time schedules**: collected and returned so the UI can prompt
   *   the user to run or dismiss them (not auto-completed).
   * - **Recurring schedules**: silently advanced to the next future run time.
   *
   * @returns An array of missed one-time schedules awaiting user decision.
   */
  handleMissedSchedules(): MissedScheduleInfo[] {
    console.log('[TaskScheduler] Checking for missed schedules');
    const now = new Date();

    const activeSchedules = repo.getActiveScheduledTasks();
    const missedOneTime: MissedScheduleInfo[] = [];

    for (const schedule of activeSchedules) {
      if (!schedule.nextRunAt) continue;

      const nextRunDate = new Date(schedule.nextRunAt);
      if (nextRunDate <= now) {
        console.log(
          `[TaskScheduler] Schedule ${schedule.id} was missed (nextRunAt: ${schedule.nextRunAt})`
        );

        if (schedule.scheduleType === 'one-time') {
          // Collect missed one-time schedules so the renderer can notify the user.
          console.log(
            `[TaskScheduler] Missed one-time schedule ${schedule.id} — deferring to user`
          );
          missedOneTime.push({
            schedule,
            missedAt: schedule.nextRunAt,
          });
        } else if (schedule.cronExpression) {
          // Silently advance recurring schedules to the next future run.
          const nextRun = this.computeNextRun(schedule.cronExpression, schedule.timezone);
          if (nextRun) {
            console.log(
              `[TaskScheduler] Updating recurring schedule ${schedule.id} next run to ${nextRun}`
            );
            repo.updateNextRunTime(schedule.id, nextRun);
          } else {
            console.error(
              `[TaskScheduler] Disabling recurring schedule ${schedule.id}: failed to compute next run time`
            );
            repo.updateScheduledTask(schedule.id, { enabled: false });
            repo.updateNextRunTime(schedule.id, null);
            repo.updateScheduleExecutionStatus(
              schedule.id,
              'failed',
              'Invalid cron expression for timezone (failed to compute next run)'
            );
          }
        }
      }
    }

    return missedOneTime;
  }

  /**
   * Check for due schedules and execute them
   */
  private async checkSchedules(): Promise<void> {
    if (this.isChecking) {
      // Prevent overlapping checks (setInterval doesn't await).
      return;
    }

    this.isChecking = true;
    const now = new Date().toISOString();
    try {
      const dueSchedules = repo.getSchedulesReadyToRun(now);

      if (dueSchedules.length === 0) {
        return;
      }

      console.log(`[TaskScheduler] Found ${dueSchedules.length} due schedule(s)`);

      for (const schedule of dueSchedules) {
        await this.executeSchedule(schedule, 'due');
      }
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Execute a scheduled task
   */
  private async executeSchedule(schedule: ScheduledTask, trigger: 'due' | 'manual'): Promise<void> {
    console.log(`[TaskScheduler] Executing schedule ${schedule.id}: "${schedule.prompt}"`);

    const sendToRenderer = (channel: string, data: unknown) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (!window || window.isDestroyed() || window.webContents.isDestroyed()) {
        return;
      }
      window.webContents.send(channel, data);
    };

    const now = new Date().toISOString();

    // Compute next run time up-front (and claim atomically) so a schedule can't execute twice.
    let nextRunAt: string | null = null;
    if (schedule.scheduleType === 'recurring') {
      if (!schedule.cronExpression) {
        console.error(`[TaskScheduler] Recurring schedule ${schedule.id} missing cronExpression`);
        repo.updateScheduleExecutionStatus(schedule.id, 'failed', 'Missing cron expression');
        sendToRenderer('schedule:updated', { scheduleId: schedule.id });
        return;
      }

      const computed = this.computeNextRun(schedule.cronExpression, schedule.timezone);
      if (!computed) {
        // Prevent infinite retry loops: disable the schedule and clear next_run_at.
        console.error(
          `[TaskScheduler] Disabling schedule ${schedule.id}: failed to compute next run time`
        );
        repo.updateScheduledTask(schedule.id, { enabled: false });
        repo.updateNextRunTime(schedule.id, null);
        repo.updateScheduleExecutionStatus(
          schedule.id,
          'failed',
          'Invalid cron expression for timezone (failed to compute next run)'
        );
        sendToRenderer('schedule:updated', { scheduleId: schedule.id });
        return;
      }
      nextRunAt = computed;
    }

    // One-time schedules are considered complete once they're claimed for execution.
    const nextScheduleStatus = schedule.scheduleType === 'one-time' ? 'completed' : undefined;

    const claimed =
      trigger === 'due'
        ? repo.claimDueScheduleExecution({
            id: schedule.id,
            now,
            nextRunAt: schedule.scheduleType === 'one-time' ? null : nextRunAt,
            nextScheduleStatus,
          })
        : repo.claimManualScheduleExecution({
            id: schedule.id,
            now,
            nextRunAt: schedule.scheduleType === 'one-time' ? null : nextRunAt,
            nextScheduleStatus,
          });

    if (!claimed) {
      console.log(
        `[TaskScheduler] Skipping schedule ${schedule.id}: already running or no longer eligible`
      );
      return;
    }

    // Notify UI immediately (shows running state + updated next run time)
    sendToRenderer('schedule:updated', { scheduleId: schedule.id });

    try {
      const taskId = createTaskId();
      const taskManager = getTaskManager();

      // Create task config
      const config: TaskConfig = {
        prompt: schedule.prompt,
        taskId,
      };

      // Start the task using TaskManager (may return 'running' or 'queued')
      const task = await taskManager.startTask(taskId, config, {
        onMessage: (message: OpenCodeMessage) => {
          const taskMessage = toTaskMessage(message);
          if (!taskMessage) return;
          taskHistoryRepo.addTaskMessage(taskId, taskMessage);
          sendToRenderer('task:update', { taskId, type: 'message', message: taskMessage });
        },
        onProgress: (progress) => {
          sendToRenderer('task:progress', { taskId, ...progress });
        },
        onPermissionRequest: (request) => {
          sendToRenderer('permission:request', request);
        },
        onComplete: (result) => {
          const completedAt = new Date().toISOString();

          let status: TaskStatus = 'completed';
          if (result.status === 'error') {
            status = 'failed';
          } else if (result.status === 'interrupted') {
            status = 'interrupted';
          } else if (result.status === 'success' || !result.status) {
            status = 'completed';
          }

          // Update session ID if available (important for interrupted tasks to allow continuation)
          const sessionId = result.sessionId || taskManager.getSessionId(taskId);
          if (sessionId) {
            taskHistoryRepo.updateTaskSessionId(taskId, sessionId);
          }

          // Clear todos from DB only on success (keep todos for failed/interrupted tasks)
          if (result.status === 'success') {
            taskHistoryRepo.clearTodosForTask(taskId);
          }

          taskHistoryRepo.updateTaskStatus(taskId, status, completedAt);
          sendToRenderer('task:update', { taskId, type: 'complete', result });

          // Reflect execution status on the schedule itself
          const scheduleExecutionStatus =
            result.status === 'error' || result.status === 'interrupted' ? 'failed' : 'completed';
          const executionError =
            scheduleExecutionStatus === 'failed'
              ? result.status === 'interrupted'
                ? 'Task interrupted'
                : 'Task failed'
              : null;

          repo.updateScheduleExecutionStatus(schedule.id, scheduleExecutionStatus, executionError);
          sendToRenderer('schedule:updated', { scheduleId: schedule.id });
        },
        onError: (error) => {
          const completedAt = new Date().toISOString();
          console.error(`[TaskScheduler] Task ${taskId} error:`, error);
          taskHistoryRepo.updateTaskStatus(taskId, 'failed', completedAt);
          sendToRenderer('task:update', { taskId, type: 'error', error: error.message });

          repo.updateScheduleExecutionStatus(schedule.id, 'failed', error.message);
          sendToRenderer('schedule:updated', { scheduleId: schedule.id });
        },
        onStatusChange: (status) => {
          taskHistoryRepo.updateTaskStatus(taskId, status);
          sendToRenderer('task:status-change', { taskId, status });
        },
        onDebug: (log) => {
          if (!getDebugMode()) {
            return;
          }
          sendToRenderer('debug:log', {
            taskId,
            timestamp: new Date().toISOString(),
            ...log,
          });
        },
        onTodoUpdate: (todos) => {
          // Save to database for persistence
          taskHistoryRepo.saveTodosForTask(taskId, todos);
          sendToRenderer('todo:update', { taskId, todos });
        },
        onAuthError: (error) => {
          sendToRenderer('auth:error', error);
        },
      });

      // Add initial user message with the prompt (match task:start behavior)
      const initialUserMessage: TaskMessage = {
        id: createMessageId(),
        type: 'user',
        content: schedule.prompt,
        timestamp: new Date().toISOString(),
      };
      task.messages = [initialUserMessage];

      // Persist initial task (includes correct status + initial user message)
      taskHistoryRepo.saveTask(task);

      // Notify renderer about the new task so sidebar updates immediately
      sendToRenderer('task:created', task);

      // Mark schedule as executed
      repo.markScheduleExecuted(schedule.id, taskId);
      // Notify UI about schedule update (lastTaskId, lastRunAt)
      sendToRenderer('schedule:updated', { scheduleId: schedule.id });
    } catch (error) {
      console.error(`[TaskScheduler] Failed to execute schedule ${schedule.id}:`, error);
      repo.updateScheduleExecutionStatus(
        schedule.id,
        'failed',
        error instanceof Error ? error.message : String(error)
      );
      sendToRenderer('schedule:updated', { scheduleId: schedule.id });
    }
  }

  /**
   * Execute a specific schedule immediately (manual trigger)
   */
  async executeScheduleNow(scheduleId: string): Promise<void> {
    const schedule = repo.getScheduledTask(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule ${scheduleId} not found`);
    }

    if (schedule.status !== 'active') {
      throw new Error(`Schedule ${scheduleId} is not active`);
    }

    if (schedule.executionStatus === 'running') {
      throw new Error(`Schedule ${scheduleId} is already running`);
    }

    await this.executeSchedule(schedule, 'manual');
  }

  /**
   * Dismiss a missed one-time schedule without running it.
   * Marks it as completed with a failed execution status.
   */
  dismissMissedSchedule(scheduleId: string): void {
    console.log(`[TaskScheduler] Dismissing missed schedule ${scheduleId}`);
    repo.updateScheduleStatus(scheduleId, 'completed');
    repo.updateScheduleExecutionStatus(
      scheduleId,
      'failed',
      'Missed scheduled time (dismissed by user)'
    );
  }

  /**
   * Ensure a newly created schedule has its next run time computed
   */
  scheduleNext(schedule: ScheduledTask): void {
    if (schedule.scheduleType === 'recurring' && schedule.cronExpression && !schedule.nextRunAt) {
      const nextRun = this.computeNextRun(schedule.cronExpression, schedule.timezone);
      if (nextRun) {
        repo.updateNextRunTime(schedule.id, nextRun);
        console.log(
          `[TaskScheduler] Computed initial next run for schedule ${schedule.id}: ${nextRun}`
        );
      } else {
        console.error(
          `[TaskScheduler] Disabling schedule ${schedule.id}: failed to compute initial next run time`
        );
        repo.updateScheduledTask(schedule.id, { enabled: false });
        repo.updateScheduleExecutionStatus(
          schedule.id,
          'failed',
          'Invalid cron expression for timezone (failed to compute next run)'
        );
      }
    }
  }

  /**
   * Compute the next run time for a cron expression
   */
  computeNextRun(cronExpression: string, timezone: string): string | null {
    try {
      const cron = CronExpressionParser.parse(cronExpression, {
        tz: timezone,
        currentDate: new Date(),
      });
      const next = cron.next();
      return next.toISOString();
    } catch (error) {
      console.error(`[TaskScheduler] Failed to parse cron expression: ${cronExpression}`, error);
      return null;
    }
  }
}

// Singleton instance
let schedulerInstance: TaskScheduler | null = null;

/**
 * Get the global TaskScheduler instance
 */
export function getScheduler(): TaskScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new TaskScheduler();
  }
  return schedulerInstance;
}

/**
 * Dispose the global TaskScheduler instance
 */
export function disposeScheduler(): void {
  if (schedulerInstance) {
    schedulerInstance.stop();
    schedulerInstance = null;
  }
}
