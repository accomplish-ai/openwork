import type { TaskConfig } from '../common/types/task.js';
import { sanitizeString } from './sanitize.js';

const VALID_ATTACHMENT_TYPES = ['image', 'text', 'code', 'pdf', 'other'] as const;
type AttachmentType = (typeof VALID_ATTACHMENT_TYPES)[number];

export function isValidAttachmentType(type: unknown): type is AttachmentType {
  return typeof type === 'string' && VALID_ATTACHMENT_TYPES.includes(type as AttachmentType);
}

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
  if (Array.isArray(config.attachments)) {
    validated.attachments = config.attachments
      .filter(
        (attachment): attachment is import('../common/types/task.js').TaskFileAttachment =>
          typeof attachment === 'object' && attachment !== null,
      )
      .map((attachment) => ({
        id: sanitizeString(attachment.id, 'attachment.id'),
        name: sanitizeString(attachment.name, 'attachment.name'),
        path: sanitizeString(attachment.path, 'attachment.path'),
        size: typeof attachment.size === 'number' ? attachment.size : 0,
        type: isValidAttachmentType(attachment.type) ? attachment.type : 'other',
        content: attachment.content
          ? sanitizeString(attachment.content, 'attachment.content')
          : undefined,
      })) as import('../common/types/task.js').TaskFileAttachment[];
  }

  return validated;
}
