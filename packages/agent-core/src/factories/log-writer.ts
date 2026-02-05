/**
 * Factory function for creating LogWriter instances
 */

import { LogFileWriter } from '../internal/classes/LogFileWriter.js';
import type {
  LogWriterAPI,
  LogWriterOptions,
} from '../types/log-writer.js';

/**
 * Create a new log writer instance
 * @param options - Configuration for the log writer
 * @returns LogWriterAPI instance
 */
export function createLogWriter(options: LogWriterOptions): LogWriterAPI {
  const writer = new LogFileWriter(options.logDir);
  return writer;
}
