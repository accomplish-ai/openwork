/**
 * Unit tests for Accomplish API library
 *
 * Tests the Electron detection and shell utilities:
 * - isRunningInElectron() detection
 * - getAccomplish() API access
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store original window
const originalWindow = globalThis.window;

describe('Accomplish API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    (globalThis as unknown as { window: Record<string, unknown> }).window = {};
  });

  afterEach(() => {
    vi.clearAllMocks();
    (globalThis as unknown as { window: typeof window }).window = originalWindow;
  });

  describe('isRunningInElectron', () => {
    it('should return true when accomplishShell.isElectron is true', async () => {
      (globalThis as unknown as { window: { accomplishShell: { isElectron: boolean } } }).window = {
        accomplishShell: { isElectron: true },
      };

      const { isRunningInElectron } = await import('@/lib/accomplish');
      expect(isRunningInElectron()).toBe(true);
    });

    it('should return false when accomplishShell.isElectron is false', async () => {
      (globalThis as unknown as { window: { accomplishShell: { isElectron: boolean } } }).window = {
        accomplishShell: { isElectron: false },
      };

      const { isRunningInElectron } = await import('@/lib/accomplish');
      expect(isRunningInElectron()).toBe(false);
    });

    it('should return false when accomplishShell is unavailable', async () => {
      // Test undefined, null, missing property, and empty object
      const unavailableScenarios = [
        { accomplishShell: undefined },
        { accomplishShell: null },
        { accomplishShell: { version: '1.0.0' } }, // missing isElectron
        {}, // no accomplishShell at all
      ];

      for (const scenario of unavailableScenarios) {
        vi.resetModules();
        (globalThis as unknown as { window: Record<string, unknown> }).window = scenario;
        const { isRunningInElectron } = await import('@/lib/accomplish');
        expect(isRunningInElectron()).toBe(false);
      }
    });

    it('should use strict equality for isElectron check', async () => {
      // Truthy but not true should return false
      (globalThis as unknown as { window: { accomplishShell: { isElectron: number } } }).window = {
        accomplishShell: { isElectron: 1 },
      };

      const { isRunningInElectron } = await import('@/lib/accomplish');
      expect(isRunningInElectron()).toBe(false);
    });
  });

  describe('getAccomplish', () => {
    it('should return accomplish API when available', async () => {
      const mockApi = {
        getVersion: vi.fn(),
        startTask: vi.fn(),
        validateBedrockCredentials: vi.fn(),
        saveBedrockCredentials: vi.fn(),
        getBedrockCredentials: vi.fn(),
      };
      (globalThis as unknown as { window: { accomplish: typeof mockApi } }).window = {
        accomplish: mockApi,
      };

      const { getAccomplish } = await import('@/lib/accomplish');
      const result = getAccomplish();
      // getAccomplish returns a wrapper object with spread methods + Bedrock wrappers
      expect(result.getVersion).toBeDefined();
      expect(result.startTask).toBeDefined();
      expect(result.validateBedrockCredentials).toBeDefined();
      expect(result.saveBedrockCredentials).toBeDefined();
      expect(result.getBedrockCredentials).toBeDefined();
    });

    it('should throw when accomplish API is not available', async () => {
      const unavailableScenarios = [{ accomplish: undefined }, {}];

      for (const scenario of unavailableScenarios) {
        vi.resetModules();
        (globalThis as unknown as { window: Record<string, unknown> }).window = scenario;
        const { getAccomplish } = await import('@/lib/accomplish');
        expect(() => getAccomplish()).toThrow(
          'Accomplish API not available - not running in Electron',
        );
      }
    });
  });
});
