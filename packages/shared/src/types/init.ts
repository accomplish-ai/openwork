/**
 * Structured error for initialization failures.
 * Verbose by default - captures full context for debugging.
 */
export interface InitError {
  code: string;
  component: string;
  message: string;
  guidance: string;
  debugInfo: {
    platform: string;
    expectedPath?: string;
    actualPath?: string | null;
    searchedPaths?: string[];
    env?: Record<string, string>;
    stderr?: string;
    exitCode?: number | null;
    nodeVersion?: string | null;
  };
}

export type HealthStatus = 'pending' | 'checking' | 'healthy' | 'degraded' | 'failed';

export interface ComponentHealth {
  name: string;
  displayName: string;
  status: HealthStatus;
  lastCheck: number | null;
  error: InitError | null;
  retryCount: number;
}

export interface SystemHealth {
  overall: HealthStatus;
  components: ComponentHealth[];
  lastFullCheck: number | null;
  isChecking: boolean;
  checkingComponent: string | null;
}

export const HEALTH_COMPONENTS = [
  'bundled-node',
  'mcp:file-permission',
  'mcp:ask-user-question',
  'mcp:dev-browser-mcp',
  'mcp:complete-task',
  'chrome',
] as const;

export type HealthComponent = typeof HEALTH_COMPONENTS[number];
