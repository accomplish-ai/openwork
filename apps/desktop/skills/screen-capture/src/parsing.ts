import { ToolError } from './errors';

export function toInt(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new ToolError('ERR_INVALID_INPUT', `${fieldName} must be an integer.`);
  }
  return value;
}

export function parseBoolean(value: unknown, defaultValue: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  return defaultValue;
}

export function parseWindowIds(value: unknown): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const ids: number[] = [];
  for (const entry of value) {
    if (typeof entry !== 'number' || !Number.isInteger(entry)) {
      throw new ToolError('ERR_INVALID_INPUT', 'window_ids must be an array of integer window IDs.');
    }
    ids.push(entry);
  }

  return ids;
}

export function parseOptionalWindowId(value: unknown): number | null {
  if (value === undefined) {
    return null;
  }
  return toInt(value, 'window_id');
}

export function parseOptionalAppName(value: unknown): string | null {
  if (value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new ToolError('ERR_INVALID_INPUT', 'app_name must be a string.');
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ToolError('ERR_INVALID_INPUT', 'app_name cannot be empty.');
  }
  return trimmed;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function toOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  return undefined;
}
