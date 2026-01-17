/**
 * Unit tests for Clean Start utility
 *
 * Tests the CLEAN_START functionality that clears userData directory.
 * This feature should ONLY work in development mode (non-packaged builds)
 * to prevent accidental data loss in production.
 *
 * @module __tests__/unit/main/utils/clean-start.unit.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock electron module
const mockApp = {
  isPackaged: false,
  getPath: vi.fn((name: string) => `/mock/path/${name}`),
};

vi.mock('electron', () => ({
  app: mockApp,
}));

// Mock fs module
const mockFs = {
  existsSync: vi.fn(() => true),
  rmSync: vi.fn(),
};

vi.mock('fs', () => ({
  default: mockFs,
  existsSync: mockFs.existsSync,
  rmSync: mockFs.rmSync,
}));

describe('Clean Start Utility', () => {
  let performCleanStart: typeof import('@main/utils/clean-start').performCleanStart;
  let shouldPerformCleanStart: typeof import('@main/utils/clean-start').shouldPerformCleanStart;

  const originalEnv = process.env;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = { ...originalEnv };

    // Spy on console methods
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Re-import module to get fresh state
    const module = await import('@main/utils/clean-start');
    performCleanStart = module.performCleanStart;
    shouldPerformCleanStart = module.shouldPerformCleanStart;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('shouldPerformCleanStart', () => {
    it('should return false when CLEAN_START is not set', () => {
      // Arrange
      delete process.env.CLEAN_START;
      mockApp.isPackaged = false;

      // Act
      const result = shouldPerformCleanStart();

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when CLEAN_START is set but app is packaged', () => {
      // Arrange
      process.env.CLEAN_START = '1';
      mockApp.isPackaged = true;

      // Act
      const result = shouldPerformCleanStart();

      // Assert
      expect(result).toBe(false);
    });

    it('should return true when CLEAN_START is set and app is not packaged', () => {
      // Arrange
      process.env.CLEAN_START = '1';
      mockApp.isPackaged = false;

      // Act
      const result = shouldPerformCleanStart();

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when CLEAN_START is set to "0"', () => {
      // Arrange
      process.env.CLEAN_START = '0';
      mockApp.isPackaged = false;

      // Act
      const result = shouldPerformCleanStart();

      // Assert
      expect(result).toBe(false);
    });

    it('should log warning when CLEAN_START is blocked in production', () => {
      // Arrange
      process.env.CLEAN_START = '1';
      mockApp.isPackaged = true;

      // Act
      shouldPerformCleanStart();

      // Assert
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('CLEAN_START ignored')
      );
    });
  });

  describe('performCleanStart', () => {
    it('should delete userData directory when conditions are met', () => {
      // Arrange
      process.env.CLEAN_START = '1';
      mockApp.isPackaged = false;
      mockFs.existsSync.mockReturnValue(true);

      // Act
      const result = performCleanStart();

      // Assert
      expect(result).toBe(true);
      expect(mockFs.rmSync).toHaveBeenCalledWith('/mock/path/userData', {
        recursive: true,
        force: true,
      });
    });

    it('should not delete anything when app is packaged', () => {
      // Arrange
      process.env.CLEAN_START = '1';
      mockApp.isPackaged = true;

      // Act
      const result = performCleanStart();

      // Assert
      expect(result).toBe(false);
      expect(mockFs.rmSync).not.toHaveBeenCalled();
    });

    it('should not delete anything when CLEAN_START is not set', () => {
      // Arrange
      delete process.env.CLEAN_START;
      mockApp.isPackaged = false;

      // Act
      const result = performCleanStart();

      // Assert
      expect(result).toBe(false);
      expect(mockFs.rmSync).not.toHaveBeenCalled();
    });

    it('should return false and not throw when directory does not exist', () => {
      // Arrange
      process.env.CLEAN_START = '1';
      mockApp.isPackaged = false;
      mockFs.existsSync.mockReturnValue(false);

      // Act
      const result = performCleanStart();

      // Assert
      expect(result).toBe(false);
      expect(mockFs.rmSync).not.toHaveBeenCalled();
    });

    it('should handle fs errors gracefully', () => {
      // Arrange
      process.env.CLEAN_START = '1';
      mockApp.isPackaged = false;
      mockFs.existsSync.mockReturnValue(true);
      mockFs.rmSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      // Act
      const result = performCleanStart();

      // Assert
      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to clear userData'),
        expect.any(Error)
      );
    });
  });
});
