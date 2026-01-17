/**
 * Centralized Logging System
 *
 * Provides structured logging with support for:
 * - Multiple log levels (DEBUG, INFO, WARN, ERROR)
 * - Console and file output
 * - Structured context data
 * - Log rotation
 * - Module-scoped loggers
 *
 * @module main/utils/logger
 */

import { app } from 'electron';
import fs from 'fs';
import path from 'path';

/**
 * Log levels for filtering messages
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * Log level names for output formatting
 */
const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
};

/**
 * Configuration options for Logger
 */
export interface LoggerOptions {
  /** Minimum log level to output */
  level?: LogLevel;
  /** Enable file logging */
  fileLogging?: boolean;
  /** Maximum log file size in bytes (default: 10MB) */
  maxFileSize?: number;
  /** Number of backup files to keep (default: 5) */
  maxBackups?: number;
  /**
   * Defer file logging initialization until first log.
   * This is useful when the logger is created before app.whenReady(),
   * as app.getPath('userData') may not be available yet.
   */
  deferInit?: boolean;
  /**
   * Number of log writes between rotation checks (default: 100).
   * Higher values reduce fs.stat syscalls but may allow logs to grow
   * slightly beyond maxFileSize before rotation.
   */
  rotationCheckInterval?: number;
  /**
   * Number of log messages to buffer before writing to file (default: 0 = no buffering).
   * Buffering reduces file I/O by batching writes, improving performance at the cost
   * of potential log loss if the process crashes before flushing.
   */
  bufferSize?: number;
}

/**
 * Default logger configuration
 */
const DEFAULT_OPTIONS: Required<LoggerOptions> = {
  level: LogLevel.INFO,
  fileLogging: false,
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxBackups: 5,
  deferInit: false,
  rotationCheckInterval: 100, // Check every 100 log writes
  bufferSize: 0, // No buffering by default (immediate writes)
};

/**
 * Safely stringify objects, handling circular references
 */
function safeStringify(obj: unknown, indent = 2): string {
  const seen = new WeakSet();
  return JSON.stringify(
    obj,
    (_key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      // Handle Error objects
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack,
        };
      }
      return value;
    },
    indent
  );
}

/**
 * Format timestamp for log output
 */
function formatTimestamp(): string {
  const now = new Date();
  return now.toISOString();
}

/**
 * Logger class for structured logging
 */
export class Logger {
  private moduleName: string;
  private options: Required<LoggerOptions>;
  private logFilePath: string | null = null;
  private logsDir: string | null = null;
  private fileLoggingInitialized = false;
  private logWriteCount = 0; // Counter for rotation check optimization
  private logBuffer: string[] = []; // Buffer for batched writes

  constructor(moduleName: string, options: LoggerOptions = {}) {
    this.moduleName = moduleName;
    this.options = { ...DEFAULT_OPTIONS, ...options };

    // Only initialize file logging immediately if not deferred
    if (this.options.fileLogging && !this.options.deferInit) {
      this.initFileLogging();
    }
  }

  /**
   * Initialize file logging
   * This is called lazily if deferInit is true, or immediately in constructor otherwise.
   */
  private initFileLogging(): void {
    if (this.fileLoggingInitialized) return;

    try {
      this.logsDir = path.join(app.getPath('userData'), 'logs');
      if (!fs.existsSync(this.logsDir)) {
        fs.mkdirSync(this.logsDir, { recursive: true });
      }
      this.logFilePath = path.join(this.logsDir, 'app.log');
      this.fileLoggingInitialized = true;
    } catch (error) {
      console.error('[Logger] Failed to initialize file logging:', error);
      this.options.fileLogging = false;
    }
  }

  /**
   * Ensure file logging is initialized (for deferred initialization)
   */
  private ensureFileLoggingInitialized(): void {
    if (this.options.fileLogging && !this.fileLoggingInitialized) {
      this.initFileLogging();
    }
  }

  /**
   * Get the module name
   */
  getModuleName(): string {
    return this.moduleName;
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return this.options.level;
  }

  /**
   * Set log level at runtime
   */
  setLevel(level: LogLevel): void {
    this.options.level = level;
  }

  /**
   * Check if file logging is enabled
   */
  isFileLoggingEnabled(): boolean {
    return this.options.fileLogging;
  }

  /**
   * Log a debug message
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Log an info message
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log an error message
   */
  error(message: string, error?: Error | Record<string, unknown>): void {
    const context = error instanceof Error
      ? { error: { name: error.name, message: error.message, stack: error.stack } }
      : error;
    this.log(LogLevel.ERROR, message, context);
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (level < this.options.level) {
      return;
    }

    const timestamp = formatTimestamp();
    const levelName = LOG_LEVEL_NAMES[level];
    const prefix = `[${timestamp}] [${levelName}] [${this.moduleName}]`;

    // Console output
    this.consoleLog(level, prefix, message, context);

    // File output (with lazy initialization support)
    if (this.options.fileLogging) {
      // Trigger deferred initialization if needed
      this.ensureFileLoggingInitialized();

      if (this.logFilePath) {
        this.fileLog(prefix, message, context);
      }
    }
  }

  /**
   * Output to console with appropriate method
   */
  private consoleLog(
    level: LogLevel,
    prefix: string,
    message: string,
    context?: Record<string, unknown>
  ): void {
    const args: unknown[] = [`${prefix} ${message}`];
    if (context) {
      args.push(context);
    }

    switch (level) {
      case LogLevel.DEBUG:
        console.debug(...args);
        break;
      case LogLevel.INFO:
        console.log(...args);
        break;
      case LogLevel.WARN:
        console.warn(...args);
        break;
      case LogLevel.ERROR:
        console.error(...args);
        break;
    }
  }

  /**
   * Output to log file
   */
  private fileLog(prefix: string, message: string, context?: Record<string, unknown>): void {
    if (!this.logFilePath || !this.logsDir) return;

    // Format log entry
    const contextStr = context ? ` ${safeStringify(context)}` : '';
    const logEntry = `${prefix} ${message}${contextStr}\n`;

    // Use buffering if enabled
    if (this.options.bufferSize > 0) {
      this.logBuffer.push(logEntry);

      // Flush buffer when it reaches the configured size
      if (this.logBuffer.length >= this.options.bufferSize) {
        this.flushBuffer();
      }
    } else {
      // No buffering - write immediately
      this.writeToFile(logEntry);
    }
  }

  /**
   * Write a log entry to file with rotation check
   */
  private writeToFile(content: string): void {
    if (!this.logFilePath || !this.logsDir) return;

    try {
      // Increment write counter and check rotation periodically
      this.logWriteCount++;
      if (this.logWriteCount >= this.options.rotationCheckInterval) {
        this.rotateIfNeeded();
        this.logWriteCount = 0;
      }

      // Append to log file
      fs.appendFileSync(this.logFilePath, content, 'utf8');
    } catch (error) {
      // Fallback to console only
      console.error('[Logger] Failed to write to log file:', error);
    }
  }

  /**
   * Flush the log buffer to file
   */
  private flushBuffer(): void {
    if (this.logBuffer.length === 0) return;

    // Join all buffered entries and write at once
    const content = this.logBuffer.join('');
    this.logBuffer = [];
    this.writeToFile(content);
  }

  /**
   * Manually flush any buffered log entries.
   * Call this before process exit to ensure all logs are written.
   */
  flush(): void {
    this.flushBuffer();
  }

  /**
   * Rotate log file if it exceeds max size
   */
  private rotateIfNeeded(): void {
    if (!this.logFilePath || !this.logsDir) return;

    try {
      if (!fs.existsSync(this.logFilePath)) return;

      const stats = fs.statSync(this.logFilePath);
      if (stats.size < this.options.maxFileSize) return;

      // Rotate existing backups
      for (let i = this.options.maxBackups - 1; i >= 1; i--) {
        const oldPath = path.join(this.logsDir, `app.log.${i}`);
        const newPath = path.join(this.logsDir, `app.log.${i + 1}`);
        if (fs.existsSync(oldPath)) {
          if (i === this.options.maxBackups - 1) {
            fs.unlinkSync(oldPath);
          } else {
            fs.renameSync(oldPath, newPath);
          }
        }
      }

      // Move current log to backup
      fs.renameSync(this.logFilePath, path.join(this.logsDir, 'app.log.1'));
    } catch (error) {
      console.error('[Logger] Log rotation failed:', error);
    }
  }
}

/**
 * Factory function to create a logger for a module
 */
export function createLogger(moduleName: string, options?: LoggerOptions): Logger {
  return new Logger(moduleName, options);
}

/**
 * Default application logger
 */
let defaultLogger: Logger | null = null;

/**
 * Get or create the default application logger
 */
export function getDefaultLogger(): Logger {
  if (!defaultLogger) {
    defaultLogger = new Logger('app', {
      level: app.isPackaged ? LogLevel.INFO : LogLevel.DEBUG,
      fileLogging: app.isPackaged,
      deferInit: true, // Defer file logging init until first log
    });
  }
  return defaultLogger;
}

/**
 * Log entry type for IPC event logging
 */
export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, unknown>;
  timestamp?: string;
  module?: string;
}

/**
 * Cache of loggers by module name for performance
 * Avoids creating new Logger instances on every logEvent call
 */
const moduleLoggerCache: Map<string, Logger> = new Map();

/**
 * Get or create a cached logger for a module
 * Uses deferInit to avoid calling app.getPath before app is ready
 */
function getCachedLogger(moduleName: string): Logger {
  let logger = moduleLoggerCache.get(moduleName);
  if (!logger) {
    logger = new Logger(moduleName, { fileLogging: true, deferInit: true });
    moduleLoggerCache.set(moduleName, logger);
  }
  return logger;
}

/**
 * Log an entry from IPC (used by handlers.ts)
 * Uses cached loggers per module for better performance
 */
export function logEvent(entry: LogEntry): void {
  const logger = getCachedLogger(entry.module || 'renderer');

  switch (entry.level) {
    case 'debug':
      logger.debug(entry.message, entry.context);
      break;
    case 'info':
      logger.info(entry.message, entry.context);
      break;
    case 'warn':
      logger.warn(entry.message, entry.context);
      break;
    case 'error':
      logger.error(entry.message, entry.context);
      break;
    default:
      logger.info(entry.message, entry.context);
  }
}

/**
 * Flush all cached loggers' buffers.
 * Call this before process exit to ensure all buffered logs are written.
 */
export function flushAllLoggers(): void {
  // Flush default logger
  if (defaultLogger) {
    defaultLogger.flush();
  }

  // Flush all cached module loggers
  for (const logger of moduleLoggerCache.values()) {
    logger.flush();
  }
}
