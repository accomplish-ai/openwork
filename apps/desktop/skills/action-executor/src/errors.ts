import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  type ActionExecutorErrorCode,
  PERMISSION_REMEDIATION,
  INVALID_INPUT_REMEDIATION,
  RUNTIME_REMEDIATION,
  PERMISSION_ERROR_PATTERNS,
} from './constants';

export class ActionExecutorError extends Error {
  code: ActionExecutorErrorCode;
  details: Record<string, unknown> | undefined;
  remediation: string;

  constructor(
    code: ActionExecutorErrorCode,
    message: string,
    details?: Record<string, unknown>,
    remediation?: string
  ) {
    super(message);
    this.name = 'ActionExecutorError';
    this.code = code;
    this.details = details;
    this.remediation = remediation ?? remediationForCode(code);
  }
}

export function remediationForCode(code: ActionExecutorErrorCode): string {
  switch (code) {
    case 'INVALID_INPUT':
      return INVALID_INPUT_REMEDIATION;
    case 'PERMISSION_MISSING':
      return PERMISSION_REMEDIATION;
    case 'RUNTIME_FAILURE':
      return RUNTIME_REMEDIATION;
  }
}

export function invalidInput(message: string, details?: Record<string, unknown>): never {
  throw new ActionExecutorError('INVALID_INPUT', message, details, INVALID_INPUT_REMEDIATION);
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function extractExecDetails(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== 'object') {
    return {};
  }

  const raw = error as {
    stdout?: unknown;
    stderr?: unknown;
    code?: unknown;
    signal?: unknown;
    cmd?: unknown;
  };
  const details: Record<string, unknown> = {};

  if (typeof raw.stdout === 'string' && raw.stdout.trim().length > 0) {
    details.stdout = raw.stdout.trim();
  }

  if (typeof raw.stderr === 'string' && raw.stderr.trim().length > 0) {
    details.stderr = raw.stderr.trim();
  }

  if (raw.code !== undefined) {
    details.exitCode = raw.code;
  }

  if (raw.signal !== undefined) {
    details.signal = raw.signal;
  }

  if (typeof raw.cmd === 'string' && raw.cmd.length > 0) {
    details.command = raw.cmd;
  }

  return details;
}

export function isPermissionError(error: unknown): boolean {
  const details = extractExecDetails(error);
  const text = `${errorMessage(error)} ${String(details.stderr ?? '')} ${String(details.stdout ?? '')}`.toLowerCase();
  return PERMISSION_ERROR_PATTERNS.some((pattern) => text.includes(pattern));
}

export function normalizeError(error: unknown): ActionExecutorError {
  if (error instanceof ActionExecutorError) {
    return error;
  }

  const details = extractExecDetails(error);
  details.cause = errorMessage(error);

  if (isPermissionError(error)) {
    return new ActionExecutorError(
      'PERMISSION_MISSING',
      'Accessibility permission is required to run mouse and keyboard actions.',
      details,
      PERMISSION_REMEDIATION
    );
  }

  return new ActionExecutorError('RUNTIME_FAILURE', 'Action execution failed.', details, RUNTIME_REMEDIATION);
}

export function buildErrorResult(error: unknown): CallToolResult {
  const normalizedError = normalizeError(error);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            ok: false,
            error: {
              code: normalizedError.code,
              message: normalizedError.message,
              remediation: normalizedError.remediation,
              details: normalizedError.details ?? {},
            },
          },
          null,
          2
        ),
      },
    ],
    isError: true,
  };
}
