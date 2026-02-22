import process from 'node:process';

const FATAL_ERROR_CODES = new Set([
  'ERR_OUT_OF_MEMORY',
  'ERR_SCRIPT_EXECUTION_TIMEOUT',
  'ERR_WORKER_OUT_OF_MEMORY',
  'ERR_WORKER_UNCAUGHT_EXCEPTION',
  'ERR_WORKER_INITIALIZATION_FAILED',
]);

const TRANSIENT_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  'ESOCKETTIMEDOUT',
  'ECONNABORTED',
  'EPIPE',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_DNS_RESOLVE_FAILED',
  'UND_ERR_CONNECT',
  'UND_ERR_SOCKET',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
]);

function extractErrorCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') {
    return undefined;
  }
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function getErrorCause(err: unknown): unknown {
  if (!err || typeof err !== 'object') {
    return undefined;
  }
  return (err as { cause?: unknown }).cause;
}

function extractCodeWithCauseChain(err: unknown): string | undefined {
  const direct = extractErrorCode(err);
  if (direct) {
    return direct;
  }
  const cause = getErrorCause(err);
  if (cause && cause !== err) {
    return extractCodeWithCauseChain(cause);
  }
  return undefined;
}

function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.stack ?? err.message;
  }
  return String(err);
}

export function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  if ('name' in err && String(err.name) === 'AbortError') {
    return true;
  }
  if ('message' in err && typeof (err as Error).message === 'string') {
    if ((err as Error).message === 'This operation was aborted') {
      return true;
    }
  }
  return false;
}

export function isFatalError(err: unknown): boolean {
  const code = extractCodeWithCauseChain(err);
  return code !== undefined && FATAL_ERROR_CODES.has(code);
}

export function isTransientError(err: unknown): boolean {
  if (!err) {
    return false;
  }

  const code = extractCodeWithCauseChain(err);
  if (code && TRANSIENT_ERROR_CODES.has(code)) {
    return true;
  }

  if (err instanceof TypeError && err.message === 'fetch failed') {
    const cause = getErrorCause(err);
    if (cause) {
      return isTransientError(cause);
    }
    return true;
  }

  const cause = getErrorCause(err);
  if (cause && cause !== err) {
    return isTransientError(cause);
  }

  if (err instanceof AggregateError && err.errors?.length) {
    return err.errors.every((e) => isTransientError(e));
  }

  return false;
}

export type CrashHandlerOptions = {
  logger?: {
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
};

export function installCrashHandlers(opts: CrashHandlerOptions = {}): void {
  const log = opts.logger ?? {
    warn: (msg: string) => console.warn(msg),
    error: (msg: string) => console.error(msg),
  };

  process.on('unhandledRejection', (reason: unknown) => {
    if (isAbortError(reason)) {
      log.warn(`[Daemon] Suppressed AbortError: ${formatError(reason)}`);
      return;
    }

    if (isFatalError(reason)) {
      log.error(`[Daemon] FATAL unhandled rejection: ${formatError(reason)}`);
      process.exit(1);
      return;
    }

    if (isTransientError(reason)) {
      log.warn(`[Daemon] Transient error (continuing): ${formatError(reason)}`);
      return;
    }

    log.error(`[Daemon] Unhandled rejection (non-transient): ${formatError(reason)}`);
    process.exit(1);
  });

  process.on('uncaughtException', (err: Error) => {
    if (isAbortError(err)) {
      log.warn(`[Daemon] Suppressed AbortError in uncaughtException: ${formatError(err)}`);
      return;
    }

    if (isFatalError(err)) {
      log.error(`[Daemon] FATAL uncaught exception: ${formatError(err)}`);
      process.exit(1);
      return;
    }

    if (isTransientError(err)) {
      log.warn(`[Daemon] Transient uncaught exception (continuing): ${formatError(err)}`);
      return;
    }

    log.error(`[Daemon] Uncaught exception: ${formatError(err)}`);
    process.exit(1);
  });
}
