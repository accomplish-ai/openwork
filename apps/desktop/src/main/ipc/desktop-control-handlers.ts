import type { IpcMainInvokeEvent } from 'electron';
import { BrowserWindow } from 'electron';
import type { LiveScreenStartOptions } from '@accomplish/shared';
import {
  validate,
  desktopControlStatusRequestSchema,
  desktopControlStatusResponseSchema,
  liveScreenStartOptionsSchema,
  liveScreenSessionStartResponseSchema,
  liveScreenFrameRequestSchema,
  liveScreenFrameResponseSchema,
  liveScreenStopRequestSchema,
  liveScreenStopResponseSchema,
} from './validation';
import { handle } from './message-utils';
import { getDesktopControlService } from '../desktop-control/service';

/**
 * Register desktop control IPC handlers
 */
export function registerDesktopControlHandlers(): void {
  // Desktop control: Return preflight readiness status for screen/action tools
  handle(
    'desktopControl:getStatus',
    async (
      _event: IpcMainInvokeEvent,
      options?: { forceRefresh?: boolean }
    ) => {
      const request = validate(desktopControlStatusRequestSchema, options ?? {});
      const status = await getDesktopControlService().getReadinessStatus(request);
      return validate(desktopControlStatusResponseSchema, status);
    }
  );

  handle(
    'desktopControl:startLiveScreenSession',
    async (_event: IpcMainInvokeEvent, options?: unknown) => {
      const request = validate(liveScreenStartOptionsSchema, options);
      const payload = await getDesktopControlService().startLiveScreenSession(request);
      return validate(liveScreenSessionStartResponseSchema, payload);
    }
  );

  handle(
    'desktopControl:getLiveScreenFrame',
    async (_event: IpcMainInvokeEvent, request?: unknown) => {
      const payload = validate(liveScreenFrameRequestSchema, request ?? {});
      const frame = await getDesktopControlService().getLiveScreenFrame(payload.sessionId);
      return validate(liveScreenFrameResponseSchema, frame);
    }
  );

  handle(
    'desktopControl:refreshLiveScreenFrame',
    async (_event: IpcMainInvokeEvent, request?: unknown) => {
      const payload = validate(liveScreenFrameRequestSchema, request ?? {});
      const frame = await getDesktopControlService().refreshLiveScreenFrame(payload.sessionId);
      return validate(liveScreenFrameResponseSchema, frame);
    }
  );

  handle(
    'desktopControl:stopLiveScreenSession',
    async (_event: IpcMainInvokeEvent, request?: unknown) => {
      const payload = validate(liveScreenStopRequestSchema, request ?? {});
      const result = await getDesktopControlService().stopLiveScreenSession(payload.sessionId);
      return validate(liveScreenStopResponseSchema, result);
    }
  );

  // Undo last action (mouse move only)
  handle('desktopControl:undoLastAction', async () => {
    const result = await getDesktopControlService().undoLastAction();
    return result ?? { undone: false };
  });

  // Restart live screen session (cleanup + fresh start)
  handle(
    'desktopControl:restartLiveScreenSession',
    async (_event: IpcMainInvokeEvent, options?: LiveScreenStartOptions) => {
      const payload = await getDesktopControlService().restartLiveScreenSession(options);
      return validate(liveScreenSessionStartResponseSchema, payload);
    }
  );

  // Clear sensitive data
  handle('desktopControl:clearSensitiveData', async () => {
    getDesktopControlService().clearSensitiveData();
    return { ok: true };
  });

  // Subscribe renderer to desktop control events via IPC push
  const service = getDesktopControlService();
  service.onEvent((event) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('desktopControl:event', event);
      }
    }
  });
}
