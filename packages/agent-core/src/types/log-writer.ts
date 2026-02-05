export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export type LogSource = 'main' | 'mcp' | 'browser' | 'opencode' | 'env' | 'ipc';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  source: LogSource;
  message: string;
}

export interface LogWriterOptions {
  logDir: string;
}

export interface LogWriterAPI {
  initialize(): void;
  write(level: LogLevel, source: LogSource, message: string): void;
  log(level: LogLevel, source: LogSource, message: string, data?: unknown): void;
  logMcp(level: LogLevel, message: string, data?: unknown): void;
  logBrowser(level: LogLevel, message: string, data?: unknown): void;
  logOpenCode(level: LogLevel, message: string, data?: unknown): void;
  logEnv(level: LogLevel, message: string, data?: unknown): void;
  logIpc(level: LogLevel, message: string, data?: unknown): void;
  flush(): void;
  getCurrentLogPath(): string;
  getLogDir(): string;
  shutdown(): void;
}
