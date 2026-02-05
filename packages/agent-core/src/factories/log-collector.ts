/**
 * Factory function for creating LogCollector instances
 *
 * LogCollector is a central logging service that captures all application logs
 * by intercepting console methods and routing them to a LogWriterAPI.
 */

import { LogCollector } from '../internal/classes/LogCollector.js';
import type { LogWriterAPI } from '../types/log-writer.js';
import type { LogLevel, LogSource } from '../common/types/logging.js';

/**
 * Public API for log collector operations
 */
export interface LogCollectorAPI {
  /** Initialize the log collector - must be called early in app startup */
  initialize(): void;
  /** Log a message with structured metadata */
  log(level: LogLevel, source: LogSource, message: string, data?: unknown): void;
  /** Log MCP server events */
  logMcp(level: LogLevel, message: string, data?: unknown): void;
  /** Log browser/Playwright events */
  logBrowser(level: LogLevel, message: string, data?: unknown): void;
  /** Log OpenCode CLI events */
  logOpenCode(level: LogLevel, message: string, data?: unknown): void;
  /** Log environment/startup events */
  logEnv(level: LogLevel, message: string, data?: unknown): void;
  /** Log IPC events */
  logIpc(level: LogLevel, message: string, data?: unknown): void;
  /** Get the path to the current log file */
  getCurrentLogPath(): string;
  /** Get the log directory */
  getLogDir(): string;
  /** Flush all pending logs to disk */
  flush(): void;
  /** Shutdown the collector */
  shutdown(): void;
}

/**
 * Create a new log collector instance
 * @param writer - LogWriterAPI instance to use for writing logs
 * @returns LogCollectorAPI instance
 */
export function createLogCollector(writer: LogWriterAPI): LogCollectorAPI {
  return new LogCollector(writer);
}
