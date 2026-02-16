import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { OpenCodeLogWatcher, OpenCodeLogError, createLogWatcher } from '../../../src/opencode/log-watcher.js';

describe('OpenCodeLogWatcher', () => {
  let testDir: string;
  let logDir: string;
  let watcher: OpenCodeLogWatcher;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `log-watcher-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    logDir = path.join(testDir, 'log');
    fs.mkdirSync(logDir, { recursive: true });

    // Suppress console output
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    if (watcher) {
      await watcher.stop();
    }
    vi.restoreAllMocks();

    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('constructor', () => {
    it('should use default log directory if none provided', () => {
      const defaultWatcher = new OpenCodeLogWatcher();
      expect(defaultWatcher).toBeInstanceOf(OpenCodeLogWatcher);
    });

    it('should use provided log directory', () => {
      watcher = new OpenCodeLogWatcher(logDir);
      expect(watcher).toBeInstanceOf(OpenCodeLogWatcher);
    });
  });

  describe('start', () => {
    it('should not start twice', async () => {
      watcher = new OpenCodeLogWatcher(logDir);

      await watcher.start();
      await watcher.start(); // Should be a no-op

      // No errors thrown
      expect(true).toBe(true);
    });

    it('should handle empty log directory', async () => {
      watcher = new OpenCodeLogWatcher(logDir);
      await watcher.start();

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('stop', () => {
    it('should clean up resources', async () => {
      watcher = new OpenCodeLogWatcher(logDir);
      await watcher.start();
      await watcher.stop();

      // Can start again after stop
      await watcher.start();
      expect(true).toBe(true);
    });

    it('should handle stop when not started', async () => {
      watcher = new OpenCodeLogWatcher(logDir);
      await watcher.stop(); // Should not throw

      expect(true).toBe(true);
    });
  });

  describe('getErrorMessage', () => {
    it('should return user-friendly message for OAuthExpiredError', () => {
      const error: OpenCodeLogError = {
        timestamp: new Date().toISOString(),
        service: 'opencode',
        errorName: 'OAuthExpiredError',
        message: 'Token expired',
        raw: 'raw line',
      };

      const message = OpenCodeLogWatcher.getErrorMessage(error);
      expect(message).toContain('Token expired');
    });

    it('should return user-friendly message for OAuthUnauthorizedError', () => {
      const error: OpenCodeLogError = {
        timestamp: new Date().toISOString(),
        service: 'opencode',
        errorName: 'OAuthUnauthorizedError',
        raw: 'raw line',
      };

      const message = OpenCodeLogWatcher.getErrorMessage(error);
      expect(message).toContain('session has expired');
    });

    it('should return user-friendly message for OAuthAuthenticationError', () => {
      const error: OpenCodeLogError = {
        timestamp: new Date().toISOString(),
        service: 'opencode',
        errorName: 'OAuthAuthenticationError',
        message: 'Auth failed',
        raw: 'raw line',
      };

      const message = OpenCodeLogWatcher.getErrorMessage(error);
      expect(message).toContain('Auth failed');
    });

    it('should return user-friendly message for ThrottlingException', () => {
      const error: OpenCodeLogError = {
        timestamp: new Date().toISOString(),
        service: 'bedrock',
        errorName: 'ThrottlingException',
        statusCode: 429,
        message: 'Too many requests',
        raw: 'raw line',
      };

      const message = OpenCodeLogWatcher.getErrorMessage(error);
      expect(message).toContain('Rate limit exceeded');
      expect(message).toContain('Too many requests');
    });

    it('should return user-friendly message for AuthenticationError', () => {
      const error: OpenCodeLogError = {
        timestamp: new Date().toISOString(),
        service: 'opencode',
        errorName: 'AuthenticationError',
        statusCode: 403,
        raw: 'raw line',
      };

      const message = OpenCodeLogWatcher.getErrorMessage(error);
      expect(message).toContain('Authentication failed');
      expect(message).toContain('Settings');
    });

    it('should return user-friendly message for ModelNotFoundError', () => {
      const error: OpenCodeLogError = {
        timestamp: new Date().toISOString(),
        service: 'opencode',
        errorName: 'ModelNotFoundError',
        statusCode: 404,
        modelID: 'gpt-5',
        raw: 'raw line',
      };

      const message = OpenCodeLogWatcher.getErrorMessage(error);
      expect(message).toContain('Model not available');
      expect(message).toContain('gpt-5');
    });

    it('should return user-friendly message for ModelNotFoundError without modelID', () => {
      const error: OpenCodeLogError = {
        timestamp: new Date().toISOString(),
        service: 'opencode',
        errorName: 'ModelNotFoundError',
        statusCode: 404,
        raw: 'raw line',
      };

      const message = OpenCodeLogWatcher.getErrorMessage(error);
      expect(message).toContain('Model not available');
      expect(message).toContain('unknown');
    });

    it('should return user-friendly message for AI_APICallError with 429', () => {
      const error: OpenCodeLogError = {
        timestamp: new Date().toISOString(),
        service: 'opencode',
        errorName: 'AI_APICallError',
        statusCode: 429,
        message: 'Rate limited',
        raw: 'raw line',
      };

      const message = OpenCodeLogWatcher.getErrorMessage(error);
      expect(message).toContain('Rate limit exceeded');
    });

    it('should return user-friendly message for AI_APICallError with 503', () => {
      const error: OpenCodeLogError = {
        timestamp: new Date().toISOString(),
        service: 'opencode',
        errorName: 'AI_APICallError',
        statusCode: 503,
        raw: 'raw line',
      };

      const message = OpenCodeLogWatcher.getErrorMessage(error);
      expect(message).toContain('Service temporarily unavailable');
    });

    it('should return user-friendly message for AI_APICallError with other status', () => {
      const error: OpenCodeLogError = {
        timestamp: new Date().toISOString(),
        service: 'opencode',
        errorName: 'AI_APICallError',
        statusCode: 500,
        message: 'Server error',
        raw: 'raw line',
      };

      const message = OpenCodeLogWatcher.getErrorMessage(error);
      expect(message).toContain('API error (500)');
      expect(message).toContain('Server error');
    });

    it('should return user-friendly message for ValidationError', () => {
      const error: OpenCodeLogError = {
        timestamp: new Date().toISOString(),
        service: 'opencode',
        errorName: 'ValidationError',
        statusCode: 400,
        message: 'Invalid parameter: model',
        raw: 'raw line',
      };

      const message = OpenCodeLogWatcher.getErrorMessage(error);
      expect(message).toContain('Invalid request');
      expect(message).toContain('Invalid parameter: model');
    });

    it('should return user-friendly message for ContextOverflow', () => {
      const error: OpenCodeLogError = {
        timestamp: new Date().toISOString(),
        service: 'opencode',
        errorName: 'ContextOverflow',
        statusCode: 400,
        message: 'Context overflow: 211840 tokens exceeded 200000 token limit.',
        raw: 'raw line',
        currentTokens: 211840,
        maxTokens: 200000,
      };

      const message = OpenCodeLogWatcher.getErrorMessage(error);
      expect(message).toContain('211840');
      expect(message).toContain('200000');
    });

    it('should return fallback message for ContextOverflow without message', () => {
      const error: OpenCodeLogError = {
        timestamp: new Date().toISOString(),
        service: 'opencode',
        errorName: 'ContextOverflow',
        statusCode: 400,
        raw: 'raw line',
      };

      const message = OpenCodeLogWatcher.getErrorMessage(error);
      expect(message).toContain('Context window exceeded');
    });

    it('should return generic message for unknown error', () => {
      const error: OpenCodeLogError = {
        timestamp: new Date().toISOString(),
        service: 'opencode',
        errorName: 'SomeUnknownError',
        message: 'Something went wrong',
        raw: 'raw line',
      };

      const message = OpenCodeLogWatcher.getErrorMessage(error);
      expect(message).toBe('Something went wrong');
    });

    it('should return error name when no message for unknown error', () => {
      const error: OpenCodeLogError = {
        timestamp: new Date().toISOString(),
        service: 'opencode',
        errorName: 'CustomError',
        raw: 'raw line',
      };

      const message = OpenCodeLogWatcher.getErrorMessage(error);
      expect(message).toContain('CustomError');
    });
  });

  describe('context-overflow detection', () => {
    it('should emit error with ContextOverflow details when prompt too long', async () => {
      // Create a log file inside the log directory
      const logFile = path.join(logDir, 'test.log');
      fs.writeFileSync(logFile, '');

      watcher = new OpenCodeLogWatcher(logDir);
      const errors: OpenCodeLogError[] = [];
      watcher.on('error', (error) => errors.push(error));
      await watcher.start();

      // The line must contain "ERROR" (uppercase) to pass the parseLine guard,
      // and must match the context-overflow pattern
      const errorLog =
        'ERROR service=opencode "name":"APIError" prompt is too long: 211840 tokens > 200000 maximum statusCode=400';
      fs.appendFileSync(logFile, errorLog + '\n');

      // Wait for polling to pick it up
      await new Promise((resolve) => setTimeout(resolve, 600));

      expect(errors.length).toBeGreaterThanOrEqual(1);
      const overflow = errors.find((e) => e.errorName === 'ContextOverflow');
      expect(overflow).toBeDefined();
      expect(overflow!.statusCode).toBe(400);
      expect(overflow!.message).toContain('211840');
      expect(overflow!.currentTokens).toBe(211840);
      expect(overflow!.maxTokens).toBe(200000);
    });

    it('should detect context overflow before ValidationException pattern', async () => {
      // Verify that the ContextOverflow pattern takes priority over ValidationException
      const logFile = path.join(logDir, 'test.log');
      fs.writeFileSync(logFile, '');

      watcher = new OpenCodeLogWatcher(logDir);
      const errors: OpenCodeLogError[] = [];
      watcher.on('error', (error) => errors.push(error));
      await watcher.start();

      // A line that could match both ValidationException and ContextOverflow
      const errorLog =
        'ERROR service=opencode ValidationException "message":"prompt is too long: 150000 tokens > 128000 maximum"';
      fs.appendFileSync(logFile, errorLog + '\n');

      await new Promise((resolve) => setTimeout(resolve, 600));

      expect(errors.length).toBeGreaterThanOrEqual(1);
      // Should match ContextOverflow, NOT ValidationError
      expect(errors[0]!.errorName).toBe('ContextOverflow');
    });

    it('should deduplicate identical context-overflow errors within the same session', async () => {
      // The log-watcher uses seenErrors to skip duplicate errors.
      // Verify a second identical overflow line does NOT produce a second event.
      const logFile = path.join(logDir, 'test.log');
      fs.writeFileSync(logFile, '');

      watcher = new OpenCodeLogWatcher(logDir);
      const errors: OpenCodeLogError[] = [];
      watcher.on('error', (error) => errors.push(error));
      await watcher.start();

      const errorLine =
        'ERROR service=opencode sessionID=ses_abc prompt is too long: 211840 tokens > 200000 maximum statusCode=400';

      // Write the same error line twice
      fs.appendFileSync(logFile, errorLine + '\n');
      fs.appendFileSync(logFile, errorLine + '\n');

      await new Promise((resolve) => setTimeout(resolve, 600));

      // Only one event should have been emitted despite two identical log lines
      const overflows = errors.filter((e) => e.errorName === 'ContextOverflow');
      expect(overflows).toHaveLength(1);
    });

    it('should parse different token counts from varied overflow messages', async () => {
      // Test with a different model context window (e.g., 128K for non-Anthropic)
      const logFile = path.join(logDir, 'test.log');
      fs.writeFileSync(logFile, '');

      watcher = new OpenCodeLogWatcher(logDir);
      const errors: OpenCodeLogError[] = [];
      watcher.on('error', (error) => errors.push(error));
      await watcher.start();

      const errorLog =
        'ERROR service=opencode prompt is too long: 135000 tokens > 128000 maximum statusCode=400';
      fs.appendFileSync(logFile, errorLog + '\n');

      await new Promise((resolve) => setTimeout(resolve, 600));

      expect(errors).toHaveLength(1);
      expect(errors[0]!.currentTokens).toBe(135000);
      expect(errors[0]!.maxTokens).toBe(128000);
      expect(errors[0]!.message).toContain('135000');
      expect(errors[0]!.message).toContain('128000');
    });
  });

  describe('createLogWatcher', () => {
    it('should create a new log watcher instance', () => {
      const newWatcher = createLogWatcher(logDir);
      expect(newWatcher).toBeInstanceOf(OpenCodeLogWatcher);
    });

    it('should create a new log watcher with default directory', () => {
      const newWatcher = createLogWatcher();
      expect(newWatcher).toBeInstanceOf(OpenCodeLogWatcher);
    });
  });

  describe('OpenCodeLogError interface', () => {
    it('should have all required fields', () => {
      const error: OpenCodeLogError = {
        timestamp: '2024-01-01T00:00:00Z',
        service: 'opencode',
        errorName: 'TestError',
        raw: 'ERROR test error line',
      };

      expect(error.timestamp).toBeDefined();
      expect(error.service).toBeDefined();
      expect(error.errorName).toBeDefined();
      expect(error.raw).toBeDefined();
    });

    it('should support optional fields', () => {
      const error: OpenCodeLogError = {
        timestamp: '2024-01-01T00:00:00Z',
        service: 'opencode',
        providerID: 'anthropic',
        modelID: 'claude-3',
        sessionID: 'sess-123',
        errorName: 'TestError',
        statusCode: 500,
        message: 'Test message',
        raw: 'ERROR test error line',
        isAuthError: true,
      };

      expect(error.providerID).toBe('anthropic');
      expect(error.modelID).toBe('claude-3');
      expect(error.sessionID).toBe('sess-123');
      expect(error.statusCode).toBe(500);
      expect(error.message).toBe('Test message');
      expect(error.isAuthError).toBe(true);
    });
  });
});
