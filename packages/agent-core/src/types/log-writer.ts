/**
 * Public API interface for LogFileWriter
 * Handles writing structured logs to rotating log files.
 */

/** Log severity levels */
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

/** Log source identifiers */
export type LogSource = 'main' | 'mcp' | 'browser' | 'opencode' | 'env' | 'ipc';

/** A structured log entry */
export interface LogEntry {
  /** ISO timestamp of the log entry */
  timestamp: string;
  /** Severity level */
  level: LogLevel;
  /** Source component */
  source: LogSource;
  /** Log message content */
  message: string;
}

/** Options for creating a LogWriter instance */
export interface LogWriterOptions {
  /** Directory to store log files */
  logDir: string;
  /** Maximum file size in bytes before rotation (optional) */
  maxFileSizeBytes?: number;
  /** Number of days to retain log files (optional) */
  retentionDays?: number;
  /** Buffer flush interval in milliseconds (optional) */
  bufferFlushIntervalMs?: number;
  /** Maximum buffer entries before auto-flush (optional) */
  bufferMaxEntries?: number;
}

/** Public API for log writing operations */
export interface LogWriterAPI {
  /**
   * Initialize the log writer
   * Creates the log directory if needed and sets up rotation
   */
  initialize(): void;

  /**
   * Write a log entry
   * @param level - Severity level of the log
   * @param source - Source component identifier
   * @param message - Log message content
   */
  write(level: LogLevel, source: LogSource, message: string): void;

  /**
   * Flush any buffered log entries to disk
   */
  flush(): void;

  /**
   * Get the path to the current log file
   * @returns Absolute path to current log file
   */
  getCurrentLogPath(): string;

  /**
   * Get the log directory path
   * @returns Absolute path to log directory
   */
  getLogDir(): string;

  /**
   * Shutdown the log writer
   * Flushes remaining entries and closes file handles
   */
  shutdown(): void;
}
