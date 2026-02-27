import type {
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

export interface DesktopControlDomainState {
  readiness: DesktopControlReadinessState;
  toolHealth: DesktopControlToolHealthState;
  context: DesktopControlContextState;
  liveScreen: DesktopControlLiveScreenState;
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
  };
}
