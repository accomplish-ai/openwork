import { registerApiKeyHandlers } from './api-key-handlers';
import { registerSettingsHandlers } from './settings-handlers';
import { registerTaskHandlers } from './task-handlers';
import { registerDesktopControlHandlers } from './desktop-control-handlers';
import { registerScreenHandlers } from './screen-handlers';
import { registerDesktopContextHandlers } from './desktop-context-handlers';

/**
 * Register all IPC handlers.
 *
 * This is the single entry point called from main/index.ts.
 * Each handler module registers its own channels via ipcMain.handle().
 */
export function registerIPCHandlers(): void {
  registerApiKeyHandlers();
  registerSettingsHandlers();
  registerTaskHandlers();
  registerDesktopControlHandlers();
  registerScreenHandlers();
  registerDesktopContextHandlers();
}
