import type { TaskConfig } from '../common/types/task.js';
import {
  TASK_ATTACHMENT_MAX_FILES,
  TASK_ATTACHMENT_MAX_FILE_SIZE_BYTES,
} from '../common/types/task.js';
import { sanitizeString } from './sanitize.js';

/**
 * Validates and sanitizes a TaskConfig object.
 * Ensures all fields are properly typed, trimmed, and within length limits.
 *
 * @param config - The task configuration to validate
 * @returns A sanitized TaskConfig with all fields validated
 */
export function validateTaskConfig(config: TaskConfig): TaskConfig {
  const prompt = sanitizeString(config.prompt, 'prompt');
  const validated: TaskConfig = { prompt };

  if (config.taskId) {
    validated.taskId = sanitizeString(config.taskId, 'taskId', 128);
  }
  if (config.sessionId) {
    validated.sessionId = sanitizeString(config.sessionId, 'sessionId', 128);
  }
  if (config.workingDirectory) {
    validated.workingDirectory = sanitizeString(config.workingDirectory, 'workingDirectory', 1024);
  }
  if (Array.isArray(config.allowedTools)) {
    validated.allowedTools = config.allowedTools
      .filter((tool): tool is string => typeof tool === 'string')
      .map((tool) => sanitizeString(tool, 'allowedTools', 64))
      .slice(0, 20);
  }
  if (config.systemPromptAppend) {
    validated.systemPromptAppend = sanitizeString(
      config.systemPromptAppend,
      'systemPromptAppend'
    );
  }
  if (config.outputSchema && typeof config.outputSchema === 'object') {
    validated.outputSchema = config.outputSchema;
  }
  if (Array.isArray(config.attachments)) {
    validated.attachments = config.attachments
      .filter((attachment) => {
        if (!attachment) return false;
        if (typeof attachment.path !== 'string' || attachment.path.trim().length === 0) return false;
        if (typeof attachment.name !== 'string' || attachment.name.trim().length === 0) return false;
        if (!['image', 'text', 'document', 'other'].includes(attachment.type)) return false;
        if (!Number.isFinite(attachment.size) || attachment.size < 0) return false;
        return attachment.size <= TASK_ATTACHMENT_MAX_FILE_SIZE_BYTES;
      })
      .slice(0, TASK_ATTACHMENT_MAX_FILES)
      .map((attachment) => ({
        id: attachment.id || `attachment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        path: sanitizeString(attachment.path, 'attachmentPath', 2048),
        name: sanitizeString(attachment.name, 'attachmentName', 256),
        type: attachment.type,
        size: Math.floor(attachment.size),
      }));
  }

  return validated;
}
