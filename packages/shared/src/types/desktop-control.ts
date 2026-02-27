/**
 * Shared desktop-control contracts for readiness, tool failures, and MCP health.
 */

export type DesktopControlCapability = 'screen_capture' | 'action_execution' | 'mcp_health';

export type DesktopControlStatus =
  | 'ready'
  | 'needs_screen_recording_permission'
  | 'needs_accessibility_permission'
  | 'mcp_unhealthy'
  | 'unknown';

export type ScreenCaptureReadinessStatus =
  | 'ready'
  | 'needs_screen_recording_permission'
  | 'mcp_unhealthy'
  | 'unknown';

export type ActionExecutionReadinessStatus =
  | 'ready'
  | 'needs_accessibility_permission'
  | 'mcp_unhealthy'
  | 'unknown';

export type McpHealthReadinessStatus = 'ready' | 'degraded' | 'mcp_unhealthy' | 'unknown';

export interface DesktopControlCapabilityStatuses {
  screen_capture: ScreenCaptureReadinessStatus;
  action_execution: ActionExecutionReadinessStatus;
  mcp_health: McpHealthReadinessStatus;
}

export interface DesktopControlReadinessSnapshot {
  status: DesktopControlStatus;
  capabilities: DesktopControlCapabilityStatuses;
  checkedAt: number;
  message?: string;
  remediation?: string;
}

export type ToolErrorCode =
  | 'ERR_PERMISSION_DENIED'
  | 'ERR_TIMEOUT'
  | 'ERR_UNAVAILABLE_BINARY'
  | 'ERR_VALIDATION_ERROR'
  | 'ERR_UNKNOWN';

export type ToolFailureCategory =
  | 'permission'
  | 'timeout'
  | 'unavailable'
  | 'validation'
  | 'dependency'
  | 'internal'
  | 'unknown';

export type ToolFailureSource =
  | 'readiness'
  | 'context'
  | 'live_screen'
  | 'screen_capture'
  | 'action_execution'
  | 'mcp'
  | 'service'
  | 'unknown';

export interface ToolFailure {
  code: ToolErrorCode;
  message: string;
  capability?: DesktopControlCapability;
  category?: ToolFailureCategory;
  source?: ToolFailureSource;
  retryable?: boolean;
  retryAfterMs?: number;
  details?: Record<string, unknown>;
}

export type DesktopControlResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ToolFailure };

export type DesktopActionType =
  | 'move_mouse'
  | 'click'
  | 'double_click'
  | 'activate_app'
  | 'type_text'
  | 'press_key'
  | 'scroll';

export type DesktopActionButton = 'left' | 'right';

export type DesktopActionModifier = 'command' | 'shift' | 'option' | 'control';

export type DesktopActionScrollDirection = 'up' | 'down' | 'left' | 'right';

export type DesktopActionRequest =
  | { type: 'move_mouse'; x: number; y: number }
  | { type: 'click'; x: number; y: number; button?: DesktopActionButton }
  | { type: 'double_click'; x: number; y: number }
  | { type: 'activate_app'; appName: string }
  | { type: 'type_text'; text: string }
  | { type: 'press_key'; key: string; modifiers?: DesktopActionModifier[] }
  | { type: 'scroll'; direction: DesktopActionScrollDirection; amount?: number };

export interface DesktopActionResponse {
  action: DesktopActionRequest;
  message: string;
  executedAt: string;
  details?: Record<string, unknown>;
}

export type McpSkillState = 'healthy' | 'degraded' | 'unhealthy' | 'starting' | 'stopped' | 'unknown';

export interface McpSkillHealth {
  state: McpSkillState;
  lastSeenAt?: number;
  lastRestartAt?: number;
  updatedAt: number;
  restartAttempts: number;
  error?: ToolFailure;
}

export interface ToolHealthSnapshot {
  checkedAt: number;
  overallState: McpHealthReadinessStatus;
  skills: Record<string, McpSkillHealth>;
}

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
  status: DesktopControlStatus;
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
