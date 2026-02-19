import type { TaskConfig, TaskAttachment } from '../common/types/task.js';
import { sanitizeString } from './sanitize.js';

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_DATA_LENGTH = 10 * 1024 * 1024; // ~10MB base64
const VALID_ATTACHMENT_TYPES = new Set<TaskAttachment['type']>(['screenshot', 'json']);

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
    validated.systemPromptAppend = sanitizeString(config.systemPromptAppend, 'systemPromptAppend');
  }
  if (config.outputSchema && typeof config.outputSchema === 'object') {
    validated.outputSchema = config.outputSchema;
  }
  if (Array.isArray(config.attachments) && config.attachments.length > 0) {
    validated.attachments = validateAttachments(config.attachments);
  }

  return validated;
}

export function validateAttachments(attachments: unknown[]): TaskAttachment[] | undefined {
  const valid = attachments.slice(0, MAX_ATTACHMENTS).filter((att): att is TaskAttachment => {
    if (!att || typeof att !== 'object') {
      return false;
    }
    const a = att as Record<string, unknown>;
    return (
      typeof a.type === 'string' &&
      VALID_ATTACHMENT_TYPES.has(a.type as TaskAttachment['type']) &&
      typeof a.data === 'string' &&
      a.data.length > 0 &&
      a.data.length <= MAX_ATTACHMENT_DATA_LENGTH &&
      (a.label === undefined || typeof a.label === 'string')
    );
  });
  return valid.length > 0 ? valid : undefined;
}
