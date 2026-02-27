import type {
  DesktopControlStatusSnapshot,
  LiveScreenFramePayload,
  LiveScreenSessionStartPayload,
  ToolFailure,
} from '@accomplish/shared';

export type LiveScreenSessionStatus = 'active' | 'expired' | 'stopped';

export interface LiveScreenSessionState {
  session: LiveScreenSessionStartPayload;
  status: LiveScreenSessionStatus;
  lastFrame?: LiveScreenFramePayload;
  stoppedAt?: string;
}

export interface DesktopControlState {
  readiness: DesktopControlStatusSnapshot | null;
  readinessCheckedAt: string | null;
  liveScreen: LiveScreenSessionState | null;
  lastToolFailure: ToolFailure | null;
}

export function createDesktopControlState(): DesktopControlState {
  return {
    readiness: null,
    readinessCheckedAt: null,
    liveScreen: null,
    lastToolFailure: null,
  };
}
