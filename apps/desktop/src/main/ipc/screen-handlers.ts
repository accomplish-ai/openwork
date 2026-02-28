import type { IpcMainInvokeEvent } from 'electron';
import { handle } from './message-utils';
import {
  getScreenSources,
  getPrimaryDisplay,
  getAllDisplays,
  getScreenSourceId,
} from '../services/screen-capture';

/**
 * Register screen capture IPC handlers
 */
export function registerScreenHandlers(): void {
  // Screen Capture: Get available screen sources
  handle(
    'screen:get-sources',
    async (_event: IpcMainInvokeEvent, options?: { types?: ('screen' | 'window')[] }) => {
      try {
        return await getScreenSources({
          types: options?.types || ['screen', 'window'],
          thumbnailSize: { width: 320, height: 180 },
          fetchWindowIcons: true,
        });
      } catch (error) {
        console.error('[IPC] Failed to get screen sources:', error);
        throw error;
      }
    }
  );

  // Screen Capture: Get primary display info
  handle('screen:get-primary-display', async (_event: IpcMainInvokeEvent) => {
    return getPrimaryDisplay();
  });

  // Screen Capture: Get all displays
  handle('screen:get-all-displays', async (_event: IpcMainInvokeEvent) => {
    return getAllDisplays();
  });

  // Screen Capture: Get screen source ID for getUserMedia
  handle('screen:get-source-id', async (_event: IpcMainInvokeEvent, displayId?: string) => {
    try {
      return await getScreenSourceId(displayId);
    } catch (error) {
      console.error('[IPC] Failed to get screen source ID:', error);
      throw error;
    }
  });
}
