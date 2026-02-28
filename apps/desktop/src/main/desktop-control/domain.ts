import type {
  DesktopActionRequest,
  DesktopActionResponse,
  DesktopContextSnapshot,
  DesktopControlStatusSnapshot,
  LiveScreenFramePayload,
  LiveScreenSessionStartPayload,
  ToolFailure,
  ToolHealthSnapshot,
} from '@accomplish/shared';

export type DesktopControlLiveSessionPhase =
  | 'idle'
  | 'starting'
  | 'active'
  | 'stopping'
  | 'error';

export interface DesktopControlReadinessState {
  snapshot: DesktopControlStatusSnapshot | null;
  lastUpdatedAt: number | null;
}

export interface DesktopControlToolHealthState {
  snapshot: ToolHealthSnapshot | null;
  lastUpdatedAt: number | null;
}

export interface DesktopControlContextState {
  snapshot: DesktopContextSnapshot | null;
  lastUpdatedAt: number | null;
}

export interface DesktopControlLiveScreenState {
  phase: DesktopControlLiveSessionPhase;
  session: LiveScreenSessionStartPayload | null;
  lastFrame: LiveScreenFramePayload | null;
  lastFailure: ToolFailure | null;
  lastUpdatedAt: number;
}

export interface DesktopControlActionExecutionState {
  lastAction: DesktopActionResponse | null;
  lastFailure: ToolFailure | null;
  executionCount: number;
  lastUpdatedAt: number | null;
  history: DesktopControlActionHistoryEntry[];
}

export interface DesktopControlActionHistoryEntry {
  request: DesktopActionRequest;
  response: DesktopActionResponse | null;
  failure: ToolFailure | null;
  executedAt: number;
}

export const ACTION_HISTORY_MAX_LENGTH = 50;

// --- Events ---

export type DesktopControlEventType =
  | 'action_started'
  | 'action_completed'
  | 'action_failed'
  | 'rate_limited'
  | 'permission_blocked'
  | 'session_started'
  | 'session_stopped'
  | 'readiness_checked'
  | 'sensitive_data_cleared';

export interface DesktopControlEvent {
  type: DesktopControlEventType;
  timestamp: number;
  details?: Record<string, unknown>;
}

export type DesktopControlEventListener = (event: DesktopControlEvent) => void;

export interface DesktopControlDomainState {
  readiness: DesktopControlReadinessState;
  toolHealth: DesktopControlToolHealthState;
  context: DesktopControlContextState;
  liveScreen: DesktopControlLiveScreenState;
  actionExecution: DesktopControlActionExecutionState;
}

export function createInitialDesktopControlState(now: number = Date.now()): DesktopControlDomainState {
  return {
    readiness: {
      snapshot: null,
      lastUpdatedAt: null,
    },
    toolHealth: {
      snapshot: null,
      lastUpdatedAt: null,
    },
    context: {
      snapshot: null,
      lastUpdatedAt: null,
    },
    liveScreen: {
      phase: 'idle',
      session: null,
      lastFrame: null,
      lastFailure: null,
      lastUpdatedAt: now,
    },
    actionExecution: {
      lastAction: null,
      lastFailure: null,
      executionCount: 0,
      lastUpdatedAt: null,
      history: [],
    },
  };
}
