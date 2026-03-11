/**
 * Vitest setup file for desktop tests (main process + preload only)
 */

import { vi } from 'vitest';

// Mock better-sqlite3 native module (not available in test environment)
vi.mock('better-sqlite3', () => {
  class MockDatabase {
    pragma = vi.fn().mockReturnThis();
    prepare = vi.fn().mockReturnValue({
      run: vi.fn(),
      get: vi.fn().mockReturnValue(null),
      all: vi.fn().mockReturnValue([]),
    });
    exec = vi.fn();
    transaction = vi.fn((fn: () => unknown) => () => fn());
    close = vi.fn();
  }

  return {
    default: MockDatabase,
  };
});

export {};
