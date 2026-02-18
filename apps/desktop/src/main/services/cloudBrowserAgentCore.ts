import type {
  CloudBrowserConfig,
  CloudBrowserCredentials,
} from '@accomplish_ai/agent-core';
import { getStorage } from '../store/storage';
import { getCloudBrowserCredentials } from '../store/secureStorage';

// Constants
const DEFAULT_CONNECT_TIMEOUT_MS = 30000;
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export interface CloudBrowserSession {
  cdpEndpoint: string;
  cdpHeaders?: Record<string, string>;
  sessionId?: string;
  createdAt: number;
}

class CloudBrowserSessionManager {
  private currentSession: CloudBrowserSession | null = null;
  private readonly SESSION_TIMEOUT_MS = SESSION_TIMEOUT_MS;

  getCurrentSession(): CloudBrowserSession | null {
    if (!this.currentSession) {
      return null;
    }

    // Check if session has expired
    if (Date.now() - this.currentSession.createdAt > this.SESSION_TIMEOUT_MS) {
      this.clearSession();
      return null;
    }

    return this.currentSession;
  }

  setSession(session: CloudBrowserSession): void {
    this.clearSession(); // Clear any existing session
    this.currentSession = {
      ...session,
      createdAt: Date.now(),
    };
  }

  clearSession(): void {
    this.currentSession = null;
  }

  isSessionValid(): boolean {
    return this.getCurrentSession() !== null;
  }
}

const sessionManager = new CloudBrowserSessionManager();

function getEnabledCloudBrowserConfig(): CloudBrowserConfig | null {
  const config = getStorage().getCloudBrowserConfig();
  if (!config || !config.enabled || config.provider !== 'aws-agentcore') {
    return null;
  }
  return config;
}

function getCloudBrowserCreds(): CloudBrowserCredentials | null {
  const raw = getCloudBrowserCredentials();
  if (!raw) {
    return null;
  }
  if (raw.authMode !== 'accessKeys' && raw.authMode !== 'profile') {
    return null;
  }
  return raw as unknown as CloudBrowserCredentials;
}

function parseSessionResponse(payload: unknown): CloudBrowserSession {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid AgentCore response payload');
  }

  const data = payload as Record<string, unknown>;
  const cdpEndpoint = (data.cdpEndpoint || data.wsEndpoint || data.websocketUrl) as string | undefined;
  if (!cdpEndpoint || typeof cdpEndpoint !== 'string') {
    throw new Error('AgentCore response missing cdpEndpoint');
  }

  const sessionId = typeof data.sessionId === 'string' ? data.sessionId : undefined;
  const headers = data.headers && typeof data.headers === 'object'
    ? (data.headers as Record<string, string>)
    : undefined;

  return { 
    cdpEndpoint, 
    cdpHeaders: headers, 
    sessionId,
    createdAt: Date.now(),
  };
}

async function createSessionFromAgentCoreApi(
  config: CloudBrowserConfig,
  credentials: CloudBrowserCredentials | null
): Promise<CloudBrowserSession> {
  if (!config.agentCoreApiUrl) {
    throw new Error('AgentCore API URL is required when direct CDP endpoint is not set');
  }

  // Validate and sanitize URL
  let url: URL;
  try {
    url = new URL(config.agentCoreApiUrl);
  } catch {
    throw new Error('Invalid AgentCore API URL format');
  }

  // Only allow HTTPS and HTTP protocols
  if (!['https:', 'http:'].includes(url.protocol)) {
    throw new Error('AgentCore API URL must use HTTP or HTTPS protocol');
  }

  // Remove trailing slashes for consistent URL construction
  const sanitizedUrl = url.toString().replace(/\/+$/, '');
  
  // Add request timeout to prevent hung IPC calls
  const timeoutMs = config.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(`${sanitizedUrl}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        provider: config.provider,
        region: config.region,
        workspaceId: config.workspaceId,
        browserPoolId: config.browserPoolId,
        launchOptions: {
          headless: config.headless ?? true,
          viewportWidth: config.viewportWidth,
          viewportHeight: config.viewportHeight,
          connectTimeoutMs: timeoutMs,
        },
        credentials,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`AgentCore session creation failed (${response.status}): ${body}`);
    }

    const payload = (await response.json()) as unknown;
    return parseSessionResponse(payload);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`AgentCore session creation timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Checks if cloud browser is enabled and configured
 * @returns true if cloud browser is enabled, false otherwise
 */
export function isCloudBrowserEnabled(): boolean {
  return Boolean(getEnabledCloudBrowserConfig());
}

/**
 * Gets the current active cloud browser session
 * @returns Current session or null if no active session
 */
export function getCurrentCloudBrowserSession(): CloudBrowserSession | null {
  return sessionManager.getCurrentSession();
}

/**
 * Ensures a cloud browser session is available, creating one if needed
 * @returns Promise that resolves to an active cloud browser session
 * @throws Error if cloud browser is not enabled or session creation fails
 */
export async function ensureCloudBrowserSession(): Promise<CloudBrowserSession> {
  const existingSession = sessionManager.getCurrentSession();
  if (existingSession?.cdpEndpoint) {
    return existingSession;
  }

  const config = getEnabledCloudBrowserConfig();
  if (!config) {
    throw new Error('Cloud browser is not enabled');
  }

  const credentials = getCloudBrowserCreds();

  if (config.cdpEndpoint) {
    const session = {
      cdpEndpoint: config.cdpEndpoint,
      cdpHeaders: credentials?.cdpSecret ? { 'X-CDP-Secret': credentials.cdpSecret } : undefined,
      sessionId: undefined,
      createdAt: Date.now(),
    };
    sessionManager.setSession(session);
    return session;
  }

  const session = await createSessionFromAgentCoreApi(config, credentials);
  sessionManager.setSession(session);
  return session;
}

/**
 * Clears the current cloud browser session
 */
export function clearCloudBrowserSession(): void {
  sessionManager.clearSession();
}

/**
 * Tests cloud browser connection with provided configuration
 * @param config - Cloud browser configuration to test
 * @param credentials - AWS credentials for authentication
 * @returns Promise resolving to test result with success status and optional session
 */
export async function testCloudBrowserConnection(
  config: CloudBrowserConfig,
  credentials: CloudBrowserCredentials | null
): Promise<{ success: boolean; error?: string; session?: CloudBrowserSession }> {
  try {
    if (config.provider !== 'aws-agentcore') {
      return { success: false, error: 'Only aws-agentcore is supported' };
    }

    if (!config.enabled) {
      return { success: false, error: 'Cloud browser is disabled' };
    }

    if (config.cdpEndpoint) {
      return {
        success: true,
        session: {
          cdpEndpoint: config.cdpEndpoint,
          cdpHeaders: credentials?.cdpSecret ? { 'X-CDP-Secret': credentials.cdpSecret } : undefined,
          sessionId: undefined,
          createdAt: Date.now(),
        },
      };
    }

    const session = await createSessionFromAgentCoreApi(config, credentials);
    return { success: true, session };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
