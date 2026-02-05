// apps/desktop/src/main/ipc/scheduler/index.ts

import { ipcMain } from 'electron';
import * as handlers from './handlers';
import { normalizeIpcError } from '../validation';

/**
 * Type-safe handler wrapper with error normalization
 */
function handle<Args extends unknown[], R>(
  channel: string,
  handler: (...args: Args) => Promise<R> | R
): void {
  ipcMain.handle(channel, async (_, ...args) => {
    try {
      return await handler(...(args as Args));
    } catch (error) {
      console.error(`[Scheduler IPC] ${channel} failed:`, error);
      throw normalizeIpcError(error);
    }
  });
}

/**
 * Register all scheduler IPC handlers
 */
export function registerSchedulerHandlers(): void {
  console.log('[Scheduler IPC] Registering handlers');

  handle('schedule:create', handlers.createSchedule);
  handle('schedule:list', handlers.listSchedules);
  handle('schedule:get', handlers.getSchedule);
  handle('schedule:update', handlers.updateSchedule);
  handle('schedule:delete', handlers.deleteSchedule);
  handle('schedule:toggle', handlers.toggleSchedule);
  handle('schedule:run-now', handlers.runScheduleNow);
  handle('schedule:dismiss-missed', handlers.dismissMissedSchedule);
  handle('schedule:active-count', handlers.getActiveScheduleCount);

  console.log('[Scheduler IPC] Handlers registered');
}
