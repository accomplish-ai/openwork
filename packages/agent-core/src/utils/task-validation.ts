import type {
  TaskConfig,
  TaskInputAttachment,
  TaskInputAttachmentType,
} from '../common/types/task.js';
import { PROMPT_DEFAULT_MAX_LENGTH } from './sanitize.js';
import { sanitizeString } from './sanitize.js';

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;

const VALID_ATTACHMENT_TYPES: TaskInputAttachmentType[] = ['image', 'text', 'document', 'other'];

function sanitizeAttachmentPath(path: unknown): string {
  if (typeof path !== 'string' || !path.trim()) {
    throw new Error('Attachment path is required');
  }
  const normalized = path.trim();
  if (normalized.includes('..')) {
    throw new Error('Attachment path must not contain directory traversal');
  }
  if (normalized.length > 2048) {
    throw new Error('Attachment path exceeds maximum length');
  }
  return normalized;
}

function validateAttachment(att: unknown, index: number): TaskInputAttachment {
  if (!att || typeof att !== 'object' || Array.isArray(att)) {
    throw new Error(`Attachment at index ${index} must be an object`);
  }
  const o = att as Record<string, unknown>;
  const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : `att-${index}`;
  const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim() : null;
  if (!name) {
    throw new Error(`Attachment at index ${index} must have a non-empty name`);
  }
  const path = sanitizeAttachmentPath(o.path);
  const type = o.type as TaskInputAttachmentType;
  if (!VALID_ATTACHMENT_TYPES.includes(type)) {
    throw new Error(
      `Attachment at index ${index} must have type one of: ${VALID_ATTACHMENT_TYPES.join(', ')}`,
    );
  }
  const size = Number(o.size);
  if (!Number.isFinite(size) || size < 0) {
    throw new Error(`Attachment at index ${index} must have a non-negative numeric size`);
  }
  if (size > MAX_ATTACHMENT_SIZE_BYTES) {
    throw new Error(
      `Attachment "${name}" exceeds maximum size of ${MAX_ATTACHMENT_SIZE_BYTES} bytes`,
    );
  }
  return { id, name, path, type, size };
}

/**
 * Validates and sanitizes a TaskConfig object.
 * Ensures all fields are properly typed, trimmed, and within length limits.
 *
 * @param config - The task configuration to validate
 * @returns A sanitized TaskConfig with all fields validated
 */
export function validateTaskConfig(config: TaskConfig): TaskConfig {
  const hasAttachments = Array.isArray(config.attachments) && config.attachments.length > 0;
  let prompt: string;
  if (typeof config.prompt === 'string' && config.prompt.trim()) {
    const trimmed = config.prompt.trim();
    if (trimmed.length > PROMPT_DEFAULT_MAX_LENGTH) {
      throw new Error(`prompt exceeds maximum length of ${PROMPT_DEFAULT_MAX_LENGTH}`);
    }
    prompt = trimmed;
  } else if (hasAttachments) {
    prompt = ' ';
  } else {
    throw new Error('prompt is required');
  }
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
  if (config.modelId) {
    validated.modelId = sanitizeString(config.modelId, 'modelId', 256);
  }
  if (Array.isArray(config.attachments)) {
    if (config.attachments.length > MAX_ATTACHMENTS) {
      throw new Error(`Attachments exceed maximum of ${MAX_ATTACHMENTS} files`);
    }
    validated.attachments = config.attachments.map((a, i) => validateAttachment(a, i));
  }

  return validated;
}
