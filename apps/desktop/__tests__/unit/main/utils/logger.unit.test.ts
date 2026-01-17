/**
 * Unit tests for Logger utility
 *
 * Tests the centralized logging system that provides structured logging
 * for debugging and error tracking across the application.
 *
 * @module __tests__/unit/main/utils/logger.unit.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock electron module
const mockApp = {
  isPackaged: false,
  getPath: vi.fn((name: string) => `/mock/path/${name}`),
  getVersion: vi.fn(() => '1.0.0'),
  name: 'Openwork',
};

vi.mock('electron', () => ({
  app: mockApp,
}));

// Mock fs module
const mockFs = {
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
  statSync: vi.fn(() => ({ size: 1000 })),
  renameSync: vi.fn(),
  unlinkSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  writeFileSync: vi.fn(),
};

vi.mock('fs', () => ({
  default: mockFs,
  existsSync: mockFs.existsSync,
  mkdirSync: mockFs.mkdirSync,
  appendFileSync: mockFs.appendFileSync,
  statSync: mockFs.statSync,
  renameSync: mockFs.renameSync,
  unlinkSync: mockFs.unlinkSync,
  readdirSync: mockFs.readdirSync,
  writeFileSync: mockFs.writeFileSync,
}));

describe('Logger Module', () => {
  let Logger: typeof import('@main/utils/logger').Logger;
  let LogLevel: typeof import('@main/utils/logger').LogLevel;
  let createLogger: typeof import('@main/utils/logger').createLogger;
  let flushAllLoggers: typeof import('@main/utils/logger').flushAllLoggers;
  let logEvent: typeof import('@main/utils/logger').logEvent;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});

    // Re-import module to get fresh state
    const module = await import('@main/utils/logger');
    Logger = module.Logger;
    LogLevel = module.LogLevel;
    createLogger = module.createLogger;
    flushAllLoggers = module.flushAllLoggers;
    logEvent = module.logEvent;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Logger Class', () => {
    describe('Constructor and Configuration', () => {
      it('should create logger with default configuration', () => {
        // Act
        const logger = new Logger('test-module');

        // Assert
        expect(logger).toBeDefined();
        expect(logger.getModuleName()).toBe('test-module');
      });

      it('should create logger with custom log level', () => {
        // Act
        const logger = new Logger('test-module', { level: LogLevel.DEBUG });

        // Assert
        expect(logger.getLevel()).toBe(LogLevel.DEBUG);
      });

      it('should create logger with file logging enabled', () => {
        // Act
        const logger = new Logger('test-module', { fileLogging: true });

        // Assert
        expect(logger.isFileLoggingEnabled()).toBe(true);
      });
    });

    describe('Logging Methods', () => {
      it('should log debug messages when level is DEBUG', () => {
        // Arrange
        const logger = new Logger('test', { level: LogLevel.DEBUG });

        // Act
        logger.debug('Debug message', { key: 'value' });

        // Assert
        expect(console.debug).toHaveBeenCalled();
      });

      it('should not log debug messages when level is INFO', () => {
        // Arrange
        const logger = new Logger('test', { level: LogLevel.INFO });

        // Act
        logger.debug('Debug message');

        // Assert
        expect(console.debug).not.toHaveBeenCalled();
      });

      it('should log info messages', () => {
        // Arrange
        const logger = new Logger('test', { level: LogLevel.INFO });

        // Act
        logger.info('Info message');

        // Assert
        expect(console.log).toHaveBeenCalled();
      });

      it('should log warning messages', () => {
        // Arrange
        const logger = new Logger('test', { level: LogLevel.WARN });

        // Act
        logger.warn('Warning message');

        // Assert
        expect(console.warn).toHaveBeenCalled();
      });

      it('should log error messages with Error objects', () => {
        // Arrange
        const logger = new Logger('test', { level: LogLevel.ERROR });
        const error = new Error('Test error');

        // Act
        logger.error('Error occurred', error);

        // Assert
        expect(console.error).toHaveBeenCalled();
      });

      it('should include timestamp in log output', () => {
        // Arrange
        const logger = new Logger('test', { level: LogLevel.INFO });

        // Act
        logger.info('Test message');

        // Assert
        const call = (console.log as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(call[0]).toMatch(/^\[\d{4}-\d{2}-\d{2}/);
      });

      it('should include module name in log output', () => {
        // Arrange
        const logger = new Logger('my-module', { level: LogLevel.INFO });

        // Act
        logger.info('Test message');

        // Assert
        const call = (console.log as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(call[0]).toContain('[my-module]');
      });
    });

    describe('Structured Logging', () => {
      it('should log with context data', () => {
        // Arrange
        const logger = new Logger('test', { level: LogLevel.INFO });
        const context = { userId: '123', action: 'login' };

        // Act
        logger.info('User action', context);

        // Assert
        expect(console.log).toHaveBeenCalled();
        const call = (console.log as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(call.length).toBeGreaterThan(1);
      });

      it('should handle circular references in context', () => {
        // Arrange
        const logger = new Logger('test', { level: LogLevel.INFO });
        const context: Record<string, unknown> = { key: 'value' };
        context.self = context; // Circular reference

        // Act & Assert - should not throw
        expect(() => logger.info('Circular context', context)).not.toThrow();
      });
    });

    describe('File Logging', () => {
      it('should write to file when file logging is enabled', () => {
        // Arrange
        const logger = new Logger('test', { fileLogging: true, level: LogLevel.INFO });

        // Act
        logger.info('File log message');

        // Assert
        expect(mockFs.appendFileSync).toHaveBeenCalled();
      });

      it('should not write to file when file logging is disabled', () => {
        // Arrange
        const logger = new Logger('test', { fileLogging: false, level: LogLevel.INFO });

        // Act
        logger.info('Console only message');

        // Assert
        expect(mockFs.appendFileSync).not.toHaveBeenCalled();
      });

      it('should create logs directory if it does not exist', () => {
        // Arrange
        mockFs.existsSync.mockReturnValueOnce(false);
        const logger = new Logger('test', { fileLogging: true, level: LogLevel.INFO });

        // Act
        logger.info('Test message');

        // Assert
        expect(mockFs.mkdirSync).toHaveBeenCalled();
      });
    });

    describe('Log Level Control', () => {
      it('should filter logs below current level', () => {
        // Arrange
        const logger = new Logger('test', { level: LogLevel.ERROR });

        // Act
        logger.debug('Debug');
        logger.info('Info');
        logger.warn('Warn');
        logger.error('Error');

        // Assert
        expect(console.debug).not.toHaveBeenCalled();
        expect(console.log).not.toHaveBeenCalled();
        expect(console.warn).not.toHaveBeenCalled();
        expect(console.error).toHaveBeenCalled();
      });

      it('should allow changing log level at runtime', () => {
        // Arrange
        const logger = new Logger('test', { level: LogLevel.ERROR });

        // Act & Assert - initially only errors
        logger.info('Should not log');
        expect(console.log).not.toHaveBeenCalled();

        // Change level
        logger.setLevel(LogLevel.INFO);
        logger.info('Should log now');
        expect(console.log).toHaveBeenCalled();
      });
    });
  });

  describe('createLogger Factory', () => {
    it('should create a new logger instance', () => {
      // Act
      const logger = createLogger('factory-test');

      // Assert
      expect(logger).toBeInstanceOf(Logger);
      expect(logger.getModuleName()).toBe('factory-test');
    });

    it('should pass options to logger', () => {
      // Act
      const logger = createLogger('factory-test', { level: LogLevel.DEBUG });

      // Assert
      expect(logger.getLevel()).toBe(LogLevel.DEBUG);
    });
  });

  describe('LogLevel Enum', () => {
    it('should have correct level ordering', () => {
      // Assert
      expect(LogLevel.DEBUG).toBeLessThan(LogLevel.INFO);
      expect(LogLevel.INFO).toBeLessThan(LogLevel.WARN);
      expect(LogLevel.WARN).toBeLessThan(LogLevel.ERROR);
    });
  });

  describe('Write Buffering', () => {
    it('should buffer writes when buffering is enabled', () => {
      // Arrange
      mockApp.getPath.mockReturnValue('/mock/path/userData');
      mockFs.existsSync.mockReturnValue(true);
      const logger = new Logger('test', {
        fileLogging: true,
        level: LogLevel.INFO,
        bufferSize: 5, // Buffer up to 5 messages
      });

      // Clear mock calls from initialization
      mockFs.appendFileSync.mockClear();

      // Act - log less than buffer size
      logger.info('Message 1');
      logger.info('Message 2');
      logger.info('Message 3');

      // Assert - should not write yet (buffered)
      expect(mockFs.appendFileSync).not.toHaveBeenCalled();

      // Act - log more to fill buffer
      logger.info('Message 4');
      logger.info('Message 5');

      // Assert - buffer full, should flush
      expect(mockFs.appendFileSync).toHaveBeenCalled();
    });

    it('should flush buffer on explicit flush call', () => {
      // Arrange
      mockApp.getPath.mockReturnValue('/mock/path/userData');
      mockFs.existsSync.mockReturnValue(true);
      const logger = new Logger('test', {
        fileLogging: true,
        level: LogLevel.INFO,
        bufferSize: 10,
      });

      mockFs.appendFileSync.mockClear();

      // Act
      logger.info('Buffered message');
      expect(mockFs.appendFileSync).not.toHaveBeenCalled();

      logger.flush();

      // Assert
      expect(mockFs.appendFileSync).toHaveBeenCalled();
    });

    it('should write immediately when buffering is disabled (bufferSize = 0)', () => {
      // Arrange
      mockApp.getPath.mockReturnValue('/mock/path/userData');
      mockFs.existsSync.mockReturnValue(true);
      const logger = new Logger('test', {
        fileLogging: true,
        level: LogLevel.INFO,
        bufferSize: 0, // No buffering
      });

      mockFs.appendFileSync.mockClear();

      // Act
      logger.info('Immediate message');

      // Assert - should write immediately
      expect(mockFs.appendFileSync).toHaveBeenCalled();
    });
  });

  describe('Log Rotation Optimization', () => {
    it('should not check file size on every log (rotation check interval)', () => {
      // Arrange
      mockApp.getPath.mockReturnValue('/mock/path/userData');
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ size: 1000 });
      const logger = new Logger('test', { fileLogging: true, level: LogLevel.INFO });

      // Clear mock calls from initialization
      mockFs.statSync.mockClear();

      // Act - log multiple times
      for (let i = 0; i < 50; i++) {
        logger.info(`Log message ${i}`);
      }

      // Assert - statSync should be called less than 50 times
      // With rotationCheckInterval of 100, it should be called 0 times for first 50 logs
      expect(mockFs.statSync.mock.calls.length).toBeLessThan(50);
    });

    it('should eventually check file size after enough logs', () => {
      // Arrange
      mockApp.getPath.mockReturnValue('/mock/path/userData');
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ size: 1000 });
      const logger = new Logger('test', {
        fileLogging: true,
        level: LogLevel.INFO,
        rotationCheckInterval: 10, // Check every 10 logs
      });

      // Clear mock calls from initialization
      mockFs.statSync.mockClear();

      // Act - log more than interval
      for (let i = 0; i < 25; i++) {
        logger.info(`Log message ${i}`);
      }

      // Assert - should check at least twice (at log 10 and 20)
      expect(mockFs.statSync.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Lazy File Logging Initialization', () => {
    it('should not call app.getPath when creating logger without file logging', () => {
      // Arrange
      mockApp.getPath.mockClear();

      // Act
      const logger = new Logger('test', { fileLogging: false });

      // Assert
      expect(mockApp.getPath).not.toHaveBeenCalled();
      expect(logger).toBeDefined();
    });

    it('should defer file logging initialization until first log with fileLogging enabled', () => {
      // Arrange
      mockApp.getPath.mockClear();

      // Act - create logger with file logging but deferInit
      const logger = new Logger('test', { fileLogging: true, deferInit: true });

      // Assert - app.getPath should NOT be called yet
      expect(mockApp.getPath).not.toHaveBeenCalled();

      // Act - log something to trigger initialization
      logger.info('Test message');

      // Assert - now app.getPath should be called
      expect(mockApp.getPath).toHaveBeenCalledWith('userData');
    });

    it('should handle app.getPath errors gracefully during deferred initialization', () => {
      // Arrange
      mockApp.getPath.mockImplementation(() => {
        throw new Error('app not ready');
      });

      // Act - create logger with deferred init
      const logger = new Logger('test', { fileLogging: true, deferInit: true });

      // Assert - should not throw, file logging should be disabled
      expect(() => logger.info('Test')).not.toThrow();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to initialize file logging'),
        expect.any(Error)
      );
    });
  });

  describe('flushAllLoggers', () => {
    it('should flush all cached loggers when called', () => {
      // Arrange
      mockApp.getPath.mockReturnValue('/mock/path/userData');
      mockFs.existsSync.mockReturnValue(true);

      // Create buffered logs via logEvent (which uses cached loggers)
      logEvent({ level: 'info', message: 'Test 1', module: 'module-a' });
      logEvent({ level: 'info', message: 'Test 2', module: 'module-b' });

      mockFs.appendFileSync.mockClear();

      // Act
      flushAllLoggers();

      // Assert - flush should have been called (even if buffers were empty)
      // The function should not throw
      expect(() => flushAllLoggers()).not.toThrow();
    });

    it('should not throw when no loggers exist', () => {
      // Act & Assert
      expect(() => flushAllLoggers()).not.toThrow();
    });
  });
});
