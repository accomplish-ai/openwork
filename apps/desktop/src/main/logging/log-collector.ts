/**
 * Electron-specific LogCollector wrapper.
 *
 * This thin wrapper creates a LogCollector instance using the Electron-specific
 * LogFileWriter that injects the correct userData path.
 */

import { createLogCollector, type LogCollectorAPI } from '@accomplish/agent-core';
import { getLogFileWriter, shutdownLogFileWriter } from './log-file-writer';

// Re-export types from shared package for backward compatibility
export type { LogLevel, LogSource } from '@accomplish/agent-core';

let instance: LogCollectorAPI | null = null;

export function getLogCollector(): LogCollectorAPI {
  if (!instance) {
    instance = createLogCollector(getLogFileWriter());
  }
  return instance;
}

export function initializeLogCollector(): void {
  getLogCollector().initialize();
}

export function shutdownLogCollector(): void {
  if (instance) {
    instance.shutdown();
    instance = null;
  }
  // Also shutdown the file writer
  shutdownLogFileWriter();
}
