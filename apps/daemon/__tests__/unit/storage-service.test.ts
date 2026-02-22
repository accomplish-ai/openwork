import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockCreateStorage, mockMkdirSync } = vi.hoisted(() => ({
  mockCreateStorage: vi.fn(),
  mockMkdirSync: vi.fn(),
}));

vi.mock('@accomplish_ai/agent-core', () => ({
  createStorage: mockCreateStorage,
}));

vi.mock('node:fs', () => ({
  mkdirSync: mockMkdirSync,
}));

vi.mock('node:os', () => ({
  homedir: () => '/mock/home',
}));

vi.mock('node:path', async () => {
  const actual = await vi.importActual<typeof import('node:path')>('node:path');
  return actual;
});

import { StorageService } from '../../src/storage-service.js';

describe('StorageService', () => {
  let service: StorageService;
  let mockStorage: {
    initialize: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new StorageService();
    mockStorage = {
      initialize: vi.fn(),
      close: vi.fn(),
    };
    mockCreateStorage.mockReturnValue(mockStorage);
  });

  describe('initialize', () => {
    it('should create directory with recursive option and mode 0o700', () => {
      service.initialize('/test/data');
      expect(mockMkdirSync).toHaveBeenCalledWith('/test/data', { recursive: true, mode: 0o700 });
    });

    it('should call createStorage with correct paths when dataDir is provided', () => {
      service.initialize('/test/data');

      expect(mockCreateStorage).toHaveBeenCalledWith({
        databasePath: expect.stringContaining('accomplish.db'),
        runMigrations: true,
        userDataPath: '/test/data',
        secureStorageFileName: 'secure-storage.json',
      });
    });

    it('should use accomplish.db when dataDir is provided', () => {
      service.initialize('/custom/dir');

      const call = mockCreateStorage.mock.calls[0][0];
      expect(call.databasePath).toContain('accomplish.db');
      expect(call.databasePath).not.toContain('accomplish-dev.db');
    });

    it('should use accomplish-dev.db when dataDir is not provided', () => {
      service.initialize();

      const call = mockCreateStorage.mock.calls[0][0];
      expect(call.databasePath).toContain('accomplish-dev.db');
    });

    it('should use secure-storage-dev.json when dataDir is not provided', () => {
      service.initialize();

      const call = mockCreateStorage.mock.calls[0][0];
      expect(call.secureStorageFileName).toBe('secure-storage-dev.json');
    });

    it('should use default data dir (~/.accomplish) when dataDir is not provided', () => {
      service.initialize();
      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('.accomplish'),
        { recursive: true, mode: 0o700 },
      );
    });

    it('should call storage.initialize()', () => {
      service.initialize('/test/data');
      expect(mockStorage.initialize).toHaveBeenCalled();
    });

    it('should return the storage instance', () => {
      const result = service.initialize('/test/data');
      expect(result).toBe(mockStorage);
    });
  });

  describe('getStorage', () => {
    it('should throw if not initialized', () => {
      expect(() => service.getStorage()).toThrow('Storage not initialized. Call initialize() first.');
    });

    it('should return storage after initialization', () => {
      service.initialize('/test/data');
      expect(service.getStorage()).toBe(mockStorage);
    });
  });

  describe('close', () => {
    it('should close storage and reset', () => {
      service.initialize('/test/data');
      service.close();

      expect(mockStorage.close).toHaveBeenCalled();
      expect(() => service.getStorage()).toThrow('Storage not initialized');
    });

    it('should be safe to call close without initialization', () => {
      expect(() => service.close()).not.toThrow();
    });

    it('should be safe to call close multiple times', () => {
      service.initialize('/test/data');
      service.close();
      expect(() => service.close()).not.toThrow();
    });
  });
});
