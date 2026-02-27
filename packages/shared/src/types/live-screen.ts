/**
 * Shared contracts for sampled live screen sessions.
 */

export type LiveScreenToolErrorCode = 'INVALID_SESSION' | 'EXPIRED_SESSION' | 'CAPTURE_FAILURE';

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
