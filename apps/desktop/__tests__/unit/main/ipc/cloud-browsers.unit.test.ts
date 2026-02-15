
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerCloudBrowserHandlers } from '../../../../src/main/ipc/cloud-browsers';
import type { AwsAgentCoreConfig } from '@accomplish_ai/agent-core';

// Mock electron modules
vi.mock('electron', () => {
  const mockHandlers = new Map<string, Function>();
  return {
    ipcMain: {
      handle: vi.fn((channel: string, handler: Function) => {
        mockHandlers.set(channel, handler);
      }),
      _getHandler: (channel: string) => mockHandlers.get(channel),
      _clear: () => mockHandlers.clear(),
    },
  };
});

// Mock agent-core
vi.mock('@accomplish_ai/agent-core', () => ({
  validateBedrockCredentials: vi.fn(),
}));

import { ipcMain } from 'electron';
import { validateBedrockCredentials } from '@accomplish_ai/agent-core';

// Helper to access mocked implementations
const mockedIpcMain = ipcMain as unknown as {
  _getHandler: (channel: string) => Function | undefined;
  _clear: () => void;
};

// Helper to invoke handler
async function invokeHandler(channel: string, ...args: any[]) {
  const handler = mockedIpcMain._getHandler(channel);
  if (!handler) throw new Error(`No handler for ${channel}`);
  return handler({}, ...args);
}

describe('Cloud Browser IPC Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedIpcMain._clear();
    // Register handlers before each test
    registerCloudBrowserHandlers(ipcMain.handle);
  });

  it('should register cloud-browser:test-connection', () => {
    expect(mockedIpcMain._getHandler('cloud-browser:test-connection')).toBeDefined();
  });

  it('should map profile config correctly', async () => {
    const config: AwsAgentCoreConfig = {
      region: 'us-west-2',
      profile: 'test-profile',
    };

    (validateBedrockCredentials as any).mockResolvedValue({ valid: true });

    const result = await invokeHandler('cloud-browser:test-connection', config);

    expect(result).toBe(true);
    expect(validateBedrockCredentials).toHaveBeenCalledWith(JSON.stringify({
      authType: 'profile',
      profileName: 'test-profile',
      region: 'us-west-2',
    }));
  });

  it('should map access key config correctly', async () => {
    const config: AwsAgentCoreConfig = {
      region: 'eu-central-1',
      accessKeyId: 'AKIA...',
      secretAccessKey: 'secret...',
    };

    (validateBedrockCredentials as any).mockResolvedValue({ valid: true });

    const result = await invokeHandler('cloud-browser:test-connection', config);

    expect(result).toBe(true);
    expect(validateBedrockCredentials).toHaveBeenCalledWith(JSON.stringify({
      authType: 'accessKeys',
      accessKeyId: 'AKIA...',
      secretAccessKey: 'secret...',
      region: 'eu-central-1',
    }));
  });

  it('should return false if validation fails', async () => {
    const config: AwsAgentCoreConfig = {
      region: 'us-east-1',
      profile: 'invalid-profile',
    };

    (validateBedrockCredentials as any).mockResolvedValue({ 
      valid: false, 
      error: 'Profile not found' 
    });

    const result = await invokeHandler('cloud-browser:test-connection', config);

    expect(result).toBe(false);
  });

  it('should return false if credentials missing', async () => {
    const config: AwsAgentCoreConfig = {
      region: 'us-east-1',
    };

    const result = await invokeHandler('cloud-browser:test-connection', config);

    expect(result).toBe(false);
    expect(validateBedrockCredentials).not.toHaveBeenCalled();
  });
});
