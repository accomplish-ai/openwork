import type { TaskConfig, TaskInputAttachmentType } from '../common/types/task.js';
import { sanitizeString } from './sanitize.js';

const MAX_TASK_ATTACHMENTS = 5;
const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
const VALID_ATTACHMENT_TYPES = new Set<TaskInputAttachmentType>([
  'image',
  'text',
  'document',
  'other',
]);

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
    const sanitizedAttachments: NonNullable<TaskConfig['attachments']> = [];
    for (const attachment of config.attachments) {
      if (!attachment || typeof attachment !== 'object') {
        continue;
      }
      if (sanitizedAttachments.length >= MAX_TASK_ATTACHMENTS) {
        break;
      }

      const type = VALID_ATTACHMENT_TYPES.has(attachment.type)
        ? attachment.type
        : 'other';
      const size = Number.isFinite(attachment.size) ? Math.trunc(attachment.size) : 0;
      if (size < 0 || size > MAX_ATTACHMENT_SIZE_BYTES) {
        continue;
      }

      const sanitizedAttachment = {
        name: sanitizeString(attachment.name, 'attachmentName', 512),
        path: sanitizeString(attachment.path, 'attachmentPath', 4096),
        type,
        size,
      } as const;

      if (attachment.preview) {
        sanitizedAttachments.push({
          ...sanitizedAttachment,
          preview: sanitizeString(attachment.preview, 'attachmentPreview', 12000),
        });
      } else {
        sanitizedAttachments.push(sanitizedAttachment);
      }
    }

    if (sanitizedAttachments.length > 0) {
      validated.attachments = sanitizedAttachments;
    }
  }

  return validated;
}
