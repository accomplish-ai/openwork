/**
 * Factory functions for agent-core
 *
 * This module exports all factory functions for creating API instances.
 * Consumers should use these factories instead of directly instantiating classes.
 */

// Task Manager
export { createTaskManager } from './task-manager.js';

// Storage
export { createStorage } from './storage.js';

// Secure Storage (lightweight credential management)
export { createSecureStorage, type SecureStorageAPI, type SecureStorageOptions } from './secure-storage.js';

// Permission Handler
export { createPermissionHandler } from './permission-handler.js';

// Thought Stream Handler
export { createThoughtStreamHandler } from './thought-stream.js';

// Log Writer
export { createLogWriter } from './log-writer.js';

// Log Collector
export { createLogCollector, type LogCollectorAPI } from './log-collector.js';

// OpenCode Adapter (low-level CLI interaction)
export {
  createOpenCodeAdapter,
  type OpenCodeAdapterAPI,
  type OpenCodeAdapterEvents,
} from './opencode-adapter.js';

// Skills Manager
export { createSkillsManager } from './skills-manager.js';

// Speech Service
export { createSpeechService } from './speech.js';
