import type { IpcMainInvokeEvent } from 'electron';
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
}
