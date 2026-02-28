import type {
  DesktopActionRequest,
  DesktopActionResponse,
  DesktopContextOptions,
  DesktopContextSnapshot,
  DesktopControlStatusSnapshot,
  LiveScreenFramePayload,
  LiveScreenSessionStartPayload,
  LiveScreenStartOptions,
  LiveScreenStopPayload,
  ToolFailure,
} from '@accomplish/shared';
import { getDesktopControlStatus } from './preflight';
import { executeDesktopAction } from './action-executor';
import {
  createLiveScreenSessionManager,
  type LiveScreenSessionManager,
  type LiveScreenSessionSnapshot,
} from './live-screen';
import { systemPreferences } from 'electron';
import { getDesktopContextService } from '../services/desktop-context-service';
import { getAllowMouseControl, getLiveScreenSampling } from '../store/appSettings';

export interface DesktopControlDataAccess {
  getReadinessStatus(options?: { forceRefresh?: boolean }): Promise<DesktopControlStatusSnapshot>;
  captureDesktopContext(options?: DesktopContextOptions): Promise<DesktopContextSnapshot>;
  executeAction(request: DesktopActionRequest): Promise<DesktopActionResponse>;
  startLiveScreenSession(options?: LiveScreenStartOptions): Promise<LiveScreenSessionStartPayload>;
  getLiveScreenFrame(sessionId: string): Promise<LiveScreenFramePayload>;
  updateLiveScreenSession(sessionId: string): Promise<LiveScreenFramePayload>;
  refreshLiveScreenFrame(sessionId: string): Promise<LiveScreenFramePayload>;
  getLiveScreenSession(sessionId: string): Promise<LiveScreenSessionSnapshot | null>;
  listLiveScreenSessions(): Promise<LiveScreenSessionSnapshot[]>;
  closeLiveScreenSession(sessionId: string): Promise<LiveScreenStopPayload>;
  deleteLiveScreenSession(sessionId: string): Promise<void>;
  stopLiveScreenSession(sessionId: string): Promise<LiveScreenStopPayload>;
}

export function createDesktopControlDataAccess(): DesktopControlDataAccess {
  const liveScreenManager: LiveScreenSessionManager = createLiveScreenSessionManager();
  const dataAccessUnavailable = (feature: string): Error =>
    new Error(`DesktopControlDataAccess ${feature} is not configured yet.`);

  return {
    getReadinessStatus: async (options?: { forceRefresh?: boolean }) => {
      return await getDesktopControlStatus(options);
    },
    executeAction: async (request: DesktopActionRequest) => {
      if (!getAllowMouseControl()) {
        const failure: ToolFailure = {
          code: 'ERR_PERMISSION_DENIED',
          category: 'permission',
          source: 'action_execution',
          message: 'Mouse/keyboard control is disabled in settings.',
          retryable: false,
        };
        throw failure;
      }
      // Re-verify accessibility permission at runtime (not just the toggle)
      if (
        process.platform === 'darwin' &&
        !systemPreferences.isTrustedAccessibilityClient(false)
      ) {
        const failure: ToolFailure = {
          code: 'ERR_PERMISSION_DENIED',
          category: 'permission',
          source: 'action_execution',
          message: 'Accessibility permission required. Grant access in System Settings > Privacy & Security > Accessibility.',
          retryable: false,
        };
        throw failure;
      }
      return await executeDesktopAction(request);
    },
    captureDesktopContext: async (options?: DesktopContextOptions) => {
      const service = getDesktopContextService();
      const context = await service.getDesktopContext(options ?? {});
      return {
        timestamp: new Date().toISOString(),
        ...context,
      };
    },
    startLiveScreenSession: async (options?: LiveScreenStartOptions) => {
      if (!getLiveScreenSampling()) {
        const failure: ToolFailure = {
          code: 'ERR_PERMISSION_DENIED',
          category: 'permission',
          source: 'live_screen',
          message: 'Live screen sampling is disabled in settings.',
          retryable: false,
        };
        throw failure;
      }
      return await liveScreenManager.startSession(options);
    },
    getLiveScreenFrame: async (sessionId: string): Promise<LiveScreenFramePayload> => {
      const snapshot = liveScreenManager.getSessionSnapshot(sessionId);
      if (!snapshot) {
        throw new Error(`Unknown live screen session: ${sessionId}`);
      }
      return snapshot.lastFrame;
    },
    refreshLiveScreenFrame: async (sessionId: string): Promise<LiveScreenFramePayload> => {
      return await liveScreenManager.refreshSessionFrame(sessionId);
    },
    updateLiveScreenSession: async (sessionId: string): Promise<LiveScreenFramePayload> => {
      return await liveScreenManager.refreshSessionFrame(sessionId);
    },
    getLiveScreenSession: async (sessionId: string): Promise<LiveScreenSessionSnapshot | null> => {
      return liveScreenManager.getSessionSnapshot(sessionId);
    },
    listLiveScreenSessions: async (): Promise<LiveScreenSessionSnapshot[]> => {
      return liveScreenManager.listSessions();
    },
    stopLiveScreenSession: async (sessionId: string): Promise<LiveScreenStopPayload> => {
      const stopped = liveScreenManager.stopSession(sessionId);
      if (!stopped) {
        throw new Error(`Unknown live screen session: ${sessionId}`);
      }
      return {
        sessionId,
        status: 'stopped',
        stoppedAt: new Date().toISOString(),
      };
    },
    closeLiveScreenSession: async (sessionId: string): Promise<LiveScreenStopPayload> => {
      const stopped = liveScreenManager.stopSession(sessionId);
      if (!stopped) {
        throw new Error(`Unknown live screen session: ${sessionId}`);
      }
      return {
        sessionId,
        status: 'stopped',
        stoppedAt: new Date().toISOString(),
      };
    },
    deleteLiveScreenSession: async (sessionId: string): Promise<void> => {
      const stopped = liveScreenManager.stopSession(sessionId);
      if (!stopped) {
        throw new Error(`Unknown live screen session: ${sessionId}`);
      }
    },
  };
}
