import type { ErrorCode } from './types';

export class ToolError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly recoverable = false
  ) {
    super(message);
    this.name = 'ToolError';
  }
}

type ExecError = Error & {
  code?: number | string;
  stderr?: string;
  stdout?: string;
};

function getExecErrorText(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error).toLowerCase();
  }

  const execError = error as ExecError;
  return `${execError.message ?? ''} ${execError.stderr ?? ''} ${execError.stdout ?? ''}`.toLowerCase();
}

function getExecExitCode(error: unknown): number | string | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }
  return (error as ExecError).code;
}

function isPermissionDeniedCaptureError(error: unknown): boolean {
  const message = getExecErrorText(error);
  const indicators = [
    'not authorized',
    'permission denied',
    'operation not permitted',
    'screen recording',
  ];
  return indicators.some((indicator) => message.includes(indicator));
}

function isCommandNotFoundCaptureError(error: unknown): boolean {
  const message = getExecErrorText(error);
  const indicators = ['not found', 'enoent'];
  return indicators.some((indicator) => message.includes(indicator));
}

function isTransientCaptureError(error: unknown): boolean {
  const message = getExecErrorText(error);
  const indicators = [
    'resource temporarily unavailable',
    'temporarily unavailable',
    'timeout',
    'timed out',
    'interrupted system call',
    'failed to capture',
    'could not create image from display',
    'device busy',
  ];
  return indicators.some((indicator) => message.includes(indicator));
}

export function normalizeCaptureError(error: unknown): ToolError {
  if (error instanceof ToolError) {
    return error;
  }

  if (isPermissionDeniedCaptureError(error)) {
    return new ToolError(
      'ERR_CAPTURE_PERMISSION_DENIED',
      'Screen capture permission denied. Enable Screen Recording permission and retry.'
    );
  }

  if (isCommandNotFoundCaptureError(error)) {
    return new ToolError(
      'ERR_CAPTURE_COMMAND_FAILED',
      'Screen capture command is unavailable.'
    );
  }

  if (isTransientCaptureError(error)) {
    return new ToolError(
      'ERR_CAPTURE_COMMAND_FAILED',
      'Transient screen capture failure.',
      true
    );
  }

  if (getExecExitCode(error) !== undefined) {
    return new ToolError(
      'ERR_CAPTURE_COMMAND_FAILED',
      'Screen capture command failed.'
    );
  }

  return new ToolError('ERR_INTERNAL', 'Unexpected internal error.');
}

export function toToolError(error: unknown): ToolError {
  if (error instanceof ToolError) {
    return error;
  }
  return new ToolError('ERR_INTERNAL', 'Unexpected internal error.');
}

export function formatToolError(error: unknown): string {
  const toolError = toToolError(error);
  return `${toolError.code}|${toolError.message}`;
}

export function parseHelperError(errorMessage: string): ToolError {
  const value = errorMessage.toLowerCase();
  if (value.includes('screen recording permissions')) {
    return new ToolError(
      'ERR_DESKTOP_CONTEXT_PERMISSION_DENIED',
      'Desktop context capture requires Screen Recording permission for Screen Agent.'
    );
  }
  if (value.includes('accessibility permissions')) {
    return new ToolError(
      'ERR_DESKTOP_CONTEXT_ACCESSIBILITY_DENIED',
      'Desktop context inspection requires Accessibility permission for Screen Agent.'
    );
  }
  if (value.includes('window not found')) {
    return new ToolError(
      'ERR_DESKTOP_CONTEXT_WINDOW_NOT_FOUND',
      'Requested window was not found.'
    );
  }
  if (value.includes('missing parameter') || value.includes('invalid parameters')) {
    return new ToolError('ERR_INVALID_INPUT', errorMessage);
  }
  return new ToolError('ERR_DESKTOP_CONTEXT_PROTOCOL', errorMessage);
}

export function normalizeHelperFailure(error: unknown): ToolError {
  if (error instanceof ToolError) {
    return error;
  }

  if (error instanceof Error) {
    return parseHelperError(error.message);
  }

  return new ToolError('ERR_DESKTOP_CONTEXT_PROTOCOL', String(error));
}
