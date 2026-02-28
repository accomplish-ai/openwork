import type { IpcMainInvokeEvent } from 'electron';
import { handle } from './message-utils';
import { getAllowMouseControl } from '../store/appSettings';
import { getDesktopContextService } from '../services/desktop-context-service';
import { executeDesktopAction } from '../desktop-control/action-executor';
import type {
  DesktopContextOptions,
  MouseMovePayload,
  MouseClickPayload,
} from '@accomplish/shared';

/**
 * Register desktop context and mouse control IPC handlers
 */
export function registerDesktopContextHandlers(): void {
  // Desktop Context: List all windows
  handle('desktop:listWindows', async (_event: IpcMainInvokeEvent) => {
    try {
      const service = getDesktopContextService();
      const windows = await service.listWindows();
      return windows;
    } catch (error) {
      console.error('[IPC] Failed to list windows:', error);
      throw error;
    }
  });

  // Desktop Context: Inspect window accessibility tree
  handle(
    'desktop:inspectWindow',
    async (
      _event: IpcMainInvokeEvent,
      windowId: number,
      maxDepth?: number,
      maxNodes?: number
    ) => {
      if (typeof windowId !== 'number' || !Number.isInteger(windowId)) {
        throw new Error('Invalid windowId');
      }
      try {
        const service = getDesktopContextService();
        const tree = await service.inspectWindow(
          windowId,
          maxDepth ?? 10,
          maxNodes ?? 1000
        );
        return tree;
      } catch (error) {
        console.error(`[IPC] Failed to inspect window ${windowId}:`, error);
        throw error;
      }
    }
  );

  // Desktop Context: Capture screenshot
  handle(
    'desktop:capture',
    async (
      _event: IpcMainInvokeEvent,
      options: {
        mode: 'screen' | 'window' | 'region';
        windowId?: number;
        rect?: { x: number; y: number; width: number; height: number };
      }
    ) => {
      if (!options || typeof options.mode !== 'string') {
        throw new Error('Invalid capture options');
      }
      try {
        const service = getDesktopContextService();
        const screenshot = await service.captureScreenshot(
          options.mode,
          options.windowId,
          options.rect
        );
        return screenshot;
      } catch (error) {
        console.error('[IPC] Failed to capture screenshot:', error);
        throw error;
      }
    }
  );

  // Desktop Context: Get full context snapshot
  handle(
    'desktop:getContext',
    async (_event: IpcMainInvokeEvent, options?: DesktopContextOptions) => {
      try {
        const service = getDesktopContextService();
        const context = await service.getDesktopContext(options ?? {});
        return {
          timestamp: new Date().toISOString(),
          ...context,
        };
      } catch (error) {
        console.error('[IPC] Failed to get desktop context:', error);
        throw error;
      }
    }
  );

  // Mouse control: move and click (gated by allowMouseControl setting)
  handle('mouse:move', async (_event: IpcMainInvokeEvent, payload: MouseMovePayload) => {
    if (!getAllowMouseControl()) {
      throw new Error('Mouse control is disabled in settings');
    }

    if (
      !payload ||
      typeof payload.x !== 'number' ||
      typeof payload.y !== 'number' ||
      !Number.isFinite(payload.x) ||
      !Number.isFinite(payload.y)
    ) {
      throw new Error('Invalid mouse move payload');
    }

    const result = await executeDesktopAction({ type: 'move_mouse', x: payload.x, y: payload.y });
    return { ok: true, result };
  });

  handle('mouse:click', async (_event: IpcMainInvokeEvent, payload: MouseClickPayload) => {
    if (!getAllowMouseControl()) {
      throw new Error('Mouse control is disabled in settings');
    }

    if (!payload || typeof payload.button !== 'string') {
      throw new Error('Invalid mouse click payload');
    }

    if (!['left', 'right', 'middle'].includes(payload.button)) {
      throw new Error('Unsupported mouse button');
    }

    // 'middle' is not supported by Quartz bindings — treat as left click
    const button = payload.button === 'middle' ? 'left' : payload.button;
    const result = await executeDesktopAction({ type: 'click', x: 0, y: 0, button });
    return { ok: true, result };
  });
}
