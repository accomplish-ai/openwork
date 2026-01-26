/**
 * Unit tests for Chrome detector
 *
 * Tests Chrome browser detection across platforms (darwin, win32, linux)
 * with comprehensive error reporting for debugging installation issues.
 *
 * @module __tests__/unit/main/utils/chrome-detector.unit.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  default: {
    access: vi.fn(),
  },
}));

// Mock child_process
vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

// Mock util
vi.mock('util', async () => {
  const actual = await vi.importActual<typeof import('util')>('util');
  return {
    ...actual,
    promisify: vi.fn((fn) => fn),
  };
});

// Import after mocks are set up
import { getChromePaths, detectChrome } from '@main/utils/chrome-detector';

describe('ChromeDetector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getChromePaths', () => {
    it('returns correct paths for darwin', () => {
      const paths = getChromePaths('darwin');

      expect(paths).toContain('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
      expect(paths.length).toBeGreaterThan(0);
    });

    it('returns correct paths for win32', () => {
      const paths = getChromePaths('win32');

      expect(paths.some(p => p.includes('Program Files'))).toBe(true);
      expect(paths.some(p => p.includes('chrome.exe'))).toBe(true);
    });

    it('returns correct paths for linux', () => {
      const paths = getChromePaths('linux');

      expect(paths).toContain('/usr/bin/google-chrome');
    });
  });

  describe('detectChrome', () => {
    it('returns found=true when Chrome exists and is executable', async () => {
      // Mock file exists check to succeed
      vi.mocked(fs.access).mockResolvedValue(undefined);

      // Mock execFile to return version (promisify makes it return a promise)
      vi.mocked(execFile).mockResolvedValue({
        stdout: 'Google Chrome 120.0.0\n',
        stderr: '',
      } as any);

      const result = await detectChrome();

      expect(result.found).toBe(true);
      expect(result.path).toBeTruthy();
      expect(result.error).toBeNull();
    });

    it('returns verbose error when Chrome not found', async () => {
      // Set up to reject all access checks
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      const result = await detectChrome();

      expect(result.found).toBe(false);
      expect(result.error).not.toBeNull();
      expect(result.error?.code).toBe('CHROME_NOT_FOUND');
      expect(result.error?.debugInfo.searchedPaths).toBeDefined();
      expect(result.error?.debugInfo.searchedPaths!.length).toBeGreaterThan(0);
      expect(result.error?.guidance).toContain('google.com/chrome');
    });
  });
});
