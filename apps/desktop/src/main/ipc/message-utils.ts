import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import type {
  TaskConfig,
  OpenCodeMessage,
  TaskMessage,
} from '@accomplish/shared';
import { normalizeIpcError } from './validation';

export const MAX_TEXT_LENGTH = 8000;

export function sanitizeString(input: unknown, field: string, maxLength = MAX_TEXT_LENGTH): string {
  if (typeof input !== 'string') {
    throw new Error(`${field} must be a string`);
  }
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error(`${field} is required`);
  }
  if (trimmed.length > maxLength) {
    throw new Error(`${field} exceeds maximum length`);
  }
  return trimmed;
}

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
      'systemPromptAppend',
      MAX_TEXT_LENGTH
    );
  }
  if (config.outputSchema && typeof config.outputSchema === 'object') {
    validated.outputSchema = config.outputSchema;
  }

  return validated;
}

export function handle<Args extends unknown[], ReturnType = unknown>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: Args) => ReturnType
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...(args as Args));
    } catch (error) {
      console.error(`IPC handler ${channel} failed`, error);
      throw normalizeIpcError(error);
    }
  });
}

export function createTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Extract base64 screenshots from tool output
 */
export function extractScreenshots(output: string): {
  cleanedText: string;
  attachments: Array<{ type: 'screenshot' | 'json'; data: string; label?: string }>;
} {
  const attachments: Array<{ type: 'screenshot' | 'json'; data: string; label?: string }> = [];

  const dataUrlRegex = /data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+/g;
  let match;
  while ((match = dataUrlRegex.exec(output)) !== null) {
    attachments.push({
      type: 'screenshot',
      data: match[0],
      label: 'Screenshot',
    });
  }

  const rawBase64Regex = /(?<![;,])(?:^|["\s])?(iVBORw0[A-Za-z0-9+/=]{100,})(?:["\s]|$)/g;
  while ((match = rawBase64Regex.exec(output)) !== null) {
    const base64Data = match[1];
    if (base64Data && base64Data.length > 100) {
      attachments.push({
        type: 'screenshot',
        data: `data:image/png;base64,${base64Data}`,
        label: 'Screenshot',
      });
    }
  }

  let cleanedText = output
    .replace(dataUrlRegex, '[Screenshot captured]')
    .replace(rawBase64Regex, '[Screenshot captured]');

  cleanedText = cleanedText
    .replace(/"[Screenshot captured]"/g, '"[Screenshot]"')
    .replace(/\[Screenshot captured\]\[Screenshot captured\]/g, '[Screenshot captured]');

  return { cleanedText, attachments };
}

/**
 * Sanitize tool output to remove technical details
 */
export function sanitizeToolOutput(text: string, isError: boolean): string {
  let result = text;

  result = result.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
  result = result.replace(/\x1B\[2m|\x1B\[22m|\x1B\[0m/g, '');
  result = result.replace(/ws:\/\/[^\s\]]+/g, '[connection]');
  result = result.replace(/\s*Call log:[\s\S]*/i, '');

  if (isError) {
    const timeoutMatch = result.match(/timed? ?out after (\d+)ms/i);
    if (timeoutMatch) {
      const seconds = Math.round(parseInt(timeoutMatch[1]) / 1000);
      return `Timed out after ${seconds}s`;
    }

    const protocolMatch = result.match(/Protocol error \([^)]+\):\s*(.+)/i);
    if (protocolMatch) {
      result = protocolMatch[1].trim();
    }

    result = result.replace(/^Error executing code:\s*/i, '');
    result = result.replace(/browserType\.connectOverCDP:\s*/i, '');
    result = result.replace(/\s+at\s+.+/g, '');
    result = result.replace(/\w+Error:\s*/g, '');
  }

  return result.trim();
}

export function toTaskMessage(message: OpenCodeMessage): TaskMessage | null {
  if (message.type === 'text') {
    if (message.part.text) {
      return {
        id: createMessageId(),
        type: 'assistant',
        content: message.part.text,
        timestamp: new Date().toISOString(),
      };
    }
    return null;
  }

  if (message.type === 'tool_call') {
    return {
      id: createMessageId(),
      type: 'tool',
      content: `Using tool: ${message.part.tool}`,
      toolName: message.part.tool,
      toolInput: message.part.input,
      timestamp: new Date().toISOString(),
    };
  }

  if (message.type === 'tool_use') {
    const toolUseMsg = message as import('@accomplish/shared').OpenCodeToolUseMessage;
    const toolName = toolUseMsg.part.tool || 'unknown';
    const toolInput = toolUseMsg.part.state?.input;
    const toolOutput = toolUseMsg.part.state?.output || '';
    const status = toolUseMsg.part.state?.status;

    if (status === 'completed' || status === 'error') {
      const { cleanedText, attachments } = extractScreenshots(toolOutput);
      const isError = status === 'error';
      const sanitizedText = sanitizeToolOutput(cleanedText, isError);

      const displayText = sanitizedText.length > 500
        ? sanitizedText.substring(0, 500) + '...'
        : sanitizedText;

      return {
        id: createMessageId(),
        type: 'tool',
        content: displayText || `Tool ${toolName} ${status}`,
        toolName,
        toolInput,
        timestamp: new Date().toISOString(),
        attachments: attachments.length > 0 ? attachments : undefined,
      };
    }
    return null;
  }

  return null;
}
