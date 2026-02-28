export interface LiveScreenStartOptions {
  sampleFps?: number;
  durationSeconds?: number;
  includeCursor?: boolean;
  activeWindowOnly?: boolean;
}

export interface LiveScreenSessionStartPayload {
  sessionId: string;
  sampleFps: number;
  sampleIntervalMs: number;
  startedAt: string;
  expiresAt: string;
  expiresInSeconds: number;
  maxLifetimeSeconds: number;
  initialFrameSequence: number;
  initialFrameCapturedAt: string;
}

export interface LiveScreenFramePayload {
  sessionId: string;
  frameSequence: number;
  capturedAt: string;
  staleMs: number;
  expiresAt: string;
  sampleFps: number;
  imagePath?: string;
  captureWarning?: string;
}

export interface LiveScreenStopPayload {
  sessionId: string;
  status: 'stopped';
  stoppedAt: string;
}

export const DESKTOP_CONTROL_BRIDGE_CHANNELS = {
  getStatus: 'desktopControl:getStatus',
} as const;

export const DESKTOP_CONTROL_BRIDGE_ERROR_CODES = {
  apiUnavailable: 'desktop_control_status_api_unavailable',
  ipcInvokeFailed: 'desktop_control_status_ipc_failed',
} as const;

export type DesktopControlOverallStatus =
  | 'ready'
  | 'needs_screen_recording_permission'
  | 'needs_accessibility_permission'
  | 'mcp_unhealthy'
  | 'unknown';

export type DesktopControlCapability = 'screen_capture' | 'action_execution' | 'mcp_health';
export type DesktopControlCheckStatus = 'ready' | 'blocked' | 'unknown';

export interface DesktopControlRemediation {
  title: string;
  steps: string[];
  systemSettingsPath?: string;
}

export interface DesktopControlCapabilityStatus {
  capability: DesktopControlCapability;
  status: DesktopControlCheckStatus;
  errorCode: string | null;
  message: string;
  remediation: DesktopControlRemediation;
  checkedAt: string;
  details?: Record<string, unknown>;
}

export interface DesktopControlStatusSnapshot {
  status: DesktopControlOverallStatus;
  errorCode: string | null;
  message: string;
  remediation: DesktopControlRemediation;
  checkedAt: string;
  cache: {
    ttlMs: number;
    expiresAt: string;
    fromCache: boolean;
  };
  checks: {
    screen_capture: DesktopControlCapabilityStatus;
    action_execution: DesktopControlCapabilityStatus;
    mcp_health: DesktopControlCapabilityStatus;
  };
}

export interface DesktopControlStatusRequest {
  forceRefresh?: boolean;
}

export interface DesktopControlBridgeNamespace {
  getStatus(options?: DesktopControlStatusRequest): Promise<DesktopControlStatusSnapshot>;
  liveScreen: {
    startSession(options?: LiveScreenStartOptions): Promise<LiveScreenSessionStartPayload>;
    getFrame(sessionId: string): Promise<LiveScreenFramePayload>;
    refreshFrame(sessionId: string): Promise<LiveScreenFramePayload>;
    stopSession(sessionId: string): Promise<LiveScreenStopPayload>;
    restartSession(options?: LiveScreenStartOptions): Promise<LiveScreenSessionStartPayload>;
  };
  undoLastAction(): Promise<unknown>;
  clearSensitiveData(): Promise<{ ok: true }>;
}

export interface DesktopControlBridgeAPI {
  getDesktopControlStatus(options?: DesktopControlStatusRequest): Promise<DesktopControlStatusSnapshot>;
  desktopControlGetStatus(options?: DesktopControlStatusRequest): Promise<DesktopControlStatusSnapshot>;
  desktopControl: DesktopControlBridgeNamespace;
}

function createBridgeRemediation(): DesktopControlRemediation {
  return {
    title: 'Desktop control status bridge unavailable',
    steps: [
      'Restart Screen Agent and run Recheck again.',
      'If this persists, update or reinstall the desktop app.',
    ],
  };
}

function createUnknownCapabilityStatus(
  capability: DesktopControlCapability,
  checkedAt: string,
  errorCode: string,
  technicalDetail?: string
): DesktopControlCapabilityStatus {
  return {
    capability,
    status: 'unknown',
    errorCode,
    message: 'Readiness could not be checked because the desktop-control status bridge failed.',
    remediation: createBridgeRemediation(),
    checkedAt,
    details: technicalDetail ? { cause: technicalDetail } : undefined,
  };
}

export function normalizeDesktopControlIpcErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    const message = (error as { message: string }).message.trim();
    if (message.length > 0) {
      return message;
    }
  }

  return 'Unknown IPC error';
}

export function createDesktopControlBridgeErrorSnapshot(params: {
  errorCode: string;
  message: string;
  technicalDetail?: string;
}): DesktopControlStatusSnapshot {
  const checkedAt = new Date().toISOString();
  const remediation = createBridgeRemediation();

  return {
    status: 'unknown',
    errorCode: params.errorCode,
    message: params.message,
    remediation,
    checkedAt,
    cache: {
      ttlMs: 0,
      expiresAt: checkedAt,
      fromCache: false,
    },
    checks: {
      screen_capture: createUnknownCapabilityStatus(
        'screen_capture',
        checkedAt,
        params.errorCode,
        params.technicalDetail
      ),
      action_execution: createUnknownCapabilityStatus(
        'action_execution',
        checkedAt,
        params.errorCode,
        params.technicalDetail
      ),
      mcp_health: createUnknownCapabilityStatus(
        'mcp_health',
        checkedAt,
        params.errorCode,
        params.technicalDetail
      ),
    },
  };
}

export function createDesktopControlBridgeUnavailableSnapshot(
  technicalDetail?: string
): DesktopControlStatusSnapshot {
  return createDesktopControlBridgeErrorSnapshot({
    errorCode: DESKTOP_CONTROL_BRIDGE_ERROR_CODES.apiUnavailable,
    message: 'Desktop-control readiness API is unavailable in the renderer bridge.',
    technicalDetail,
  });
}

export function createDesktopControlIpcFailureSnapshot(
  technicalDetail?: string
): DesktopControlStatusSnapshot {
  return createDesktopControlBridgeErrorSnapshot({
    errorCode: DESKTOP_CONTROL_BRIDGE_ERROR_CODES.ipcInvokeFailed,
    message: 'Desktop-control readiness check failed over IPC.',
    technicalDetail,
  });
}
