export type CaptureMode = 'active-window' | 'full-screen';
export type WindowCaptureState =
  | 'capturable'
  | 'minimized'
  | 'offscreen'
  | 'permission_denied'
  | 'protected_or_blank'
  | 'not_found'
  | 'unknown';

export type ErrorCode =
  | 'ERR_UNKNOWN_TOOL'
  | 'ERR_INVALID_INPUT'
  | 'ERR_CAPTURE_PERMISSION_DENIED'
  | 'ERR_CAPTURE_COMMAND_FAILED'
  | 'ERR_CAPTURE_OUTPUT_MISSING'
  | 'ERR_CAPTURE_RETRY_EXHAUSTED'
  | 'ERR_SCREEN_INFO_FAILED'
  | 'ERR_DESKTOP_CONTEXT_UNAVAILABLE'
  | 'ERR_DESKTOP_CONTEXT_PROTOCOL'
  | 'ERR_DESKTOP_CONTEXT_TIMEOUT'
  | 'ERR_DESKTOP_CONTEXT_HELPER_EXITED'
  | 'ERR_DESKTOP_CONTEXT_PERMISSION_DENIED'
  | 'ERR_DESKTOP_CONTEXT_ACCESSIBILITY_DENIED'
  | 'ERR_DESKTOP_CONTEXT_WINDOW_NOT_FOUND'
  | 'ERR_IMAGE_TOO_LARGE'
  | 'ERR_INTERNAL';

export interface DesktopContextCommand {
  cmd: 'list_windows' | 'inspect_window' | 'capture';
  id: string;
  params?: {
    windowId?: number;
    mode?: 'window' | 'screen';
    maxDepth?: number;
    maxNodes?: number;
  };
}

export interface AccessibleNodeFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AccessibleNodeLike {
  role?: unknown;
  title?: unknown;
  value?: unknown;
  description?: unknown;
  frame?: unknown;
  children?: unknown;
  enabled?: unknown;
  focused?: unknown;
}

export interface DesktopContextWindow {
  id: number;
  appName: string;
  pid: number;
  title: string;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  zOrder: number;
  stackIndex?: number;
  isOnScreen: boolean;
  isMinimized: boolean;
  isVisible: boolean;
  isFrontmostApp?: boolean;
  appIsHidden?: boolean;
  layer: number;
}

export interface DesktopContextResponse {
  id: string;
  success: boolean;
  error?: string;
  data?: {
    windows?: DesktopContextWindow[];
    tree?: unknown;
    imagePath?: string;
    region?: { x: number; y: number; width: number; height: number };
  };
}

export interface PendingRequest {
  resolve: (value: DesktopContextResponse) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export interface WindowContextRecord {
  window: DesktopContextWindow;
  captureState: WindowCaptureState;
  capturedAt: string;
  imageBase64?: string;
  imageMimeType?: 'image/png';
  imageBytes?: number;
  imageWidth?: number;
  imageHeight?: number;
  errorCode?: ErrorCode;
  error?: string;
  fingerprint: string;
}

export interface BackgroundSnapshot {
  capturedAt: string;
  refreshedAtMs: number;
  windows: WindowContextRecord[];
}

export interface BackgroundContextArgs {
  include_images?: boolean;
  include_ax?: boolean;
  window_ids?: number[];
  force_refresh?: boolean;
}

export interface ListWindowsArgs {
  include_minimized?: boolean;
  include_offscreen?: boolean;
}

export interface FindTextInputsArgs {
  window_id?: unknown;
  app_name?: unknown;
  max_depth?: unknown;
  max_nodes?: unknown;
}

export interface CaptureSelectionContext {
  foregroundAppName: string | null;
  topWindowId: number | null;
}

export interface WindowImageLimits {
  maxBytes: number;
  maxDimension: number;
}

export interface TextInputCandidate {
  role: string;
  title?: string;
  description?: string;
  valuePreview?: string;
  frame: AccessibleNodeFrame;
  clickPoint: { x: number; y: number };
  enabled?: boolean;
  focused?: boolean;
  score: number;
  reasons: string[];
}

export interface BuildWindowContextOptions {
  imageLimits?: WindowImageLimits;
}
